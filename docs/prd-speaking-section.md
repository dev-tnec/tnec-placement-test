# PRD: Bagian Speaking dengan Speechace

Status: draf untuk direview. Tanggal: 17 November 2026.

## 1. Ringkasan

Tes penempatan saat ini hanya mengukur grammar, vocabulary, dan reading lewat 25 soal pilihan ganda. Hasilnya dikirim seketika setelah siswa mengisi nama, email, dan WhatsApp.

PRD ini menambahkan satu bagian speaking opsional di akhir tes. Siswa merekam satu jawaban, mengirim pekerjaannya, mengisi data kontak, lalu menutup halaman. Sistem menilai rekaman itu dengan Speechace di latar belakang, menggabungkannya dengan skor pilihan ganda, lalu mengirim hasil yang lebih rinci lewat email dan WhatsApp.

Karena penilaian Speechace butuh beberapa detik sampai puluhan detik, hasil tidak lagi dikirim di dalam response HTTP. Halaman siswa berubah menjadi layar "hasil sedang disiapkan", dan pengiriman terjadi setelah penilaian selesai.

## 2. Masalah

Hasil sekarang hanya berisi level dan skor total. Tim pendidikan tidak melihat kemampuan berbicara, padahal itu bagian penting dari penempatan kelas. Email dan WhatsApp juga hanya menyebut level, skor, dan satu kalimat rekomendasi, sehingga siswa tidak tahu kekuatan dan kelemahannya.

## 3. Tujuan

1. Menambahkan bagian speaking opsional pada placement test, dengan satu pertanyaan terbuka dan rekaman maksimal 45 detik.
2. Menilai rekaman dengan Speechace dan menyimpan lima aspek: pronunciation, fluency, grammar, vocabulary, dan coherence.
3. Mengirim hasil secara asinkron setelah penilaian selesai, tanpa membuat siswa menunggu di halaman.
4. Membuat email dan WhatsApp memuat rincian lima aspek, CEFR, dan IELTS.
5. Menyediakan saklar untuk menyalakan atau mematikan bagian speaking per tes.
6. Menandai pengiriman yang gagal dinilai otomatis agar dinilai manual oleh tim.

## 4. Non-tujuan

1. Percakapan langsung atau wawancara real time. Rekaman tetap satu arah.
2. Penilaian otomatis untuk pre-test dan post-test pada rilis pertama. Saklar hanya dipakai di placement test.
3. Sertifikat yang mencetak skor speaking. Sertifikat tetap memakai data yang ada.
4. Penilaian ulang otomatis tanpa campur tangan tim ketika Speechace gagal.
5. Aplikasi mobile khusus. Perekaman memakai MediaRecorder di browser yang sama.

## 5. Keputusan yang diusulkan

| Topik | Keputusan untuk rilis pertama | Alasan |
|---|---|---|
| Pengaruh ke level | Level tetap dari skor pilihan ganda. Speaking tampil sebagai blok terpisah | Ambang level dan sertifikat tidak berubah sebelum ada kalibrasi |
| Jumlah pertanyaan | Satu pertanyaan per tes, disimpan di tabel `tests` | Cukup untuk sinyal awal, tanpa tabel baru |
| Durasi | Maksimal 45 detik, minimal 15 detik | Di bawah 20 kata Speechace memberi peringatan `response_too_short` |
| Penyimpanan audio | Kolom `bytea` di Postgres, maksimal 3 MB | Render tidak punya disk permanen, dan audio 45 detik hanya sekitar 200 KB |
| Retensi audio | Dihapus 30 hari setelah dinilai | Menjaga privasi tanpa menghilangkan bukti untuk sengketa |
| Penilai | Speechace untuk otomatis, tim untuk manual | Sesuai permintaan pemilik |
| Tes yang memakai | Placement saja pada rilis pertama | Pre-test dan post-test memakai invite dan alur berbeda |

## 6. Alur pengguna

