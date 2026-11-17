# PRD: Pendaftaran Massal Peserta IELTS Mockup

Status: disetujui pemilik, diimplementasikan 18 November 2026.

## 1. Ringkasan

IELTS Mockup adalah tes berbayar yang hanya terbuka lewat undangan. Peserta sudah membayar di luar dashboard, lalu tim memetakan mereka dalam batch dari Excel atau CSV. PRD ini menambahkan sesi mockup dan impor massal yang membuat atau menautkan siswa, mendaftarkan mereka ke Database Siswa, membuat undangan dengan kode dan jendela tes, lalu mengirim undangan lewat antrean Email dan WhatsApp setelah tim menekan "Kirim semua".

Peserta mockup adalah siswa, bukan lead. Setiap peserta mendapat satu baris `pendaftaran` untuk program mockup dan periode sesi, sehingga muncul di Database Siswa dan di bagian Perjalanan belajar pada profilnya. Menu Pendaftaran terpisah tidak dibuat; pendaftaran tetap lewat Database Siswa sesuai keputusan di `docs/prd-pendaftaran-database-lead.md`.

## 2. Keputusan pemilik

| Topik | Keputusan |
|---|---|
| Status peserta | Siswa terdaftar, bukan lead. Impor membuat baris `pendaftaran` untuk program mockup dan periode sesi |
| Menu Pendaftaran | Tidak ada menu terpisah. Pendaftaran lewat Database Siswa, tombol "Daftarkan siswa" |
| Program mockup | Satu siswa mengerjakan tes dalam satu hari, tetapi satu gelombang bisa membentang beberapa hari dan siswa diplot pada tanggal dan jam yang berbeda. Program "IELTS Mockup" dan durasi "1 hari" di-seed di migrasi supaya impor langsung jalan, harga diisi tim |
| Periode sesi | Biasanya periode intake, tetapi boleh periode apa pun. Tim memilih periode yang sudah ada di Program & Kelas, dan boleh membuat periode baru kalau perlu |
| Hitungan daftar | Pendaftaran mockup ikut dihitung di "Daftar TN berapa kali" |
| Pengiriman | Setelah tim menekan "Kirim semua", undangan dikirim lewat antrean Email dan WhatsApp. Email memakai Cloudflare dengan kuota harian sekitar 200 email, termasuk email hasil tes. WhatsApp lewat AttCos tanpa batas |
| Kode tes | Selalu dibuat dashboard, 6 karakter, tidak berhubungan dengan kode pembayaran |
| Jendela tes | Mode terjadwal: setiap siswa punya tanggal dan jam sendiri, dan harus mulai dalam 2 jam sejak jadwalnya. Mode fleksibel: admin mengatur rentang tanggal, misalnya 17 sampai 19 November 2026, dan siswa boleh mulai kapan saja dalam rentang itu |
| Pembayaran | Tidak dicatat di dashboard. Tim memastikan pembayaran sebelum mengunggah daftar |

## 3. Istilah

Sesi mockup adalah satu gelombang peserta berbayar, dengan satu program, satu periode, satu paket soal, satu mode jendela tes, dan satu roster. Roster adalah daftar siswa di sesi itu. Kode tes adalah kode 6 karakter yang diketik siswa di halaman undangan. Tautan undangan adalah tautan per siswa yang memuat token rahasia. Program mockup adalah program "IELTS Mockup" di katalog Program & Kelas yang dipakai untuk baris `pendaftaran`.

## 4. Model sesi

Satu sesi mewakili satu gelombang. Karena satu gelombang bisa membentang beberapa hari, jadwal per siswa disimpan per undangan, bukan per sesi. Sesi menyimpan pengaturan bersama, roster menyimpan orang, dan undangan menyimpan jendela tes setiap orang.

| Kolom sesi | Isi |
|---|---|
| `name` | Nama sesi, misalnya "Mockup November 2026 Gelombang 1" |
| `window_mode` | `terjadwal` atau `fleksibel` |
| `range_start`, `range_end` | Wajib untuk mode `fleksibel`: rentang tanggal mulai dan akhir. Kosong untuk mode `terjadwal` |
| `entry_grace_seconds` | Wajib untuk mode `terjadwal`: jendela mulai setelah jadwal, default 7200 detik atau 2 jam |
| `program_id` | Program "IELTS Mockup" di katalog. Wajib, dipakai untuk `pendaftaran` |
| `period_id` | Periode untuk pendaftaran, biasanya periode intake. Wajib, dipilih tim |
| `duration_id` | Durasi program mockup "1 hari", dipakai untuk `pendaftaran` |
| `package_id` | Paket soal, misalnya Paket Demo A. Wajib |
| `quota` | Batas jumlah peserta, opsional |
| `status` | `draft`, `open`, `closed`, `cancelled` |
| `created_by`, `created_at`, `updated_at` | Jejak tim |

