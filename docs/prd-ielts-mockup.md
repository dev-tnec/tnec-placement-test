# PRD: IELTS Mockup Test di aplikasi tes penempatan

Status: draf untuk direview. Tanggal: 17 November 2026.

## 1. Ringkasan

Tes keempat di aplikasi ini, dengan kunci `ielts-mockup`, yang meniru mock test IELTS: siswa duduk satu sesi, mengerjakan Listening lalu Reading, dan mendapat perkiraan band per skill beserta band keseluruhan. Tes hanya terbuka lewat undangan WhatsApp ditambah kode unik per siswa. Bank soalnya diambil dari materi di `C:\Users\Sales\Desktop\ielts-mockup`, dan platform lama di folder itu tidak dipakai: isinya dibaca sebagai bahan, lalu fiturnya dibangun ulang di aplikasi ini.

Rilis pertama mencakup Listening dan Reading, karena keduanya dinilai dari kunci jawaban dan sudah ada bahan lengkapnya: paket Desember dengan 40 soal listening beserta audionya dan 40 soal reading beserta kuncinya. Writing dan Speaking ditambahkan pada 17 November 2026 atas keputusan pemilik, dinilai otomatis, dan band keseluruhan memakai empat skill. Lihat bagian 15. Writing dan Speaking, yang butuh penilaian AI atau guru, menjadi fase kedua dengan PRD lanjutan sendiri.

## 2. Keputusan pemilik

| Topik | Keputusan |
|---|---|
| Di mana dibangun | Di aplikasi ini, bukan men-deploy platform lama di folder ielts-mockup |
| Bahan | Bank soal di folder itu diekstrak sebagai isi, bukan disalin kodenya |
| Akses | Undangan lewat WhatsApp ditambah kode unik per siswa, dua-duanya wajib |
| Jadwal per siswa dan unggah CSV | Fase berikutnya |
| Pembayaran / DP | Tidak dicatat |

## 3. Alur siswa

1. Siswa membuka tautan undangan dari WhatsApp. Halaman meminta kode 6 karakter yang juga ada di pesan itu.
2. Kode benar: halaman pengantar menampilkan nama, nama paket, jumlah soal per bagian, durasi tiap bagian, dan aturan. Kode salah tiga kali: undangan terkunci sampai dibuat ulang.
3. Siswa menyetujui persetujuan lalu mulai. Browser masuk mode layar penuh dan aturan pelanggaran fokus berlaku seperti tes lain.
4. Bagian Listening: satu berkas audio untuk Part 1 sampai Part 4, diputar sekali, tanpa tombol geser. Siswa bebas berpindah soal Part 1 sampai Part 4 selama audio berbunyi; kartu audio tetap terpasang dan suaranya tidak berhenti saat pindah soal.
5. Setelah soal listening ke-40, siswa lanjut ke bagian Reading: tiga bacaan panjang, 40 soal.
6. Tes berjalan dalam empat bagian dengan waktu sendiri: Listening 32 menit (30 menit audio ditambah 2 menit memeriksa), Reading 60, Writing 60, dan Speaking 15. Saat waktu satu bagian habis, bagian itu terkunci, tes pindah ke bagian berikutnya, dan siswa tidak bisa kembali. Empat waktunya diatur di Pengaturan, dan totalnya 167 menit. Jawaban terkirim otomatis setelah bagian Speaking selesai, berbeda dengan placement test yang gagal.
7. Layar hasil menampilkan skor mentah tiap skill, band tiap skill, dan band keseluruhan, dengan kalimat bahwa band adalah perkiraan dan bukan skor resmi IELTS.

## 4. Model soal baru

Tabel `questions` sekarang hanya tahu pilihan ganda empat opsi. IELTS memakai dua bentuk: pilihan dan isian teks. Kolom baru:

| Kolom | Isi |
|---|---|
| `type` | `choice` atau `text`, default `choice`, semua soal lama tetap `choice` |
| `part` | Nomor bagian IELTS, 1 sampai 4 untuk listening, dipakai untuk menempel audio dan bacaan di tempat yang benar |
| `accepted` | JSON berisi daftar jawaban yang diterima untuk soal `text`, misalnya `["bamboo", "bamboos"]` |

