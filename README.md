# PALM - Aplikasi Timbangan & Kalkulator Upah Sawit
##  Deskripsi Proyek PALM adalah aplikasi pencatatan timbangan sawit dan kalkulator upah otomatis yang dirancang khusus untuk perkebunan swadaya. Aplikasi ini dibangun untuk menyelesaikan masalah pencatatan manual menggunakan kertas yang rawan hilang, memicu selisih data panen, dan memakan waktu lama saat merekap upah pekerja. Dengan PALM, waktu rekapitulasi harian dapat dipangkas dari rata-rata 2 jam menjadi di bawah 5 menit.
##  Fitur Utama (MVP)
Form Input Timbangan Digital: Memudahkan Mandor untuk mencatat berat kotor (Bruto) dan berat truk kosong (Tara) secara cepat.
Kalkulator Upah Otomatis: Menghitung nominal uang secara instan berdasarkan tonase (berat bersih x tarif upah).
Offline-First: Aplikasi tetap bisa digunakan dan menyimpan data saat sinyal internet di perkebunan hilang (blank spot), lalu otomatis menyinkronkan data saat sinyal pulih.
Dashboard Pemilik Kebun: Menampilkan grafik ringkasan panen harian dan rincian daftar tagihan upah.
##  Metodologi & Alur Kerja Proyek ini dikembangkan dengan pendekatan spec-driven development menggunakan framework GSD Core dan agentic AI (Claude Code). Alur pengembangan kami mengikuti fase:
Discuss: Mengeksplorasi masalah pencatatan manual di lapangan.
Plan: Menyusun dokumen spesifikasi (PRD) dan merencanakan alur kerja tanpa menulis kode terlebih dahulu.
Execute: Menginstruksikan agen AI untuk membangun fitur sesuai spesifikasi.
Verify: Memverifikasi akurasi perhitungan upah dan menguji ketahanan aplikasi saat mode offline.
Ship: Merapikan kode dan menggabungkannya ke repository utama.
Pengerjaan kode secara paralel dalam tim dikelola menggunakan sistem git worktrees untuk meminimalkan risiko konflik file.
##  Tim Pengembang (Kelompok DAUN)
Dafa Rizal Ramanda: Product Owner & Mobile Dev
Muhammad Farhan Haafidh Abror: Backend Dev
Sifa Aulia Aroyaningrum: Full Stack Dev

