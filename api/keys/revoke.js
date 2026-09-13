// POST /api/keys/revoke { prefix } — nonaktifkan key sendiri.
const { send, fail, preflight } = require('../_lib');
const { redis, toObj } = require('../_store');
const { getUser } = require('../_auth');

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
  let u;
  try { u = await getUser(req); } catch (e) { return fail(res, e.status || 500, e.message); }
  if (!u) return fail(res, 401, 'Login dulu.');
  let b;
  try { b = await body(req); } catch (e) { return fail(res, 400, e.message); }

  const prefix = String(b.prefix || '').trim();
  if (!prefix) return fail(res, 400, 'Isi prefix key yang mau di-revoke.');

  try {
    const hashes = (await redis('smembers', `user:${u.id}:keys`)) || [];
    for (const sha of hashes) {
      const k = toObj(await redis('hgetall', `key:${sha}`));
      if (k.prefix === prefix) {
        await redis('hset', `key:${sha}`, 'status', 'revoked');
        await redis('srem', `user:${u.id}:keys`, sha);
        return send(res, 200, { ok: true, data: { revoked: prefix } }, 0);
      }
    }
    return fail(res, 404, 'Key tidak ketemu di akun lu.');
  } catch (e) { return fail(res, e.status || 500, e.message); }
};