Untuk soal `text`, kolom `option_a` sampai `option_d` dibiarkan kosong dan batasan NOT NULL-nya dilonggarkan. Untuk soal `choice`, kolomnya dipakai seperti biasa. Bacaan reading tetap memakai kolom `passage` yang sudah ada, disalin ke setiap soal pada bagian yang sama, karena tampilan tes memang menggambar ulang bacaan di atas tiap soal.

Penilaian: soal `choice` dibandingkan dengan huruf kuncinya; soal `text` dinormalisasi dulu (spasi dirapikan, huruf dikecilkan, tanda baca dibuang) lalu dibandingkan dengan tiap isi `accepted`. Kunci yang disimpan saat menilai tetap dicatat di `answers.answer_key` seperti sekarang.

## 5. Audio

1. Berkas `listening-dec/December test 1 full.mp3` dari folder bahan disalin ke `apps/web/public/audio/ielts-dec-1.mp3` dan dialamatkan lewat kolom `tests.audio_url`. Media dari origin sendiri sudah diizinkan CSP.
2. Pemutar di halaman listening: satu tombol putar, tanpa bilah geser, tanpa unduh, dan setelah selesai tombolnya hilang. Memutar sekali adalah aturan mock IELTS.
3. Server mencatat `attempts.audio_played_at` saat pertama kali halaman meminta audio lewat `POST /api/attempts/:id/audio-played`. Permintaan kedua untuk attempt yang sama ditolak, jadi memuat ulang halaman tidak memberi putaran kedua.

## 6. Waktu dan pengiriman

1. Mode waktu baru `sections` dipakai khusus `ielts-mockup`. Empat kolom di `tests`: `listening_seconds` 1920, `reading_seconds` 3600, `writing_seconds` 3600, dan `speaking_block_seconds` 900. `total_seconds` menyimpan jumlahnya, 10020 detik, dan dihitung ulang setiap kali tim menyimpan empat waktu itu. `speaking_seconds` tetap batas satu rekaman placement, bukan blok speaking mockup.
2. Server mengirim `sectionPlan` berisi empat bagian beserta detiknya di `GET /api/config`, `GET /api/invites/:token`, dan `POST /api/attempts`. Runner memakai rencana itu untuk timer, kunci bagian, dan tombol "Lanjut ke Reading", "Lanjut ke Writing", atau "Lanjut ke Speaking".
3. Kolom `tests.auto_submit`: 1 berarti jawaban terkirim apa adanya di akhir bagian tulis, 0 berarti percobaan gagal seperti placement test. `ielts-mockup` bernilai 1, tes lain 0.
4. Anti-cheat, pencatat pelanggaran, dan penghapusan percobaan gagal berjalan seperti tes lain. Batas pelanggaran bisa diatur per tes.

Keputusan pemilik 17 November 2026: format computer-based 32/60/60/15, dan setiap bagian terkunci saat waktunya habis.

## 7. Konversi band

Tabel baru `band_scales`:

```sql
CREATE TABLE IF NOT EXISTS band_scales (
  test_key TEXT NOT NULL,
  skill    TEXT NOT NULL,
  raw      INTEGER NOT NULL,
  band     NUMERIC(3,1) NOT NULL,
  PRIMARY KEY (test_key, skill, raw)
);
```

Isinya diambil dari tabel konversi paket Desember yang sudah ada di bahan (`fullSectionListeningBandTable` dan `fullSectionReadingBandTable`), untuk `listening` dan `reading`, skor mentah 0 sampai 40. Band keseluruhan adalah rata-rata band skill yang ada, dibulatkan ke kelipatan setengah. Karena rilis pertama hanya dua skill, band keseluruhan sementara diberi label "perkiraan dari Listening dan Reading".

## 8. Hasil

1. Skor mentah per skill dihitung dari `answers` yang sudah menyimpan benar atau salah per soal, dikelompokkan lewat kolom `skill` soal.
2. Attempt menyimpan `bands`, JSON berisi band per skill dan band keseluruhan, dihitung server saat submit dan disimpan supaya hasil tidak berubah kalau tabel konversi diedit belakangan.
3. Laporan hasil adalah satu halaman React di `/hasil` untuk keempat tes. Undangan membuka `/hasil?attempt=<id>`, dan tes penempatan membuka `/hasil?token=<token>`. Untuk `ielts-mockup` laporan menampilkan skor mentah dan band per skill, band keseluruhan, evaluasi Writing dan Speaking, dan kalimat "Hasil ini adalah perkiraan dan bukan skor resmi IELTS. Skor resmi hanya diterbitkan oleh British Council atau IDP."
4. Email dan WhatsApp hasil menyusul setelah rilis pertama jalan; layar hasil dan dasbor dulu.

