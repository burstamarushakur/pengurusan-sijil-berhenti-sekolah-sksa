# Sistem Sijil Tamat Persekolahan SK Sungai Abong 2026

Frontend Vite/React untuk pengisian dan jana PDF Sijil Tamat Persekolahan Arus Perdana + PPKI.

## Backend
Backend production menggunakan project Supabase Portal KOKU yang sama dan Edge Function `school-leaving-api`.

## Login
Login menggunakan nombor kad pengenalan 12 digit. Pengguna yang dibenarkan:
- MOHD HASRUL ASRAF BIN OTHMAN
- NOR FARAHIN BINTI MOHD HALIL
- MARDIANA BT SAMSURY
- SITI HAJAR BINTI SUBARI
- NOOR HIDAYAH BT JAMAL (PPKI)

IC sebenar tidak disimpan dalam jadual login. Backend menyimpan SHA-256 sahaja. Selepas login, backend mengeluarkan token sesi 12 jam. Setiap simpanan murid direkodkan dengan nama pengguna dan audit log.

## Arus Perdana
- 3 kelas Tahun 6 kekal seperti sedia ada.
- No. siri `jba5095/2026/001` hingga `079` kekal mengikut alphabetical semua murid Tahun 6 merentas ketiga-tiga kelas.

## PPKI
- Dashboard ada kad `PENDIDIKAN KHAS (PPKI)`.
- Sistem menyenaraikan semua murid PPKI aktif daripada 4 kelas PPKI semasa.
- Guru tandakan hanya murid yang akan tamat persekolahan.
- Selepas pilihan disimpan, hanya murid yang dipilih masuk ke paparan pengisian sijil.
- No. siri PPKI bermula `jba5095/2026/080` dan bersambung 081, 082, ... mengikut alphabetical **murid PPKI yang dipilih sahaja**.
- Mengubah pilihan PPKI akan menyusun semula siri PPKI sahaja. Siri 001–079 arus perdana tidak berubah.
- Maklumat peribadi, KOKU, status, PDF, tandatangan dan audit log menggunakan aliran yang sama seperti arus perdana.

## PDF
Master: `public/sijil-template.pdf`
Tandatangan: `public/tandatangan-gb-clean.png`

KOKU menukar `AJK 1`, `AJK 8`, dan sebagainya kepada `AJK` sahaja dalam paparan/PDF. No. siri PDF dicetak bold.

## Deploy frontend
```bash
npm install
npm run build
```
Deploy folder ini ke Vercel/GitHub seperti projek Vite biasa.

> Migration dan Edge Function production telah dikemas kini semasa pembangunan. Fail dalam `supabase/` disertakan untuk rujukan/redeploy. Jangan jalankan semula migration production tanpa keperluan.
