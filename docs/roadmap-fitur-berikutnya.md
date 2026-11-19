# Roadmap: Fitur Berikutnya

Status: draf untuk diskusi. Tanggal: 19 November 2026.

Daftar ini lahir dari dua sumber: celah yang sudah dicatat di AGENTS.md sebagai batasan yang diketahui, dan alur yang paling menyentuh uang dan siswa. Lima kandidat, diurutkan dari nilai terhadap usaha.

## 1. Verifikasi sertifikat publik (rekomendasi pertama)

Siswa membayar untuk TOEFL dan IELTS Prediction, dan hal pertama yang dilakukan perusahaan atau kampus adalah memeriksa apakah sertifikatnya asli. Hari ini tidak ada cara untuk membuktikannya.

Rencananya satu halaman publik di `/verifikasi/<nomor>` (atau pindai QR pada PDF) tempat siapa pun memasukkan nomor sertifikat dan melihat nama penerima, jenis, tanggal terbit, dan status aktif atau dibatalkan. Tidak ada data pribadi, hanya yang memang sudah tercetak di kertas.

Pekerjaannya kecil: satu route publik di aplikasi tes plus satu QR di komponen PDF yang baru dibangun di `packages/core/src/certificate-pdf.js`. Nomor sudah unik di tabel `certificates`, dan status `revoked_at` sudah tersimpan, jadi tidak ada migrasi.

## 2. Lanjut setelah muat ulang

Hari ini satu muat ulang halaman atau satu sinyal hilang di perjalanan menghapus seluruh percobaan. Untuk mockup berbayar itu berarti tim harus menerbitkan undangan baru secara manual.

Server sudah menyimpan baris attempt dan anggaran waktunya, jadi melanjutkan berarti menyajikan kembali soal yang tersimpan dan mengisi ulang jawaban dari klien. Ini rasa sakit terbesar pelari tes dan pelindung sesi berbayar. Usaha menengah, dampak tinggi.

## 3. Coba ulang dan peringatan pengiriman hasil

Email dan WhatsApp hasil yang gagal terkirim duduk sebagai gagal selamanya; tim baru tahu ketika siswa mengeluh. Mesin sewa pengiriman (`delivery_lease_until`) sudah ada untuk pengiriman pertama, jadi satu sapuan berkala yang mengirim ulang yang gagal dan menampilkannya di Ringkasan adalah langkah kecil.

Setiap tes penempatan menjanjikan hasil lewat email dan WhatsApp, jadi ini soal menepati janji.

## 4. Pengingat tindak lanjut lead

Lead menjadi dingin setelah 90 hari tanpa aktivitas dan hilang dari antrean Ringkasan. Rencananya satu dorongan WhatsApp mingguan untuk lead di tahap Baru atau Dihubungi yang tidak ada aktivitasnya, dikirim lewat AttCos dengan persetujuan tim.

Ini nilai paling langsung: tes penempatan ada untuk mengisi kelas, dan tab Lead adalah sumber pendaftaran.

## 5. Laporan kemajuan pre dan post

Satu tampilan di halaman siswa: skor pre-test, skor post-test, selisihnya, dan riwayat band mockup kalau ada. Semua datanya sudah tersimpan di attempts. Nilai pendidikan untuk tim dan cerita kuat untuk perpanjangan: bukti programnya bekerja.

## Dua risiko yang bukan fitur tapi perlu diputuskan

1. Delapan belas video examiner pada mockup speaking berasal dari IELTS Online Tests. Hak pakainya harus dikonfirmasi sebelum mockup berbayar dijual.
2. Email hasil masih terkirim dari `index-now.dev`, bukan `titiknolenglish.com`. Terlihat janggal di kotak masuk siswa di samping sertifikat resmi.
