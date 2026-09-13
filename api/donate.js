// GET /api/donate -> leaderboard donasi + link support (publik)
// POST /api/donate (admin only) {aksi: tambah|hapus, nama, nominal, pesan, tanggal, idx}
const { send, fail, ok, preflight } = require('./_lib');

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
  const { redis, getSettings, listDonations } = require('./_store');

  if (req.method === 'GET') {
    try {
      const [s, list] = await Promise.all([getSettings(), listDonations().catch(() => [])]);
      const total = list.reduce((a, d) => a + (Number(d.nominal) || 0), 0);
      return ok(res, {
        title: s.support_title || 'Dukung MR.TOOLS',
        text: s.support_text || '',
        saweria: s.donate_saweria || '',
        sociabuzz: s.donate_sociabuzz || '',
        leaderboard_on: s.leaderboard_enabled !== '0',
        total, jumlah: list.length, top: list.slice(0, 20),
      }, 60);
    } catch (e) {
      return ok(res, { title: 'Dukung MR.TOOLS', text: '', saweria: '', sociabuzz: '', leaderboard_on: true, total: 0, jumlah: 0, top: [] }, 60);
    }
  }

  if (req.method !== 'POST') return fail(res, 405, 'Pakai GET atau POST.');
  let b;
  try { b = await body(req); } catch (e) { return fail(res, 400, e.message); }
  try {
    const { getUser } = require('./_auth');
    const u = await getUser(req);
    if (!u) return fail(res, 401, 'Login dulu.');
    if (u.role !== 'admin') return fail(res, 403, 'Khusus admin.');

    if (b.aksi === 'tambah') {
      const nama = String(b.nama || 'Hamba Allah').slice(0, 60);
      const nominal = Math.max(0, Math.floor(Number(b.nominal) || 0));
      const pesan = String(b.pesan || '').slice(0, 200);
      const tanggal = String(b.tanggal || new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)).slice(0, 10);
      if (!nominal) return fail(res, 400, 'Nominal harus > 0.');
      await redis('lpush', 'don:list', JSON.stringify({ nama, nominal, pesan, tanggal }));
      await redis('ltrim', 'don:list', '0', '199');
      return send(res, 201, { ok: true, data: { nama, nominal } }, 0);
    }
    if (b.aksi === 'hapus') {
      const idx = Number(b.idx);
      const cur = await redis('lrange', 'don:list', '0', '-1');
      if (!(idx >= 0 && idx < cur.length)) return fail(res, 404, 'Index tidak ketemu.');
      const tmp = '__del__' + Date.now();
      await redis('lset', 'don:list', String(idx), tmp);
      await redis('lrem', 'don:list', '1', tmp);
      return send(res, 200, { ok: true, data: { hapus: idx } }, 0);
    }
    return fail(res, 400, 'aksi: tambah | hapus');
  } catch (e) { return fail(res, e.status || 500, e.message); }
};