1. Siswa membuka tes seperti sekarang dan menyetujui tiga kotak persetujuan. Teks privasi sudah menyebut rekaman suara dan Speechace.
2. Siswa mengerjakan 25 soal pilihan ganda seperti sekarang.
3. Setelah menekan Kirim Jawaban, jika speaking aktif, muncul layar speaking. Siswa melihat pertanyaan, menekan Mulai Rekam, berbicara, lalu menekan Stop.
4. Siswa bisa mendengarkan hasil rekaman dan merekam ulang satu kali sebelum mengirim. Tombol Kirim Rekaman mengunggah audio.
5. Setelah unggahan berhasil, siswa mengisi nama, email, dan WhatsApp seperti sekarang.
6. Halaman terakhir menampilkan pesan bahwa hasil sedang disiapkan dan akan dikirim ke email dan WhatsApp. Skor tidak ditampilkan di halaman.
7. Di latar belakang, sistem mengirim audio ke Speechace, menyimpan lima skor, lalu mengirim email dan WhatsApp.
8. Jika Speechace gagal setelah tiga percobaan, pengiriman ditandai perlu dinilai manual dan masuk antrean dashboard. Siswa tidak menerima hasil sampai tim menyelesaikannya.

Jika speaking dimatikan, langkah 3 sampai 5 dilewati dan alur kembali seperti sekarang, termasuk hasil yang langsung tampil setelah kontak.

## 7. Aturan penilaian

Endpoint yang dipakai adalah `POST /api/scoring/speech/v9/json` dengan `user_audio_file`, `include_ielts_feedback=1`, `relevance_context` berisi pertanyaan, `dialect=en-us`, dan `user_id` berisi id attempt yang sudah di-hash. Endpoint ini butuh langganan Premium.

Lima aspek yang disimpan dan ditampilkan:

| Aspek | Kunci Speechace | Skala |
|---|---|---|
| Pronunciation | `speech_score.cefr_score.pronunciation`, `ielts_score.pronunciation`, `speechace_score.pronunciation` | CEFR, IELTS 0 sampai 9, 0 sampai 100 |
| Fluency | `fluency` | Sama |
| Grammar | `grammar` | Sama |
| Vocabulary | `vocab` | Sama |
| Coherence | `coherence` | Sama |
| Keseluruhan | `overall` pada ketiga objek | Sama |

Aturan tampilan:

1. Angka utama adalah CEFR keseluruhan. IELTS keseluruhan menjadi angka kedua. Skor 0 sampai 100 hanya ditampilkan di tabel rincian.
2. Tidak ada konversi buatan sendiri. Semua angka diambil apa adanya dari Speechace.
3. `relevance.class` disimpan dan ditampilkan sebagai catatan "Sesuai pertanyaan" atau "Belum sesuai pertanyaan".
4. `score_issue_list` disimpan. `response_too_short` tidak menggagalkan penilaian, tetapi menandai `needs_review = 1` dan tetap dikirim.
5. `grammar.errors` dan pesan metrik yang levelnya `low` diambil maksimal tiga untuk catatan di email. Teks dibersihkan dari tag sebelum dikirim.
6. Transkrip disimpan dan ditampilkan di email dan dashboard. Di WhatsApp hanya dikirim kalau panjangnya di bawah 300 karakter.

## 8. Perubahan data

Migrasi baru `db/migrations/0005_speaking.sql`.

