# Sistem Sijil Tamat Persekolahan SK Sungai Abong 2026

Frontend Vite/React untuk pengisian dan jana PDF Sijil Tamat Persekolahan Tahun 6.

## Backend
Backend production menggunakan project Supabase Portal KOKU yang sama dan Edge Function `school-leaving-api`.

## Login
Login menggunakan nombor kad pengenalan 12 digit. Hanya empat pengguna yang dibenarkan:
- MOHD HASRUL ASRAF BIN OTHMAN
- NOR FARAHIN BINTI MOHD HALIL
- MARDIANA BT SAMSURY
- SITI HAJAR BINTI SUBARI

IC sebenar tidak disimpan dalam jadual login. Backend menyimpan SHA-256 sahaja. Selepas login, backend mengeluarkan token sesi 12 jam. Setiap simpanan murid direkodkan dengan nama pengguna dan audit log.

## Kemaskini 1 Oktober 2026
- Logo SKSA menggantikan ikon kunci pada skrin log masuk.
- Kepimpinan menggunakan dropdown jawatan sekolah yang ditetapkan.
- Paparan/output KOKU menukar `AJK 1`, `AJK 8`, dan sebagainya kepada `AJK` sahaja tanpa nombor AJK.
- Nombor siri pada PDF dicetak bold.
- Nombor siri `jba5095/2026/001` hingga `079` disusun semula mengikut nama murid secara alphabetical merentas ketiga-tiga kelas Tahun 6.

## PDF
Master: `public/sijil-template.pdf`
Tandatangan: `public/tandatangan-gb-clean.png`

## Deploy frontend
```bash
npm install
npm run build
```
Deploy folder ini ke Vercel/GitHub seperti projek Vite biasa.

> Migration production telah dipasang semasa pembangunan. Fail dalam `supabase/` disertakan untuk rujukan/redeploy sahaja. Jangan jalankan semula migration resequence pada production tanpa keperluan.
