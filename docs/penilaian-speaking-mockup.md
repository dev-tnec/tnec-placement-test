# Penilaian Speaking IELTS Mockup

Referensi teknis. Diperbarui 20 November 2026.

## Ringkasan

Bagian speaking mockup IELTS terdiri dari 18 rekaman: 11 jawaban di Part 1, satu tugas panjang di Part 2, dan 6 jawaban di Part 3. Setiap rekaman dinilai sendiri oleh Speechace, lalu ke-18 hasil itu digabung menjadi satu band speaking dengan cara rata-rata per kriteria. Dokumen ini menjelaskan alur penilaian, rumus penggabungan, perilaku saat gagal, dan contoh perhitungan nyata.

## Alur penilaian

1. Siswa merekam jawaban satu per satu. Setiap rekaman menjadi satu baris di tabel `speaking_answers` dengan status `pending`.
2. Worker (`packages/core/src/speaking-mockup-worker.js`) mengambil baris satu per satu dengan lease 120 detik, lalu mengirim rekaman ke Speechace bersama teks pertanyaannya sebagai konteks dan hash attempt id sebagai identitas siswa (Speechace tidak pernah menerima nama atau kontak).
3. Speechace membalas dengan lima aspek: pronunciation, fluency, grammar, vocabulary, dan coherence, masing-masing pada skala CEFR, IELTS, dan 0 sampai 100, plus transkrip.
4. Hasil per jawaban disimpan pada barisnya. Kegagalan panggilan diulang otomatis: percobaan kedua setelah 60 detik, ketiga setelah 300 detik. Setelah tiga kali, baris menunggu tim di halaman submission dengan tombol Nilai ulang yang gagal.

## Dari lima aspek ke empat kriteria IELTS

Lima aspek Speechace dipadatkan menjadi empat kriteria resmi IELTS untuk setiap jawaban (`speakingCriteria` di `packages/core/src/speaking-mockup.js`):

| Kriteria IELTS | Sumber |
|---|---|
| Pronunciation | Aspek pronunciation apa adanya |
| Fluency and Coherence | Rata-rata dari aspek fluency dan coherence |
| Lexical Resource | Aspek vocabulary |
| Grammatical Range and Accuracy | Aspek grammar |

## Penggabungan 18 jawaban menjadi satu band

Begitu semua jawaban mencapai keadaan final (tidak ada yang pending atau grading), `finalizeAttempt` berjalan:

1. Setiap kriteria dirata-ratakan antar jawaban: rata-rata pronunciation dari semua jawaban, rata-rata fluency and coherence dari semua jawaban, dan seterusnya. Rata-rata dibulatkan ke satu desimal.
2. Band speaking adalah rata-rata dari empat nilai rata-rata itu, dibulatkan ke kelipatan setengah terdekat (`speakingBandFromCriteria`).
3. Band itu ditulis ke attempt sebagai skill Speaking, dan band keseluruhan dihitung ulang: rata-rata dari band Listening, Reading, Writing, dan Speaking, dibulatkan ke kelipatan setengah terdekat (`overallBand` di `packages/core/src/bands.js`).

### Contoh perhitungan nyata

Data dari satu attempt pada basis data dev (18 jawaban, empat kriteria per jawaban):

| # | Pron | Flu & Coh | Lexical | Grammar |
|---|---|---|---|---|
| 1 | 8.5 | 6.25 | 4.0 | 4.0 |
| 2 | 7.5 | 5.75 | 4.0 | 4.0 |
| 3 | 8.5 | 6.25 | 4.0 | 4.0 |
| 4 | 9.0 | 6.75 | 6.5 | 4.5 |
| 5 | 8.0 | 6.25 | 4.0 | 4.0 |
| 6 | 9.0 | 7.50 | 5.5 | 5.0 |
| 7 | 9.0 | 6.25 | 4.0 | 4.0 |
| 8 | 9.0 | 6.25 | 4.0 | 4.0 |
| 9 | 9.0 | 6.25 | 4.0 | 4.5 |
| 10 | 9.0 | 6.00 | 4.0 | 4.5 |
| 11 | 9.0 | 6.00 | 4.0 | 5.0 |
| 12 | 9.0 | 6.50 | 6.5 | 5.5 |
| 13 | 9.0 | 6.25 | 4.0 | 4.5 |
| 14 | 9.0 | 6.25 | 4.0 | 4.5 |
| 15 | 8.5 | 6.00 | 4.0 | 4.5 |
| 16 | 8.5 | 6.00 | 4.0 | 4.5 |
| 17 | 9.0 | 7.50 | 4.0 | 5.0 |
| 18 | 9.0 | 6.25 | 4.0 | 4.5 |

Rata-rata per kriteria:

| Kriteria | Rata-rata 18 jawaban |
|---|---|
| Pronunciation | 8.75 |
| Fluency and Coherence | 6.35 |
| Lexical Resource | 4.36 |
| Grammatical Range and Accuracy | 4.47 |

Band speaking: (8.75 + 6.35 + 4.36 + 4.47) / 4 = 5.98, dibulatkan ke setengah terdekat = **6.0**.

## Aturan penting

1. Rata-rata dihitung per kriteria, bukan per band jawaban. Siswa dengan pelafalan kuat dan kosakata lemah tetap terlihat perbedaannya di angka akhir, tidak diratakan dulu.
2. Semua jawaban berbobot sama. Jawaban panjang Part 2 (2 menit) berbobot sama dengan jawaban pendek Part 1. Wawancara IELTS sungguhan menonjolkan Part 2; bila suatu saat bobotnya ingin dibedakan, itu perubahan di `finalizeAttempt`.
3. Waktu habis dengan sebagian jawaban tuntas bukan halangan: setiap jawaban yang terekam tetap dinilai dan band dihitung dari jawaban yang ada.
4. Satu jawaban gagal dinilai menahan seluruh band speaking: `finalizeAttempt` menandai speaking gagal dan tidak menghitung band parsial. Setelah tim menekan Nilai ulang yang gagal dan berhasil, seluruh jawaban yang sudah dinilai ikut dihitung.
5. Nilai per jawaban, transkrip, dan status penilaian tersimpan di tabel `speaking_answers`; rekaman audionya dihapus 30 hari setelah tes, sedangkan skor dan transkrip tetap.

## Perbedaan dengan placement test

Placement test menilai satu rekaman menjadi satu nilai speaking yang berdiri sendiri, tidak digabung ke level. Mockup menilai 18 rekaman menjadi satu band speaking yang menjadi salah satu dari empat skill pada band keseluruhan.
