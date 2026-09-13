// Dashboard user: GET /api/keys (list key sendiri) + POST /api/keys (bikin key baru).
const { send, fail, ok, preflight } = require('../_lib');
const { redis, toObj, getSettings } = require('../_store');
const { getUser, newApiKey } = require('../_auth');

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
  let u;
  try { u = await getUser(req); } catch (e) { return fail(res, e.status || 500, e.message); }
  if (!u) return fail(res, 401, 'Login dulu di /login.');

  // ---------- LIST ----------
  if (req.method === 'GET') {
    try {
      const day = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      const hashes = (await redis('smembers', `user:${u.id}:keys`)) || [];
      const out = [];
      for (const sha of hashes) {
        const k = toObj(await redis('hgetall', `key:${sha}`));
        const used = Number(await redis('get', `use:${sha}:${day}`).catch(() => 0)) || 0;
        if (k.prefix) out.push({
          prefix: k.prefix, name: k.name || '', status: k.status || 'active',
          quota_day: Number(k.quota_day) || 0, used_today: used, created: k.created || '',
        });
      }
      return ok(res, out, 0);
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }

  // ---------- CREATE ----------
  if (req.method !== 'POST') return fail(res, 405, 'Pakai GET atau POST.');
  let b;
  try { b = await body(req); } catch (e) { return fail(res, 400, e.message); }

  try {
    const settings = await getSettings();
    const maxKeys = u.role === 'admin' ? 50 : 5;
    const punya = Number(await redis('scard', `user:${u.id}:keys`)) || 0;
    if (punya >= maxKeys) return fail(res, 403, `Maksimal ${maxKeys} key per akun. Hapus yang lama dulu.`);

    const { raw, sha, prefix } = newApiKey();
    const name = String(b.name || 'key-1').trim().slice(0, 60) || 'key-1';
    const quota = u.plan === 'pro' ? Number(settings.pro_day) : Number(settings.free_day);
    await redis('hset', `key:${sha}`,
      'user', u.id, 'prefix', prefix, 'name', name,
      'quota_day', String(quota), 'status', 'active', 'created', new Date().toISOString());
    await redis('sadd', `user:${u.id}:keys`, sha);
    await redis('incr', 'stats:keys_total');
    // key mentah HANYA ditampilkan sekali ini. Habis itu tidak bisa dilihat lagi.
    return send(res, 201, { ok: true, data: { key: raw, prefix, name, quota_day: quota, peringatan: 'Simpan key ini sekarang — tidak akan ditampilkan lagi.' } }, 0);
  } catch (e) { return fail(res, e.status || 500, e.message); }
};
