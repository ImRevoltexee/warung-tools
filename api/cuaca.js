// GET /api/cuaca?kota=Jakarta         -> cuaca sekarang + prakiraan 3 hari
// GET /api/cuaca?kota=Jakarta&hari=5
// Sumber: wttr.in (OpenStreetMap-based), tanpa API key.
const { ok, fail, preflight, getJSON, cleanStr } = require('./_lib');
const { guard } = require('./_guard');

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  const g = await guard(req, res, 'cuaca');
  if (!g) return;
  const url = new URL(req.url, 'http://x');
  const paramKota = url.searchParams.get('kota');
  // Parameter ada tapi kosong = permintaan salah. Parameter tidak ada = pakai Jakarta.
  if (paramKota !== null && !paramKota.trim()) {
    return fail(res, 400, 'Param kota tidak boleh kosong. Contoh: /api/cuaca?kota=Jakarta');
  }
  const kota = cleanStr(paramKota || 'Jakarta', 60);
  const hari = Math.min(Math.max(parseInt(url.searchParams.get('hari') || '3', 10) || 3, 1), 3);

  try {
    const j = await getJSON(`https://wttr.in/${encodeURIComponent(kota)}?format=j1`, {
      timeout: 10000,
    });

    const cur = j.current_condition?.[0] || {};
    const area = j.nearest_area?.[0] || {};
    const desc = (arr) => arr?.[0]?.value || null;

    const sekarang = {
      kota: desc(area.areaName) || kota,
      negara: desc(area.country),
      suhu: Number(cur.temp_C),
      terasa: Number(cur.FeelsLikeC),
      kelembapan: Number(cur.humidity),
      angin_kmh: Number(cur.windspeedKmph),
      arah_angin: cur.winddir16Point,
      tekanan: Number(cur.pressure),
      jarak_pandang_km: Number(cur.visibility),
      tutupan_awan: Number(cur.cloudcover),
      hujan_mm: Number(cur.precipMM),
      uv: cur.uvIndex != null ? Number(cur.uvIndex) : null,
      waktu_observasi: cur.observation_time,
      kondisi: cur.weatherDesc?.[0]?.value || null,
    };

    const prakiraan = (j.weather || []).slice(0, hari).map((d) => ({
      tanggal: d.date,
      suhu_max: Number(d.maxtempC),
      suhu_min: Number(d.mintempC),
      matahari_terbit: d.astronomy?.[0]?.sunrise,
      matahari_terbenam: d.astronomy?.[0]?.sunset,
      per_jam: (d.hourly || [])
        .filter((_, i) => i % 3 === 0)
        .map((h) => ({
          jam: String(h.time).padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:00'),
          suhu: Number(h.tempC),
          terasa: Number(h.FeelsLikeC),
          hujan_peluang: Number(h.chanceofrain),
          kondisi: h.weatherDesc?.[0]?.value || null,
        })),
    }));

    return ok(res, { sekarang, prakiraan, sumber: 'wttr.in' }, 600, { kota: sekarang.kota });
  } catch (e) {
    return fail(res, 502, `Kota "${kota}" tidak ketemu atau sumber cuaca sedang down. (${e.message})`);
  }
};
