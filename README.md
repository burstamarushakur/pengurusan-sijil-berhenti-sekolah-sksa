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

## PDF
Master: `public/sijil-template.pdf`
Tandatangan: `public/tandatangan-gb-clean.png`

## Deploy frontend
```bash
npm install
npm run build
```
Deploy folder ini ke Vercel/GitHub seperti projek Vite biasa.

> Migration dan Edge Function production telah dipasang semasa pembangunan. Fail dalam `supabase/` disertakan untuk rujukan/redeploy sahaja.