```sql
ALTER TABLE tests ADD COLUMN speaking_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN speaking_seconds INTEGER NOT NULL DEFAULT 45;
ALTER TABLE tests ADD COLUMN speaking_min_seconds INTEGER NOT NULL DEFAULT 15;
ALTER TABLE tests ADD COLUMN speaking_prompt TEXT;

CREATE TABLE speaking_submissions (
  id                 TEXT PRIMARY KEY,
  attempt_id         TEXT NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE CASCADE,
  student_id         TEXT,
  prompt             TEXT NOT NULL,
  audio              BYTEA,
  audio_mime         TEXT,
  audio_bytes        INTEGER,
  duration_seconds   INTEGER,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'grading', 'graded', 'failed', 'manual', 'skipped')),
  needs_review       INTEGER NOT NULL DEFAULT 0,
  provider           TEXT NOT NULL DEFAULT 'speechace',
  provider_request_id TEXT,
  provider_response  TEXT,
  transcript         TEXT,
  cefr_overall       TEXT,
  ielts_overall      NUMERIC(3,1),
  scores             TEXT,
  error              TEXT,
  tries              INTEGER NOT NULL DEFAULT 0,
  next_attempt_at    BIGINT,
  lease_until        BIGINT,
  graded_at          BIGINT,
  graded_by          TEXT,
  created_at         BIGINT NOT NULL
);

CREATE INDEX idx_speaking_status ON speaking_submissions (status, next_attempt_at);
CREATE INDEX idx_speaking_attempt ON speaking_submissions (attempt_id);
```

Catatan:

1. `scores` menyimpan JSON lima aspek dengan tiga skala, supaya email dan dashboard tidak perlu memanggil Speechace lagi.
2. `provider_response` menyimpan response mentah yang sudah dipotong 200 KB, untuk audit dan sengketa.
3. `attempts` tidak perlu kolom baru. Status menunggu dihitung dari `speaking_submissions.status`.
4. Audio dihapus dengan `UPDATE speaking_submissions SET audio = NULL WHERE graded_at < now - 30 days`, dijalankan oleh sweep harian.

## 9. Perubahan API

| Method | Path | Perubahan |
|---|---|---|
| GET | `/api/config` | Tambah `speaking: { enabled, seconds, minSeconds, prompt }` |
| POST | `/api/attempts/:id/speaking` | Baru. Menerima audio mentah, maksimal 3 MB, tipe `audio/webm`, `audio/ogg`, `audio/mp4`, atau `audio/wav`. Hanya untuk attempt yang sudah `submitted`. Satu unggahan final, unggahan kedua ditolak setelah status bukan `pending` |
| POST | `/api/attempts/:id/contact` | Tidak lagi memanggil `deliverInBackground` kalau speaking masih menunggu. Response berubah menjadi `{ delivery: { email, whatsapp }, result: null, speaking: { status } }` ketika skor belum siap |
| GET | `/api/admin/speaking/:id/audio` | Baru. Butuh sesi admin. Mengembalikan audio dengan `content-type` aslinya |
| POST | `/api/admin/speaking/:id/grade` | Baru. Menyimpan nilai manual, status `manual`, lalu memicu pengiriman |
| POST | `/api/admin/speaking/:id/retry` | Baru. Mengembalikan status ke `pending` dan menjalankan penilaian lagi |
| PUT | `/api/admin/tests/:key` | Menerima `speakingEnabled`, `speakingSeconds`, `speakingMinSeconds`, `speakingPrompt` |
| GET | `/api/admin/bootstrap` | Tambah ringkasan speaking dan daftar yang perlu dinilai |

Aturan validasi unggahan:

1. Tolak kalau `Content-Type` bukan audio yang diizinkan.
2. Tolak kalau ukuran lebih dari 3 MB.
3. Tolak kalau attempt belum `submitted` atau sudah punya baris speaking yang statusnya bukan `pending`.
4. Simpan `duration_seconds` dari header `X-Duration` yang dikirim klien, dibatasi 1 sampai 120.
5. Jangan pernah mengirim audio ke klien tanpa sesi admin.

## 10. Proses latar belakang

Modul baru `packages/core/src/speaking.js`, mengikuti pola lease yang sudah dipakai `packages/core/src/delivery.js`.

