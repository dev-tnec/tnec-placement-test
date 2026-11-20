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
3. Menyertakan PDF sertifikat pada pemberitahuan selesai: dokumen PDF di WhatsApp, lampiran di email.
4. Menjaga kontrol tim: sertifikat otomatis muncul di daftar yang sama, bisa disunting, dibatalkan, dipulihkan, dan dikirim ulang persis seperti sertifikat manual.

## 4. Non-tujuan

1. Sertifikat otomatis untuk placement, pre-test, dan post-test. Ketiganya tetap manual.
2. Mengubah format nomor, counter, template, atau alur terbit dan kirim. Mesin nomor, penyusun PDF react-pdf, dan jalur kirim dipakai apa adanya.
3. Mengirim sertifikat otomatis ke siswa lewat pemberitahuan selesai (PDF pada WhatsApp dan email) tanpa tindakan tim. Pengiriman ulang manual tetap tersedia bila tim perlu mengirim lagi setelah menyunting.
4. Perubahan pada TOEFL Prediction dan Certificate of Completion.

## 5. Keputusan yang diusulkan

| Topik | Keputusan | Alasan |
|---|---|---|
| Kapan terbit | Saat attempt mockup mencapai keadaan final: submitted, tidak ada jawaban speaking yang pending atau gagal, dan writing graded. Untuk attempt tanpa speaking aktif, terbit saat submit selesai | Satu momen final per attempt, tidak perlu polling |
| Pemicu | Titik yang sama dengan pemberitahuan selesai: akhir submit dan akhir penilaian speaking di worker. Penerbitan berjalan sebelum pemberitahuan supaya pesan bisa menyebut nomor sertifikatnya | Satu tempat logika, dua efek berurutan |
| Jenis sertifikat | Tipe IELTS Prediction (`ctp_ielts`) bila aktif. Bila tipenya nonaktif atau tidak ada, penerbitan dilewati tanpa error dan dicatat di log aktivitas | Tim yang mengendalikan tipe, bukan kode |
| Field | writing, speaking, dan skor_akhir diambil dari band attempt; skor_akhir memakai band keseluruhan. Speaking wajib selesai: bila penilaiannya gagal teknis, sertifikat menunggu hingga tim menekan Nilai ulang dan band Speaking masuk | Kertas tidak pernah menampilkan angka yang tidak ada, dan tidak ada sertifikat band parsial |
| Nama penerima | `students.name`, bukan nama kontak attempt | Nama resmi siswa, konsisten dengan sertifikat manual |
| Tanggal terbit | Tanggal penilaian selesai (hari penerbitan), bukan tanggal mengerjakan | Nomor dan tanggal terbit berpasangan pada periode yang sama |
| Terbit ganda | Kolom baru `certificates.attempt_id`, unik. Percobaan terbit kedua untuk attempt yang sama diabaikan dengan senyap dan dicatat di log | Idempoten, aman diulang worker |
| Sertifikat lama | Sertifikat manual yang sudah ada tidak diubah dan tidak diikat ke attempt | Tidak menyentuh data terbit |
| Sinkron dengan nomor | Penerbitan memakai transaksi counter yang sama dengan penerbitan manual; kegagalan menyimpan mengembalikan nomor | Nomor tidak pernah bolong |
| Template | Sementara ini memakai template IELTS Prediction dengan copy disesuaikan untuk mockup (judul dan teks membaca mockup). Template khusus menyusul tanpa mengubah alur | Sesuai keputusan pemilik; satu tipe dan satu template tetap satu alur |
| Pemberitahuan | Email dan WhatsApp selesai menyertakan sertifikat: WhatsApp menerima PDF sebagai dokumen, email menerima PDF sebagai lampiran. PDF disusun otomatis pada momen penerbitan | Janji sesuai kenyataan, dan siswa menerima kertasnya tanpa menunggu kirim manual |
| Hasil attempt tiga skill | Sertifikat tetap terbit dengan speaking kosong; pemberitahuan tetap terkirim. Setelah Nilai ulang speaking berhasil dan band Speaking masuk, field sertifikat tidak diubah otomatis; tim memperbaruinya lewat Edit bila perlu | Menulis ulang kertas yang sudah terbit itu berbahaya; keputusan tetap di tangan tim |

## 6. Alur pengguna

### 6.1 Peserta mockup dengan speaking dinilai

