# PRD: Alur Mockup IELTS yang Taat Sesi dan Pencarian Siswa saat Menambah Peserta

Status: draf untuk direview. Tanggal: 20 November 2026.

## 1. Ringkasan

Ada dua lubang pada alur mockup IELTS hari ini.

Pertama, pintu belakang. Alur resmi mockup berbayar adalah: siswa membayar, tim membuat sesi, peserta masuk ke sesi itu, lalu undangan dikirim dari antrean sesi. Tetapi menu "Kirim tautan tes" pada halaman siswa bisa mengirim tautan IELTS Mockup langsung ke satu siswa lewat WhatsApp, tanpa sesi, tanpa kuota, tanpa jendela tes, dan tanpa tercatat di daftar peserta sesi mana pun. Fungsi itu dibuat untuk placement, pre-test, dan post-test yang memang gratis dan per-siswa, lalu IELTS Mockup ditambahkan ke daftarnya. Hasilnya jalan pintu untuk tes berbayar: undangan hidup tanpa sesi, deadline 14 hari bawaan undangan tunggal, dan tidak pernah masuk hitungan kuota atau roster.

Kedua, pintu depannya sempit. Menambah peserta ke sesi hanya lewat dua jalan: impor CSV atau satu form "Tambah peserta" dengan nama, nomor, dan email yang harus diketik ulang. Padahal orang yang mau ditambah hampir selalu sudah ada di Database Siswa. Tidak ada pencarian: tim tidak bisa mengetik nama, memilih siswa yang sudah ada, dan menaruhnya ke sesi. Nomor dan email yang cocok memang dipakai ulang otomatis oleh pencocokan CSV, tetapi tim harus menebak nomornya dengan benar lebih dulu, dan nama yang sama dengan nomor berbeda membuat siswa baru tanpa peringatan.

PRD ini menutup pintu belakang dan melebarkan pintu depan: mengirim undangan mockup selalu lewat sesi, dan menambah peserta ke sesi selalu bisa lewat pencarian siswa yang sudah ada.

## 2. Masalah

1. Mockup berbayar bisa dibagikan gratis. Menu "Kirim tautan tes" pada profil siswa menawarkan IELTS Mockup di samping tes gratis lainnya. Satu klik membuat undangan aktif dan mengirim WhatsApp, tanpa pembayaran yang tercatat, tanpa sesi, dan tanpa kuota. Tidak ada jejak di tab Sesi, jadi tim keuangan dan akademik tidak melihat peserta ini di roster gelombang berbayar mana pun.
2. Undangan yang mengambang merusak data. Undangan tanpa sesi memakai `expires_at` 14 hari bawaan, bukan jendela sesi. Hasil ujiannya masuk ke profil siswa, tetapi pendaftaran program mockup tidak dibuat, sehingga siswa yang seharusnya terdaftar di program IELTS Mockup periode tertentu tidak tercatat di mana pun.
3. Menambah peserta memakai waktu tim. Form Tambah peserta memaksa mengetik nama, nomor WhatsApp, dan email ulang untuk orang yang datanya sudah lengkap di Database Siswa. Salah satu digit nomor dan sistem membuat siswa ganda tanpa peringatan.
4. Pencarian tidak ada di tempat yang paling sering dipakai. Database Siswa sudah punya pencarian CRM, tetapi halaman sesi yang justru membutuhkannya tidak memilikinya.

## 3. Tujuan

1. Membuat atau mengirim undangan IELTS Mockup hanya mungkin lewat sesi. Setiap undangan mockup terikat ke `session_id`, jendela tesnya dari sesi, pendaftarannya dari sesi, dan kirimannya dari antrean sesi.
2. Menambahkan peserta yang sudah menjadi siswa lewat pencarian: ketik nama atau nomor, pilih dari hasil, sisanya terisi otomatis.
3. Mencegah siswa ganda: menambah orang baru yang nomor atau emailnya sudah terdaftar harus ditolak dengan pesan yang menyebut siswa yang sudah ada, bukan membuat baris kedua diam-diam.
4. Menjaga alur pembayaran: tim tetap membuat sesi per gelombang bayaran, dan setiap peserta mockup tercatat di satu sesi.

## 4. Non-tujuan

1. Mengubah alur placement, pre-test, dan post-test. Tiga tes itu tetap bisa dikirim langsung dari profil siswa karena gratis dan per-siswa.
2. Integrasi pembayaran otomatis. Pembayaran tetap diverifikasi manual oleh tim; PRD ini hanya memastikan undangan mockup selalu lahir dari sesi.
3. Mengubah format CSV atau aturan pencocokannya. CSV tetap jalan tambahan untuk gelombang besar.
4. Mengubah kuota, paket, jendela, atau antrean kirim sesi. Semuanya dipakai apa adanya.

## 5. Keputusan yang diusulkan