1. Setelah unggahan tersimpan, server memanggil `gradeInBackground(env, submissionId)` tanpa menunggu.
2. Fungsi itu mengklaim baris dengan `UPDATE ... SET status = 'grading', lease_until = now + 120 WHERE status = 'pending' AND (lease_until IS NULL OR lease_until < now) RETURNING ...`.
3. Audio dikirim ke Speechace dengan timeout 60 detik. `AbortSignal.timeout` dipakai supaya server tidak menggantung.
4. Kalau sukses, simpan transkrip, lima skor, `provider_request_id`, `provider_response`, status `graded`, lalu panggil `deliverInBackground` untuk attempt tersebut.
5. Kalau gagal, `tries` naik. Percobaan berikutnya dijadwalkan 60 detik, 5 menit, lalu 15 menit kemudian lewat `next_attempt_at`. Setelah tiga kegagalan, status menjadi `failed`, `needs_review = 1`, dan hasil tidak dikirim.
6. Saat server web mulai, `gradePending(env)` mengambil semua baris `pending` yang `next_attempt_at` sudah lewat. Ini menutup kasus server mati di tengah penilaian.
7. Sweep berjalan setiap 60 detik lewat `setInterval` yang di-`unref`, dan berhenti saat SIGTERM bersama `drainDeliveries`.

Pengiriman hasil menunggu speaking:

1. `deliverResult` di `delivery.js` mengecek apakah ada `speaking_submissions` untuk attempt itu.
2. Kalau ada dan statusnya `pending`, `grading`, atau `failed`, fungsi mengembalikan `null` tanpa mengirim.
3. Kalau statusnya `graded`, `manual`, atau `skipped`, pengiriman berjalan seperti sekarang.
4. Kontak tetap menyimpan `email_status` dan `wa_status` menjadi `pending`, tetapi `deliverInBackground` tidak dipanggil sampai speaking final.

## 11. Hasil yang lebih rinci

### Email

Struktur baru `packages/core/src/email.js`, tetap 600px dan inline style.

| Bagian | Isi |
|---|---|
| Header | Navy, eyebrow kuning, judul "Hasil Tes Penempatan" |
| Sapaan | Halo nama, satu paragraf pengantar |
| Kartu level | Level, skor pilihan ganda, jumlah benar |
| Kartu speaking | CEFR keseluruhan, IELTS, lima baris aspek dengan CEFR dan skor 0 sampai 100 |
| Transkrip | Blok surface, maksimal 600 karakter |
| Catatan | Maksimal tiga pesan dari Speechace |
| Rekomendasi | Program dari level, seperti sekarang |
| CTA | Tombol WhatsApp |
| Catatan kaki | Disclaimer dan alamat kampus |

Kalau speaking dimatikan atau `skipped`, kartu speaking tidak dirender dan email tetap seperti sekarang.

### WhatsApp

Pesan baru `buildResultWhatsApp`:

```text
Halo Rani, hasil tes penempatan kamu sudah siap.

Level: Intermediate
Skor tes: 13 dari 25

Speaking (Speechace):
CEFR B2, IELTS 6.0
Pronunciation 78 (B2)
Fluency 80 (B2)
Grammar 62 (B1)
Vocabulary 64 (B1)
Coherence 70 (B2)

Program yang kami sarankan: Program Intermediate.

Balas pesan ini kalau ingin konsultasi.

_Hasil ini dipakai untuk penempatan kelas dan bukan sertifikat resmi._
```

Aturan:

1. Maksimal 1.000 karakter. Kalau lebih, transkrip dan catatan dihapus lebih dulu.
2. Angka 0 sampai 100 hanya dikirim kalau ada. Untuk nilai manual yang hanya berisi CEFR, barisnya menjadi `Pronunciation B2`.
3. Tetap memakai `source: "Placement Test"` supaya lead source di AttCos tidak berubah.

### Dashboard

Halaman submission menampilkan blok speaking: status, audio player, transkrip, lima skor, request id, error terakhir, dan tombol Coba Lagi. Halaman siswa menampilkan ringkasan yang sama di panel Sertifikat atau panel baru Speaking.

## 12. Admin

### Pengaturan

Di menu Placement Test, Pengaturan, tambah satu bagian "Speaking".