Aturan jendela tes:

1. Mode `terjadwal`: setiap siswa punya tanggal dan jam sendiri dari berkas atau dari roster. `invites.opens_at` diisi jadwal siswa itu. `invites.expires_at` diisi jadwal ditambah 2 jam. Siswa harus memulai dalam 2 jam sejak jadwalnya. Setelah mulai, dia tetap mendapat durasi penuh dari Pengaturan mockup, saat ini 167 menit, walaupun selesai melewati jendela.
2. Mode `fleksibel`: semua siswa memakai rentang yang diatur admin. `invites.opens_at` diisi awal rentang, `invites.expires_at` diisi akhir rentang. Siswa boleh mulai kapan saja dalam rentang itu dan mendapat durasi penuh dari saat mulai. Admin disarankan mengatur akhir rentang minimal 167 menit sebelum batas keras yang diinginkan.

Pemeriksaan undangan harus menolak sebelum `opens_at` dan sesudah `expires_at`; saat ini yang diperiksa baru `expires_at`, jadi pemeriksaan `opens_at` ditambahkan di halaman undangan dan saat membuat attempt.

Program dan periode wajib karena peserta harus menjadi siswa, bukan lead. Program "IELTS Mockup" di-seed di migrasi beserta durasi "1 hari" tanpa harga, dan tim mengisi harganya sekali di Program & Kelas. Periode dipilih dari yang sudah ada; kalau tidak ada yang cocok, tim membuat periode baru, misalnya "Mockup November 2026". Kalau program atau periode belum ada, impor berhenti dengan pesan yang jelas dan tidak menulis apa pun.

Sesi berstatus `draft` boleh diisi dan diubah. Status `open` berarti undangan sudah dibuat dan siap dikirim. Status `closed` berarti gelombang selesai. Status `cancelled` berarti sesi dibatalkan dan undangannya tidak dipakai.

## 5. Dua mode impor

| Mode sesi | Kolom berkas | Jendela tes |
|---|---|---|
| Terjadwal | `nama`, `whatsapp`, `email`, `tanggal_tes`, `jam_tes` | Per siswa, dari berkas |
| Fleksibel | `nama`, `whatsapp`, `email` | Sama untuk semua, dari rentang sesi |

Kedua mode memakai dialog impor yang sama. Sesi dipilih atau dibuat dulu, lalu berkas diunggah. Mode sesi menentukan kolom wajib berkas: sesi terjadwal menuntut `tanggal_tes` dan `jam_tes` per baris, sesi fleksibel menolak kolom tanggal dan memakai rentang sesi. Paket soal selalu dari sesi, supaya satu gelombang memakai paket yang sama.

## 6. Format berkas

Berkas CSV, UTF-8, pemisah koma, dengan baris header. Tim mengunduh template dari dialog impor sesuai mode sesi. Template berisi header dan satu baris contoh.

| Kolom | Wajib | Aturan |
|---|---|---|
| `nama` | Ya | Nama lengkap, 2 sampai 120 karakter |
| `whatsapp` | Ya | Nomor Indonesia. Menerima `08...`, `628...`, atau `+62...`, lalu dinormalisasi ke `62...` |
| `email` | Tidak | Kalau diisi, harus alamat email yang valid. Tanpa email, kanal email dilewati dan WhatsApp tetap jalan |
| `tanggal_tes` | Mode terjadwal | Format `YYYY-MM-DD`, waktu Asia/Jakarta |
| `jam_tes` | Mode terjadwal | Format `HH:MM`, 24 jam, waktu Asia/Jakarta |

Kode tes tidak ada di berkas karena selalu dibuat dashboard. Baris kosong diabaikan. Baris dengan kolom wajib kosong atau tidak valid ditandai error. Berkas dibatasi 2 MB dan 500 baris per impor. Berkas tidak disimpan di server setelah diproses.

## 7. Alur impor

