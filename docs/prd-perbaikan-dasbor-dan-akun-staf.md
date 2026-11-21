# PRD: Lencana Siswa, Baris Tabel yang Bisa Disalin, Perbaikan Sub-teks, Akun Staf dengan Peran, dan Saluran WhatsApp per Cabang

Status: draf untuk direview. Tanggal: 21 November 2026.

## 1. Ringkasan

Lima perbaikan sekaligus: satu lencana yang menghitung salah di menu Database Siswa, interaksi baris tabel yang menghalangi menyalin nama, sub-teks di bawah nama yang tidak jelas asalnya, pengelolaan akun staf dengan peran terbatas, dan saluran WhatsApp berbeda per cabang. Semua berasal dari laporan pemilik pada 21 November 2026 setelah dipakai sehari-hari.

## 2. Poin 1: Lencana menu Database Siswa menghitung yang salah

### Masalah

Lencana pada menu "Database Siswa" di bilah sisi menunjukkan 5, padahal siswa terdaftar sebenarnya hanya 1. Lencana itu menghitung `leads()`: semua baris `students` dengan `daftarCount === 0`. Sejak hasil submission ikut membuat baris siswa (kontak placement yang berhenti sebelum mendaftar), baris itu ikut terhitung, padahal mereka bukan siswa dan bukan pula calon yang perlu dihubungi.

### Keputusan

Lencana berubah makna dan hitungannya: ia hanya menghitung lead baru yang perlu dihubungi, yaitu `stage === "baru"`, `daftarCount === 0`, dan tidak dingin, sama dengan antrean "Perlu dihubungi" di Ringkasan. Judul tooltip diperbarui menyebut makna itu. Siswa terdaftar tidak pernah masuk lencana; jumlah mereka sudah ada di halaman Database Siswa sendiri.

### Penerimaan

Lencana sama persis dengan angka pada panel "Perlu dihubungi" Ringkasan. Lead dingin dan siswa terdaftar tidak terhitung.

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

## 6. Poin 5: Saluran WhatsApp per cabang

### Masalah

Hasil placement test dikirim dari satu nomor WhatsApp (`ATTCOS_CHANNEL_ID`) untuk semua cabang, padahal setiap cabang punya nomor sendiri. Siswa yang memilih Medan menerima pesan dari nomor Pare.

### Keputusan

1. Variabel lingkungan baru: `ATTCOS_CHANNEL_ID_JOGJA` dan `ATTCOS_CHANNEL_ID_MEDAN`. Yang sudah ada, `ATTCOS_CHANNEL_ID`, menjadi saluran Pare dan sekaligus Online, sesuai keputusan pemilik.
2. `sendWhatsApp` menerima `branch` opsional dan memilih saluran: `jogja` memakai saluran Jogja, `medan` memakai saluran Medan, sisanya (termasuk `online`, `pare`, dan tanpa cabang) memakai saluran bawaan. Saluran cabang yang kosong jatuh ke saluran bawaan dengan catatan log, supaya pengiriman tidak pernah gagal hanya karena variabel belum diisi.
3. Pengiriman hasil placement membaca `students.branch` pada baris attempt dan meneruskannya. Pengiriman manual dari dasbor membaca cabang siswa yang dituju.
4. Pesan antrean mockup tetap memakai saluran bawaan; cabang peserta mockup tidak diketahui dari sesi dan pemilik tidak meminta perubahan di sana.

### Penerimaan

1. Siswa yang memilih Medan menerima WhatsApp dari nomor Medan; Jogja dari nomor Jogja; Pare dan Online dari nomor bawaan.
2. Variabel cabang yang belum diisi tidak menghentikan pengiriman.
3. Render menerima dua variabel baru tanpa restart ganda.

## 7. Urutan pengerjaan

1. Poin 1 sampai 3: perbaikan kecil, satu rilis.
2. Poin 5: variabel lingkungan dan pemilihan saluran, satu rilis setelah nomor Medan dan Jogja tersedia di AttCos.
3. Poin 4: pengaturan staf dan pembatasan peran, rilis terakhir karena paling besar dan paling perlu uji.

## 8. Pertanyaan terbuka

1. Tutor melihat "siswa kelasnya": apakah cukup siswa yang kelasnya ditandai tutor tersebut, ataukah juga siswa lead yang belum punya kelas? Usulan ini: hanya siswa dengan kelas milik tutor itu; lead tetap di tangan tim admin.
2. Peran Admin boleh menghapus siswa dan submission seperti hari ini, atau hanya Administrator? Usulan ini: Admin boleh, karena itu pekerjaan operasional harian; Administrator hanya untuk akun dan pengaturan.
3. Nomor WhatsApp Medan dan Jogja perlu didaftarkan di AttCos sebagai channel baru sebelum variabel lingkungan bisa diisi; pemilik menyiapkan nomornya.
