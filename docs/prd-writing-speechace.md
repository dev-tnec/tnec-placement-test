# PRD: Penilaian Writing Mockup dengan Speechace Score Writing

Status: draf untuk direview. Tanggal: 21 November 2026.

## 1. Ringkasan

Hari ini dua keahlian produktif mockup dinilai dua vendor berbeda: speaking oleh Speechace dan writing oleh Google AI Studio (Gemini). Uji coba langsung ke endpoint Score Writing Speechace (`api2.speechace.com/api/scoring/writing/v9/json`) dengan kunci produksi berhasil: esai Task 2 dinilai 8 pada skala IELTS dengan empat kriteria yang persis sama dengan rubrik yang dipakai sekarang, dan kuota Premium sudah mencakup panggilan writing secara terpisah dari speaking.

PRD ini memindahkan penilaian writing mockup dari Gemini ke Speechace, sehingga dua keahlian produktif dinilai satu vendor dengan satu keluarga rubrik. Tidak ada perubahan pada alur siswa, struktur data, maupun tampilan dashboard: hanya mesin di belakang `writing_status` yang berganti, plus satu keputusan kecil soal data yang dikirim ke vendor.

## 2. Masalah

1. Dua vendor untuk dua keahlian produktif berarti dua rubrik band yang tidak dijamin sebanding. Band Speaking 6 dari Speechace dan band Writing 6 dari Gemini tidak berasal dari mesin yang sama, jadi overall band mencampur dua skala yang berbeda karakter.
2. Dua integrasi berarti dua set kunci, dua perilaku gagal, dan dua dokumentasi untuk dipelihara. Tim harus mengerti dua sistem ketika satu esai perlu dinilai ulang.
3. Gemini adalah model umum yang menyatakan band sendiri; Speechace adalah layanan penilaian dengan rubrik yang dipublikasikan dan skala IELTS yang dipetakan langsung, sama seperti yang sudah dipakai untuk speaking.

## 3. Tujuan

1. Menilai kedua esai mockup (Task 1 dan Task 2) dengan endpoint Score Writing Speechace dan menyimpan empat kriteria IELTS: task_response, coherence, vocab, grammar, plus overall, pada struktur band yang sudah ada.
2. Menjaga alur siswa dan dashboard apa adanya: submit tetap menilai langsung, gagal tetap masuk jalur Nilai ulang writing, dan hasil tetap tampil di panel Writing submission dengan kriteria dan band.
3. Menyatukan perilaku gagal dengan pola antrean speaking: percobaan ulang otomatis, lalu menunggu tim.

## 4. Non-tujuan

1. Mengubah cara siswa mengerjakan esai, batas kata, atau timer Writing.
2. Mengubah tampilan hasil maupun konten email dan WhatsApp.
3. Mengirim gambar peta Task 1. Batasan yang sama dengan Gemini tetap: Task 1 dinilai dari teks prompt dan esainya.
4. Menghapus Gemini dari kode. Modul Gemini tetap untuk `GEMINI_MOCK=1` di dev dan sebagai referensi, hanya tidak lagi dipanggil di produksi.

## 5. Keputusan yang diusulkan

| Topik | Keputusan | Alasan |
|---|---|---|
| Endpoint | `POST /api/scoring/writing/v9/json` pada host region yang sama dengan speaking (`SPEECHACE_API_BASE`) | Satu kunci, satu host, satu tagihan |
| Format panggilan | Form-encoded (`application/x-www-form-urlencoded`), bukan JSON. Uji nyata menunjukkan JSON ditolak dengan `prompt parameter has invalid value` | Hasil uji langsung 21 November 2026 |
| Task type | `essay-writing` untuk kedua task. Task 2 (250 kata) pas; Task 1 (150 kata minimum) juga masuk rentang 150 sampai 300 kata | Sesuai panduan Speechace: esai 150 kata atau lebih memakai essay-writing |
| Data yang dikirim | `prompt` (teks soal), `answer` (esai), `user_id` (hash attempt id, sama seperti speaking), `dialect` dari pengaturan | Speechace tidak menerima nama maupun kontak siswa, sama seperti hari ini |
| Skor yang disimpan | `writing_score.ielts`: task_response, vocab, coherence, grammar, overall, disimpan pada bentuk yang sudah dipakai dashboard | Pemetaan satu-satu, tampilan tidak berubah |
| Band writing | Overall dari Speechace dipakai langsung, pembobotan Task 2 dua kali tetap berjalan di sisi kita seperti sekarang | Rubrik vendor menghitung kriteria; pembobotan task tetap kebijakan lembaga |
| Kegagalan | Jalur `writing_status = failed` dengan `writing_error` tetap; Nilai ulang writing memanggil ulang Speechace | Sama dengan hari ini, hanya vendor yang berganti |
| Gemini | Berhenti dipanggil untuk penilaian produksi. `GEMINI_MOCK=1` dan `GEMINI_API_KEY` tetap tidak disentuh di lingkungan dev; kunci produksi boleh dihapus setelah stabil | Memelihara jalan mundur tanpa biaya |

## 6. Alur penilaian

