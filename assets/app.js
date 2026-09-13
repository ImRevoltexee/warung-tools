/* shared helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 1800);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Tersalin ✓'); }
  catch {
    const a = document.createElement('textarea');
    a.value = text; document.body.appendChild(a); a.select();
    document.execCommand('copy'); a.remove(); toast('Tersalin ✓');
  }
}

function setOut(el, text, isErr) {
  el.textContent = text || '';
  el.classList.toggle('err', !!isErr);
}

const rupiah = n => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');

function rnd(base, spread) { return Math.floor(base + Math.random() * spread); }

/* build the shared nav so every page stays in sync */
function nav(active) {
  const links = [
    ['/', 'Home'],
    ['/tools/wa-link', 'WA Link'],
    ['/tools/qr', 'QR'],
    ['/tools/json', 'JSON'],
    ['/tools/base64', 'Base64'],
    ['/tools/password', 'Password'],
    ['/tools/kompres', 'Kompres'],
    ['/tools/nota', 'Nota'],
    ['/tools/margin', 'Margin'],
    ['/tools/splitbill', 'Split Bill'],
    ['/anime', 'Anime'],
    ['/gempa', 'Gempa'],
    ['/cuaca', 'Cuaca'],
    ['/sholat', 'Sholat'],
    ['/login', 'Masuk'],
    ['/dashboard', 'Dashboard'],
  ];
  const h = $('header.top .wrap');
  if (!h) return;
  const n = document.createElement('nav');
  for (const [href, label] of links) {
    if (href === active) continue;
    const a = document.createElement('a');
    a.href = href; a.textContent = label;
    n.appendChild(a);
  }
  h.appendChild(n);
}

/* fetch our own API with clear errors */
async function api(path) {
  const r = await fetch(path, { headers: { accept: 'application/json' } });
  let j = null;
  try { j = await r.json(); } catch { throw new Error('Respons bukan JSON (HTTP ' + r.status + ')'); }
  if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

document.addEventListener('DOMContentLoaded', () => {
  const p = location.pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
  nav(p);
  // announcement bar (diisi admin dari panel, via /api/settings)
  const ann = document.getElementById('ann');
  if (ann) {
    fetch('/api/settings').then(r => r.json()).then(j => {
      const a = j?.data?.announcement;
      if (a) { ann.textContent = '📣 ' + a; ann.classList.add('show'); }
    }).catch(() => {});
  }
});
