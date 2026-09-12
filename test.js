// Smoke test semua route + API. Jalankan: node test.js [base]
// Default base: http://localhost:4321
const BASE = process.argv[2] || 'http://localhost:4321';

const PAGES = [
  '/', '/tools/wa-link', '/tools/qr', '/tools/json', '/tools/base64', '/tools/password',
  '/tools/kompres', '/tools/nota', '/tools/margin', '/tools/splitbill',
  '/anime', '/gempa', '/cuaca', '/sholat',
  '/assets/style.css', '/assets/app.js', '/sitemap.xml',
];

const APIS = [
  ['/api/anime?q=naruto&limit=3', j => j.ok && Array.isArray(j.data) && j.data.length > 0],
  ['/api/anime?id=20', j => j.ok && j.data.judul],
  ['/api/gempa', j => j.ok && j.data.terbaru],
  ['/api/cuaca?kota=Bandung', j => j.ok && j.data.sekarang.suhu != null],
  ['/api/sholat?kota=Jakarta', j => j.ok && j.data.waktu.subuh],
  ['/api/sholat?kota=Jakarta&tanggal=2026-09-20', j => j.ok && j.data.waktu.maghrib],
  ['/api/sholat', j => j.ok && j.data.length > 100],
  ['/api/gempa?x=1', j => j.ok],
];

const BAD = [
  ['/api/anime', 400],
  ['/api/anime?id=abc', 400],
  ['/api/cuaca?kota=', 400],
  ['/api/sholat?kota=zzzzqqq', 404],
  ['/api/tidakada', 404],
];

let pass = 0, fail = 0;
const log = (ok, msg) => { ok ? pass++ : fail++; console.log(`${ok ? '  ✅' : '  ❌'} ${msg}`); };

async function head(path) {
  const r = await fetch(BASE + path);
  const t = await r.text();
  return { status: r.status, len: t.length, type: r.headers.get('content-type') || '', body: t };
}

(async () => {
  console.log(`\n=== PAGES (${BASE}) ===`);
  for (const p of PAGES) {
    try {
      const r = await head(p);
      log(r.status === 200 && r.len > 200, `${p} → HTTP ${r.status}, ${r.len} bytes`);
    } catch (e) { log(false, `${p} → ${e.message}`); }
  }

  console.log(`\n=== API ===`);
  for (const [p, check] of APIS) {
    try {
      const r = await head(p);
      const j = JSON.parse(r.body);
      log(r.status === 200 && check(j), `${p} → HTTP ${r.status} ${JSON.stringify(j).slice(0, 90)}`);
    } catch (e) { log(false, `${p} → ${e.message}`); }
  }

  console.log(`\n=== ERROR HANDLING ===`);
  for (const [p, expect] of BAD) {
    try {
      const r = await head(p);
      const j = JSON.parse(r.body);
      log(r.status === expect && j.ok === false, `${p} → HTTP ${r.status} (harap ${expect}): ${j.error || ''}`);
    } catch (e) { log(false, `${p} → ${e.message}`); }
  }

  console.log(`\n=== CORS / CACHE ===`);
  try {
    const r = await fetch(BASE + '/api/gempa');
    log(r.headers.get('access-control-allow-origin') === '*', `CORS: ${r.headers.get('access-control-allow-origin')}`);
    log(/s-maxage=\d+/.test(r.headers.get('cache-control') || ''), `Cache-Control: ${r.headers.get('cache-control')}`);
  } catch (e) { log(false, e.message); }

  console.log(`\n${'='.repeat(40)}\nHASIL: ${pass} lolos, ${fail} gagal\n`);
  process.exit(fail ? 1 : 0);
})();
