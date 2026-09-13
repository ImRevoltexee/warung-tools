// POST /api/auth/logout — hapus cookie session.
const { send, preflight } = require('../_lib');
const { clearCookie } = require('../_auth');

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  res.setHeader('Set-Cookie', clearCookie());
  return send(res, 200, { ok: true, data: { logout: true } }, 0);
};