| Topik | Keputusan | Alasan |
|---|---|---|
| Pintu belakang | Menu "Kirim tautan tes" pada profil siswa tidak lagi menawarkan IELTS Mockup. Server menolak `test: "ielts-mockup"` pada `POST /api/admin/students/:id/invite` dengan pesan yang mengarah ke tab Sesi | Tes berbayar hanya lahir dari sesi; satu titik pembuatan undangan |
| Undangan lama | Undangan mockup tanpa sesi yang masih hidup dibiarkan sampai kedaluwarsa, tetapi ditandai di daftar Submission dan bisa dibatalkan | Data lama tidak dirusak, tetapi kebocoran terlihat |
| Pencarian peserta | Dialog Tambah peserta mendapat mode pertama: kolom pencarian (nama, nomor, email) yang mencari Database Siswa secara langsung, dengan hasil yang bisa dipilih | Sekali ketik menggantikan mengetik ulang tiga kolom |
| Orang baru | Bila pencarian tidak menemukan, tim lanjut ke form manual yang sama seperti sekarang; nomor dan email tetap diperiksa terhadap siswa yang sudah ada | Orang benar-benar baru tetap mudah ditambahkan, siswa ganda tetap dicegah |
| Batas pencarian | Maksimal 8 hasil, minimal 2 karakter, cari nama dengan ILIKE, nomor dengan pencocokan akhiran, email dengan pencococokan persis setelah dinormalkan | Cukup untuk memilih, tidak membebani server |
| Mencegah ganda di form manual | Form manual memanggil pratinjau baris yang sama dengan CSV: nomor atau email yang cocok dipakai ulang, dan kalau nama berbeda jauh dari nama terdaftar, tampilkan konfirmasi dengan nama terdaftarnya | Satu aturan pencocokan untuk semua pintu masuk |

## 6. Alur pengguna

### 6.1 Mengirim undangan mockup (setelah perbaikan)

1. Siswa membayar. Tim membuka tab Sesi, membuat atau membuka sesi untuk gelombang itu, dengan program, periode, kuota, dan paket soalnya.
2. Tim menambahkan peserta, satu per satu lewat pencarian atau lewat CSV.
3. Tim menekan "Kirim semua". Antrean sesi mengirim undangan WhatsApp dan email satu per satu, dengan jendela tes dari sesi.
4. Sebelum perbaikan ini, langkah 1 sampai 3 bisa dilewati: profil siswa, "Kirim tautan tes", pilih IELTS Mockup, kirim. Setelah perbaikan, opsi IELTS Mockup hilang dari menu itu, dan percobaan lewat API ditolak dengan pesan "Undangan IELTS Mockup hanya bisa dibuat dari sesi. Buka tab Sesi dan tambahkan pesertanya di sana."

### 6.2 Menambah peserta yang sudah menjadi siswa

1. Tim membuka halaman sesi dan menekan Tambah peserta.
2. Dialog terbuka pada mode Cari siswa: satu kolom pencarian di atas. Tim mengetik nama, atau menempel nomor WhatsApp, atau email.
3. Hasil muncul di bawah kolom: nama, nomor, cabang, dan tes terakhir. Maksimal 8.
4. Tim memilih satu hasil. Dialog menampilkan data yang akan dipakai (nama, nomor, email) dengan tombol Tambahkan ke sesi. Untuk sesi terjadwal, tim mengisi tanggal dan jam tesnya.
5. Sistem menambahkan peserta: siswa dipakai ulang, pendaftaran program dibuat bila belum ada, undangan dibuat dengan paket acak dari sesi, baris antrean dibuat, kuota berkurang.
6. Bila siswa itu sudah jadi peserta sesi ini, sistem menolak dengan pesan yang jelas, sama seperti CSV hari ini.

### 6.3 Menambah orang yang belum menjadi siswa

1. Pencarian tidak menemukan, atau tim tahu orangnya baru. Dialog tetap menyediakan link "Belum terdaftar? Isi datanya" yang membuka form manual yang sekarang.
2. Form manual mengecek nomor dan email ke Database Siswa saat disimpan. Cocok berarti siswa dipakai ulang; nomor cocok tetapi nama sangat berbeda memunculkan konfirmasi "Nomor ini terdaftar atas nama X. Tetap tambahkan dengan nama Y?" sebelum baris kedua dibuat.

## 7. Aturan pencocokan

Satu set aturan, dipakai pencarian, pratinjau CSV, dan form manual.

1. Nomor WhatsApp dinormalkan ke bentuk 62xxx. Dua orang dengan nomor sama dianggap orang yang sama; sistem tidak pernah membuat siswa kedua dengan nomor yang sama.
2. Email cocok persis setelah dibersihkan dan dikecilkan. Nomor menang atas email kalau keduanya diisi dan menunjuk siswa berbeda, dengan error yang menyebut dua nama itu (aturan yang sudah ada di CSV, dibawa ke form manual).
3. Nama tidak dipakai untuk pencocokan otomatis. Nama hanya mengisi pratinjau dan konfirmasi.

## 8. Perubahan API