| Field | Kontrol | Aturan |
|---|---|---|
| Aktif | Toggle | Default mati sampai tim menyalakan |
| Durasi maksimal | Number, 15 sampai 90 detik | Default 45 |
| Durasi minimal | Number, 5 sampai 30 detik | Default 15 |
| Pertanyaan | Textarea, maksimal 300 karakter | Wajib kalau aktif |
| Bahasa | Select en-US atau en-GB | Default en-US |

Tombol Simpan memakai route `PUT /api/admin/tests/:key` yang sudah ada.

### Antrean manual

1. Filter baru di Submission: "Perlu dinilai".
2. Baris dengan `status = failed` atau `needs_review = 1` diberi chip merah "Perlu dinilai".
3. Halaman detail menampilkan form: CEFR keseluruhan (wajib), IELTS (opsional), lima CEFR aspek (opsional), catatan (opsional).
4. Simpan dan Kirim menulis status `manual`, `graded_by`, `graded_at`, lalu memanggil `deliverInBackground`.
5. Tombol "Tidak dinilai" mengubah status menjadi `skipped` dengan alasan. Hasil tetap dikirim tanpa blok speaking.
6. Tombol Coba Lagi mengubah status menjadi `pending`, menghapus `error`, dan menjalankan penilaian lagi.

## 13. Penanganan error

| Kondisi | Status | Tindakan |
|---|---|---|
| HTTP 5xx atau timeout | `pending`, `tries` naik | Retry sesuai jadwal, lalu `failed` |
| HTTP 401 atau 403 | `failed` | Perlu manual, tampilkan pesan kunci API di dashboard |
| Kuota habis, HTTP 429 | `failed` | Perlu manual, tampilkan peringatan kuota |
| `error_no_speech` | `failed` | Perlu manual, audio bisa didengarkan admin |
| `non_dialect_language_detected` | `failed` | Perlu manual, siswa mungkin menjawab dalam bahasa Indonesia |
| `response_too_short` | `graded`, `needs_review = 1` | Tetap dikirim, ditandai di dashboard |
| Audio lebih dari 3 MB | Ditolak di API | Siswa merekam ulang |
| Audio kurang dari durasi minimal | Ditolak di klien | Siswa merekam ulang |

Kalau pengiriman email atau WhatsApp gagal setelah speaking dinilai, perilakunya tetap seperti sekarang: status channel menjadi `failed: ...`, dashboard bisa kirim ulang email, dan WhatsApp dikirim manual dari halaman siswa.

## 14. Privasi dan keamanan

1. Rekaman suara adalah data pribadi. Kebijakan privasi harus menyebut rekaman suara, Speechace sebagai prosesor, dan masa simpan 30 hari untuk audio.
2. `CONSENT_VERSION` naik, misalnya menjadi `2026-11-17a`. Teks persetujuan menyebut bahwa suara direkam dan dikirim ke Speechace untuk dinilai.
3. Audio tidak pernah punya URL publik. Route audio admin memakai sesi dan `Cache-Control: no-store`.
4. Kunci Speechace hanya ada di environment server, tidak pernah di HTML atau JavaScript klien.
5. Nama siswa tidak dikirim ke Speechace. `user_id` memakai hash attempt id.
6. Hapus audio setelah 30 hari, dan hapus seluruh baris speaking saat attempt dihapus.
7. Batasi satu unggahan per attempt dan 3 MB per unggahan.

## 15. Biaya

Speechace `score/speech` butuh paket Premium. Harga per 15 detik sekitar $0.008 di Pro dan $0.0125 di Premium, jadi satu jawaban 45 detik sekitar $0.024 sampai $0.0375.

| Volume per bulan | Perkiraan biaya |
|---|---|
| 100 siswa | $2.40 sampai $3.75 |
| 1.000 siswa | $24 sampai $37.50 |
| 5.000 siswa | $120 sampai $187.50 |

Biaya ini di luar email, WhatsApp, dan Neon. Tidak ada biaya per pertanyaan tambahan.

