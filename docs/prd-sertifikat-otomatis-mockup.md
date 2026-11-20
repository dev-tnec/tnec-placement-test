# PRD: Sertifikat Otomatis IELTS Mockup dan Pemberitahuan yang Menyebutnya

Status: draf untuk direview. Tanggal: 20 November 2026.

## 1. Ringkasan

Saat ini sertifikat hanya terbit lewat satu pintu: tim membuka halaman siswa atau menu Sertifikat, menekan Terbitkan sertifikat, mengisi jenis, nama, tanggal, dan field satu per satu, lalu menekan simpan. Tidak ada sertifikat otomatis untuk siapa pun, termasuk IELTS Mockup yang datanya paling lengkap: band Listening, Reading, Writing, dan Speaking, keseluruhannya, serta nama siswa dan tanggalnya sudah tersimpan pada baris attempt begitu penilaian selesai.

Pada saat yang sama, pemberitahuan selesai mockup yang baru dibangun (email dan WhatsApp) hanya membawa tabel band dan tautan hasil. Ia tidak menyebut sertifikat, karena memang belum ada sertifikat yang bisa disebut.

PRD ini menghubungkan dua ujung itu. Begitu attempt IELTS Mockup mencapai keadaan selesai (band final tersimpan, tidak ada yang pending), sistem menerbitkan sertifikat IELTS Prediction secara otomatis dengan field yang diambil dari band attempt, mencatatnya di profil siswa, dan pemberitahuan selesai menyebut sertifikatnya beserta tautan filenya. Tim tetap bisa merenum, menyunting, membatalkan, dan mengirim ulang sertifikat itu seperti sertifikat manual.

## 2. Masalah

1. Sertifikat manual memakai waktu tim untuk data yang sudah ada di mesin. Setiap peserta mockup yang lulus butuh satu dialog dengan lima isian, padahal band keseluruhan dan per skill, nama siswa, dan tanggal sudah ada pada attempt.
2. Pemberitahuan selesai diam soal sertifikat. Siswa menerima band lewat WhatsApp dan email, lalu harus menunggu tim menerbitkan dan mengirim sertifikat secara terpisah, atau bertanya dulu.
3. Tidak ada jejak antara hasil dan sertifikat. Sertifikat manual tidak tahu attempt mana yang menjadi dasarnya, jadi tidak ada cara memastikan band di kertas sama dengan band di data, dan tidak ada pencegah penerbitan ganda untuk attempt yang sama.

## 3. Tujuan

1. Menerbitkan sertifikat IELTS Prediction otomatis begitu attempt mockup selesai dinilai, termasuk band Writing dan Speaking dan keseluruhan pada field sertifikat.
2. Mengikat sertifikat itu ke attempt asalnya, sehingga terbit ganda tidak mungkin dan dashboard bisa menunjukkan hasil yang menjadi dasarnya.
3. Menyebut sertifikat pada pemberitahuan selesai (email dan WhatsApp), dengan tautan file PDF-nya bila sudah terkirim, atau janji bahwa sertifikat menyusul bila belum.
4. Menjaga kontrol tim: sertifikat otomatis muncul di daftar yang sama, bisa disunting, dibatalkan, dipulihkan, dan dikirim ulang persis seperti sertifikat manual.

## 4. Non-tujuan

1. Sertifikat otomatis untuk placement, pre-test, dan post-test. Ketiganya tetap manual.
2. Mengubah format nomor, counter, template, atau alur terbit dan kirim. Mesin nomor, penyusun PDF react-pdf, dan jalur kirim dipakai apa adanya.
3. Mengirim sertifikat otomatis ke siswa tanpa tindakan tim. Sertifikat terbit otomatis, tetapi pengiriman tetap manual lewat menu Kirim email atau Kirim WhatsApp, supaya tim memeriksa dulu cetakan atas nama dan bandnya. Pemberitahuan selesai boleh menyebut sertifikatnya sudah terbit.
4. Perubahan pada TOEFL Prediction dan Certificate of Completion.

## 5. Keputusan yang diusulkan

