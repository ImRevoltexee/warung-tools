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

/* centang biru ala sosmed — pakai untuk user verified */
function badge(v) {
  return v ? ' <span class="vbadge" title="Terverifikasi">✓</span>' : '';
}

/* build the shared nav so every page stays in sync */
function nav(active) {
  const links = [
    ['/', 'Home'],
    ['/tools/wa-link', 'WA Link'],
    ['/tools/qr', 'QR'],
    ['/tools/json', 'JSON'],
    ['/tools/uuid', 'UUID'],
    ['/tools/hash', 'Hash'],
    ['/tools/wordcount', 'Kata'],
    ['/tools/case', 'Case'],
    ['/tools/color', 'Warna'],
    ['/tools/password', 'Password'],
    ['/tools/kompres', 'Kompres'],
    ['/tools/nota', 'Nota'],
    ['/tools/margin', 'Margin'],
    ['/tools/splitbill', 'Split Bill'],
    ['/tools/umur', 'Umur'],
    ['/tools/stopwatch', 'Timer'],
    ['/tools/todo', 'Todo'],
    ['/tools/lorem', 'Lorem'],
    ['/tools/yt-thumb', 'YT Thumb'],
    ['/tools/meta-seo', 'Meta SEO'],
    ['/anime', 'Anime'],
    ['/gempa', 'Gempa'],
    ['/cuaca', 'Cuaca'],
    ['/sholat', 'Sholat'],
    ['/support', '💛 Support'],
    ['/login', 'Masuk'],
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
  // setting publik: pengumuman + nama web + tagline (diatur admin dari panel)
  const ann = document.getElementById('ann');
  fetch('/api/settings').then(r => r.json()).then(j => {
    const s = j?.data || {};
    if (s.announcement && ann) { ann.textContent = '📣 ' + s.announcement; ann.classList.add('show'); }
    if (s.site_name) {
      document.querySelectorAll('[data-site]').forEach(el => el.textContent = s.site_name);
      const logo = document.querySelector('.logo');
      if (logo && !logo.dataset.fixed) logo.textContent = '⚡ ' + s.site_name;
    }
    const tg = document.getElementById('tagline');
    if (tg && s.tagline) tg.textContent = s.tagline;
  }).catch(() => {});
});
