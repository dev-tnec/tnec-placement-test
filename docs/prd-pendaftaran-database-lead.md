# PRD: Menu Pendaftaran, Database Siswa untuk siswa terdaftar, Lead, dan IELTS Mockup Test

Status: draf untuk direview. Tanggal: 17 November 2026.

Diperbarui 17 November 2026: menu Pendaftaran terpisah dibatalkan. Pendaftaran digabung ke Database Siswa lewat tombol "Daftarkan siswa" dan panel "Pendaftaran terbaru", sesuai keputusan pemilik. Bagian 3 dan tabel antarmuka di bawah sudah disesuaikan.

## 1. Ringkasan

Dua perubahan besar dan dua tambahan. Pendaftaran dilakukan dari Database Siswa lewat tombol "Daftarkan siswa", bukan menu terpisah, dan pendaftaran itu otomatis menautkan atau membuat profil di Database Siswa. Database Siswa lalu hanya memuat siswa yang sudah terdaftar di program, sementara calon siswa dari placement test pindah ke tab Lead di bawah menu Placement Test. Data siswa bertambah tujuh kolom identitas. Tes keempat, IELTS Mockup Test, hanya terbuka lewat undangan WhatsApp dan kode unik per siswa.

## 2. Keputusan yang sudah diputus pemilik

| Topik | Keputusan |
|---|---|
| Siapa yang masuk Database Siswa | Hanya siswa dengan minimal satu pendaftaran. Kontak placement test tetap sebagai Lead |
| Lokasi Pendaftaran | Digabung ke Database Siswa lewat tombol "Daftarkan siswa", bukan menu sidebar terpisah. Keputusan 17 November 2026 |
| Lokasi Lead | Tab baru "Lead" di menu Placement Test, di samping Submission |
| Akses IELTS Mockup | Undangan pribadi lewat WhatsApp ditambah kode unik per siswa. Dua-duanya wajib |
| Jadwal mockup per siswa dan unggah CSV | Fase berikutnya, tidak di rilis ini |

## 3. Pendaftaran di Database Siswa

### Alur

1. Admin membuka Database Siswa dan menekan tombol "Daftarkan siswa".
2. Dialog mencari calon siswa berdasarkan nama, email, atau nomor WhatsApp. Pencarian memakai data Lead dan siswa yang sudah ada.
3. Kalau orangnya belum ada, admin mengisi nama, WhatsApp, dan email baru. Kalau sudah ada, profilnya dipakai dan data lama tidak ditimpa.
4. Admin memilih program, durasi, periode, dan kelas, lalu menyimpan.
5. Simpan menulis satu baris ke tabel `pendaftaran`, menautkannya ke `student_id`, dan status siswa berubah menjadi terdaftar.
6. Orang yang tadinya Lead sekarang muncul di Database Siswa. Panel "Pendaftaran terbaru" di bawah tabel menampilkan delapan pendaftaran terakhir.

### Aturan satu siswa, banyak program

1. Satu siswa boleh punya banyak baris pendaftaran, satu per program dan periode. Siswa lanjut ke level berikut berarti pendaftaran baru dengan periode baru.
2. Kolom `program_id`, `duration_id`, `period_id`, `class_id` di tabel `students` tetap dipakai sebagai pendaftaran terkini, supaya tabel Database Siswa dan filter periode, program, dan tutor tetap cepat. Setiap simpan pendaftaran baru otomatis memperbarui kolom itu kalau pendaftarannya lebih baru.
3. Status pendaftaran: `aktif`, `selesai`, `batal`. Batal hanya menyembunyikan dari perjalanan, tidak menghapus barisnya, supaya hitungan berapa kali daftar tetap jujur.
4. Halaman profil siswa mendapat bagian "Perjalanan belajar": semua pendaftaran diurut dari yang paling lama ke paling baru, tiap baris memuat program, durasi, periode, tutor dan kelas, tanggal daftar, dan siapa yang mendaftarkan. Baris pendaftaran bisa diedit dan dibatalkan dari sini.
5. "Daftar TN berapa kali?" dihitung otomatis: jumlah baris pendaftaran yang tidak batal.

### Kolom pendaftaran

