// GET /api/auth/me — siapa yang login sekarang.
const { fail, ok, preflight } = require('../_lib');
const { getUser } = require('../_auth');

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  try {
    const u = await getUser(req);
    if (!u) return fail(res, 401, 'Belum login.');
    return ok(res, u, 0);
  } catch (e) {
    return fail(res, e.status || 500, e.message);
  }
};