1. Tim membuka IELTS Mockup, lalu tab Sesi.
2. Tim membuat sesi baru atau memilih sesi yang sudah ada, dengan mode terjadwal atau fleksibel.
3. Tim mengunduh template sesuai mode, mengisi daftar peserta, lalu mengunggah berkas.
4. Server membaca berkas, mencocokkan siswa, menghitung jendela tes, lalu mengembalikan pratinjau. Belum ada yang ditulis.
5. Pratinjau menampilkan nomor baris, nama, WhatsApp yang sudah dinormalisasi, email, status siswa lama atau baru, status pendaftaran lama atau baru, jadwal atau rentang tes, kode yang akan dibuat, serta error per baris.
6. Tim memperbaiki berkas kalau ada error. Impor menolak seluruh berkas kalau masih ada error, supaya tidak ada peserta yang terlewat tanpa disadari.
7. Setelah konfirmasi, satu transaksi membuat atau menautkan siswa, membuat baris `pendaftaran`, membuat undangan beserta jendela tes, dan mengisi baris antrean. Belum ada pesan yang terkirim.
8. Tim menekan "Kirim semua" di halaman sesi. Antrean Email dan antrean WhatsApp mulai berjalan. Tim bisa menjeda, melihat status per siswa, dan mengulang yang gagal.
9. Siswa menerima tautan dan kode lewat email atau WhatsApp. Undangan hanya bisa dibuka pada jendela tes siswa itu.

## 8. Pencocokan dan pendaftaran siswa

Pencocokan memakai WhatsApp setelah dinormalisasi, lalu email dalam huruf kecil. Kalau WhatsApp dan email menunjuk ke dua siswa berbeda, baris ditandai konflik dan tidak diimpor. Kalau tidak ada yang cocok, dashboard membuat siswa baru dengan nama, WhatsApp, email, sumber "IELTS Mockup", dan stage `terdaftar`.

Setiap peserta mendapat satu baris `pendaftaran` dengan program mockup, periode sesi, durasi "1 hari", kelas kosong, status `aktif`, catatan "Mockup [nama sesi]", dan `registered_by` berisi nama admin yang mengimpor. Kalau siswa sudah punya pendaftaran tidak batal untuk program dan periode yang sama, baris itu dipakai ulang dan tidak dibuat ganda.

Pendaftaran memakai logika yang sama dengan tombol "Daftarkan siswa" di Database Siswa, termasuk memperbarui kolom program, durasi, periode, dan kelas terbaru di tabel `students`. Dengan begitu siswa muncul di Database Siswa, di Perjalanan belajar profilnya, tidak lagi muncul di tab Lead, dan pendaftaran mockup ikut dihitung di "Daftar TN berapa kali".

## 9. Undangan dan kode

Setiap siswa mendapat satu undangan per sesi. Token undangan dibuat acak, hanya hash yang disimpan di `invites.token_hash`, dan token aslinya disimpan sementara di antrean sampai kedua kanal selesai, lalu dihapus.

Kode tes selalu dibuat dashboard: 6 karakter huruf besar dan angka, acak, unik, disimpan di `invites.code` dengan indeks unik yang sudah ada. Kode ini tidak berhubungan dengan kode pembayaran apa pun.

Jendela tes dihitung sesuai mode sesi, seperti di bagian 4. Paket soal diambil dari sesi dan disimpan di undangan.

Kalau siswa perlu dijadwalkan ulang, tim membuat undangan baru di sesi lain dan undangan lama yang belum dipakai dihapus atau ditandai diganti. Undangan yang sudah dipakai tidak dihapus, karena attempt dan hasilnya menunjuk ke undangan itu.

## 10. Antrean Email dan WhatsApp

Pengiriman baru mulai setelah tim menekan "Kirim semua" di halaman sesi. Sebelum itu, antrean hanya berisi baris berstatus `pending`. Tim bisa mengirim satu pesan uji ke alamat atau nomor admin dan melihat pratinjau isi pesan.

Antrean disimpan di tabel `mockup_invite_queue`, satu baris per undangan, dengan status terpisah untuk kedua kanal:

| Kanal | Status | Catatan |
|---|---|---|
| Email | `pending`, `sending`, `sent`, `failed`, `dilewati`, `kuota` | `dilewati` kalau siswa tidak punya email. `kuota` kalau jatah email hari ini habis |
| WhatsApp | `pending`, `sending`, `sent`, `failed` | Selalu dijalankan, karena AttCos lewat Baileys tidak punya batas harian |

Worker mengirim satu per satu dengan jeda beberapa detik, bukan puluhan permintaan sekaligus. Setiap pengiriman dicatat di `wa_messages` untuk WhatsApp, dan pengiriman email dicatat dengan status dan error dari Cloudflare.

