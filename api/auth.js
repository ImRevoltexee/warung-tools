// ALL auth routes in ONE serverless function (Vercel Hobby max 12 functions).
// Rewrite: /api/auth/:action -> /api/auth?action=:action (lihat vercel.json).
// Aksi: signup | login | logout | me | seed
const { send, fail, ok, preflight } = require('./_lib');
const { redis, toObj, getSettings } = require('./_store');
const {
  hashPassword, verifyPassword, validEmail, newUserId,
  signToken, sessionCookie, clearCookie, getUser,
} = require('./_auth');

const ADMIN_EMAIL = 'revolt.codes@gmail.com';

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e5) reject(new Error('Body kegedean')); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('Body harus JSON')); } });
    req.on('error', reject);
  });
}

function cleanUsername(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 30);
}

function actionOf(req) {
  const u = new URL(req.url, 'http://x');
  const q = (u.searchParams.get('action') || '').toLowerCase();
  if (q) return q;
  const m = u.pathname.match(/\/api\/auth\/([a-z]+)/);
  return m ? m[1] : '';
}

async function signup(req, res, b) {
  const email = String(b.email || '').trim().toLowerCase();
  const pw = String(b.password || '');
  const name = String(b.name || '').trim().slice(0, 60);
  const username = cleanUsername(b.username || b.name || email.split('@')[0]);

  if (!validEmail(email)) return fail(res, 400, 'Email tidak valid.');
  if (pw.length < 8) return fail(res, 400, 'Password minimal 8 karakter.');
  if (pw.length > 128) return fail(res, 400, 'Password maksimal 128 karakter.');
  if (!username || username.length < 3) return fail(res, 400, 'Username minimal 3 karakter (huruf/angka/._).');

  const settings = await getSettings();
  if (settings.signup_enabled !== '1') return fail(res, 403, 'Pendaftaran sedang ditutup admin.');

  const exists = await redis('get', `user:email:${email}`);
  if (exists) return fail(res, 409, 'Email ini sudah terdaftar. Login aja.');
  const unameTaken = await redis('get', `user:uname:${username}`);
  if (unameTaken) return fail(res, 409, 'Username sudah dipakai. Coba yang lain.');

  const total = Number(await redis('scard', 'users')) || 0;
  const id = await newUserId();
  const role = total === 0 ? 'admin' : 'user';

  await redis('hset', `user:id:${id}`,
    'email', email, 'name', name, 'username', username, 'role', role, 'plan', 'free',
    'verified', role === 'admin' ? '1' : '0',
    'pass', hashPassword(pw), 'disabled', '0', 'created', new Date().toISOString());
  await redis('set', `user:email:${email}`, id);
  await redis('set', `user:uname:${username}`, id);
  await redis('sadd', 'users', id);

  const tok = signToken({ sub: id, role, exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
  res.setHeader('Set-Cookie', sessionCookie(tok));
  return send(res, 201, { ok: true, data: { id, email, name, username, role, plan: 'free', admin_pertama: role === 'admin' } }, 0);
}

async function login(req, res, b) {
  const email = String(b.email || '').trim().toLowerCase();
  if (!validEmail(email) || !b.password) return fail(res, 400, 'Isi email + password.');

  const id = await redis('get', `user:email:${email}`);
  const SALAH = 'Email atau password salah.';
  if (!id) return fail(res, 401, SALAH);

  const u = toObj(await redis('hgetall', `user:id:${id}`));
  if (!u.email || !verifyPassword(String(b.password), u.pass)) return fail(res, 401, SALAH);
  if (u.disabled === '1') return fail(res, 403, 'Akun ini dinonaktifkan. Hubungi admin.');

  const tok = signToken({ sub: id, role: u.role || 'user', exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
  res.setHeader('Set-Cookie', sessionCookie(tok));
  return send(res, 200, { ok: true, data: { id, email: u.email, name: u.name || '', username: u.username || '', verified: u.verified === '1', role: u.role || 'user', plan: u.plan || 'free' } }, 0);
}

async function seed(req, res, b) {
  const email = String(b.email || '').trim().toLowerCase();
  const pw = String(b.password || '');
  const username = cleanUsername(b.username || 'REVOLT') || 'revolt';

  if (email !== ADMIN_EMAIL) return fail(res, 403, 'Seed hanya untuk admin awal.');
  if (!validEmail(email)) return fail(res, 400, 'Email tidak valid.');
  if (pw.length < 8) return fail(res, 400, 'Password minimal 8 karakter.');

  const exists = await redis('get', `user:email:${email}`);
  if (exists) return fail(res, 409, 'Admin sudah ada. Login aja di /login. Endpoint seed sudah mati.');

  const unameTaken = await redis('get', `user:uname:${username}`);
  if (unameTaken) return fail(res, 409, 'Username sudah dipakai.');

  const id = await newUserId();
  await redis('hset', `user:id:${id}`,
    'email', email, 'name', 'REVOLT', 'username', username,
    'role', 'admin', 'plan', 'pro', 'verified', '1',
    'pass', hashPassword(pw), 'disabled', '0', 'created', new Date().toISOString());
  await redis('set', `user:email:${email}`, id);
  await redis('set', `user:uname:${username}`, id);
  await redis('sadd', 'users', id);

  const tok = signToken({ sub: id, role: 'admin', exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
  res.setHeader('Set-Cookie', sessionCookie(tok));
  return send(res, 201, { ok: true, data: { id, email, username, role: 'admin', verified: true } }, 0);
}

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  const a = actionOf(req);

  try {
    if (a === 'me') {
      if (req.method !== 'GET') return fail(res, 405, 'Pakai GET.');
      const u = await getUser(req);
      if (!u) return fail(res, 401, 'Belum login.');
      return ok(res, u, 0);
    }
    if (a === 'logout') {
      res.setHeader('Set-Cookie', clearCookie());
      return send(res, 200, { ok: true, data: { logout: true } }, 0);
    }
    if (req.method !== 'POST') return fail(res, 405, 'Pakai POST.');
    let b;
    try { b = await body(req); } catch (e) { return fail(res, 400, e.message); }

    if (a === 'signup') return signup(req, res, b);
    if (a === 'login') return login(req, res, b);
    if (a === 'seed') return seed(req, res, b);
    return fail(res, 404, 'Auth action tidak ada. Pakai: signup, login, logout, me, seed.');
  } catch (e) {
    return fail(res, e.status || 500, e.message);
  }
};
