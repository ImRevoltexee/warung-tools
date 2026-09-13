// GET /api/settings -> setting publik (dipakai semua halaman).
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
      site_name: s.site_name || 'MR.TOOLS',
      tagline: s.tagline || '',
      support_title: s.support_title || '',
      support_text: s.support_text || '',
      saweria: s.donate_saweria || '',
      sociabuzz: s.donate_sociabuzz || '',
      leaderboard_on: s.leaderboard_enabled !== '0',
    }, 60);
  } catch (e) {
    // DB belum diset = web tetap jalan sebagai tools gratis.
    return ok(res, { announcement: '', maintenance: false, signup_enabled: false, site_name: 'MR.TOOLS', tagline: '', support_title: '', support_text: '', saweria: '', sociabuzz: '', leaderboard_on: true, akun_mati: true }, 60);
  }
};