Kuota email Cloudflare sekitar 200 email per hari dan dipakai bersama email hasil tes, jadi penghitungnya membaca semua email yang terkirim hari itu. Halaman sesi menampilkan "Email terkirim hari ini X dari 200". Kalau sisa kuota lebih kecil dari jumlah email yang menunggu, email berhenti dengan status `kuota` dan otomatis lanjut besok, sedangkan WhatsApp tetap jalan.

Pesan berisi nama siswa, nama sesi, jadwal siswa itu atau rentang sesi, tautan undangan, kode tes, dan batas akhir mulai. Isi pesan sama untuk kedua kanal, dengan format email dan format teks WhatsApp masing-masing. Setelah kedua kanal selesai, token asli dihapus dari antrean.

Percobaan per kanal dibatasi tiga kali sebelum menunggu tindakan tim. Tim bisa mengulang satu siswa per kanal dari roster.

## 11. Antarmuka

Tab baru "Sesi" di menu IELTS Mockup, di samping Soal & Jawaban, Submission, Bagian, Paket, dan Pengaturan. Tab ini berisi daftar sesi dengan mode jadwal, rentang, paket, program dan periode, jumlah peserta, jumlah email terkirim, jumlah WhatsApp terkirim, jumlah sudah mengerjakan, dan status.

Halaman detail sesi berisi roster: nama, WhatsApp, email, kode tes, jadwal atau rentang, status email, status WhatsApp, status tes, status pendaftaran, dan aksi per baris. Aksi roster adalah "Kirim semua", ulangi yang gagal per kanal, jeda antrean, kirim pesan uji, jadwalkan ulang, dan ekspor CSV. Tombol "Impor peserta" membuka dialog unggah.

Dialog impor berisi pilihan sesi, unduh template, unggah berkas, pratinjau, dan konfirmasi. Dialog menampilkan jumlah baris valid, jumlah siswa baru, jumlah siswa lama, dan daftar error.

Tombol undangan per siswa di halaman profil tetap ada untuk kasus satu orang, dan bisa memakai antrean yang sama belakangan.

## 12. API admin

| Method | Path | Isi |
|---|---|---|
| GET | `/api/admin/mockup/sessions` | Daftar sesi dan ringkasan roster |
| POST | `/api/admin/mockup/sessions` | Membuat sesi |
| PUT | `/api/admin/mockup/sessions/:id` | Mengubah sesi |
| POST | `/api/admin/mockup/sessions/:id/import` | Membaca berkas dan mengembalikan pratinjau, tanpa menulis |
| POST | `/api/admin/mockup/sessions/:id/import/confirm` | Menulis siswa, pendaftaran, undangan, dan antrean |
| POST | `/api/admin/mockup/sessions/:id/send` | Tim menekan "Kirim semua", antrean kedua kanal mulai |
| POST | `/api/admin/mockup/sessions/:id/pause` | Menjeda antrean |
| POST | `/api/admin/mockup/invites/:id/retry` | Mengulang satu kanal untuk satu siswa |
| GET | `/api/admin/mockup/sessions/:id/roster` | Roster lengkap dengan status kedua kanal |

Semua route butuh sesi admin dan menolak tulisan dari origin lain, seperti route admin yang sudah ada. Impor massal mencatat aktivitas admin, jumlah baris, dan nama sesi.

## 13. Model data dan migrasi

Migrasi baru `db/migrations/0015_mockup_sessions.sql`.

| Tabel | Perubahan |
|---|---|
| `mockup_sessions` | Tabel baru: `id`, `name`, `window_mode`, `range_start`, `range_end`, `entry_grace_seconds`, `program_id`, `period_id`, `duration_id`, `package_id`, `quota`, `status`, `created_by`, `created_at`, `updated_at` |
| `invites` | Tambah `session_id` yang menunjuk ke `mockup_sessions`, nullable untuk pre-test dan post-test |
| `mockup_invite_queue` | Tabel baru: `id`, `invite_id`, `email_status`, `email_attempts`, `email_error`, `email_sent_at`, `wa_status`, `wa_attempts`, `wa_error`, `wa_sent_at`, `plain_token`, `created_at` |
| `programs`, `program_durations` | Seed program "IELTS Mockup" mode Online dan durasi "1 hari" tanpa harga |
| `students` | Tidak berubah. Sumber "IELTS Mockup" ditambahkan ke daftar sumber |
| `pendaftaran` | Tidak berubah. Impor memakai kolom yang sudah ada |

Indeks unik baru pada `invites (session_id, student_id)` mencegah satu siswa mendapat dua undangan di sesi yang sama. Indeks unik kode yang sudah ada tetap menjadi penjaga terakhir.

## 14. Privasi dan keamanan

