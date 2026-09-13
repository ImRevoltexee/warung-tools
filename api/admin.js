// Admin API. Semua route butuh login + role admin.
// GET  /api/admin/overview            -> statistik + settings
// POST /api/admin/settings {k:v}      -> ubah setting (announcement, maintenance, quota...)
// GET  /api/admin/users               -> daftar user + key mereka
// POST /api/admin/user {id, plan|disabled|role} -> ubah user
// POST /api/admin/key   {prefix, quota_day|status} -> ubah key siapa pun
const { send, fail, ok, preflight } = require('./_lib');
const { redis, toObj, getSettings, setSettings, listUsers, countKeys, DEFAULT_SETTINGS } = require('./_store');
const { getUser } = require('./_auth');

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 2e5) reject(new Error('Body kegedean')); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('Body harus JSON')); } });
    req.on('error', reject);
  });
}

function route(url) {
  const u = new URL(url, 'http://x');
  const q = (u.searchParams.get('admin_action') || u.searchParams.get('action') || u.searchParams.get('r') || '').toLowerCase();
  if (q) return q;
  const p = u.pathname;
  const i = p.indexOf('/api/admin/');
  return i >= 0 ? p.slice(i + '/api/admin/'.length).toLowerCase() : '';
}

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  let u;
  try { u = await getUser(req); } catch (e) { return fail(res, e.status || 500, e.message); }
  if (!u) return fail(res, 401, 'Login dulu.');
  if (u.role !== 'admin') return fail(res, 403, 'Halaman admin khusus admin.');

  const r = route(req.url);

  try {
    // ---------- OVERVIEW ----------
    if (req.method === 'GET' && (r === '' || r === 'overview')) {
      const settings = await getSettings();
      const users = await listUsers();
      const day = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      const [reqHari, reqTotal, keysTotal] = await Promise.all([
        redis('get', `stats:req:${day}`).catch(() => 0),
        redis('get', 'stats:req_total').catch(() => 0),
        countKeys().catch(() => 0),
      ]);
      return ok(res, {
        settings,
        setting_defs: Object.keys(DEFAULT_SETTINGS),
        stats: {
          tanggal: day,
          request_hari_ini: Number(reqHari) || 0,
          request_total: Number(reqTotal) || 0,
          total_user: users.length,
          total_key_dibuat: Number(keysTotal) || 0,
        },
      }, 0);
    }

    // ---------- DONASI (admin lihat semua) ----------
    if (req.method === 'GET' && r === 'donations') {
      const { listDonations } = require('./_store');
      const list = await listDonations();
      const total = list.reduce((a, d) => a + (Number(d.nominal) || 0), 0);
      return ok(res, { total, jumlah: list.length, semua: list }, 0);
    }

    // ---------- SETTINGS ----------
    if (req.method === 'POST' && r === 'settings') {
      const b = await body(req);
      const s = await setSettings(b);
      return send(res, 200, { ok: true, data: s }, 0);
    }

    // ---------- USERS ----------
    if (req.method === 'GET' && r === 'users') {
      const users = await listUsers();
      const out = [];
      for (const usr of users) {
        const hashes = (await redis('smembers', `user:${usr.id}:keys`).catch(() => [])) || [];
        const keys = [];
        for (const sha of hashes) {
          const k = toObj(await redis('hgetall', `key:${sha}`));
          if (k.prefix) keys.push({ prefix: k.prefix, name: k.name || '', status: k.status || 'active', quota_day: Number(k.quota_day) || 0 });
        }
        out.push({ ...usr, keys });
      }
      return ok(res, out, 0);
    }

    // ---------- UBAH USER ----------
    if (req.method === 'POST' && r === 'user') {
      const b = await body(req);
      const id = String(b.id || '').trim();
      if (!id) return fail(res, 400, 'Isi id user.');
      const cur = toObj(await redis('hgetall', `user:id:${id}`));
      if (!cur.email) return fail(res, 404, 'User tidak ketemu.');

      const patch = [];
      if (b.plan === 'free' || b.plan === 'pro') { patch.push('plan', b.plan); }
      if (b.disabled === true || b.disabled === '1' || b.disabled === 1) patch.push('disabled', '1');
      if (b.disabled === false || b.disabled === '0' || b.disabled === 0) patch.push('disabled', '0');
      if ((b.role === 'admin' || b.role === 'user') && id !== u.id) patch.push('role', b.role);
      if (b.verified === true || b.verified === '1' || b.verified === 1) patch.push('verified', '1');
      if (b.verified === false || b.verified === '0' || b.verified === 0) patch.push('verified', '0');
      if (patch.length) await redis('hset', `user:id:${id}`, ...patch);

      // plan pro/free langsung sinkron ke quota key aktif miliknya
      if (b.plan === 'free' || b.plan === 'pro') {
        const settings = await getSettings();
        const quota = b.plan === 'pro' ? settings.pro_day : settings.free_day;
        const hashes = (await redis('smembers', `user:${id}:keys`)) || [];
        for (const sha of hashes) await redis('hset', `key:${sha}`, 'quota_day', String(quota));
      }
      const upd = toObj(await redis('hgetall', `user:id:${id}`));
      return send(res, 200, { ok: true, data: { id, email: upd.email, username: upd.username, verified: upd.verified === '1', role: upd.role, plan: upd.plan, disabled: upd.disabled === '1' } }, 0);
    }

    // ---------- UBAH KEY (milik siapa pun) ----------
    if (req.method === 'POST' && r === 'key') {
      const b = await body(req);
      const { prefix } = b;
      if (!prefix) return fail(res, 400, 'Isi prefix key.');
      const ids = (await redis('smembers', 'users')) || [];
      for (const id of ids) {
        const hashes = (await redis('smembers', `user:${id}:keys`)) || [];
        for (const sha of hashes) {
          const k = toObj(await redis('hgetall', `key:${sha}`));
          if (k.prefix === prefix) {
            const patch = [];
            if (b.quota_day != null && Number(b.quota_day) >= 0) patch.push('quota_day', String(Number(b.quota_day)));
            if (b.status === 'active' || b.status === 'revoked') patch.push('status', b.status);
            if (b.name != null) patch.push('name', String(b.name).slice(0, 60));
            if (patch.length) await redis('hset', `key:${sha}`, ...patch);
            if (b.status === 'revoked') await redis('srem', `user:${id}:keys`, sha);
            const upd = toObj(await redis('hgetall', `key:${sha}`));
            return send(res, 200, { ok: true, data: { prefix, status: upd.status, quota_day: upd.quota_day, owner: id } }, 0);
          }
        }
      }
      return fail(res, 404, 'Key tidak ketemu.');
    }

    return fail(res, 404, 'Admin endpoint tidak ada. Lihat /api/admin/overview, /users, POST /settings, /user, /key.');
  } catch (e) {
    return fail(res, e.status || 500, e.message);
  }
};
