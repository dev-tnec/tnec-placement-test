# PRD: Lencana Siswa, Baris Tabel yang Bisa Disalin, Perbaikan Sub-teks, Akun Staf dengan Peran, dan Saluran WhatsApp per Cabang

Status: draf untuk direview. Tanggal: 21 November 2026.

## 1. Ringkasan

Lima perbaikan sekaligus: satu lencana yang menghitung salah di menu Database Siswa, interaksi baris tabel yang menghalangi menyalin nama, sub-teks di bawah nama yang tidak jelas asalnya, pengelolaan akun staf dengan peran terbatas, dan saluran WhatsApp berbeda per cabang. Semua berasal dari laporan pemilik pada 21 November 2026 setelah dipakai sehari-hari.

## 2. Poin 1: Lencana menu Database Siswa menghitung yang salah

### Masalah

Lencana pada menu "Database Siswa" di bilah sisi menunjukkan 5, padahal siswa terdaftar sebenarnya hanya 1. Lencana itu menghitung `leads()`: semua baris `students` dengan `daftarCount === 0`. Sejak hasil submission ikut membuat baris siswa (kontak placement yang berhenti sebelum mendaftar), baris itu ikut terhitung, padahal mereka bukan siswa dan bukan pula calon yang perlu dihubungi.

### Keputusan

1. Lencana pada menu "Database Siswa" menghitung siswa terdaftar: baris `students` dengan pendaftaran aktif, sama dengan baris yang halaman Database Siswa tampilkan. Lead tidak pernah masuk lencana ini; lead ada di menu Placement Test, tab Lead, dan antrean "Perlu dihubungi" di Ringkasan.

### Penerimaan

Lencana sama persis dengan jumlah baris di halaman Database Siswa. Lead, dingin maupun baru, tidak terhitung.

## 3. Poin 2: Baris tabel tidak boleh terbuka saat menyalin teks

### Masalah

Mengklik nama di tabel "Perlu dihubungi" untuk menyalinnya justru membuka halaman siswa. Perilaku `rowClick` menautkan seluruh baris: klik di mana pun, termasuk saat memilih teks, langsung pindah halaman. Perilaku ini muncul di setiap tabel yang memakai `rowClick`: Ringkasan (Perlu dihubungi, Pendaftaran terbaru, Kelas bulan ini), Database Siswa, panel pendaftaran terbaru di halaman siswa, dan beberapa tabel Submission dan Test.

### Keputusan

Dua perubahan di helper bersama `rowClick` supaya seluruh aplikasi berubah sekaligus:

1. Navigasi hanya terjadi bila kliknya bukan seleksi teks. `window.getSelection()` yang tidak kosong berarti pengguna sedang menyeleksi; peristiwa klik itu diabaikan.
2. Setiap baris yang menautkan ke detail mendapat tombol aksi eksplisit di kolom terakhir: ikon buka dengan label "Buka", selalu ada, selalu berfungsi satu klik, dan tetap menjadi target keyboard (`Tab` lalu `Enter`).

Tautan nama yang ada hari ini tetap berfungsi seperti biasa; yang hilang hanya salah klik.

### Penerimaan

Menyeleksi nama di baris mana pun, lalu melepas mouse, tidak membuka halaman apa pun dan teks tersalin. Tombol Buka di akhir baris membuka detailnya. Seluruh tabel yang memakai `rowClick` berubah sekaligus, bukan satu per satu.

## 4. Poin 3: Sub-teks di bawah nama pada tabel Perlu dihubungi

### Temuan

Teks di bawah nama di tabel Perlu dihubungi berbunyi `kota, nomor`. Bagian sebelum koma adalah `s.city`, kota asal siswa dari data kontak; sesudahnya nomor WhatsApp yang sudah diformat `08xx`. Jadi `Pare, 0851xxxx` berarti kota asal Pare.

### Keputusan

