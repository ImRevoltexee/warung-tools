// POST /api/auth/seed { email, password, username } — bikin admin awal SEKALI.
// Hanya untuk revolt.codes@gmail.com, hanya kalau email itu belum terdaftar.
// Setelah admin jadi, endpoint ini mati sendiri (409).
const { send, fail, preflight } = require('../_lib');
const { redis } = require('../_store');
const { hashPassword, validEmail, newUserId, signToken, sessionCookie } = require('../_auth');

const ADMIN_EMAIL = 'revolt.codes@gmail.com';

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
  const username = String(b.username || 'REVOLT').trim().slice(0, 30) || 'REVOLT';

  if (email !== ADMIN_EMAIL) return fail(res, 403, 'Seed hanya untuk admin awal.');
  if (!validEmail(email)) return fail(res, 400, 'Email tidak valid.');
  if (pw.length < 8) return fail(res, 400, 'Password minimal 8 karakter.');

  try {
    const exists = await redis('get', `user:email:${email}`);
    if (exists) return fail(res, 409, 'Admin sudah ada. Login aja di /login. Endpoint seed sudah mati.');

    const id = await newUserId();
    await redis('hset', `user:id:${id}`,
      'email', email, 'name', 'REVOLT', 'username', username,
      'role', 'admin', 'plan', 'pro', 'verified', '1',
      'pass', hashPassword(pw), 'disabled', '0', 'created', new Date().toISOString());
    await redis('set', `user:email:${email}`, id);
    await redis('sadd', 'users', id);

    const tok = signToken({ sub: id, role: 'admin', exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
    res.setHeader('Set-Cookie', sessionCookie(tok));
    return send(res, 201, { ok: true, data: { id, email, username, role: 'admin', verified: true } }, 0);
  } catch (e) {
    return fail(res, e.status || 500, e.message);
  }
};