| Kolom | Isi |
|---|---|
| Siswa | Nama, WhatsApp, email, dicari dulu sebelum membuat baru |
| Tempat lahir, tanggal lahir | Bagian identitas, lihat bagian 5 |
| Kota/Kabupaten, Provinsi, Kode Pos | Alamat domisili |
| Jenjang Pendidikan | Pilihan: SD, SMP, SMA/SMK, D3, S1, S2, S3 |
| Tahu TN dari mana? | Pilihan: Instagram, TikTok, Google, Teman/Alumni, Datang langsung, Lainnya |
| Program, Durasi, Periode | Wajib. Kelas opsional, dipilih dari kelas yang cocok dengan program dan periode |
| Catatan | Opsional, misalnya alasan lanjut level atau permintaan jadwal |

## 4. Database Siswa dan Lead

### Database Siswa

1. Daftar hanya memuat siswa dengan minimal satu pendaftaran yang tidak batal.
2. Chip status yang lama (Baru, Dihubungi, Konsultasi) tidak lagi dipakai di sini. Status yang tersisa untuk siswa terdaftar: aktif, selesai, dan lepas untuk yang berhenti di tengah program.
3. Halaman profil siswa terdaftar menampilkan bagian baru: data identitas lengkap, perjalanan belajar, riwayat tes, sertifikat, catatan.
4. Ekspor CSV mengikuti daftar yang tampil, jadi hanya siswa terdaftar.

### Tab Lead di Placement Test

1. Tab keempat di Placement Test, bernama "Lead", di samping Soal & Jawaban, Submission, dan Pengaturan.
2. Isinya setiap orang yang mengisi kontak di placement test tetapi belum punya pendaftaran: nama, skor dan level placement, sumber, status tindak lanjut (Baru, Dihubungi, Konsultasi, Lepas), tanggal tes.
3. Baris Lead punya dua tombol: buka profil (profil yang sama, dengan data placementnya) dan "Daftarkan" yang langsung membuka form Pendaftaran dengan data orang itu terisi.
4. Antrean "Perlu dihubungi" di Ringkasan tetap jalan, sekarang membaca Lead.
5. Submission di Placement Test tetap memuat semua percobaan, tetapi barisnya menautkan ke profil di tempat yang sama.
6. Lead yang tidak ditindaklanjuti selama 90 hari sejak tesnya diberi tanda "Dingin" dan keluar dari hitungan antrean, tapi tetap bisa dicari dan dibuka profilnya. Batas 90 hari diatur konstanta di server, bukan kolom yang diedit tim.

### Pemetaan data lama

Ini bagian paling penting dari rilis. Migrasi membuat satu baris pendaftaran untuk setiap siswa yang sudah punya `program_id` dan `period_id` hari ini, memakai nilai kolomnya sekarang, dengan tanggal dari `updated_at` dan pendaftar "Migrasi". Tanpa ini, memfilter Database Siswa akan mengosongkannya. Siswa yang belum memilih program tetap menjadi Lead.

## 5. Data siswa baru

| Kolom | Tipe | Diisi di |
|---|---|---|
| `tempat_lahir` | Teks | Form Pendaftaran dan profil siswa |
| `tanggal_lahir` | Tanggal ISO | Sama |
| `city` | Teks, sudah ada, labelnya berubah menjadi Kota/Kabupaten | Sama |
| `provinsi` | Teks | Sama |
| `kode_pos` | Teks | Sama |
| `jenjang_pendidikan` | Pilihan | Sama |
| `tahu_dari` | Pilihan | Sama |
| Jumlah daftar | Hitungan baris pendaftaran, otomatis | Profil siswa |

Data ini dimasukkan admin, bukan diisi peserta tes, jadi tes publik tidak berubah. Kebijakan privasi tetap harus diperbarui: bagian "Data identitas" menambah tempat dan tanggal lahir, provinsi, kode pos, jenjang pendidikan, dan dari mana orang itu mengenal Titik Nol. `CONSENT_VERSION` naik karena isi kebijakan berubah.

## 6. IELTS Mockup Test

Akses undangan ditambah kode unik per siswa tetap seperti bagian di bawah ini, dan seluruh rancangan tesnya, bank soalnya, dan fase Writing dan Speaking pindah ke dokumen sendiri: `docs/prd-ielts-mockup.md`, karena cakupannya sebesar PRD ini. Ringkasnya: tes keempat dengan kunci `ielts-mockup`, siswa duduk satu sesi Listening lalu Reading, hasil berupa band per skill dan band keseluruhan, dan bank soalnya diekstrak dari bahan `ielts-mockup` di desktop pemilik.