Tidak ada perubahan data, hanya kejelasan: label kota dipertegas menjadi `Kota asal: Pare` pada tabel itu, karena pemilik sendiri tidak yakin apa artinya. Nomor tetap di sebelahnya. Perubahan berlaku pada tabel Perlu dihubungi; tabel lain yang menampilkan `s.city` dengan pola sama ikut disesuaikan bila ada.

## 5. Poin 4: Akun staf dengan peran terbatas

### Masalah

Hari ini ada dua peran, `admin` dan `pendidikan`, dan keduanya melihat seluruh dasbor. Tidak ada cara menambah akun staf lewat antarmuka (hanya `npm run admin:create`), dan tidak ada pembatasan data: tutor bisa melihat data keuangan siswa, akun baru bisa menghapus apa pun.

### Keputusan

| Peran | Akses |
|---|---|
| Administrator | Semua, termasuk Pengaturan Staf di bawah menu Pengaturan |
| Admin | Semua operasional: siswa, sertifikat, tes, sesi, program, kelas. Tidak ada Pengaturan Staf, tidak ada pembuatan atau penghapusan akun |
| Tutor | Hanya Ringkasan, Database Siswa (baca dan catatan, tanpa hapus), hasil tes siswa kelasnya, dan sertifikat siswa (baca). Tanpa menu tes, pengaturan soal, dan pengaturan akun |

Rincian mekanis:

1. Menu Pengaturan Staf baru di bawah grup Pengaturan: daftar akun, tambah akun (nama, email, peran, kata sandi awal), nonaktifkan (bukan hapus, supaya riwayat aktivitas akun itu tetap bermakna), aktifkan kembali, dan ganti kata sandi. Hanya Administrator yang melihat menu ini.
2. Pembatasan ada dua lapis: sisi klien menyembunyikan menu dan tombol, sisi server menolak rute di luar peran dengan 403. Server adalah pengaman sebenarnya; klien hanya kerapian.
3. Peran lama dipetakan: `admin` yang membuat akun pertama tetap Administrator; peran `pendidikan` yang ada dipetakan ke Admin saat masuk.
4. Pembatasan data Tutor pada tabel besar: dasbor Tutor memuat siswa yang terdaftar di kelasnya dan submission tes milik siswa itu. Bootstrap untuk Tutor difilter di server, bukan di klien, supaya data penuh tidak pernah dikirim ke browser Tutor.
5. Aktivitas mencatat pelaku pada setiap aksi sensitif seperti sudah ada; tambahan: mencatat pembuatan, penonaktifan, dan perubahan peran akun.

### Penerimaan

1. Admin baru bisa dibuat dari dasbor, masuk, dan hanya melihat operasional.
2. Tutor hanya melihat siswa kelasnya; memakai API secara langsung pada rute terlarang ditolak 403.
3. Hanya Administrator yang mengelola akun.
4. Akun nonaktif tidak bisa masuk dengan pesan yang jelas.

## 6. Poin 5: Saluran WhatsApp per cabang, dikelola dari dasbor

### Masalah

Hasil placement test dikirim dari satu nomor WhatsApp untuk semua cabang, padahal setiap cabang punya nomor sendiri. Siswa yang memilih Medan menerima pesan dari nomor Pare.

### Keputusan

Pemisahan kredensial dan konfigurasi, mengikuti pola yang sudah dipakai repo ini: kunci rahasia tetap di lingkungan server, nilai operasional dikelola tim dari dasbor dan tersimpan di basis data, sama seperti durasi tes, pengaturan speaking, dan tipe sertifikat.

| Data | Sifat | Tempat |
|---|---|---|
| `ATTCOS_API_KEY` dan basis URL | Rahasia: siapa pun yang memegangnya bisa mengirim dari semua nomor | Variabel lingkungan, tidak pernah ke basis data, tidak pernah ke browser |
| ID saluran per cabang | Pengenal operasional: tak berguna tanpa kuncinya, bukan rahasia | Baris basis data, diedit di panel Pengaturan |

Rincian mekanis:

