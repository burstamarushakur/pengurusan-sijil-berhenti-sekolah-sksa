# Sistem Sijil Tamat Persekolahan SK Sungai Abong 2026

Webapp untuk guru kelas Tahun 6 melengkapkan dan menjana **Sijil Tamat Persekolahan Sekolah Rendah** terus daripada data Supabase Portal KOKU.

## Apa yang sudah disambungkan

- Supabase project: **Perjumpaan Kokurikulum SKSA**
- Tahun 6: 6 IBNU BATTUTAH, 6 IBNU KHALDUN, 6 IBNU SINA
- Nama, tarikh lahir, no. kad pengenalan, tarikh masuk sekolah: auto daripada database murid
- Kelab/Persatuan, Sukan/Permainan, Unit Beruniform + jawatan: auto daripada Portal KOKU
- Kelakuan: `BAIK`
- Tarikh keluar: `31/12/2026`
- No. siri: `jba5095/2026/001` dan seterusnya
- Kepimpinan: guru kelas isi
- Nombor Sijil Lahir: guru kelas isi jika data sumber belum ada
- PDF menggunakan `public/sijil-template.pdf`
- Tandatangan Guru Besar menggunakan `public/tandatangan-gb-clean.png`
- Download PDF seorang murid atau satu kelas

## Keselamatan

Frontend tidak membaca table murid secara terus. Semua data melalui Supabase Edge Function `school-leaving-api` menggunakan service role di server. Login webapp menggunakan pengesahan kata laluan sistem yang sama dengan mekanisme BMI/SEGAK sedia ada (`segak_bridge_authorized`).

## Jalankan secara lokal

```bash
npm install
npm run dev
```

## Deploy Vercel

Import folder/repository ini ke Vercel. Framework akan dikesan sebagai Vite. Tiada environment variable frontend diperlukan kerana frontend hanya memanggil Edge Function yang sudah dideploy.

## Backend yang sudah dibuat

Migration:

`supabase/migrations/20261001_add_school_leaving_certificate_2026.sql`

Edge Function:

`supabase/functions/school-leaving-api/index.ts`

Pada 1 Oktober 2026, migration dan Edge Function ini telah pun dipasang pada project Supabase production SKSA.

## Nota data

Fail data murid semasa tidak mempunyai medan nombor sijil lahir. Sebab itu medan tersebut kekal boleh diisi dalam webapp dan disimpan dalam `school_leaving_certificates.birth_certificate_no`.
