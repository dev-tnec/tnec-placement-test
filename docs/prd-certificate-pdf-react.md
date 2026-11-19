# PRD: Sertifikat PDF dengan @react-pdf/renderer

Status: diterima, diimplementasikan 19 November 2026. Foto 3 x 4 dihapus dari sertifikat sesuai keputusan pemilik.

## 1. Ringkasan

Saat ini PDF sertifikat dirender di server lewat Cloudflare Browser Run ketika tim menekan Kirim email atau Kirim WhatsApp. Layanan itu menjalankan Chrome headless di infrastruktur Cloudflare, mengirim string HTML template, lalu mengembalikan PDF. Alur ini bekerja, tetapi punya tiga kelemahan: font di lingkungan Linux Cloudflare berbeda dari font tim (Segoe UI jatuh ke metrik Arial, jadi hasil render harus dicek setiap ganti template), setiap pengiriman pertama bergantung pada layanan pihak ketiga yang bisa gagal atau berubah, dan biayanya ditagih per render meskipun jumlahnya kecil.

PRD ini mengganti penyusun PDF dengan `@react-pdf/renderer`, pustaka MIT tanpa browser. Sertifikat digambar ulang sebagai komponen React yang berjalan di server Node admin, hasilnya PDF vektor dengan font yang disertakan langsung di aplikasi, dan `CLOUDFLARE_BROWSER_TOKEN` tidak lagi diperlukan untuk sertifikat. Halaman cetak di browser tetap ada dan tetap memakai template HTML yang sudah ada, jadi alur cetak manual tim tidak berubah sama sekali.

## 2. Masalah

1. Browser Run merender dengan font Linux miliknya. Segoe UI tidak terpasang di sana, jadi judul, nama siswa, dan skor bergeser dari apa yang tim lihat di layar. Setiap perubahan template wajib dicek dengan satu render nyata, dan tidak ada jaminan hasilnya sama besok.
2. Render terjadi di luar server kita. Ketika Cloudflare gagal, batas waktunya tercapai, atau format API-nya berubah, pengiriman sertifikat ikut gagal dengan pesan 502, dan tim harus mengunggah PDF buatan tangan.
3. Template HTML dipakai dua kali dengan dua jalur berbeda: browser tim untuk cetak, Browser Run untuk PDF. Perbaikan visual harus dicek di kedua tempat, dan aturan khusus render (filter SVG dibuang, stylesheet di-inline, gambar di-inline) hidup di kode sebagai kompensasi kelemahan Chrome headless.

## 3. Tujuan

1. Menyusun PDF sertifikat di dalam proses Node admin dengan `@react-pdf/renderer`, tanpa layanan eksternal, tanpa browser, tanpa network call saat render.
2. Font yang sama antara PDF dan rencana cetak: file font TTF disertakan di aplikasi dan didaftarkan sekali, sehingga PDF berhenti bergantung pada font mesin Cloudflare.
3. Menjaga semua perilaku pengiriman yang sudah ada: render otomatis saat kirim, PDF disimpan di baris sertifikat dan dipakai ulang, unggah manual tetap sebagai penimpa, token tautan tetap valid, lampiran email dan dokumen WhatsApp tidak berubah.
4. Menjaga halaman cetak HTML untuk cetak manual dan contoh, tanpa perubahan.
5. Menghapus `CLOUDFLARE_BROWSER_TOKEN` dari kebutuhan sertifikat setelah migrasi selesai.

## 4. Non-tujuan

1. Mengganti halaman cetak browser. Cetak manual tetap dari template HTML di jendela cetak browser.
2. Membuat editor desain sertifikat. Tim tetak menambah tipe baru lewat Pengaturan dengan template yang sudah ada; desain baru tetap pekerjaan pengembang.
3. Tanda tangan berupa gambar, kode QR, atau halaman verifikasi publik. Tetap di daftar tugas terbuka seperti sekarang.
4. Mengubah nomor sertifikat, counter, format, atau alur terbit dan batalkan. Semua logika itu tidak tersentuh.
5. Menyusun ulang hasil dan laporan siswa. Hanya sertifikat.