### Akses

1. Admin membuat undangan per siswa dari halaman Lead atau profil siswa, sama seperti pre-test dan post-test, dan mengirimkannya lewat WhatsApp. Pesan undangan memuat tautan pribadi dan kode unik siswa.
2. Setiap undangan `ielts-mockup` punya `code`: 6 karakter acak, unik, huruf besar dan angka, dibuat server.
3. Siswa membuka tautan undangan, lalu halaman minta kodenya. Kode salah tiga kali menolak undangan itu sampai dibuat ulang. Jadi tautan yang diteruskan ke orang lain tidak bisa dipakai tanpa kode.
4. Tes tidak pernah terbuka tanpa undangan. `is_open` di pengaturan tetap dipakai untuk menutup seluruh sesi.

## 7. Data model

Migrasi `db/migrations/0007_pendaftaran_and_mockup.sql`.

```sql
ALTER TABLE students ADD COLUMN IF NOT EXISTS tempat_lahir TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS tanggal_lahir TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS provinsi TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS kode_pos TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS jenjang_pendidikan TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS tahu_dari TEXT;

CREATE TABLE IF NOT EXISTS pendaftaran (
  id            TEXT PRIMARY KEY,
  student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  program_id    TEXT NOT NULL REFERENCES programs(id),
  duration_id   TEXT REFERENCES program_durations(id) ON DELETE SET NULL,
  period_id     TEXT NOT NULL REFERENCES periods(id),
  class_id      TEXT REFERENCES classes(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'selesai', 'batal')),
  note          TEXT,
  registered_at BIGINT NOT NULL,
  registered_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_pendaftaran_student ON pendaftaran (student_id, registered_at);

-- Batasan kunci tes dilonggarkan untuk tes keempat.
ALTER TABLE tests DROP CONSTRAINT tests_key_check;
ALTER TABLE tests ADD CONSTRAINT tests_key_check CHECK (key IN ('placement', 'pre', 'post', 'ielts-mockup'));
ALTER TABLE invites DROP CONSTRAINT invites_test_key_check;
ALTER TABLE invites ADD CONSTRAINT invites_test_key_check CHECK (test_key IN ('pre', 'post', 'ielts-mockup'));
ALTER TABLE invites ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS opens_at BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_code ON invites (code) WHERE code IS NOT NULL;

INSERT INTO tests (key, time_mode, total_seconds, per_default, is_open, max_violations, pass_score)
  VALUES ('ielts-mockup', 'total', 3600, 60, 0, 3, NULL) ON CONFLICT (key) DO NOTHING;

-- Pemetaan data lama: satu pendaftaran untuk setiap siswa yang sudah punya program dan periode.
INSERT INTO pendaftaran (id, student_id, program_id, duration_id, period_id, class_id, status, note, registered_at, registered_by)
  SELECT 'pdf_' || s.id, s.id, s.program_id, s.duration_id, s.period_id, s.class_id, 'aktif',
         'Dipindahkan dari data lama saat migrasi.', s.updated_at, 'Migrasi'
    FROM students s WHERE s.program_id IS NOT NULL AND s.period_id IS NOT NULL
  ON CONFLICT (id) DO NOTHING;
```

`apps/admin/src/api.js` dan `packages/core/src/db.js` tidak berubah bentuknya, hanya pertanyaan baru. Nama tabel dan kolom mengikuti gaya yang ada.

## 8. API

| Method | Path | Isi |
|---|---|---|
| GET | `/api/admin/bootstrap` | Menambah `pendaftaran` per siswa, jumlah daftar, ringkasan Lead untuk Ringkasan |
| POST | `/api/admin/pendaftaran` | Membuat pendaftaran. Menerima `studentId` atau data orang baru. Memvalidasi program, durasi, periode, kelas cocok, dan kolom identitas |
| PUT | `/api/admin/pendaftaran/:id` | Mengubah program, durasi, periode, kelas, status, catatan |
| GET | `/api/admin/students/:id` | Menambah perjalanan belajar dan data identitas |
| PATCH | `/api/admin/students/:id` | Menerima kolom identitas baru |
| POST | `/api/admin/students/:id/invite` | Membuat undangan `ielts-mockup` dengan `code`, selain pre dan post |
| GET | `/api/invites/:token` | Untuk `ielts-mockup` membalas `needsCode: true` dan tidak membuka soal sebelum kode dikirim |
| POST | `/api/attempts` | Menerima `inviteCode` untuk `ielts-mockup`. Kode salah membalas 403 dengan sisa percobaan |

