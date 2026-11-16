// Legal copy and public config. Bump CONSENT_VERSION whenever the text changes,
// so every stored consent record points to the exact version the user saw.

export const CONSENT_VERSION = "2026-11-16c";
export const WHATSAPP = "6282333143544";
// Fills the {{total}}, {{duration}}, and {{strikes}} tokens with the live test settings,
// so the legal text always matches what the dashboard has configured.
export function fillLegal(doc, values) {
  const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ""));
  return { ...doc, sections: doc.sections.map((sec) => ({ ...sec, paragraphs: sec.paragraphs.map(fill) })) };
}

export const CAMPUS_ADDRESS =
  "Jl. Brawijaya No.75, Mangunrejo, Tulungrejo, Kec. Pare, Kab. Kediri, Jawa Timur";

export const TERMS = {
  title: "Syarat dan Ketentuan",
  updated: "16 November 2026",
  sections: [
    {
      heading: "1. Tentang tes ini",
      paragraphs: [
        "Tes ini dibuat oleh Titik Nol English Course untuk mengukur kemampuan bahasa Inggris kamu. Tes ini terdiri dari {{total}} soal pilihan ganda dengan satu jawaban benar per soal, dan durasinya {{duration}}.",
        "Hasil tes ini dipakai untuk menentukan kelas atau memantau perkembangan belajar, dan bukan sertifikat resmi. Jangan memakai hasil ini sebagai bukti kemampuan bahasa Inggris untuk keperluan formal.",
      ],
    },
    {
      heading: "2. Aturan pengerjaan",
      paragraphs: [
        "Tes berjalan dalam mode layar penuh. Kalau kamu keluar dari mode itu, berpindah tab, membuka aplikasi lain, atau memindahkan fokus dari jendela tes, aktivitas tersebut dicatat sebagai pelanggaran. Pada pelanggaran ke-{{strikes}}, tes berhenti dan jawaban kamu tidak dikirim.",
        "Kerjakan tes ini sendiri tanpa bantuan kamus, aplikasi penerjemah, kecerdasan buatan, atau orang lain.",
        "Waktu terus berjalan ketika jendela tes kehilangan fokus, dan waktu tidak bisa dijeda.",
      ],
    },
    {
      heading: "3. Pengiriman jawaban",
      paragraphs: [
        "Skor dihitung di server setelah jawaban dikirim, dan jawaban yang sudah dikirim tidak bisa diubah.",
        "Kalau waktu habis, percobaan itu gagal dan jawaban kamu tidak dikirim. Kamu bisa mengulang tes dari awal, dan percobaan baru akan memakai soal yang sama dengan waktu yang baru.",
        "Kalau tes memakai batas waktu per soal, soal berikutnya muncul otomatis saat waktu satu soal habis, soal sebelumnya tidak bisa dibuka lagi, dan jawaban terkirim setelah soal terakhir.",
      ],
    },
    {
      heading: "4. Integritas hasil",
      paragraphs: [
        "Titik Nol berhak menolak, membatalkan, atau meninjau ulang hasil tes yang terindikasi curang, termasuk hasil dengan catatan pelanggaran berulang.",
        "Dengan memulai tes, kamu menyatakan bahwa data yang kamu isi adalah benar dan tes dikerjakan sendiri.",
      ],
    },
    {
      heading: "5. Perubahan dan kontak",
      paragraphs: [
        "Titik Nol bisa memperbarui syarat ini. Versi yang berlaku adalah versi yang tampil di halaman ini saat kamu memulai tes.",
        "Pertanyaan tentang syarat ini bisa disampaikan melalui WhatsApp +62 823-3314-3544 atau langsung ke kampus kami.",
      ],
    },
  ],
};