## 5. Keputusan yang diusulkan

| Topik | Keputusan | Alasan |
|---|---|---|
| Pustaka | `@react-pdf/renderer`, MIT, dipasang di `packages/core` | Satu-satunya pustaka React deklaratif tanpa browser yang mendukung teks, tabel, dan gambar vektor; dapat dipakai server Node admin |
| Cakupan render | Ketiga desain dipindah: Completion, TOEFL Prediction, IELTS Prediction | Ketiganya aktif dipakai; setengah migrasi berarti dua jalur render tetap hidup |
| Sumber desain | Komponen React baru per desain, diterjemahkan dari HTML dan CSS yang ada, bukan konversi otomatis | Pustaka tidak membaca HTML; terjemahan manual dari file yang ada memberi hasil paling setia |
| Logo | Gambar vektor digambar ulang dengan primitif `Svg`, `Path`, `Line`, `Polygon` dari pustaka | Logo saat ini CSS box-shadow trick dan SVG dengan filter, keduanya tidak masuk PDF mentah |
| Latar dan bingkai | Gambar latar (`completion-bg.svg`, `frame.svg`) dimuat dari file dan dipakai sebagai `Image` | File yang sudah ada dipakai ulang, bentuk vektor tetap vektor |
| Font | Dua keluarga: sans (pengganti Segoe UI stack) dan serif untuk nama, file TTF disertakan di `apps/admin/assets/fonts` | Font server Cloudflare tidak bisa disalin; TTF milik sendiri memberi hasil identik di semua render |
| Halaman cetak | Tetap HTML, tetap dipakai untuk cetak manual, contoh, dan DIBATALKAN | Migrasi cetak ke React PDF adalah pekerjaan besar lain dan tidak diminta |
| Kolom nomor | Tidak berubah: HTML cetak dan PDF React membaca `TEMPLATES` dan `certificateValues` yang sama | Satu sumber data, dua tampilan |
| Kapan PDF disusun | Tetap: saat kirim pertama, disimpan di baris, dipakai ulang, dihapus saat sertifikat diedit | Perilaku pengiriman tidak berubah |
| Lingkungan | `CLOUDFLARE_BROWSER_TOKEN` dihapus dari cek sertifikat; variabelnya boleh dihapus dari Render admin setelah rilis | Tidak ada lagi panggilan Cloudflare dari jalur sertifikat |

## 6. Alur pengguna

Alur tim dan siswa tidak berubah. Yang berubah hanya apa yang terjadi di dalam server ketika PDF dibutuhkan.

1. Tim membuka baris sertifikat dan menekan Kirim email atau Kirim WhatsApp. Permintaan masuk ke route admin yang sama.
2. Server memanggil `ensureCertificatePdf`. Kalau baris sudah punya PDF, PDF itu dipakai, tidak ada render baru, sama seperti sekarang.
3. Kalau belum, server menjalankan `renderCertificatePdf(templateKey, values)` yang memanggil komponen React PDF dan mengembalikan byte PDF dari memori. Tidak ada network call.
4. PDF disimpan di baris dengan nama, ukuran, token, waktu unggah, dan petugas yang mengirim, persis kolom yang dipakai sekarang.
5. Email dikirim dengan lampiran PDF lewat Cloudflare Email Sending API, WhatsApp dikirim sebagai dokumen lewat AttCos dengan tautan `/cert-file/<token>`. Kedua jalur ini tidak berubah.
6. Cetak manual tetap: tim membuka halaman cetak, jendela cetak browser muncul, A4, margin None, Background graphics nyala.

## 7. Struktur komponen

Rencana file dan letaknya, mengikuti pola monorepo yang sudah ada.