1. Peserta menyelesaikan empat bagian dan mengirim jawaban. Writing dinilai AI saat submit, speaking masih pending.
2. Worker Speechace menyelesaikan jawaban terakhir, menghitung band Speaking, menyimpan band empat skill dan keseluruhan pada attempt.
3. Di titik yang sama, sistem menerbitkan sertifikat: mengambil tipe IELTS Prediction, mengisi writing, speaking, skor_akhir dari band, nama dari profil siswa, tanggal hari itu, mengambil nomor berikutnya, dan menyimpan baris sertifikat dengan `attempt_id`.
4. Pemberitahuan selesai terkirim: email dan WhatsApp dengan tabel band plus kalimat "Sertifikat IELTS Prediction kamu sudah terbit dengan nomor X/IEL/TNEC/XI/2026" dan tautan halaman hasil.
5. Tim membuka profil siswa: sertifikat sudah ada di panel Sertifikat dengan penanda "Otomatis dari mockup". Tim memeriksa, lalu mengirimnya lewat Kirim email atau Kirim WhatsApp; PDF tersusun otomatis seperti biasa.

### 6.2 Peserta yang penilaian speaking-nya gagal teknis

1. Attempt selesai dengan band tiga skill, speaking masih gagal. Sertifikat tidak terbit dan pemberitahuan belum terkirim.
2. Tim menekan Nilai ulang yang gagal di halaman submission. Bila berhasil, band Speaking masuk, band keseluruhan dihitung ulang, lalu sertifikat terbit dan pemberitahuan terkirim membawa PDF-nya.
3. Waktu habis dengan sebagian jawaban tuntas bukan halangan: setiap jawaban yang selesai tetap dinilai, band dibentuk dari jawaban yang ada, dan alur penerbitan berjalan seperti biasa.

### 6.3 Sesi dengan speaking tidak aktif

Pengaturan speaking nonaktif pada mockup berarti seluruh peserta tidak menghadapi bagian interview. Attempt selesai saat submit, band memuat writing dan skor_akhir dari band keseluruhan, sertifikat terbit dengan field speaking kosong, dan pemberitahuan terkirim. Ini konfigurasi khusus yang dipilih tim, bukan siswa yang melewatkan.

## 7. Perubahan data

Migrasi `0024_certificate_attempt.sql`:

1. `certificates.attempt_id TEXT REFERENCES attempts(id)`, nullable untuk sertifikat manual lama.
2. Indeks unik `certificates_attempt_key` pada `attempt_id` tempat kolom tidak null: satu sertifikat per attempt. Unik parsial, jadi sertifikat manual tetap boleh tanpa attempt.

Tidak ada kolom lain. Penanda "otomatis" tidak disimpan; `attempt_id` yang terisi sudah cukup untuk label itu di dashboard.

## 8. Perubahan server

| Lokasi | Perubahan |
|---|---|
| `packages/core/src/certificate-auto.js` (baru) | Fungsi murni `autoIssueMockupCertificate(env, attemptId, userName)`: membaca attempt, band, siswa, dan tipe; memutuskan boleh tidaknya terbit; mengambil nomor dan menyimpan dalam satu transaksi; menyusun PDF dengan react-pdf dan menyimpannya pada baris; mengembalikan `{ issued, number, skipped, reason }`. Dipakai web app |
| `apps/web/src/api.js` submit | Setelah status final tercapai dan sebelum `deliverMockupDone`, panggil penerbitan otomatis, lalu kirim pemberitahuan |
| `packages/core/src/speaking-mockup-worker.js` finalize | Titik kedua yang sama: setelah band final tersimpan dan attempt sudah submitted, panggil penerbitan, lalu pemberitahuan |
| `packages/core/src/delivery.js` deliverMockupDone | Mencari sertifikat lewat `certificates.attempt_id`; bila ada dan ada PDF, WhatsApp mengirim dokumen PDF lewat AttCos dan email melampirkan PDF; bila PDF gagal disusun, pesan tetap terkirim dengan nomor sertifikat tanpa lampiran |
| `packages/core/src/email.js`, `whatsapp.js` | Pembangun pesan selesai mendapat field `certificateNumber`; kalimat sertifikat hanya muncul bila nomor ada. Kirim WhatsApp memakai jalur dokumen yang sudah ada, jalur yang sama dengan pengiriman manual sertifikat |

Idempotensi di dua titik: panggilan penerbitan boleh terjadi dua kali (submit dan worker); indeks unik membuat yang kedua senyap.

## 9. Perubahan admin (dashboard)

1. Panel Sertifikat pada profil siswa dan daftar Sertifikat menampilkan penanda kecil "Otomatis" pada baris dengan `attempt_id`, dengan tautan ke submission asalnya.
2. Tidak ada dialog atau tombol baru; terbit, edit, batalkan, pulihkan, kirim, dan unggah manual semuanya tetap.

## 10. Penanganan error