| Route | Perubahan |
|---|---|
| `POST /api/admin/students/:id/invite` | Menolak `test: "ielts-mockup"` dengan 400 dan pesan pengarah ke tab Sesi. Placement, pre, dan post tetap jalan |
| `GET /api/admin/mockup/students?q=` | Baru. Mencari Database Siswa dengan nama ILIKE, akhiran nomor WhatsApp, atau email persis. Balikan maksimal 8 baris: id, nama, WhatsApp, email, cabang, tes terakhir dan statusnya. Butuh sesi; hanya untuk dialog Tambah peserta |
| `POST /api/admin/mockup/sessions/:id/import/preview` | Tanpa perubahan; form manual sudah memakainya hari ini lewat pembuatan baris CSV satu baris |
| `POST /api/admin/mockup/sessions/:id/import/confirm` | Tambahan pemeriksaan nama: bila nomor cocok dengan siswa yang ada dan nama yang diketik mirip nomor itu milik siswa lain, baris ditandai bermasalah di pratinjau dengan nama terdaftarnya, dan konfirmasi butuh penanda `acceptMatch: true` pada baris itu |

## 9. Perubahan admin (dashboard)

1. Menu "Kirim tautan tes" pada halaman siswa hanya menawarkan Placement Test, Pre-test, dan Post-test.
2. Dialog Tambah peserta mendapat mode Cari siswa sebagai layar pertama: kolom pencarian, daftar hasil, pilih, lalu jadwal untuk sesi terjadwal. Link "Belum terdaftar? Isi datanya" membuka form manual yang sekarang.
3. Hasil pencarian menampilkan nama, nomor, cabang, dan tes terakhir supaya tim yakin memilih orang yang benar.
4. Daftar Submission mendapat penanda pada undangan mockup tanpa sesi (label "Tanpa sesi"), dan menunya mendapat Batal undangan.

## 10. Privasi dan keamanan

1. Route pencarian peserta hanya bisa dipakai admin yang sudah login, sama seperti route admin lain, dan tidak mengembalikan lebih dari 8 baris.
2. Membatasi pembuatan undangan mockup ke sesi mempersempit permukaan penyalahgunaan: tidak ada lagi endpoint yang menghasilkan undangan berbayar dengan satu id siswa.
3. Tidak ada data baru yang dikumpulkan.

## 11. Testing

1. Menu Kirim tautan tes tidak lagi menawarkan IELTS Mockup; panggilan API langsung dengan `test: "ielts-mockup"` ditolak 400.
2. Pencarian menemukan siswa berdasarkan nama sebagian, nomor penuh, akhiran nomor, dan email; tidak mengembalikan apa pun di bawah 2 karakter; berhenti di 8 hasil.
3. Memilih hasil pencarian menambah peserta: siswa dipakai ulang, pendaftaran dibuat bila belum ada, kuota berkurang, baris antrean ada, dan menambah orang yang sama lagi ditolak.
4. Form manual dengan nomor milik siswa yang sudah ada memakai ulang siswa itu, dan nama yang jauh berbeda memunculkan konfirmasi dengan nama terdaftar.
5. Regresi: kirim placement, pre-test, dan post-test dari profil siswa tetap bekerja; impor CSV dengan pencocokan lama tetap bekerja; undangan lama tanpa sesi masih terbuka sampai waktunya habis dan bisa dibatalkan.

## 12. Rollout

1. Terapkan penolakan server untuk `students/:id/invite` dengan mockup, dan hapus opsi mockup dari menu.
2. Tandai undangan mockup tanpa sesi di Submission; biarkan tim memutuskan membatalkan atau membiarkan kedaluwarsa.
3. Bangun pencarian peserta dan mode baru dialog Tambah peserta.
4. Jalankan uji di dev, terbitkan, lalu minta tim mencoba menambah satu peserta nyata dari Database Siswa sebelum gelombang berbayar berikutnya.

## 13. Acceptance criteria

1. Tidak ada jalan di dashboard yang membuat atau mengirim undangan IELTS Mockup tanpa sesi.
2. Setiap undangan mockup baru memiliki `session_id`, jendela tes dari sesi, dan pendaftaran program dari sesi.
3. Menambah peserta ke sesi bisa dilakukan lewat pencarian nama, nomor, atau email tanpa mengetik ulang datanya.
4. Menambah peserta yang sudah ada di sesi yang sama ditolak dengan pesan yang jelas.
5. Nomor atau email milik siswa terdaftar tidak pernah menghasilkan siswa kedua tanpa konfirmasi yang menampilkan nama terdaftar.
6. Placement, pre-test, dan post-test tetap terkirim langsung dari profil siswa seperti sebelumnya.

## 14. Pertanyaan terbuka

1. Undangan mockup tanpa sesi yang masih hidup di produksi: perlu dihitung dulu ada berapa. Kalau satu dua, biarkan kedaluwarsa; kalau banyak, pertimbangkan pembatalan massal dengan pemberitahuan.
2. Batas hasil pencarian 8 dan minimal 2 karakter adalah angka awal; kalau tim sering tidak menemukan siswa yang diketahui ada, angkanya dinaikkan.
3. Pencarian juga menampilkan lead (siswa tanpa pendaftaran) atau hanya siswa terdaftar? Proposal ini: keduanya, karena peserta mockup sering berasal dari lead placement test.
