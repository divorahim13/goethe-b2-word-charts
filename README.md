# Goethe B2 — Word Charts

Website flashcard / word charts ringan, cepat, dan responsif untuk menghafal kosakata (*Wortschatz* & *Redemittel*) level Goethe-Zertifikat B2.

## Fitur Utama
- **Ringan & Tanpa Build**: HTML + CSS + JavaScript murni (0 dependensi, siap langsung buka atau deploy).
- **Slide & Panah + Swipe**: Navigasi tombol panah kiri/kanan, keyboard (`←` / `→`), dan geser sentuh (*swipe*) di HP.
- **Flip Arti**: Klik kartu atau tekan `Spasi` untuk membalik arti, contoh kalimat, dan catatan B2.
- **Warna Artikel Jerman**: Penandaan warna otomatis untuk *der* (biru), *die* (merah), dan *das* (hijau).
- **Filter & Pencarian**: Filter berdasarkan tema, jenis kata, status hafalan (*Sudah Hafal* / *Ditandai Sulit*), balik arah (`DE → ID` / `ID → DE`), acak kartu, serta mode **Daftar**.
- **Pelafalan (`de-DE`)**: Tombol audio menggunakan Web Speech API bawaan browser.
- **Progres Tersimpan Lokal**: Status hafalan & tema gelap/terang tersimpan otomatis di `localStorage`.

## Struktur File
- `index.html` — Struktur halaman utama
- `styles.css` — Tampilan responsif (light & dark mode)
- `app.js` — Logika slide, filter, swipe, shortcut keyboard, dan penyimpanan lokal
- `data/words.js` — Data kosakata (`window.GOETHE_B2_WORDS`, saat ini masih kosong menunggu input Anda)

## Cara Online ke GitHub Pages atau Vercel
### 1. Vercel (Paling Cepat)
1. Upload folder `word-charts-b2` ke repositori GitHub Anda (atau drag & drop / `vercel` CLI).
2. Di Vercel, pilih **Import Project** → pilih repo Anda → **Framework Preset: Other** → **Deploy** (tidak perlu build command).

### 2. GitHub Pages
1. Push isi folder `word-charts-b2` ke branch `main` repositori GitHub.
2. Buka **Settings → Pages → Build and deployment**.
3. Pilih **Deploy from a branch** → branch `main` → folder `/ (root)` → **Save**.