Semua route admin tetap butuh sesi dan menolak tulisan dari origin lain, sesuai aturan yang sudah ada.

## 9. Antarmuka

| Menu | Perubahan |
|---|---|
| Sidebar | Tidak ada menu Pendaftaran terpisah. Database Siswa menangani pendaftaran lewat tombol "Daftarkan siswa" |
| Pendaftaran (dialog) | Dialog dari Database Siswa: cari orang, form identitas, pilihan program, durasi, periode, kelas |
| Database Siswa | Hanya siswa terdaftar, tombol Daftarkan siswa, panel Pendaftaran terbaru di bawah tabel, kolom identitas baru di profil, bagian Perjalanan belajar, jumlah daftar |
| Placement Test | Tab Lead baru dengan daftar Lead, tombol Daftarkan |
| Placement Test, Pengaturan | Pengaturan IELTS Mockup terpisah seperti tes lain |
| Menu tes | Item "IELTS Mockup" di sidebar dengan Soal & Jawaban, Submission, Pengaturan |
| Profil siswa | Tombol undangan IELTS Mockup di samping pre dan post |

## 10. Privasi

Data identitas baru dikumpulkan lewat admin, bukan lewat form publik. Kebijakan privasi diperbarui pada bagian data yang dikumpulkan, dan `CONSENT_VERSION` naik karena teksnya berubah. Kode mockup disimpan sebagai teks biasa di tabel `invites` karena harus bisa dibaca ulang untuk pesan WhatsApp, sama seperti token undangan yang sudah di-hash. Hash dipertahankan untuk tautan; kode pendek tetap teks biasa karena ruang pencariannya besar dengan 6 karakter acak dan pakai sekali.

## 11. Urutan pengerjaan

1. Migrasi dan `packages/core`: kolom baru, tabel pendaftaran, kunci tes keempat, pemetaan data lama.
2. API admin: pendaftaran, kolom identitas, Lead di bootstrap, undangan mockup dengan kode.
3. API web: kode mockup di halaman undangan dan saat mulai.
4. Antarmuka admin: Database Siswa baru dengan dialog Daftarkan siswa dan panel Pendaftaran terbaru, tab Lead, profil siswa dengan perjalanan belajar, menu IELTS Mockup.
5. Tes smoke dan E2E di dev.
6. Satu rilis, satu deploy. Bagian 4 butuh bagian 1 sampai 3 jadi dulu, dan filter Database Siswa tidak boleh menyala sebelum pemetaan data lama jalan.

## 12. Acceptance criteria

1. Mendaftarkan Lead baru lewat tombol Daftarkan siswa di Database Siswa membuat profilnya pindah dari tab Lead ke Database Siswa dalam satu simpan.
2. Orang yang sama didaftarkan ke program kedua di periode lain, dan perjalanannya tampil dua baris, urut dari yang lama.
3. Jumlah daftar di profil sama dengan jumlah pendaftaran tidak batal.
4. Semua siswa lama yang sudah punya program tetap tampil di Database Siswa setelah deploy, tanpa perlu diedit.
5. Kontak placement test baru tidak pernah muncul di Database Siswa sebelum didaftarkan.
6. Kolom identitas baru tersimpan, tampil di profil, dan ikut ekspor CSV.
7. Undangan IELTS Mockup berisi tautan dan kode. Tanpa kode yang benar, tes tidak mulai.
8. Tes IELTS Mockup tidak muncul untuk umum, hanya lewat undangan.
9. Kebijakan privasi dan versi persetujuan sudah diperbarui.
10. `npm test` lulus dengan test baru untuk pemetaan data lama, kode mockup, dan jumlah daftar.

## 13. Pertanyaan yang sudah terjawab

1. Lead kedaluwarsa dari antrean setelah 90 hari tanpa tindak lanjut, ditandai "Dingin" tapi tidak dihapus.
2. Pendaftaran tidak mencatat pembayaran atau DP sama sekali.
3. IELTS Mockup rilis bersama bank soalnya, dengan rancangan di `docs/prd-ielts-mockup.md`.
