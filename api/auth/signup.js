// POST /api/auth/signup  { email, password, name } -> auto-login via cookie.
// User PERTAMA yang daftar otomatis jadi admin.
const { send, fail, preflight } = require('../_lib');
const { redis, toObj, getSettings } = require('../_store');
const { hashPassword, validEmail, newUserId, signToken, sessionCookie } = require('../_auth');

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e5) reject(new Error('Body kegedean')); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('Body harus JSON')); } });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return fail(res, 405, 'Pakai POST.');
  let b;
  try { b = await body(req); } catch (e) { return fail(res, 400, e.message); }

  const email = String(b.email || '').trim().toLowerCase();
  const pw = String(b.password || '');
  const name = String(b.name || '').trim().slice(0, 60);

  if (!validEmail(email)) return fail(res, 400, 'Email tidak valid.');
  if (pw.length < 8) return fail(res, 400, 'Password minimal 8 karakter.');
  if (pw.length > 128) return fail(res, 400, 'Password maksimal 128 karakter.');

  try {
    const settings = await getSettings();
    if (settings.signup_enabled !== '1') return fail(res, 403, 'Pendaftaran sedang ditutup admin.');

    const exists = await redis('get', `user:email:${email}`);
    if (exists) return fail(res, 409, 'Email ini sudah terdaftar. Login aja.');

    const total = Number(await redis('scard', 'users')) || 0;
    const id = await newUserId();
    const role = total === 0 ? 'admin' : 'user';

    await redis('hset', `user:id:${id}`,
      'email', email, 'name', name, 'role', role, 'plan', 'free',
      'pass', hashPassword(pw), 'disabled', '0', 'created', new Date().toISOString());
    await redis('set', `user:email:${email}`, id);
    await redis('sadd', 'users', id);

    const tok = signToken({ sub: id, role, exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
    res.setHeader('Set-Cookie', sessionCookie(tok));
    return send(res, 201, { ok: true, data: { id, email, name, role, plan: 'free', admin_pertama: role === 'admin' } }, 0);
  } catch (e) {
    return fail(res, e.status || 500, e.message);
  }
};