1. Siswa mengirim jawaban. Submit menyimpan kedua esai dan memanggil penilaian writing dua kali: sekali per task.
2. Untuk tiap task, server mengirim form-encoded `prompt` dan `answer` ke Speechace, memakai `task_type=essay-writing`.
3. Respons sukses menyimpan empat kriteria IELTS plus overall per task, lalu band writing dihitung seperti sekarang: pembobotan Task 2 dua kali Task 1, dibulatkan ke setengah terdekat.
4. Kedua task sukses berarti `writing_status = graded` dan band masuk ke overall attempt. Satu task gagal berarti `writing_status = failed` dengan pesan dari Speechace, dan tim menekan Nilai ulang writing di halaman submission.
5. Penilaian ulang memanggil ulang task yang gagal dengan parameter yang sama.

## 7. Perubahan kode

| Lokasi | Perubahan |
|---|---|
| `packages/core/src/writing.js` | `gradeWritingTask` berganti mesin: panggilan Speechace form-encoded, pemetaan respons `writing_score.ielts` ke bentuk kriteria yang ada, dan kesalahan yang diklasifikasi (kuota, koneksi, konten) |
| `packages/core/src/writing.js` | Fungsi Gemini lama tetap sebagai `gradeWritingTaskGemini` untuk `WRITING_MOCK=1` di dev, ditandai tidak dipakai produksi |
| `apps/web/src/api.js` | Tidak berubah: tetap memanggil `gradeWritingTask` dengan parameter yang sama |
| `.env.example` | Catatan bahwa penilaian writing produksi memakai `SPEECHACE_KEY`; `GEMINI_API_KEY` menjadi opsional |
| Dashboard | Tidak ada perubahan; panel Writing sudah menampilkan empat kriteria dan band |

## 8. Privasi dan keamanan

1. Speechace menerima teks soal, esai, dan hash attempt id. Tidak ada nama, email, maupun nomor WhatsApp, sama seperti panggilan speaking hari ini.
2. Kebijakan privasi menyebut penilai writing generik sebagai mitra penilaian bahasa yang memproses di luar Indonesia dan menerima esai, teks task, dan id acak. Perubahan vendor tidak mengubah pernyataan itu, karena Gemini juga diposisikan generik. Nama Speechace tetap hanya di dokumen internal, kode, dan dashboard, tidak pernah di teks siswa, sesuai aturan yang berlaku.
3. Penyimpanan esai dan hasil tidak berubah: esai pada `answers`, kriteria pada `attempts.bands`.

## 9. Penanganan error

| Kondisi | Perilaku |
|---|---|
| Jaringan atau batas waktu | `writing_status = failed` dengan pesan koneksi, Nilai ulang menolak ulang |
| Kuota writing habis | `writing_status = failed` dengan pesan kuota yang jelas, aktivitas siswa mencatat kegagalan |
| Esai di bawah batas kata task | Tetap ditolak sebelum panggilan, seperti sekarang |
| Respons tanpa status sukses | `writing_status = failed` dengan pesan dari Speechace |

## 10. Biaya

Setiap attempt mockup memakai 2 panggilan writing di samping 18 panggilan speaking. Kuota Premium mencatat keduanya terpisah. Bandingkan harga per panggilan writing Speechace dengan biaya Gemini yang mendekati nol: keputusan akhir soal biaya ada pada pemilik setelah melihat tagihan pertama. Rencana implementasi menyediakan uji banding dulu agar keputusan diambil dengan data.

## 11. Testing

1. Uji banding sebelum penuh: ambil esai hasil dev yang sudah dinilai Gemini, kirim ke Speechace, bandingkan kedua band per kriteria. Terima jika selisih rata-rata keseluruhan dalam setengah band.
2. E2E dev: submit mockup dengan dua esai memenuhi batas kata, kedua task graded, band masuk overall, tanpa perubahan tampilan.
3. Gagal satu task: `writing_status = failed`, Nilai ulang memperbaiki, band akhir benar.
4. Regresi: panel Writing submission, hasil, sertifikat otomatis, dan pemberitahuan tidak berubah bentuk datanya.
5. Smoke: pemetaan respons contoh dari dokumentasi Speechace menghasilkan kriteria yang diharapkan.

## 12. Rollout

1. Tulis uji banding, jalankan pada esai dev, laporkan selisihnya ke pemilik.
2. Keputusan go atau no-go berdasarkan banding dan harga.
3. Jika go: ganti mesin, jalankan E2E dev, terbitkan, awasi lima attempt produksi pertama lewat panel Writing.
4. Setelah dua minggu stabil, hapus `GEMINI_API_KEY` dan `GEMINI_MODEL` dari layanan Render web.

## 13. Acceptance criteria

1. Kedua esai mockup dinilai Speechace dan menghasilkan empat kriteria IELTS plus overall per task.
2. Band writing pada attempt dihitung dengan pembobotan yang sama seperti sekarang.
3. Kegagalan menempuh jalur Nilai ulang yang ada tanpa perubahan dashboard.
4. Tidak ada data siswa selain teks soal, esai, dan hash id yang keluar.
5. Dashboard, hasil, sertifikat otomatis, dan pemberitahuan tidak berubah tampilan.

## 14. Pertanyaan terbuka

1. Harga per panggilan writing pada paket Premium: perlu dicek di tagihan atau tanya Speechace sebelum go.
2. `score_mode=enhanced` menawarkan akurasi lebih tinggi dengan biaya lebih besar: mulai dari standard, naikkan hanya jika banding menunjukkan standard kurang stabil.
3. `detect_ai_response_content=1` bisa menandai esai buatan AI. Menyalakannya berarti kebijakan baru: apa yang dilakukan tim ketika esai tertentu ditandai? Untuk rilis pertama tidak dipakai; keputusan kebijakan menyusul terpisah.