1. Tabel kecil `whatsapp_channels` (migrasi baru): satu baris per cabang (pare, jogja, medan, online), kolom `branch`, `channel_id`, `updated_at`, `updated_by`. Baris Pare wajib terisi karena dipakai juga oleh cabang Online.
2. Panel "Saluran WhatsApp" di bawah menu Pengaturan: satu baris per cabang, kolom ID saluran, dan tombol "Uji kirim" per baris yang mengirim pesan uji ke nomor admin yang menekannya, supaya saluran dipercaya sebelum dipakai. Baris Online hanya menampilkan saluran Pare dan tidak bisa diedit. Setiap perubahan tercatat di aktivitas: siapa, kapan, cabang apa.
3. `sendWhatsApp` menerima `branch` opsional dan membaca ID saluran dari tabel, dengan cache singkat di memori supaya pengiriman tidak membuka kueri baru setiap pesan. `pare` dan `online` memakai saluran Pare. `jogja` memakai saluran Jogja, `medan` memakai saluran Medan, keduanya tanpa cadangan ke Pare. Cabang yang ID salurannya kosong menghentikan pengiriman dengan pesan yang menyebut cabangnya, jadi hasil tidak pernah terkirim dari nomor cabang yang salah.
4. Pengiriman hasil placement membaca `students.branch` pada baris attempt dan meneruskannya. Pengiriman manual dari dasbor membaca cabang siswa yang dituju.
5. Pesan antrean mockup tetap memakai saluran Pare; cabang peserta mockup tidak diketahui dari sesi dan pemilik tidak meminta perubahan di sana.
6. `ATTCOS_CHANNEL_ID` dari variabel lingkungan tetap dipakai sebagai nilai awal baris Pare saat migrasi berjalan dan sebagai cadangan bila tabel belum siap, supaya pengiriman tidak pernah terputus saat naik versi.

### Mengapa dasbor, bukan variabel lingkungan

1. Mengubah variabel lingkungan menuntut deploy ulang layanan; mengubah baris panel langsung berlaku pada permintaan berikutnya.
2. Perubahan env tidak meninggalkan jejak; perubahan panel tercatat di aktivitas dengan pelaku dan waktunya.
3. Panel bisa memvalidasi format dan menawarkan uji kirim sebelum saluran dipercaya; salah ketik di env terdiam sampai pengiriman gagal.
4. Kunci rahasia tetap di env, jadi area yang terekspos browser dan basis data tidak bertambah.

### Penerimaan

1. Siswa yang memilih Medan menerima WhatsApp dari nomor Medan; Jogja dari nomor Jogja; Pare dan Online dari nomor Pare.
2. Cabang yang salurannya belum diisi tidak menghentikan pengiriman.
3. Mengubah ID saluran dari dasbor langsung berlaku tanpa deploy, dan tercatat di aktivitas.
4. Uji kirim dari panel tiba di nomor admin yang menekannya, dari saluran cabang yang diuji.

## 7. Urutan pengerjaan

1. Poin 1 sampai 3: perbaikan kecil, satu rilis.
2. Poin 5: tabel saluran, panel Pengaturan, dan pemilihan saluran, satu rilis setelah nomor Medan dan Jogja tersedia di AttCos.
3. Poin 4: pengaturan staf dan pembatasan peran, rilis terakhir karena paling besar dan paling perlu uji.

## 8. Pertanyaan terbuka

1. Tutor melihat "siswa kelasnya": apakah cukup siswa yang kelasnya ditandai tutor tersebut, ataukah juga siswa lead yang belum punya kelas? Usulan ini: hanya siswa dengan kelas milik tutor itu; lead tetap di tangan tim admin.
2. Peran Admin boleh menghapus siswa dan submission seperti hari ini, atau hanya Administrator? Usulan ini: Admin boleh, karena itu pekerjaan operasional harian; Administrator hanya untuk akun dan pengaturan.
3. Nomor WhatsApp Medan dan Jogja perlu didaftarkan di AttCos sebagai channel baru sebelum ID salurannya bisa diisi di panel; pemilik menyiapkan nomornya.