| Topik | Keputusan | Alasan |
|---|---|---|
| Kapan terbit | Saat attempt mockup mencapai keadaan final: submitted, tidak ada jawaban speaking yang pending, dan writing graded. Untuk attempt tanpa speaking aktif, terbit saat submit selesai | Satu momen final per attempt, tidak perlu polling |
| Pemicu | Titik yang sama dengan pemberitahuan selesai: akhir submit dan akhir penilaian speaking di worker. Penerbitan berjalan sebelum pemberitahuan supaya pesan bisa menyebut nomor sertifikatnya | Satu tempat logika, dua efek berurutan |
| Jenis sertifikat | Tipe IELTS Prediction (`ctp_ielts`) bila aktif. Bila tipenya nonaktif atau tidak ada, penerbitan dilewati tanpa error dan dicatat di log aktivitas | Tim yang mengendalikan tipe, bukan kode |
| Field | writing, speaking, dan skor_akhir diambil dari band attempt; skor_akhir memakai band keseluruhan. Bila speaking tidak dinilai (gagal atau dilewati), field speaking diisi tanda strip dan skor_akhir tetap band keseluruhan tiga skill | Kertas tidak pernah menampilkan angka yang tidak ada |
| Nama penerima | `students.name`, bukan nama kontak attempt | Nama resmi siswa, konsisten dengan sertifikat manual |
| Tanggal terbit | Tanggal penilaian selesai (hari penerbitan), bukan tanggal mengerjakan | Nomor dan tanggal terbit berpasangan pada periode yang sama |
| Terbit ganda | Kolom baru `certificates.attempt_id`, unik. Percobaan terbit kedua untuk attempt yang sama diabaikan dengan senyap dan dicatat di log | Idempoten, aman diulang worker |
| Sertifikat lama | Sertifikat manual yang sudah ada tidak diubah dan tidak diikat ke attempt | Tidak menyentuh data terbit |
| Sinkron dengan nomor | Penerbitan memakai transaksi counter yang sama dengan penerbitan manual; kegagalan menyimpan mengembalikan nomor | Nomor tidak pernah bolong |
| Pemberitahuan | Email dan WhatsApp selesai menambah baris: "Sertifikat IELTS Prediction kamu sudah terbit dengan nomor X" bila berhasil, atau tidak menyebut sertifikat bila tipenya nonaktif | Janji sesuai kenyataan |
| Hasil attempt tiga skill | Sertifikat tetap terbit dengan speaking kosong; pemberitahuan tetap terkirim. Setelah Nilai ulang speaking berhasil dan band Speaking masuk, field sertifikat tidak diubah otomatis; tim memperbaruinya lewat Edit bila perlu | Menulis ulang kertas yang sudah terbit itu berbahaya; keputusan tetap di tangan tim |

## 6. Alur pengguna

### 6.1 Peserta mockup dengan speaking dinilai

1. Peserta menyelesaikan empat bagian dan mengirim jawaban. Writing dinilai AI saat submit, speaking masih pending.
2. Worker Speechace menyelesaikan jawaban terakhir, menghitung band Speaking, menyimpan band empat skill dan keseluruhan pada attempt.
3. Di titik yang sama, sistem menerbitkan sertifikat: mengambil tipe IELTS Prediction, mengisi writing, speaking, skor_akhir dari band, nama dari profil siswa, tanggal hari itu, mengambil nomor berikutnya, dan menyimpan baris sertifikat dengan `attempt_id`.
4. Pemberitahuan selesai terkirim: email dan WhatsApp dengan tabel band plus kalimat "Sertifikat IELTS Prediction kamu sudah terbit dengan nomor X/IEL/TNEC/XI/2026" dan tautan halaman hasil.
5. Tim membuka profil siswa: sertifikat sudah ada di panel Sertifikat dengan penanda "Otomatis dari mockup". Tim memeriksa, lalu mengirimnya lewat Kirim email atau Kirim WhatsApp; PDF tersusun otomatis seperti biasa.

### 6.2 Peserta yang speaking-nya gagal atau dilewati

1. Attempt selesai dengan tiga skill. Sistem menerbitkan sertifikat dengan field speaking kosong dan skor_akhir dari band keseluruhan tiga skill.
2. Pemberitahuan terkirim seperti biasa. Sertifikat menunggu tim: isi ulang field speaking lewat Edit bila band Speaking menyusul, atau kirim apa adanya.
3. Bila tim menekan Nilai ulang yang gagal dan band Speaking masuk, sertifikat tidak ditulis ulang otomatis; tim memutuskan.

### 6.3 Sesi dengan speaking tidak aktif

Attempt selesai saat submit. Sertifikat terbit di titik yang sama, dengan writing dan skor_akhir; speaking kosong.

## 7. Perubahan data

Migrasi `0024_certificate_attempt.sql`:

1. `certificates.attempt_id TEXT REFERENCES attempts(id)`, nullable untuk sertifikat manual lama.
2. Indeks unik `certificates_attempt_key` pada `attempt_id` tempat kolom tidak null: satu sertifikat per attempt. Unik parsial, jadi sertifikat manual tetap boleh tanpa attempt.

Tidak ada kolom lain. Penanda "otomatis" tidak disimpan; `attempt_id` yang terisi sudah cukup untuk label itu di dashboard.

## 8. Perubahan server