## 9. Akses: undangan ditambah kode

Sesuai bagian 6 PRD pendaftaran, yang tetap berlaku: undangan per siswa dengan `code` 6 karakter acak, unik, dikirim dalam pesan WhatsApp; tautan tanpa kode tidak bisa memulai; tiga kali salah mengunci undangan itu; tes tidak pernah terbuka untuk umum. Kolom `invites.opens_at` tetap disiapkan untuk jadwal per siswa dan CSV nanti.

## 10. Dasbor

| Bagian | Perubahan |
|---|---|
| Sidebar | Menu "IELTS Mockup" dengan Soal & Jawaban, Submission, dan Pengaturan seperti tes lain |
| Soal & Jawaban | Editor soal mendukung tipe `text`: daftar jawaban diterima, bagian, dan bacaan. Soal listening diberi label bagian |
| Submission | Detail menampilkan skor mentah per skill, band per skill, band keseluruhan, jawaban isian berhadapan dengan yang diterima, dan waktu audio diputar |
| Pengaturan | Empat durasi bagian, saklar kirim otomatis, buka atau tutup sesi, batas pelanggaran |
| Profil siswa | Tombol undangan IELTS Mockup di samping pre-test dan post-test |
| Lead dan Pendaftaran | Tanpa perubahan untuk fitur ini |

## 11. Konten dari folder ielts-mockup

| Bahan | Yang dipakai di rilis pertama |
|---|---|
| `packages/db/src/seed.ts` | 40 soal listening paket Desember beserta kunci dan tabel band, 40 soal reading paket Desember beserta kunci dan tabel band, tiga bacaan di `content/reading-test-1.json` |
| `listening-dec/December test 1 full.mp3` | Disalin ke `apps/web/public/audio/` sebagai audio paket pertama |
| `reading-dec/` tes 2 dan 3 (HTML) | Belum dipakai: kunci jawabannya belum ada di bahan. Masuk antrean isi berikutnya begitu kuncinya ada |
| `listening-dec/` tes 2 sampai 4 (HTML) | Belum dipakai: audionya belum ada di bahan |
| Writing, Speaking, `packages/ai` | Fase kedua, PRD lanjutan |
| Kode dan basis data platform lama | Tidak dipakai sama sekali |

Ekstraksinya lewat skrip sekali jalan `scripts/extract-ielts.mjs` yang membaca bahan di folder itu dan mengeluarkan berkas SQL siap pakai, bukan mengedit migrasi dengan tangan. Hasil ekstraksinya dimasukkan sebagai migrasi benih seperti 0001.

## 12. Hak konten

Bahan listening dan reading berasal dari halaman IELTS Online Tests yang disimpan, dan platform lamanya sendiri mencatat peringatan: pastikan pusat kursus punya hak memakai tiap bacaan, soal, gambar, dan audio. Keputusan hak pakai ada pada pemilik. Kalau ragu, paket pertama dipakai untuk sesi internal siswa terdaftar dulu dan tidak dipublikasikan.

## 13. Data model

Migrasi `db/migrations/0007_pendaftaran_and_mockup.sql` dari PRD pendaftaran diperluas, dan benih IELTS masuk migrasi `0008`:

```sql
ALTER TABLE questions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'choice';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS part INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS accepted TEXT;
ALTER TABLE questions ALTER COLUMN option_a DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN option_b DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN option_c DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN option_d DROP NOT NULL;

ALTER TABLE tests ADD COLUMN IF NOT EXISTS auto_submit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS audio_played_at BIGINT;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS bands TEXT;

CREATE TABLE IF NOT EXISTS band_scales ( ... );
```

Batasan kunci tes dan undangan, kolom `invites.code` dan `invites.opens_at`, serta baris tes `ielts-mockup` tetap seperti di PRD pendaftaran.

## 14. API

