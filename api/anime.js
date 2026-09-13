// GET /api/anime?q=naruto&limit=10   -> cari anime
// GET /api/anime?id=20               -> detail satu anime
// Sumber utama: AniList GraphQL (stabil). Cadangan: Jikan v4 (MyAnimeList).
// Hanya metadata + cover + link. Bukan host video, bukan streaming bajakan.
const { ok, fail, preflight, getJSON, cleanStr } = require('./_lib');
const { guard } = require('./_guard');

const ANILIST = 'https://graphql.anilist.co';

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  description(asHtml: false)
  format
  status
  episodes
  duration
  season
  seasonYear
  averageScore
  meanScore
  popularity
  favourites
  genres
  studios(isMain: true) { nodes { name } }
  coverImage { extraLarge large color }
  bannerImage
  siteUrl
  trailer { site id }
  countryOfOrigin
  isAdult
`;

async function anilist(query, variables, attempt = 0) {
  const r = await fetch(ANILIST, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'WarungTools/1.0 (+https://warungtools.vercel.app)',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });

  const text = await r.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {
    // AniList balikin halaman HTML saat kena rate limit (429).
    // Mundur sebentar lalu coba lagi — tapi tetap di dalam batas maxDuration Vercel.
    const retryAfter = parseFloat(r.headers.get('retry-after') || '0');
    const tunggu = Math.min(retryAfter ? retryAfter * 1000 : 900 * (attempt + 1), 2500);
    if (attempt < 2) {
      await new Promise((s) => setTimeout(s, tunggu));
      return anilist(query, variables, attempt + 1);
    }
    throw new Error(
      r.status === 429
        ? 'AniList sedang membatasi permintaan (rate limit). Coba lagi beberapa detik lagi.'
        : `AniList tidak bisa diakses (HTTP ${r.status})`
    );
  }

  if (j.errors?.length) throw new Error(j.errors[0].message);
  if (!r.ok) throw new Error(`AniList HTTP ${r.status}`);
  return j.data;
}

const shape = (m) => ({
  id: m.id,
  id_mal: m.idMal,
  judul: m.title?.romaji || m.title?.english,
  judul_en: m.title?.english,
  judul_jp: m.title?.native,
  tipe: m.format,
  episode: m.episodes,
  durasi_menit: m.duration,
  status: m.status,
  musim: m.season,
  tahun: m.seasonYear,
  skor: m.averageScore ? m.averageScore / 10 : null,
  popularitas: m.popularity,
  favorit: m.favourites,
  genre: m.genres || [],
  studio: (m.studios?.nodes || []).map((s) => s.name),
  sinopsis: m.description
    ? m.description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 900)
    : null,
  gambar: m.coverImage?.extraLarge || m.coverImage?.large,
  banner: m.bannerImage,
  warna: m.coverImage?.color,
  trailer: m.trailer?.site === 'youtube' ? `https://www.youtube.com/watch?v=${m.trailer.id}` : null,
  negara: m.countryOfOrigin,
  dewasa: !!m.isAdult,
  link: m.siteUrl,
  sumber_data: 'AniList',
});

// --- Cadangan Jikan (dipakai kalau AniList down) ---
const JIKAN = 'https://api.jikan.moe/v4';
const jikanShape = (a) => ({
  id: null,
  id_mal: a.mal_id,
  judul: a.title,
  judul_en: a.title_english,
  judul_jp: a.title_japanese,
  tipe: a.type,
  episode: a.episodes,
  durasi_menit: a.duration ? parseInt(a.duration, 10) || null : null,
  status: a.status,
  musim: a.season,
  tahun: a.year,
  skor: a.score,
  popularitas: a.popularity,
  favorit: a.favorites,
  genre: (a.genres || []).map((g) => g.name),
  studio: (a.studios || []).map((s) => s.name),
  sinopsis: a.synopsis ? a.synopsis.slice(0, 900) : null,
  gambar: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url,
  banner: null,
  warna: null,
  trailer: a.trailer?.url || null,
  negara: null,
  dewasa: !!a.rating && a.rating.startsWith('Rx'),
  link: a.url,
  sumber_data: 'MyAnimeList (Jikan)',
});

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  const g = await guard(req, res, 'anime');
  if (!g) return;

  const url = new URL(req.url, 'http://x');
  const q = cleanStr(url.searchParams.get('q'), 80);
  const id = cleanStr(url.searchParams.get('id'), 12);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 1), 25);

  if (!q && !id) return fail(res, 400, 'Isi param q (judul) atau id. Contoh: /api/anime?q=naruto');

  // ---------- DETAIL ----------
  if (id) {
    if (!/^\d+$/.test(id)) return fail(res, 400, 'Param id harus angka');

    try {
      const d = await anilist(
        `query($id: Int){ Media(id: $id, type: ANIME){ ${MEDIA_FIELDS} } }`,
        { id: Number(id) }
      );
      if (d?.Media) return ok(res, shape(d.Media), 21600);
    } catch {
      /* jatuh ke cadangan */
    }

    try {
      const j = await getJSON(`${JIKAN}/anime/${id}/full`);
      if (j?.data) return ok(res, jikanShape(j.data), 21600);
    } catch {
      /* kedua sumber gagal */
    }
    return fail(res, 502, `Anime id ${id} tidak ketemu di AniList maupun MyAnimeList.`);
  }

  // ---------- CARI ----------
  try {
    const d = await anilist(
      `query($q: String, $n: Int){
         Page(page: 1, perPage: $n){
           media(search: $q, type: ANIME, isAdult: false, sort: [POPULARITY_DESC, SCORE_DESC]){
             ${MEDIA_FIELDS}
           }
         }
       }`,
      { q, n: limit }
    );
    const list = (d?.Page?.media || []).map(shape);
    if (list.length) return ok(res, list, 3600, { query: q, jumlah: list.length, sumber: 'AniList' });
  } catch {
    /* jatuh ke cadangan */
  }

  try {
    const j = await getJSON(
      `${JIKAN}/anime?q=${encodeURIComponent(q)}&limit=${limit}&sfw=true`
    );
    const list = (j?.data || []).map(jikanShape);
    return ok(res, list, 3600, { query: q, jumlah: list.length, sumber: 'MyAnimeList (Jikan)' });
  } catch (e) {
    return fail(res, 502, `Gagal ambil data anime: ${e.message}`);
  }
};