## 16. Observability

1. Log setiap penilaian dengan `submissionId`, `attemptId`, `provider_request_id`, durasi, status HTTP, dan `tries`.
2. Simpan `x-speechace-scoring-quota` dari response di log.
3. Ringkasan di dashboard: jumlah menunggu, jumlah gagal, jumlah manual, rata-rata waktu penilaian.
4. Kalau lebih dari lima submission gagal dalam satu jam, tampilkan banner di dashboard.

## 17. Testing

1. Unit test untuk pemetaan lima skor dan untuk aturan status `pending` ke `graded`, `failed`, dan `manual`.
2. Unit test untuk `deliverResult` yang menolak mengirim saat speaking belum final.
3. Integration test dengan stub Speechace untuk sukses, 500, timeout, `error_no_speech`, dan `response_too_short`.
4. E2E di branch `dev`: nyalakan speaking, rekam dengan audio palsu, isi kontak, tunggu email dan WhatsApp, lalu cek isi pesannya.
5. E2E manual: matikan Speechace, pastikan submission masuk antrean, nilai manual, dan hasil terkirim satu kali.
6. Test akses: audio tidak bisa diambil tanpa sesi, dan tidak bisa diambil untuk attempt milik siswa lain.
7. Test retensi: sweep menghapus audio yang lebih dari 30 hari tanpa menghapus skor.

## 18. Rollout

1. Jalankan migrasi `0005_speaking.sql` di branch `dev`, lalu di `main`.
2. Tambah `SPEECHACE_KEY` dan `SPEECHACE_API_BASE` di environment service web Render.
3. Deploy `apps/web` dan `apps/admin` karena keduanya berubah.
4. Nyalakan speaking di Pengaturan dengan satu pertanyaan percobaan.
5. Uji 10 siswa, bandingkan CEFR Speechace dengan penilaian guru.
6. Kalau hasilnya wajar, nyalakan untuk publik. Kalau tidak, matikan lagi tanpa deploy.
7. Fase kedua: sertifikat dan level gabungan, setelah ada data kalibrasi.

## 19. Acceptance criteria

1. Dengan speaking mati, alur dan hasil identik dengan sekarang.
2. Dengan speaking hidup, siswa merekam, mengirim, mengisi kontak, dan melihat layar "hasil sedang disiapkan".
3. Email dan WhatsApp memuat level, skor pilihan ganda, CEFR speaking, IELTS, dan lima aspek.
4. Penilaian normal selesai dan terkirim dalam dua menit untuk satu jawaban 45 detik.
5. Timeout atau 5xx dicoba tiga kali, lalu masuk antrean manual tanpa mengirim hasil.
6. Nilai manual mengirim hasil satu kali dan tidak bisa mengirim dua kali.
7. Kontak yang dikirim ulang tidak mengirim email atau WhatsApp lagi.
8. Audio tidak bisa diakses tanpa sesi admin.
9. Kebijakan privasi dan `CONSENT_VERSION` sudah diperbarui.
10. Tidak ada audio yang lebih tua dari 30 hari.
11. `npm test` lulus dan memuat test baru untuk status speaking.

## 20. Pertanyaan terbuka

1. Apakah speaking nanti ikut menentukan level, atau tetap terpisah. Rekomendasi: terpisah sampai ada 100 sampai 200 sampel yang dinilai guru.
2. Apakah pre-test dan post-test juga memakai speaking. Rekomendasi: belum, karena alur invite dan skor 100 berbeda.
3. Siapa yang boleh menilai manual, semua admin atau hanya role pendidikan. Rekomendasi: keduanya dulu, dibatasi setelah ada keluhan.
4. Berapa lama siswa menunggu sebelum diberi pesan "masih diproses" kalau antrean manual panjang. Rekomendasi: belum ada pesan otomatis di rilis pertama.
5. Apakah transkrip perlu ditampilkan ke siswa. Rekomendasi: ya di email, karena membantu siswa memahami skornya.
