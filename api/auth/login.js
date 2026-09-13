// POST /api/auth/login  { email, password } -> cookie session.
const { send, fail, preflight } = require('../_lib');
const { redis, toObj } = require('../_store');
const { verifyPassword, validEmail, signToken, sessionCookie } = require('../_auth');

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
  if (!validEmail(email) || !b.password) return fail(res, 400, 'Isi email + password.');

  try {
    const id = await redis('get', `user:email:${email}`);
    // Pesan error disamakan biar tidak bisa ditebak email mana yang terdaftar.
    const SALAH = 'Email atau password salah.';
    if (!id) return fail(res, 401, SALAH);

    const u = toObj(await redis('hgetall', `user:id:${id}`));
    if (!u.email || !verifyPassword(String(b.password), u.pass)) return fail(res, 401, SALAH);
    if (u.disabled === '1') return fail(res, 403, 'Akun ini dinonaktifkan. Hubungi admin.');

    const tok = signToken({ sub: id, role: u.role || 'user', exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
    res.setHeader('Set-Cookie', sessionCookie(tok));
    return send(res, 200, { ok: true, data: { id, email: u.email, name: u.name || '', username: u.username || '', verified: u.verified === '1', role: u.role || 'user', plan: u.plan || 'free' } }, 0);
  } catch (e) {
    return fail(res, e.status || 500, e.message);
  }
};
