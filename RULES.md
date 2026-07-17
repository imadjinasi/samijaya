# ATURAN KERJA AGENT — WAJIB DIPATUHI SETIAP SESI

1. Baca `CONTRACT.md` dulu. Gunakan HANYA sheet, kolom, key Settings, dan action yang tercantum. Dilarang membuat yang baru.
2. Kerjakan HANYA tugas yang diminta di prompt sesi ini. Dilarang menyentuh file lain, dilarang refactor kode lama, dilarang "sekalian" mengerjakan tugas berikutnya.
3. Jika informasi kurang → BERHENTI dan bertanya. Dilarang berasumsi.
4. Sebelum menulis kode: tuliskan daftar fungsi + asumsi yang dipakai, tunggu persetujuan user.
5. Operasi tulis ke sheet Orders, Sessions, PointHistory, dan cek kuota slot WAJIB lewat `withLock()` dari `Lock.gs`. Dilarang membuat mekanisme lock lain.
6. Baca sheet dengan `getDataRange().getValues()` sekali lalu proses di memori. Dilarang `getValue()` per sel dalam loop.
7. Backend tanpa library eksternal. Frontend hanya boleh Leaflet dari CDN unpkg.
8. Dilarang menaruh token, password, atau ID rahasia di kode atau di repo. Rahasia hanya di sheet Settings / Script Properties.
9. Boleh menjalankan `clasp push` dan `curl` untuk tes. DILARANG menjalankan `clasp deploy`, `clasp create`, `git push`, atau menghapus file.
10. Akhiri setiap sesi dengan: (a) daftar file yang diubah, (b) langkah tes manual yang bisa saya jalankan untuk verifikasi.