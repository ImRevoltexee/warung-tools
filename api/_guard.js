// Guard for public API endpoints: maintenance + API key quota + anon IP limit + stats.
// Usage at top of route: const g = await guard(req, res, 'gempa'); if (!g) return;
// Returns { tier: 'key'|'anon', key: {...}|null }.
const crypto = require('crypto');
const { fail } = require('./_lib');
const { redis, toObj, getSettings } = require('./_store');
const { getUser, getIP } = require('./_auth');

function dayStr() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
function minStr() {
  return new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '');
}

async function hit(key, ttlSec) {
  const n = Number(await redis('incr', key));
  if (n === 1) await redis('expire', key, ttlSec).catch(() => {});
  return n;
}

async function guard(req, res, endpoint) {
  let settings;
  try {
    settings = await getSettings();
  } catch (e) {
    // DB down = public API tetap jalan tanpa limit (fail-open biar demo/SEO hidup).
    // Auth & admin routes fail-closed di file masing-masing (needDB).
    return { tier: 'anon-nodb', key: null };
  }

  // Stats (best-effort, jangan gagalkan request).
  hit(`stats:req:${dayStr()}`, 86400 * 3).catch(() => {});
  hit('stats:req_total', 86400 * 365).catch(() => {});

  // Maintenance: hanya admin yang lolos.
  if (settings.maintenance === '1') {
    try {
      const u = await getUser(req);
      if (u?.role !== 'admin') {
        fail(res, 503, 'Web sedang maintenance. Coba lagi nanti.');
        return null;
      }
      return { tier: 'admin', key: null, user: u };
    } catch {
      fail(res, 503, 'Web sedang maintenance. Coba lagi nanti.');
      return null;
    }
  }

  // API key? Header x-api-key atau ?key= / ?api_key=
  const url = new URL(req.url, 'http://x');
  const raw =
    req.headers['x-api-key'] ||
    url.searchParams.get('key') ||
    url.searchParams.get('api_key') ||
    '';
  const keyStr = String(raw).trim();

  if (keyStr) {
    const sha = crypto.createHash('sha256').update(keyStr).digest('hex');
    const k = await redis('hgetall', `key:${sha}`).then(toObj).catch(() => null);

    if (!k?.user || k.status !== 'active') {
      fail(res, 401, 'API key tidak valid atau sudah di-revoke. Bikin baru di dashboard.');
      return null;
    }
    const u = await redis('hgetall', `user:id:${k.user}`).then(toObj).catch(() => ({}));
    if (!u?.email || u.disabled === '1') {
      fail(res, 403, 'Akun pemilik key ini dinonaktifkan.');
      return null;
    }

    const day = dayStr();
    const quota = Number(k.quota_day) || Number(settings.free_day) || 1000;
    const used = Number(await hit(`use:${sha}:${day}`, 86400 * 2).catch(() => 0));
    if (used > quota) {
      fail(res, 429, `Quota harian key ini habis (${quota}/hari). Upgrade plan atau tunggu besok.`, 0);
      return null;
    }
    const perMin = Number(settings.key_min) || 60;
    const m = Number(await hit(`rl:key:${sha}:${minStr()}`, 120).catch(() => 0));
    if (m > perMin) {
      res.setHeader('Retry-After', '60');
      fail(res, 429, `Kebanyakan request (${perMin}/menit per key). Pelanin dikit.`, 0);
      return null;
    }
    res.setHeader('X-Quota-Limit', String(quota));
    res.setHeader('X-Quota-Used', String(used));
    return { tier: 'key', key: { prefix: k.prefix, quota_day: quota, used }, user: { id: k.user, role: u.role } };
  }

  // Anon: limit per IP biar demo di web tetap jalan tapi tidak bisa disedot.
  const ip = getIP(req).replace(/[^a-zA-Z0-9.:]/g, '').slice(0, 64);
  const anonMin = Number(settings.anon_min) || 30;
  const anonDay = Number(settings.anon_day) || 200;
  const m = Number(await hit(`rl:ip:${ip}:${minStr()}`, 120).catch(() => 0));
  if (m > anonMin) {
    res.setHeader('Retry-After', '60');
    fail(res, 429, `Limit anonim ${anonMin}/menit tercapai. Pakai API key gratis biar quota lebih gede — daftar di /signup.`, 0);
    return null;
  }
  const d = Number(await hit(`rl:ipday:${ip}:${dayStr()}`, 86400 * 2).catch(() => 0));
  if (d > anonDay) {
    fail(res, 429, `Limit harian anonim habis (${anonDay}/hari per IP). Daftar gratis buat API key di /signup.`, 0);
    return null;
  }
  return { tier: 'anon', key: null };
}

module.exports = { guard, dayStr, minStr };
