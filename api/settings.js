// GET /api/settings -> announcement + maintenance + signup status (publik, dipakai semua halaman).
const { ok, fail, preflight } = require('./_lib');

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  try {
    const { getSettings } = require('./_store');
    const s = await getSettings();
    return ok(res, {
      announcement: s.announcement || '',
      maintenance: s.maintenance === '1',
      signup_enabled: s.signup_enabled === '1',
      free_day: Number(s.free_day) || 0,
      pro_day: Number(s.pro_day) || 0,
    }, 60);
  } catch (e) {
    // DB belum diset = fitur akun mati, web tetap jalan sebagai tools gratis.
    return ok(res, { announcement: '', maintenance: false, signup_enabled: false, free_day: 0, pro_day: 0, akun_mati: true }, 60);
  }
};