Berkas CSV berisi data pribadi. Unggahan lewat HTTPS, berkas hanya diproses di memori, dan tidak disimpan setelah impor. Data yang tersimpan adalah siswa, pendaftaran, undangan, antrean, dan log pengiriman, sama seperti data yang sudah ada.

Token undangan adalah rahasia. Hanya hash yang disimpan permanen. Token asli ada di antrean hanya sampai kedua kanal selesai, lalu dihapus. Kode tes disimpan sebagai teks biasa karena tim perlu mengirim ulang, sama seperti keputusan di PRD pendaftaran.

Email undangan dikirim dari `RESULT_FROM_EMAIL` lewat Cloudflare, sama seperti email hasil tes. Isi email dan WhatsApp hanya memuat nama, jadwal, tautan, dan kode. Log `wa_messages` menyimpan nomor, isi pesan, status, dan error untuk WhatsApp, dan pengiriman email menyimpan status dan errornya sendiri.

## 15. Acceptance criteria

1. Tim bisa membuat sesi terjadwal dengan jadwal per siswa, dan sesi fleksibel dengan rentang tanggal yang diatur admin.
2. Impor sesi terjadwal membuat undangan dengan `opens_at` dari tanggal dan jam baris itu, dan `expires_at` 2 jam kemudian.
3. Impor sesi fleksibel memberi semua siswa jendela dari rentang sesi.
4. Peserta mockup muncul di Database Siswa dan di Perjalanan belajar profilnya, bukan di tab Lead, dan pendaftarannya dihitung di "Daftar TN berapa kali".
5. Pratinjau menampilkan siswa lama atau baru, pendaftaran lama atau baru, jendela tes, dan error per baris. Tidak ada yang ditulis sebelum konfirmasi.
6. Berkas dengan WhatsApp ganda, email tidak valid, tanggal di masa lalu, atau jadwal kosong di mode terjadwal ditolak sebelum transaksi.
7. Kode tes selalu dibuat dashboard, 6 karakter, unik.
8. Tidak ada pesan yang terkirim sebelum tim menekan "Kirim semua".
9. Setelah "Kirim semua", email dan WhatsApp dikirim satu per satu, tercatat, dan status per kanal terlihat di roster. Yang gagal bisa diulang.
10. Siswa tanpa email mendapat WhatsApp saja, dengan email berstatus `dilewati`.
11. Kalau kuota email habis, email berhenti dengan status `kuota` dan lanjut besok, sedangkan WhatsApp tetap jalan.
12. Undangan tidak bisa dimulai sebelum `opens_at` dan tidak bisa dipakai setelah `expires_at`, dan durasi penuh tetap diberikan dari saat mulai.
13. Satu siswa tidak mendapat dua undangan di sesi yang sama.
14. `npm test` memuat parser CSV, normalisasi WhatsApp, pembuatan kode, pencocokan siswa, pembuatan pendaftaran, perhitungan jendela tes kedua mode, dan penghitungan kuota email.

## 16. Tahapan

Rilis pertama mencakup sesi kedua mode, impor CSV, pratinjau, pembuatan siswa dan pendaftaran, pembuatan undangan dan kode, antrean Email dan WhatsApp dengan status dan ulang, tombol "Kirim semua", roster, dan pemeriksaan jendela tes. Tombol undangan per siswa tetap ada.

Fase berikutnya mencakup XLSX langsung, pengingat H-1 dan H-1 jam, penjadwalan ulang dari roster, daftar tunggu, webhook pembayaran atau formulir pendaftaran publik, dan laporan per sesi.

## 17. Riwayat keputusan

Jawaban pemilik 17 November 2026 atas pertanyaan terbuka versi pertama PRD ini:

| No | Jawaban |
|---|---|
| 1 | Program mockup: satu siswa satu hari, tetapi satu gelombang bisa beberapa hari dengan siswa diplot pada tanggal dan jam berbeda. Program dan durasi "1 hari" di-seed, harga diisi tim |
| 2 | Periode: biasanya periode intake, tetapi boleh periode apa pun |
| 3 | Pendaftaran mockup ikut dihitung di "Daftar TN berapa kali" |
| 4 | Pengiriman lewat tombol "Kirim semua", lalu antrean Email dan WhatsApp. Email Cloudflare ada kuota harian, WhatsApp tidak |
| 5 | Masa tenggang 2 jam |
| 6 | Kode tes dibuat dashboard, tidak berhubungan dengan kode pembayaran |
| 7 | Setiap siswa punya tanggal dan jam sendiri, ditambah mode fleksibel dengan rentang tanggal yang diatur admin |