| File | Isi |
|---|---|
| `packages/core/src/certificate-pdf.jsx` | Komponen `CertificateDocument({ templateKey, values })` dan ketiga desain: `CompletionCertificate`, `ToeflCertificate`, `IeltsCertificate`. Modul murni, tanpa Node builtin, supaya bisa diimpor server admin |
| `packages/core/src/certificate-pdf.js` | Fungsi `renderCertificatePdf(templateKey, values)` yang membungkus `renderToBuffer`, registrasi font, dan pemetaan `TEMPLATES` ke komponen. Dipakai server admin |
| `apps/admin/assets/fonts/` | Dua file TTF: sans dan serif, plus file lisensinya |
| `packages/core/package.json` | Dependensi `@react-pdf/renderer` ditambahkan di sini, satu tempat untuk semua konsumen |

Aturan terjemahan desain, dari HTML dan CSS yang ada ke komponen:

1. Ukuran halaman A4 potret untuk Completion, A4 lanskap untuk TOEFL dan IELTS, tanpa margin, sama seperti `paper` di `TEMPLATES`.
2. Setiap blok teks HTML menjadi `Text` dengan gaya padanan: keluarga font, ukuran, tebal, warna, jarak huruf dari CSS yang ada.
3. Logo Titik Nol digambar dengan primitif SVG pustaka mengikuti bentuk `logo.css` yang ada, karena trik box-shadow CSS tidak punya padanan di PDF.
4. Tabel nilai di Completion menjadi `View` berisi baris, bukan elemen tabel HTML, dengan garis kolom digambar sebagai `Line`.
5. Bintang dan hiasan (`diamond`, `line` di TOEFL) menjadi `Svg` dengan `Polygon` dan `Line`, warna dari token yang sama.
6. Tanda DIBATALKAN tidak ada di PDF React karena sertifikat yang dibatalkan tidak bisa dikirim, sama seperti sekarang; halaman cetak tetap menampilkannya.
7. Setiap nilai yang berasal dari siswa masuk sebagai string ke `Text`, tanpa HTML, dan panjang maksimum per kolom tetap dibatasi dialog terbit.

## 8. Perubahan data

Tidak ada migrasi. Skema `certificates` sudah menyimpan PDF, nama, ukuran, token, waktu unggah, dan pengunggah, dan kolom-kolom itu dipakai apa adanya. PDF lama hasil Browser Run tetap valid dan tidak dirender ulang; hanya sertifikat tanpa PDF, atau yang diedit setelah rilis, yang disusun oleh jalur baru.

## 9. Perubahan API

Tidak ada route baru dan tidak ada bentuk respons yang berubah. Yang berubah di dalam `apps/admin/src/certificates.js`:

1. `generateCertificatePdf` berhenti memanggil Cloudflare dan memanggil `renderCertificatePdf` dari `packages/core`. Cek token Cloudflare, `BROWSER_PDF_API`, `BROWSER_PDF_TIMEOUT`, dan seluruh cabang error Cloudflare dihapus.
2. `certificatePdfHtml` dan `certificateValues` untuk HTML tetap dipakai halaman cetak, jadi fungsi pembantu template HTML tidak berubah.
3. `PDF_MAX_BYTES` tetap 5 MB sebagai batas akhir sebelum menyimpan.
4. Pesan error render menjadi kalimat dalam proses, misalnya kegagalan font atau komponen, bukan pesan layanan Cloudflare.

## 10. Penanganan error

| Kondisi | Perilaku |
|---|---|
| Template tidak dikenal | 409 dengan pesan yang sama seperti sekarang |
| Nilai wajib kosong atau gagal batas panjang | Render tetap jalan dengan string kosong di posisi itu, sama seperti perilaku `fillTemplate` sekarang; validasi nilai tetap di dialog terbit |
| Render melebihi 5 MB | 502 dengan pesan yang ada; tidak disimpan |
| Kegagalan internal pustaka | 500 dengan pesan singkat yang menyebut sertifikat dan minta tim mengunggah PDF manual, meniru jalur gagal Cloudflare sekarang |
| PDF sudah ada di baris | Dipakai ulang, tidak dirender ulang, termasuk PDF lama buatan Browser Run |

Unggah manual tetap menjadi jalan keluar untuk semua kegagalan, seperti sekarang.

## 11. Privasi dan keamanan

