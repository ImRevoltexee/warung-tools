// GET /api/gempa  -> gempa terbaru + 15 gempa terakhir (BMKG, data publik resmi)
const { ok, fail, preflight, getJSON } = require('./_lib');
const { guard } = require('./_guard');

const AUTO = 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json';
const RECENT = 'https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json';

function shape(g) {
  if (!g) return null;
  return {
    tanggal: g.Tanggal,
    jam: g.Jam,
    waktu: g.DateTime,
    lintang: g.Lintang,
    bujur: g.Bujur,
    koordinat: g.Coordinates,
    magnitude: Number(g.Magnitude) || g.Magnitude,
    kedalaman: g.Kedalaman,
    wilayah: g.Wilayah,
    potensi: g.Potensi,
    dirasakan: g.Dirasakan || null,
    shakemap: g.Shakemap
      ? `https://data.bmkg.go.id/DataMKG/TEWS/${g.Shakemap}`
      : null,
  };
}

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  const g = await guard(req, res, 'gempa');
  if (!g) return;
  try {
    const [auto, recent] = await Promise.allSettled([getJSON(AUTO), getJSON(RECENT)]);
    const terbaru =
      auto.status === 'fulfilled' ? shape(auto.value?.Infogempa?.gempa) : null;
    const list =
      recent.status === 'fulfilled'
        ? (recent.value?.Infogempa?.gempa || []).slice(0, 15).map(shape)
        : [];

    if (!terbaru && !list.length) return fail(res, 502, 'BMKG tidak bisa dihubungi');

    return ok(
      res,
      { terbaru, terakhir: list, sumber: 'BMKG (data.bmkg.go.id)' },
      120
    );
  } catch (e) {
    return fail(res, 502, `Gagal ambil data gempa: ${e.message}`);
  }
};
