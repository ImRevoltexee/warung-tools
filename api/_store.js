// Redis store via Upstash REST (zero dependency, fetch only).
// Schema:
//   users (SET of user ids) | user:email:<email> -> id | user:id:<id> (HASH)
//   key:<sha256> (HASH: user, name, prefix, quota_day, status, created)
//   user:<id>:keys (SET of key hashes)
//   settings (HASH) | stats (counters) | rl:* (rate limit counters)
const BASE = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

function needDB() {
  if (!BASE || !TOKEN) {
    const e = new Error(
      'Database belum dikonfigurasi. Tambahkan UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN di Vercel > Settings > Environment Variables.'
    );
    e.status = 503;
    throw e;
  }
}

async function redis(cmd, ...args) {
  needDB();
  const path = [cmd.toLowerCase(), ...args.map((a) => encodeURIComponent(String(a)))].join('/');
  const r = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error('DB error: ' + j.error);
  return j.result;
}

// Upstash HGETALL returns flat array [f,v,f,v] (or object on some clients) — normalize.
function toObj(h) {
  if (!h) return {};
  if (!Array.isArray(h)) return h;
  const o = {};
  for (let i = 0; i < h.length; i += 2) o[h[i]] = h[i + 1];
  return o;
}

const DEFAULT_SETTINGS = {
  announcement: '',
  maintenance: '0',
  signup_enabled: '1',
  free_day: '10000',
  pro_day: '50000',
  anon_min: '120',
  anon_day: '2000',
  key_min: '120',
  site_name: 'MR.TOOLS',
  tagline: 'Tools & API gratis, tanpa login, tanpa paywall.',
  donate_saweria: '',
  donate_sociabuzz: '',
  support_title: 'Dukung MR.TOOLS ☕',
  support_text: 'Semua tools & API 100% gratis, tanpa login, tanpa quota wajib. Kalau terbantu, traktir gue biar server & domain tetap hidup.',
  leaderboard_enabled: '1',
};

async function getSettings() {
  const h = toObj(await redis('hgetall', 'settings'));
  return { ...DEFAULT_SETTINGS, ...h };
}

async function setSettings(patch) {
  const flat = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS) flat.push(k, String(v ?? ''));
  }
  if (flat.length) await redis('hset', 'settings', ...flat);
  return getSettings();
}

// ponytail: full-scan admin list; fine <10k users. Upgrade: SCAN pagination when bigger.
async function listUsers() {
  const ids = (await redis('smembers', 'users')) || [];
  const out = [];
  for (const id of ids) {
    const u = toObj(await redis('hgetall', `user:id:${id}`));
    if (u.email) out.push({ id, email: u.email, name: u.name || '', username: u.username || '', verified: u.verified === '1', role: u.role || 'user', plan: u.plan || 'free', disabled: u.disabled === '1', created: u.created || '' });
  }
  return out.sort((a, b) => (a.created < b.created ? 1 : -1));
}

// Donasi manual (admin input dari panel; sumber: Saweria/Sociabuzz, tanpa API key).
// Schema: don:list = [json...] tiap {nama, nominal, pesan, tanggal}
async function listDonations() {
  const arr = (await redis('lrange', 'don:list', '0', '-1')) || [];
  return arr.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

async function countKeys() {
  return Number((await redis('get', 'stats:keys_total')) || 0);
}

module.exports = { redis, toObj, getSettings, setSettings, listUsers, listDonations, countKeys, DEFAULT_SETTINGS, needDB };