| Kondisi | Perilaku |
|---|---|
| Tipe IELTS Prediction nonaktif atau hilang | Tidak terbit, tidak error, catat aktivitas "Sertifikat otomatis dilewati: tipe IELTS Prediction nonaktif"; pemberitahuan terkirim tanpa sertifikat |
| Attempt belum submitted, speaking pending, writing gagal, atau speaking gagal teknis | Tidak terbit dan pemberitahuan menunggu; titik berikutnya (worker atau regrade) mencoba lagi |
| Kegagalan transaksi penerbitan | Nomor kembali, error dicatat, pemberitahuan menunggu, dan penerbitan bisa dipicu ulang lewat Nilai ulang speaking |
| Kegagalan menyusun PDF | Sertifikat tetap terbit dan pemberitahuan tetap terkirim dengan nomor sertifikat tanpa lampiran, dan aktivitas mencatat kegagalan; PDF tetap bisa dikirim manual dari halaman sertifikat |
| Attempt tanpa siswa (dibatalkan, dihapus) | Tidak terbit |

## 11. Testing

1. Submit mockup dengan speaking aktif: setelah worker selesai, satu sertifikat ada, field band sesuai attempt, nomor berurutan, `attempt_id` terisi, dan PDF tersimpan pada baris.
2. Submit dua kali memicu worker dua kali: tetap satu sertifikat.
3. Speaking gagal teknis: sertifikat tidak terbit dan pemberitahuan tidak terkirim sampai Nilai ulang berhasil; setelah berhasil, sertifikat terbit dengan band lengkap dan pemberitahuan membawa PDF.
4. Tipe nonaktif: tidak terbit, ada catatan aktivitas, pemberitahuan terkirim tanpa sertifikat.
5. Email menerima PDF sebagai lampiran dan WhatsApp menerima PDF sebagai dokumen pada pemberitahuan selesai.
6. Regresi: penerbitan manual, nomor, pengiriman, dan pembatalan tidak berubah; sertifikat manual lama tetap tanpa attempt dan tampil tanpa penanda.

## 12. Rollout

1. Migrasi `0024`, lalu modul penerbitan otomatis dan dua titik pemicunya.
2. Pesan pemberitahuan diperbarui menyebut nomor sertifikat.
3. Penanda "Otomatis" di dashboard.
4. Uji penuh di dev dengan mockup nyata, terbitkan, lalu minta tim memeriksa satu sertifikat otomatis sebelum gelombang berbayar berikutnya.

## 13. Acceptance criteria

1. Attempt mockup yang selesai dinilai memiliki tepat satu sertifikat IELTS Prediction dengan band attempt pada fieldnya, diterbitkan tanpa tindakan tim, beserta PDF yang tersusun.
2. Pemberitahuan selesai mengirim PDF: lampiran pada email, dokumen pada WhatsApp.
3. Tidak ada nomor yang bolong akibat kegagalan penerbitan.
4. Sertifikat otomatis bisa diedit, dibatalkan, dipulihkan, dan dikirim lewat alur yang sama dengan manual.
5. Sertifikat manual lama dan alurnya tidak berubah.
6. Peserta tidak bisa melewatkan bagian speaking pada mockup.

## 14. Keputusan atas pertanyaan terbuka

Ditanyakan ke pemilik pada 20 November 2026 dan sudah diputuskan:

1. Template sertifikat akan berbeda, tetapi untuk sekarang menyalin template IELTS Prediction dan menyesuaikan copy-nya untuk Mockup: judul dan teks kertas membaca mockup, bukan prediction. Nomor tetap memakai kode tipe IELTS Prediction (`IELTS`) sampai template khusus selesai diganti.
2. Speaking tidak bisa dilewati. Peserta wajib menyelesaikan semua bagian speaking; cerita berbeda bila waktu habis dan sebagian jawaban tidak tuntas, karena sistem tetap menilai jawaban yang sudah selesai. Konsekuensinya tombol "Lanjut tanpa rekaman" tidak berlaku untuk mockup, dan sertifikat selalu berangkat dari band lengkap: bila penilaian speaking gagal teknis, sertifikat menunggu tim me-Nilai ulang, bukan terbit dengan band kosong.
3. Pemberitahuan selesai menyertakan PDF sertifikat: WhatsApp menerima dokumen PDF dan email menerima lampirannya. Sertifikat disusun otomatis pada momen penerbitan. Bila penilaian speaking masih berjalan saat pemberitahuan pertama tidak terjadi (pemberitahuan hanya terkirim saat semua final), PDF sudah tersedia pada saat itu. Untuk kasus yang menyusul (misal Nilai ulang terlambat), pemberitahuan tetap terkirim dengan PDF yang ada.

Pemilik akan mengajukan pertanyaan lanjutan; PRD ini bisa ditambah sesudahnya.
