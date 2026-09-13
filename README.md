# MR.TOOLS

Kumpulan tools gratis tanpa login + REST API publik. Jalan di Vercel free tier, modal 0.

Dibuat static-first: tools berjalan di browser (0 beban server), API hanya dipakai untuk data publik.

## Isi

**Tools (client-side, tanpa server)**

| URL | Fungsi |
|---|---|
| `/tools/wa-link` | Generator link WhatsApp dengan pesan otomatis |
| `/tools/qr` | QR code generator (teks, WA, WiFi, email, telepon) + download PNG |
| `/tools/json` | Format, minify, urutkan, validasi JSON |
| `/tools/base64` | Encode/decode Base64 (unicode + file kecil) |
| `/tools/password` | Password generator pakai crypto.getRandomValues + cek kekuatan |
| `/tools/kompres` | Kompres & convert gambar ke WebP, resize, download |
| `/tools/nota` | Nota/struk warung 58mm siap cetak thermal |
| `/tools/margin` | Kalkulator margin, markup, simulasi diskon |
| `/tools/splitbill` | Bagi tagihan rata atau per item + pajak/service |

**Halaman data (pakai API publik)**

| URL | Data |
|---|---|
| `/anime` | Cari anime (AniList, cadangan MyAnimeList) |
| `/gempa` | Gempa terbaru BMKG |
| `/cuaca` | Cuaca + prakiraan 3 hari |
| `/sholat` | Jadwal sholat per kota/kabupaten |

## REST API

Semua endpoint balikin JSON `{ ok, data }` atau `{ ok:false, error }`. Tanpa API key, CORS terbuka.

```
GET /api/anime?q=naruto&limit=10       # cari anime
GET /api/anime?id=20                   # detail anime
GET /api/gempa                         # gempa terbaru + 15 terakhir
GET /api/cuaca?kota=Jakarta&hari=3     # cuaca + prakiraan
GET /api/sholat                        # daftar semua kota
GET /api/sholat?kota=Jakarta           # jadwal hari ini (WIB)
GET /api/sholat?kota=Jakarta&tanggal=2026-09-20
```

Cache: `s-maxage` di CDN 2–24 jam tergantung endpoint, jadi aman dipanggil berulang.

## Struktur

```
index.html              # landing
tools/*.html            # 9 tools client-side
anime.html gempa.html   # halaman data
cuaca.html sholat.html
api/
  _lib.js               # helper bersama (tidak jadi route karena prefix _)
  anime.js gempa.js cuaca.js sholat.js
assets/style.css        # tema neo-brutalism
assets/app.js           # helper + nav bersama
vercel.json             # cleanUrls + header cache + CORS
dev-server.js           # server lokal, meniru routing Vercel
robots.txt sitemap.xml
```

## Jalankan lokal

```bash
node dev-server.js          # http://localhost:3000
PORT=4321 node dev-server.js
```

`dev-server.js` meniru perilaku Vercel: `/api/<nama>` memanggil `api/<nama>.js`, dan `/tools/wa-link` melayani `tools/wa-link.html` (efek `cleanUrls`).

## Deploy

1. Push repo ke GitHub.
2. Import di Vercel, framework preset **Other**, tanpa build command, output directory root.
3. Selesai — tidak ada environment variable yang dibutuhkan.

## Sumber data pihak ketiga

- **AniList GraphQL** (`graphql.anilist.co`) — metadata anime
- **Jikan v4** (`api.jikan.moe`) — cadangan MyAnimeList
- **BMKG** (`data.bmkg.go.id`) — gempa, data publik resmi
- **myQuran** (`api.myquran.com`) — jadwal sholat berbasis Kemenag
- **wttr.in** — cuaca (berbasis OpenStreetMap)
- **api.qrserver.com** — generate QR

Tidak ada video, tidak ada konten streaming, tidak ada file bajakan. Hanya metadata + link ke halaman resmi.

## Yang sengaja TIDAK dibuat

Streaming/downloader film atau anime. Alasannya: melanggar hak cipta, domain bisa kena takedown, dan bandwidth Vercel free tier akan jebol. Halaman anime hanya metadata + trailer resmi YouTube.

## Lisensi

MIT — pakai bebas.