Tidak ada data baru dan tidak ada prosesor baru. Justru satu prosesor berkurang: isi sertifikat berhenti dikirim ke Cloudflare Browser Run. Email tetap lewat Cloudflare Email Sending API dan WhatsApp tetap lewat AttCos, keduanya sudah disebut di Kebijakan Privasi. PDF tetap disimpan di baris sertifikat di Neon, dihapus mengikuti data siswa yang sama seperti sekarang.

## 12. Biaya

Biaya render Browser Run hilang. Biaya email Cloudflare dan WhatsApp AttCos tidak berubah. Ukuran bundel admin bertambah karena `@react-pdf/renderer` dan file font ikut terpasang, perkiraan 2 sampai 4 MB tambahan pada pelayan admin; ini sekali jalan, bukan per permintaan.

## 13. Testing

1. `tests/smoke.mjs` menambah pemeriksaan: `renderCertificatePdf` untuk ketiga template menghasilkan berkas yang diawali `%PDF`, ukuran di bawah 5 MB, dan tidak menyebut Cloudflare.
2. Pemeriksaan padanan visual: untuk setiap template, satu render nyata disimpan sebagai lampiran pemeriksaan, dibandingkan satu per satu dengan halaman cetak HTML pada titik yang sama: judul, nama, skor, tanggal, tanda tangan, dan letak foto 3 x 4.
3. Uji kirim penuh di dev: kirim email dan WhatsApp dari halaman sertifikat, pastikan lampiran dan dokumen terbuka, ukurannya wajar, dan teksnya tidak bergeser.
4. Uji regresi sertifikat lama: baris yang sudah punya PDF Browser Run tidak merender ulang dan tetap terkirim.
5. Uji unggah manual: tim mengunggah PDF buatan tangan dan mengirimnya; jalur ini tidak tersentuh.

## 14. Rollout

1. Pasang dependensi, tulis komponen Completion dulu karena paling banyak elemen (tabel nilai, periode, foto), lalu dua template lanskap.
2. Ganti isi `generateCertificatePdf`, jalankan semua uji di dev.
3. Terbitkan ke admin produksi, kirim satu sertifikat uji dari produksi ke WhatsApp tim sendiri, periksa hasilnya di ponsel.
4. Setelah dua minggu tanpa masalah, hapus `CLOUDFLARE_BROWSER_TOKEN` dari lingkungan Render admin dan hapus barisnya dari `env.js`.

## 15. Acceptance criteria

1. Menekan Kirim email atau Kirim WhatsApp pada sertifikat tanpa PDF menghasilkan PDF dari proses Node admin, tanpa panggilan jaringan keluar saat render.
2. PDF memakai font yang disertakan di aplikasi; hasil render identik antara dev, produksi, dan ulangan kedua.
3. Sertifikat lama yang sudah punya PDF terkirim tanpa render ulang.
4. Edit sertifikat menghapus PDF dan render berikutnya memuat nilai baru.
5. Unggah manual, token tautan, penandaan terkirim, dan catatan aktivitas bekerja seperti sebelumnya.
6. Halaman cetak HTML, contoh tipe, dan tanda DIBATALKAN tidak berubah.
7. `CLOUDFLARE_BROWSER_TOKEN` tidak lagi disebut jalur sertifikat; variabel Render admin dihapus pada langkah terakhir.
8. `npm test` lulus dengan pemeriksaan PDF baru.

## 16. Pertanyaan terbuka

1. Font: rumah memakai Inter untuk UI, tetapi sertifikat memakai serif untuk nama siswa. Perlu diputuskan TTF mana yang disertakan: Inter saja untuk semua teks, atau Inter plus satu serif klasik untuk nama. Pilihan serif hari ini adalah turunan stack Times di CSS cetak.
2. Kolom nilai Completion menampilkan tabel empat komponen. Apakah versi PDF perlu garis tabel penuh atau cukup garis tipis antar baris seperti tampilan cetak sekarang, perlu satu keputusan visual saat pengerjaan.
3. Kotak foto 3 x 4 di Completion tetap kosong di cetak. PDF React menggambarnya sebagai bingkai dengan label 3 x 4, sama seperti cetak; konfirmasi bila suatu saat foto asli ingin ikut.
