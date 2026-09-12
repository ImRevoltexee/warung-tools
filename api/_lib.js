// Shared helpers for all /api routes.
// Vercel skips files starting with "_" when creating routes, so this is import-safe.

const UA = 'WarungTools/1.0 (+https://github.com/)';

function send(res, status, body, cacheSeconds = 300) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (cacheSeconds > 0) {
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`
    );
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.end(JSON.stringify(body));
}

function ok(res, data, cacheSeconds = 300, extra = {}) {
  send(res, 200, { ok: true, ...extra, data }, cacheSeconds);
}

function fail(res, status, message, cacheSeconds = 0) {
  send(res, status, { ok: false, error: message }, cacheSeconds);
}

function preflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return true;
  }
  return false;
}

async function getJSON(url, { timeout = 9000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'application/json', ...headers },
    });
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Upstream balikin bukan JSON (HTTP ${r.status})`);
    }
    if (!r.ok) throw new Error(`Upstream error HTTP ${r.status}`);
    return json;
  } finally {
    clearTimeout(t);
  }
}

function todayJakarta() {
  // WIB = UTC+7 — pakai supaya tanggal jadwal sholat tidak geser saat server di UTC.
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function cleanStr(v, max = 100) {
  return String(v ?? '').trim().slice(0, max);
}

function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

module.exports = { send, ok, fail, preflight, getJSON, todayJakarta, cleanStr, isDate };
