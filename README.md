# Goethe B2 — Word Charts

Website flashcard / word charts ringan, cepat, dan 100% statis untuk menghafal kosakata (*Wortschatz* & *Redemittel*) level Goethe-Zertifikat B2.

## Fitur Utama
- **100% Statis & Tanpa Server**: HTML + CSS + JavaScript murni (0 dependensi, 0 Serverless Function, 0 Vercel Blob).
- **Slide & Panah + Swipe**: Navigasi tombol panah kiri/kanan, keyboard (`←` / `→`), dan geser sentuh (*swipe*) di HP.
- **Flip Arti**: Klik kartu atau tekan `Spasi` untuk membalik arti dan catatan B2.
- **Warna Artikel Jerman**: Penandaan warna otomatis untuk *der* (biru), *die* (merah), dan *das* (hijau).
- **Sinkronisasi Lintas Perangkat (GitHub Gist Private)**: Hubungkan perangkat HP & laptop dengan GitHub Token (izin `gist` saja) untuk menyinkronkan status *Sudah Hafal* dan *Tandai Sulit* secara privat ke GitHub Gist Anda sendiri — dengan *debounce* 3,5 detik dan *circuit breaker* anti-loop.
- **Filter, Pencarian & Audio**: Filter tema, jenis kata, status hafalan, balik arah (`DE → ID` / `ID → DE`), acak kartu, mode **Daftar**, serta pelafalan `de-DE`.

## Struktur File
- `index.html` — Struktur halaman utama
- `styles.css` — Tampilan responsif (light & dark mode)
- `app.js` — Logika slide, filter, swipe, shortcut keyboard, dan sinkronisasi GitHub Gist Private
- `data/words.js` — Data kosakata (`window.GOETHE_B2_WORDS`)
- `vercel.json` — Header keamanan statis