| Lokasi | Perubahan |
|---|---|
| `packages/core/src/certificate-auto.js` (baru) | Fungsi murni `autoIssueMockupCertificate(env, attemptId, userName)`: membaca attempt, band, siswa, dan tipe; memutuskan boleh tidaknya terbit; mengambil nomor dan menyimpan dalam satu transaksi; mengembalikan `{ issued, number, skipped, reason }`. Dipakai web app |
| `apps/web/src/api.js` submit | Setelah status final tercapai dan sebelum `deliverMockupDone`, panggil penerbitan otomatis, simpan nomornya, lalu kirim pemberitahuan dengan nomor itu |
| `packages/core/src/speaking-mockup-worker.js` finalize | Titik kedua yang sama: setelah band final tersimpan dan attempt sudah submitted, panggil penerbitan, lalu pemberitahuan |
| `packages/core/src/delivery.js` deliverMockupDone | Menerima nomor sertifikat dari attempt (pencarian lewat `certificates.attempt_id`) dan menyebutkannya di kedua salinan pesan |
| `packages/core/src/email.js`, `whatsapp.js` | Pembangun pesan selesai mendapat field `certificateNumber`; kalimat sertifikat hanya muncul bila nomor ada |

Idempotensi di dua titik: panggilan penerbitan boleh terjadi dua kali (submit dan worker); indeks unik membuat yang kedua senyap.

## 9. Perubahan admin (dashboard)

1. Panel Sertifikat pada profil siswa dan daftar Sertifikat menampilkan penanda kecil "Otomatis" pada baris dengan `attempt_id`, dengan tautan ke submission asalnya.
2. Tidak ada dialog atau tombol baru; terbit, edit, batalkan, pulihkan, kirim, dan unggah manual semuanya tetap.

## 10. Penanganan error

| Kondisi | Perilaku |
|---|---|
| Tipe IELTS Prediction nonaktif atau hilang | Tidak terbit, tidak error, catat aktivitas "Sertifikat otomatis dilewati: tipe IELTS Prediction nonaktif" |
| Attempt belum submitted, speaking pending, atau writing gagal | Tidak terbit; titik berikutnya (worker atau regrade) mencoba lagi |
| Kegagalan transaksi penerbitan | Nomor kembali, error dicatat, pemberitahuan tetap terkirim tanpa menyebut sertifikat, dan penerbitan bisa dipicu ulang lewat Nilai ulang speaking |
| Attempt tanpa siswa (dibatalkan, dihapus) | Tidak terbit |

## 11. Testing

1. Submit mockup dengan speaking aktif: setelah worker selesai, satu sertifikat ada, field band sesuai attempt, nomor berurutan, `attempt_id` terisi.
2. Submit dua kali memicu worker dua kali: tetap satu sertifikat.
3. Speaking gagal: sertifikat terbit dengan speaking kosong, pemberitahuan terkirim.
4. Tipe nonaktif: tidak terbit, ada catatan aktivitas.
5. Email dan WhatsApp berisi kalimat sertifikat bila terbit, dan tidak berisi bila dilewati.
6. Regresi: penerbitan manual, nomor, pengiriman, dan pembatalan tidak berubah; sertifikat manual lama tetap tanpa attempt dan tampil tanpa penanda.

## 12. Rollout

1. Migrasi `0024`, lalu modul penerbitan otomatis dan dua titik pemicunya.
2. Pesan pemberitahuan diperbarui menyebut nomor sertifikat.
3. Penanda "Otomatis" di dashboard.
4. Uji penuh di dev dengan mockup nyata, terbitkan, lalu minta tim memeriksa satu sertifikat otomatis sebelum gelombang berbayar berikutnya.

## 13. Acceptance criteria

1. Attempt mockup yang selesai dinilai memiliki tepat satu sertifikat IELTS Prediction dengan band attempt pada fieldnya, diterbitkan tanpa tindakan tim.
2. Pemberitahuan selesai menyebut nomor sertifikat bila terbit, dan tidak menyebut bila dilewati.
3. Tidak ada nomor yang bolong akibat kegagalan penerbitan.
4. Sertifikat otomatis bisa diedit, dibatalkan, dipulihkan, dan dikirim lewat alur yang sama dengan manual.
5. Sertifikat manual lama dan alurnya tidak berubah.

## 14. Pertanyaan terbuka

1. Judul cetak saat ini "IELTS SIMULATION" sedangkan tipenya "IELTS Prediction"; soal lama di daftar batasan. Penerbitan otomatis memakai template apa adanya, tetapi sebaiknya diputuskan sebelum gelombang berbayar pertama memakai sertifikat ini.
2. Band keseluruhan untuk sertifikat tiga skill: tetap dipakai (perkiraan dari tiga skill) atau ditahan sampai speaking selesai? Proposal ini: tetap dipakai, dengan field speaking kosong, karena siswa sudah membayar dan hasil tiga skill tetap sah.
3. Pemberitahuan selesai menyebut nomor sertifikat tetapi tidak menautkan PDF-nya (PDF tersusun saat kirim pertama). Bila tim ingin tautan PDF ikut pemberitahuan, penyusunan PDF harus ikut otomatis; itu menambah satu keputusan biaya dan waktu pada momen pemberitahuan.