| Method | Path | Perubahan |
|---|---|---|
| GET | `/api/invites/:token` | Untuk `ielts-mockup` membalas `needsCode: true` dan nama paket, tanpa membuka soal |
| POST | `/api/attempts` | Menerima `inviteCode`; salah mengembalikan 403 dengan sisa percobaan; soal `text` memakai bentuk jawaban baru |
| POST | `/api/attempts/:id/audio-played` | Baru: menandai audio diputar, sekali per attempt, untuk bagian Listening yang memegang berkas audio |
| GET | `/api/attempts/:id/submit` | Untuk `ielts-mockup` membalas band per skill dan band keseluruhan; kirim otomatis di akhir bagian tulis |
| PUT | `/api/admin/tests/ielts-mockup` | Empat durasi bagian, saklar kirim otomatis, buka atau tutup sesi, dan batas pelanggaran |

## 15. Fase kedua: Writing dan Speaking

Writing dan Speaking sudah jalan sejak 17 November 2026 dengan keputusan pemilik. Writing dinilai AI saja tanpa review guru. Speaking dinilai Speechace dari 18 video examiner, tanpa penilaian manual rutin. Band keseluruhan memakai empat skill.

1. Soal `longtext` untuk dua task Writing dengan jumlah kata minimum, plus gambar grafik pada Task 1. Speaking memakai 18 pertanyaan video dari `docs/ielts-mockup-speaking.md`: 11 di Part 1, satu cue card Part 2 dengan 60 detik persiapan, dan 6 di Part 3.
2. Penilaian Writing memakai Google AI Studio (Gemini) dengan empat kriteria: Task Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy. Band Writing adalah rata-rata Task 1 dan Task 2 dengan Task 2 berbobot dua kali. Penilaian Speaking memakai Speechace dengan empat kriteria IELTS; band Speaking adalah rata-rata kriteria dari semua jawaban. Kalau penilaian otomatis gagal, tim bisa menilai ulang dari halaman submission, dan siswa bisa melewati speaking kalau mikrofonnya bermasalah.
3. Band keseluruhan sekarang rata-rata Listening, Reading, Writing, dan Speaking, dibulatkan ke kelipatan setengah.

## 16. Urutan pengerjaan

1. Migrasi: kolom soal baru, tes keempat, tabel band, undangan berkode.
2. Ekstraksi konten Desember menjadi benih plus berkas audio.
3. Inti web: tipe soal `text`, penilaian isian, pemutar audio sekali, kirim otomatis saat waktu habis, layar hasil band.
4. Kode undangan di halaman dan di `POST /api/attempts`.
5. Dasbor: menu IELTS Mockup, editor soal `text`, detail submission dengan band, pengaturan.
6. Tes di dev dengan audio dan 80 soal, lalu satu rilis bersama PRD pendaftaran.

## 17. Acceptance criteria

1. Siswa membuka undangan, memasukkan kode, dan hanya bisa mulai dengan kode yang benar; tiga kali salah mengunci undangan.
2. Audio listening terputar sekali per attempt, tidak bisa diputar lagi setelah muat ulang, dan tetap berbunyi saat siswa pindah soal Part 1 sampai Part 4.
3. Soal isian teks dinilai benar dengan ejaan yang berbeda tapi diterima, dan salah dengan jawaban di luar daftar.
4. Waktu bagian habis mengunci bagian itu dan memindahkan tes ke bagian berikutnya; jawaban terkirim otomatis di akhir bagian tulis dan tetap menghasilkan band, tidak menggagalkan percobaan.
5. Band listening dan reading mengikuti tabel konversi benih, dan band keseluruhan adalah rata-ratanya dibulatkan ke kelipatan setengah.
6. Layar hasil memuat kalimat perkiraan dan tidak menyebut skor resmi.
7. Tes tidak bisa dibuka tanpa undangan meski `is_open` menyala.
8. 80 soal Desember tampil dengan bacaan dan urutan yang benar, dan semua kuncinya lolos pemeriksaan benih.
9. Menu IELTS Mockup memuat 80 soal yang bisa diedit tim.
10. `npm test` memuat penilaian isian, konversi band, dan pembulatan band.

## 18. Pertanyaan terbuka

1. Untuk fase kedua, penilaian Writing dan Speaking lewat Cloudflare Workers AI seperti platform lama, atau lewat guru saja dulu?
