// Auth: scrypt password + HS256 JWT in httpOnly cookie. Stdlib only (node:crypto).
// ponytail: no refresh-token rotation; session 7 days flat. Add refresh when abuse appears.
const crypto = require('crypto');
const { redis, toObj } = require('./_store');

const COOKIE = 'wt_session';
const SECRET = () => {
  const s = process.env.JWT_SECRET || '';
  if (!s) {
    const e = new Error('JWT_SECRET belum diset di Environment Variables.');
    e.status = 503;
    throw e;
  }
  return s;
};

const b64u = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function signToken(payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac('sha256', SECRET()).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

function verifyToken(tok) {
  try {
    const [h, p, s] = String(tok).split('.');
    if (!h || !p || !s) return null;
    const want = b64u(crypto.createHmac('sha256', SECRET()).update(`${h}.${p}`).digest());
    if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
    const payload = JSON.parse(unb64u(p).toString());
    if (payload.exp && Date.now() > payload.exp * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(pw, stored) {
  try {
    const [, salt, hash] = String(stored).split('$');
    const h = crypto.scryptSync(pw, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
  } catch {
    return false;
  }
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(tok) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `${COOKIE}=${encodeURIComponent(tok)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 86400}${secure}`;
}

function clearCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function validEmail(e) {
  return /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(String(e || '').trim().toLowerCase());
}

async function getUser(req) {
  const tok = cookies(req)[COOKIE];
  if (!tok) return null;
  const p = verifyToken(tok);
  if (!p?.sub) return null;
  const u = toObj(await redis('hgetall', `user:id:${p.sub}`));
  if (!u.email || u.disabled === '1') return null;
  return { id: p.sub, email: u.email, name: u.name || '', username: u.username || '', verified: u.verified === '1', role: u.role || 'user', plan: u.plan || 'free' };
}

async function newUserId() {
  return 'u_' + crypto.randomBytes(6).toString('hex');
}

function newApiKey() {
  const raw = 'mrt_live_' + crypto.randomBytes(24).toString('hex');
  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, sha, prefix: raw.slice(0, 13) + '…' };
}

function getIP(req) {
  const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || req.socket?.remoteAddress || 'unknown';
}

module.exports = {
  COOKIE, signToken, verifyToken, hashPassword, verifyPassword, cookies,
  sessionCookie, clearCookie, validEmail, getUser, newUserId, newApiKey, getIP,
};
