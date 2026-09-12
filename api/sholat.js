// GET /api/sholat?kota=Jakarta              -> jadwal hari ini (WIB)
// GET /api/sholat?kota=Jakarta&tanggal=2026-09-20
// GET /api/sholat                               -> daftar semua kota
// Sumber: myQuran API (api.myquran.com), data Kemenag.
const { ok, fail, preflight, getJSON, todayJakarta, cleanStr, isDate } = require('./_lib');

const BASE = 'https://api.myquran.com/v2/sholat';

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  const url = new URL(req.url, 'http://x');
  const kota = cleanStr(url.searchParams.get('kota'), 60);
  const tanggal = cleanStr(url.searchParams.get('tanggal'), 10);

  try {
    if (!kota) {
      const j = await getJSON(`${BASE}/kota/semua`, { timeout: 12000 });
      const list = (j.data || []).map((k) => ({ id: k.id, kota: k.lokasi }));
      return ok(res, list, 86400, { jumlah: list.length });
    }

    const tgl = isDate(tanggal) ? tanggal : todayJakarta();

    // Cari id kota dulu (myQuran butuh numeric id).
    const cari = await getJSON(`${BASE}/kota/cari/${encodeURIComponent(kota)}`, { timeout: 12000 });
    const kandidat = cari.data || [];
    if (!kandidat.length) {
      return fail(res, 404, `Kota "${kota}" tidak ditemukan. Coba /api/sholat untuk daftar kota.`);
    }
    // Ambil match paling relevan (yang paling pendek namanya biasanya yang paling umum).
    const pilih = kandidat.sort((a, b) => a.lokasi.length - b.lokasi.length)[0];

    const j = await getJSON(`${BASE}/jadwal/${pilih.id}/${tgl}`, { timeout: 12000 });
    const d = j.data || {};
    const jd = d.jadwal || {};

    return ok(
      res,
      {
        kota: d.lokasi,
        provinsi: d.daerah,
        tanggal: jd.date || tgl,
        tanggal_lengkap: jd.tanggal,
        waktu: {
          imsak: jd.imsak,
          subuh: jd.subuh,
          terbit: jd.terbit,
          dhuha: jd.dhuha,
          dzuhur: jd.dzuhur,
          ashar: jd.ashar,
          maghrib: jd.maghrib,
          isya: jd.isya,
        },
        sumber: 'myQuran (Kemenag)',
      },
      21600,
      { alternatif: kandidat.slice(0, 5).map((k) => k.lokasi) }
    );
  } catch (e) {
    return fail(res, 502, `Gagal ambil jadwal sholat: ${e.message}`);
  }
};