export const PRIVACY = {
  title: "Kebijakan Privasi",
  updated: "16 November 2026",
  sections: [
    {
      heading: "1. Pengendali data",
      paragraphs: [
        "Titik Nol English Course, " +
          CAMPUS_ADDRESS +
          ", adalah pengendali data pribadi yang dikumpulkan melalui tes penempatan ini.",
      ],
    },
    {
      heading: "2. Data yang kami kumpulkan",
      paragraphs: [
        "Data identitas: nama lengkap, alamat email, dan nomor WhatsApp yang kamu isi setelah tes. Kalau kamu sudah terdaftar sebagai siswa, data ini juga bisa berasal dari pendaftaran di kantor kami, dan hasil pre-test atau post-test tercatat di data siswa kamu.",
        "Data pendaftaran dan komunikasi: program, periode, kelas, catatan tim, serta pesan WhatsApp yang kami kirim ke kamu.",
        "Data hasil tes: jawaban, skor, level, waktu mulai dan selesai, serta durasi pengerjaan.",
        "Data teknis: jenis dan versi perangkat atau browser, negara asal koneksi, dan catatan pelanggaran mode layar penuh atau perpindahan tab. Kami tidak menyimpan alamat IP lengkap.",
        "Data persetujuan: versi syarat dan kebijakan yang kamu setujui beserta waktu persetujuannya.",
      ],
    },
    {
      heading: "3. Tujuan dan dasar pemrosesan",
      paragraphs: [
        "Kami memakai data kamu untuk menghitung skor, menentukan level, mengirim hasil tes ke email dan WhatsApp kamu, menghubungi kamu lewat WhatsApp untuk konsultasi, jadwal kelas, atau tautan tes, mengelola pendaftaran kelas, dan menjaga integritas tes.",
        "Dasar pemrosesan adalah persetujuan yang kamu berikan saat mencentang kotak persetujuan di halaman ini, dan kamu bisa menarik persetujuan itu kapan saja.",
        "Kami tidak memakai data kamu untuk iklan pihak ketiga dan tidak menjual data kamu.",
      ],
    },
    {
      heading: "4. Penyimpanan dan retensi",
      paragraphs: [
        "Data disimpan di basis data PostgreSQL yang dikelola Neon pada server Amazon Web Services di Singapura. Artinya data diproses di luar Indonesia, dengan pengamanan kontraktual dan teknis yang wajar dari penyedia tersebut.",
        "Data hasil tes disimpan paling lama 24 bulan sejak tanggal tes, lalu dihapus. Kalau kamu meminta penghapusan lebih awal, kami menghapusnya dalam 30 hari, kecuali ada kewajiban hukum yang mengharuskan penyimpanan lebih lama.",
      ],
    },
    {
      heading: "5. Pembagian data",
      paragraphs: [
        "Data hanya diakses oleh tim Titik Nol yang membutuhkan, yaitu tim akademik dan admin penerimaan siswa.",
        "Neon bertindak sebagai prosesor untuk basis data, dan Cloudflare untuk pengiriman email hasil tes. Kami tidak membagikan data kamu kepada pihak lain untuk tujuan pemasaran.",
        "Pesan WhatsApp dari kami, termasuk hasil tes, dikirim melalui AttCos, layanan pesan yang kami pakai sebagai prosesor, dari nomor WhatsApp Titik Nol, lalu sampai ke kamu lewat layanan WhatsApp milik Meta. Keduanya hanya menerima nomor WhatsApp dan isi pesan yang diperlukan untuk mengirimkannya.",
      ],
    },
    {
      heading: "6. Hak kamu",
      paragraphs: [
        "Kamu berhak meminta akses ke data kamu, meminta koreksi data yang tidak akurat, meminta penghapusan data, menarik persetujuan, dan meminta salinan data kamu dalam format yang bisa dibaca.",
        "Ajukan permintaan melalui WhatsApp +62 823-3314-3544 dengan menyebutkan nama dan email yang kamu pakai saat tes. Kami menanggapi dalam 30 hari.",
      ],
    },
    {
      heading: "7. Cookie dan penyimpanan lokal",
      paragraphs: [
        "Situs ini tidak memakai cookie iklan, cookie analitik, atau pelacak pihak ketiga.",
        "Browser hanya menyimpan status sesi tes yang diperlukan agar halaman berjalan. Data ini tidak dibagikan ke pihak lain.",
      ],
    },
    {
      heading: "8. Anak di bawah umur",
      paragraphs: [
        "Kalau kamu berusia di bawah 16 tahun, isi tes ini bersama orang tua atau wali, dan pastikan mereka menyetujui pengumpulan data kamu.",
      ],
    },
    {
      heading: "9. Perubahan kebijakan",
      paragraphs: [
        "Kami bisa memperbarui kebijakan ini. Versi dan tanggal berlaku selalu ditampilkan di halaman ini. Perubahan berlaku sejak versi baru ditampilkan.",
      ],
    },
    {
      heading: "10. Kontak",
      paragraphs: [
        "Pertanyaan tentang privasi dan permintaan terkait data pribadi bisa disampaikan melalui WhatsApp +62 823-3314-3544 atau datang ke " +
          CAMPUS_ADDRESS +
          ".",
      ],
    },
  ],
};
