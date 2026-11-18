// Turns the public result payload of any of the four tests into the report the page renders.
// Placement answers /api/results/:token, the invited tests answer /api/attempts/:id/result.
// No React here, so tests/smoke.mjs can check the mapping without a browser.

const BAND_TARGET = 6.5;
const WA_FALLBACK = "6282333143544";

const BAND_LABELS = [
  [8.5, "Expert User"],
  [8, "Very Good User"],
  [7, "Good User"],
  [6, "Competent User"],
  [5, "Modest User"],
  [4, "Limited User"],
  [3, "Extremely Limited User"],
  [2, "Intermittent User"],
  [0, "Non User"],
];

const BAND_PROFILE = {
  8: "Kamu memakai bahasa Inggris dengan sangat lancar dan akurat, termasuk pada topik yang rumit.",
  7: "Kamu menguasai bahasa Inggris dengan baik, dengan sesekali kesalahan yang tidak mengganggu makna.",
  6: "Kamu cukup kompeten, meski masih ada kesalahan yang membuat sebagian kalimat perlu dibaca ulang.",
  5: "Kamu bisa menangani situasi umum, tetapi masih kesulitan pada teks akademik yang panjang dan kompleks.",
  4: "Kamu punya kompetensi dasar untuk situasi umum, tetapi sering kesulitan memahami informasi detail akademik.",
  3: "Kamu memahami bahasa Inggris pada situasi yang sangat familiar, dengan banyak jeda saat memakainya.",
  2: "Komunikasi kamu masih terbatas pada kata dan frasa yang sudah dikenal.",
  1: "Kamu belum bisa memakai bahasa Inggris secara mandiri, jadi fondasi dasar perlu dibangun dulu.",
};

const SKILL_ADVICE = {
  Listening: "Latih bagian 1 dan 2, terutama ejaan nama, angka, alamat, dan nominal uang.",
  Reading: "Percepat skimming dan scanning, lalu latih tipe soal True/False/Not Given.",
  Writing: "Perkaya struktur kalimat dan kata penghubung, lalu menulis dengan batas waktu.",
  Speaking: "Perpanjang jawaban dengan alasan dan contoh, dan latih kelancaran tanpa membaca.",
};

const TONE_BADGE = { strong: "Kompeten", mid: "Sedang", low: "Prioritas", muted: "Belum dinilai" };

const fmt = (value, digits = 1) => {
  const number = Number(value);
  return value === null || value === undefined || !Number.isFinite(number) ? "-" : number.toFixed(digits);
};

export const dateText = (seconds) => {
  if (!seconds) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(seconds * 1000));
};

const waLink = (number, text) => `https://wa.me/${number || WA_FALLBACK}?text=${encodeURIComponent(text)}`;

function toneForBand(band) {
  const number = Number(band);
  if (!Number.isFinite(number)) return "muted";
  if (number >= 6) return "strong";
  if (number >= 4) return "mid";
  return "low";
}

export function bandLabel(band) {
  const number = Number(band);
  if (!Number.isFinite(number)) return "-";
  return (BAND_LABELS.find(([min]) => number >= min) || BAND_LABELS[BAND_LABELS.length - 1])[1];
}

function bandProfile(band) {
  const number = Number(band);
  const key = [8, 7, 6, 5, 4, 3, 2, 1].find((min) => number >= min) || 1;
  return BAND_PROFILE[key];
}

function bandNote(band) {
  const number = Number(band);
  if (number >= 6) return "Sudah kompeten. Pertahankan dengan latihan berwaktu.";
  if (number >= 4) return "Dasar sudah ada. Ketelitian dan kecepatan yang perlu dinaikkan.";
  return "Perlu penguatan dasar. Mulai dari akurasi sebelum menambah kecepatan.";
}

const skillCard = ({ name, value, unit, raw, badge, tone, note, percent, percentLabel }) => ({
  name, value, unit, raw, badge, tone, note, percent, percentLabel,
});

/** The IELTS mockup: four skill bands and the writing criteria. */
function bandReport(result) {
  const skills = (result.skills || []).map((skill) => {
    const band = Number(skill.band);
    const writing = skill.skill === "Writing";
    const speaking = skill.skill === "Speaking";
    return skillCard({
      name: skill.skill,
      value: fmt(skill.band),
      unit: "/ 9.0",
      raw: writing ? "dinilai AI" : speaking ? `${skill.answers || 0} jawaban dinilai` : skill.total ? `${skill.raw} / ${skill.total} benar` : `${skill.raw} benar`,
      badge: TONE_BADGE[toneForBand(band)],
      tone: toneForBand(band),
      note: writing ? "Empat kriteria IELTS dinilai otomatis dari dua task." : speaking ? "Empat kriteria IELTS dinilai otomatis dari rekaman." : bandNote(band),
      percent: Math.max(0, Math.min(100, (band / 9) * 100)),
      percentLabel: `${Math.round((band / 9) * 100)}% target`,
    });
  });

  const scored = skills.filter((skill) => skill.unit).length;
  if (!skills.some((skill) => skill.name === "Speaking")) {
    const skipped = result.speakingStatus === "skipped";
    skills.push(skillCard({
      name: "Speaking",
      value: "N/A",
      unit: "",
      raw: skipped ? "tidak termasuk" : "belum dinilai",
      badge: skipped ? "Dilewati" : "Belum dinilai",
      tone: "muted",
      note: skipped
        ? "Kamu melewati bagian speaking, jadi band Speaking belum masuk ke hasil ini."
        : "Penilaian speaking belum berhasil. Tim Titik Nol akan menghubungi kamu dengan hasilnya.",
      percent: 0,
      percentLabel: "Tidak termasuk",
    }));
  }

  const graded = skills.filter((skill) => skill.unit && Number.isFinite(Number(skill.value)));
  const overall = Number(result.overall);
  const name = result.firstName || "Kamu";
  const whatsapp = waLink(result.whatsapp, `Halo Admin Titik Nol, saya ${name}. Saya baru selesai mengerjakan IELTS Mockup dengan band keseluruhan ${fmt(result.overall)} dan ingin konsultasi hasilnya.`);

  const writing = (result.skills || []).find((skill) => skill.skill === "Writing");
  const speaking = (result.skills || []).find((skill) => skill.skill === "Speaking");
  const groups = [];
  for (const task of writing?.tasks || []) {
    groups.push({
      title: `Task ${task.taskNumber}`,
      meta: task.taskNumber === 2 ? "Bobot 66.7% dari band Writing" : "Bobot 33.3% dari band Writing",
      band: fmt(task.band),
      criteria: [
        ["task_response", task.taskNumber === 2 ? "Task Response" : "Task Achievement"],
        ["coherence_cohesion", "Coherence & Cohesion"],
        ["lexical_resource", "Lexical Resource"],
        ["grammatical_range_accuracy", "Grammatical Range & Accuracy"],
      ].filter(([key]) => task.criteria?.[key]).map(([key, label]) => ({
        label, value: fmt(task.criteria[key].band), note: task.criteria[key].comment || "",
      })),
    });
  }
  if (speaking) {
    groups.push({
      title: "Speaking interview",
      meta: `${speaking.answers || 0} jawaban dalam tiga bagian`,
      band: fmt(speaking.band),
      criteria: [
        ["pronunciation", "Pronunciation"],
        ["fluency_coherence", "Fluency & Coherence"],
        ["lexical_resource", "Lexical Resource"],
        ["grammatical_range_accuracy", "Grammatical Range & Accuracy"],
      ].filter(([key]) => speaking.criteria?.[key] !== null && speaking.criteria?.[key] !== undefined).map(([key, label]) => ({
        label, value: fmt(speaking.criteria[key]), note: "",
      })),
    });
  }

  const weakest = graded.toSorted((a, b) => Number(a.value) - Number(b.value)).slice(0, 2);
  const plan = weakest.map((skill) => ({ title: `Naikkan ${skill.name}`, text: SKILL_ADVICE[skill.name] }));
  const hasWriting = groups.some((group) => group.title.startsWith("Task"));
  const hasSpeaking = groups.some((group) => group.title === "Speaking interview");

  const listening = (result.skills || []).find((skill) => skill.skill === "Listening");
  const reading = (result.skills || []).find((skill) => skill.skill === "Reading");
  const correct = (listening?.raw || 0) + (reading?.raw || 0);
  const objectiveTotal = (listening?.total || 0) + (reading?.total || 0);
  const essays = writing?.tasks?.length || 0;

  return {
    kind: "band",
    testName: result.testName || "IELTS Mockup",
    name,
    code: result.code || "",
    date: dateText(result.date),
    summary: "Hasil diagnostik simulasi IELTS kamu sudah selesai diproses. Nilai berikut adalah perkiraan kemampuan terukur, bukan skor resmi.",
    score: { value: fmt(result.overall), max: "9.0", scale: "Skala 1.0 sampai 9.0", labelTop: "Perkiraan Band Keseluruhan", label: bandLabel(result.overall), percent: (Number(result.overall) / 9) * 100, caption: "*Dihitung dari rata-rata modul yang dinilai. Band resmi hanya diterbitkan British Council atau IDP." },
    meta: [
      { label: "Paket Tes", value: result.packageName || "IELTS Mockup" },
      { label: "Tanggal Tes", value: dateText(result.date) },
      { label: "Status Tes", value: `${scored} dari 4 modul` },
      { label: "Profil Band", value: bandLabel(result.overall), accent: true },
    ],
    skills,
    gap: graded.length ? {
      title: "Analisis Kesenjangan Skor (Gap Analysis)",
      subtitle: `Perolehan tiap modul dibanding target Band ${fmt(BAND_TARGET)}`,
      badge: `Target beasiswa: ${fmt(BAND_TARGET)}`,
      rows: graded.map((skill) => {
        const delta = Number(skill.value) - BAND_TARGET;
        return {
          name: skill.name,
          value: skill.value,
          target: fmt(BAND_TARGET),
          delta: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} Band`,
          tone: delta >= 0 ? "strong" : delta >= -1.5 ? "mid" : "low",
          percent: Math.max(0, Math.min(100, (Number(skill.value) / 9) * 100)),
          marker: (BAND_TARGET / 9) * 100,
        };
      }),
      note: weakest.length
        ? `Nilai ${weakest[0].name} adalah leverage terbesar untuk menaikkan band keseluruhan. Mulai dari sana, lalu jaga modul lain tetap terlatih.`
        : "",
    } : null,
    profile: {
      eyebrow: "Diagnostik Tingkat",
      tag: `Band ${fmt(result.overall)}`,
      title: `Profil: ${bandLabel(result.overall)}`,
      text: bandProfile(overall),
      stats: [
        { label: "Soal dan Tugas", value: `${objectiveTotal || 80} soal${essays ? ` + ${essays} esai` : ""}` },
        { label: "Benar Listening + Reading", value: `${correct} / ${objectiveTotal || 80}` },
        { label: "Modul Dinilai", value: `${scored} dari 4` },
      ],
      cta: { label: "Konsultasi Hasil Gratis", href: whatsapp },
    },
    details: groups.length ? {
      title: hasWriting && hasSpeaking ? "Evaluasi Detail Writing dan Speaking" : hasWriting ? "Evaluasi Detail Writing" : "Evaluasi Detail Speaking",
      subtitle: hasWriting ? "Dinilai otomatis dengan rubrik standar IELTS. Task 2 berbobot dua kali Task 1." : "Dinilai otomatis dari rekaman dengan empat kriteria IELTS.",
      band: fmt(writing?.band),
      groups,
    } : null,
    plan,
    programs: [],
    disclaimer: result.disclaimer || "Hasil ini adalah perkiraan dan bukan skor resmi IELTS. Skor resmi hanya diterbitkan oleh British Council atau IDP.",
  };
}

/** Pre-test and post-test: one score out of 100, with the pass line on the post-test. */
function scoreReport(result) {
  const nilai = Number(result.nilai) || 0;
  const pass = result.passed === null || result.passed === undefined ? null : Boolean(result.passed);
  const name = result.firstName || "Kamu";
  const statusLabel = pass === null ? "Nilai kamu" : pass ? "Lulus" : "Belum lulus";
  const testName = result.testName || "Tes";
  const whatsapp = waLink(result.whatsapp, `Halo Admin Titik Nol, saya ${name}. Saya baru selesai mengerjakan ${testName} dengan nilai ${nilai} dan ingin menanyakan hasilnya.`);
  const passScore = Number(result.passScore) || 0;

  return {
    kind: "score",
    testName,
    name,
    code: result.code || "",
    date: dateText(result.date),
    summary: `Nilai ${testName} kamu sudah tercatat di data siswa Titik Nol English Course.`,
    score: { value: String(nilai), max: "100", scale: "Skala 0 sampai 100", labelTop: "Nilai Akhir", label: statusLabel, percent: nilai, caption: pass === null ? "Nilai akhir dari seluruh soal yang dijawab." : `Nilai kelulusan ${passScore}. Hasil ini menjadi catatan belajar kamu.` },
    meta: [
      { label: "Jenis Tes", value: testName },
      { label: "Tanggal Tes", value: dateText(result.date) },
      { label: "Soal Benar", value: `${result.score} dari ${result.total}` },
      { label: "Status", value: statusLabel, accent: pass === true },
    ],
    skills: [
      skillCard({ name: "Nilai", value: String(nilai), unit: "/ 100", raw: `${result.score} benar`, badge: statusLabel, tone: pass === false ? "low" : "strong", note: pass === false ? `Nilai kelulusan ${passScore}. Masih ada ruang untuk memperbaiki bagian yang lemah.` : "Nilai ini sudah masuk ke catatan belajar kamu.", percent: nilai, percentLabel: `${nilai}%` }),
      skillCard({ name: "Soal Benar", value: String(result.score), unit: `/ ${result.total}`, raw: "dari seluruh soal", badge: "Tercatat", tone: "strong", note: "Rincian jawaban ada di dashboard tim Titik Nol.", percent: result.total ? (result.score / result.total) * 100 : 0, percentLabel: result.total ? `${Math.round((result.score / result.total) * 100)}% benar` : "-" }),
    ],
    gap: pass === null ? null : {
      title: "Posisi Nilai terhadap Batas Lulus",
      subtitle: `Nilai kamu ${nilai} dari 100, batas lulus ${passScore}`,
      badge: `Batas lulus: ${passScore}`,
      rows: [{
        name: testName,
        value: String(nilai),
        target: String(passScore),
        delta: `${nilai - passScore >= 0 ? "+" : ""}${nilai - passScore} poin`,
        tone: nilai >= passScore ? "strong" : "low",
        percent: Math.max(0, Math.min(100, nilai)),
        marker: Math.max(0, Math.min(100, passScore)),
      }],
      note: nilai >= passScore ? "Kamu sudah melewati batas lulus. Pertahankan dengan latihan lanjutan." : "Fokus ke bagian yang paling banyak salah, lalu ulangi tes setelah belajar.",
    },
    profile: {
      eyebrow: "Status Tes",
      tag: `Nilai ${nilai}`,
      title: pass === null ? "Hasil sudah tercatat" : pass ? "Lulus" : "Belum lulus",
      text: pass === null
        ? "Nilai ini menjadi bagian dari catatan belajar kamu di Titik Nol. Tutor akan memakainya untuk menyusun materi berikutnya."
        : pass
          ? "Kamu sudah melewati batas nilai tes ini. Tutor akan memakai hasilnya untuk menyusun materi berikutnya."
          : `Nilai kamu belum mencapai batas ${passScore}. Ini bukan akhir, karena bagian yang lemah bisa dilatih ulang dengan tutor.`,
      stats: [
        { label: "Nilai", value: `${nilai} / 100` },
        { label: "Soal Benar", value: `${result.score} / ${result.total}` },
        { label: "Tanggal", value: dateText(result.date) },
      ],
      cta: { label: "Tanya Hasil ke Admin", href: whatsapp },
    },
    details: null,
    plan: [
      { title: "Bahas soal yang salah", text: "Buka catatan jawaban bersama tutor, lalu tandai pola kesalahan yang paling sering muncul." },
      { title: "Ulangi setelah belajar", text: "Minta tautan tes baru ke admin setelah materi yang lemah selesai dipelajari." },
    ],
    programs: [],
    disclaimer: "Hasil ini dipakai untuk pemetaan materi belajar dan bukan sertifikat resmi.",
  };
}

/** The placement test: the level, the score, and the speaking facts. */
function placementReport(result, programs) {
  const level = result.level || {};
  const score = Number(result.score) || 0;
  const total = Number(result.total) || 0;
  const percent = total ? (score / total) * 100 : 0;
  const name = result.name || "Kamu";
  const speaking = result.speaking;
  const next = result.next;
  const whatsapp = waLink(result.whatsapp, `Halo Admin Titik Nol, saya ${name}. Saya baru selesai mengerjakan placement test dengan hasil ${level.label || ""} (${score} dari ${total}) dan ingin berkonsultasi tentang program yang sesuai.`);

  const skills = [
    skillCard({
      name: "Pilihan Ganda",
      value: String(score),
      unit: `/ ${total}`,
      raw: `${Math.round(percent)}% benar`,
      badge: level.label || "Dinilai",
      tone: "strong",
      note: level.summary || "",
      percent,
      percentLabel: `${Math.round(percent)}% benar`,
    }),
  ];
  if (speaking) {
    skills.push(skillCard({
      name: "Speaking",
      value: speaking.cefr || "-",
      unit: "",
      raw: speaking.ielts === null || speaking.ielts === undefined ? "dinilai tim" : `IELTS ${fmt(speaking.ielts)}`,
      badge: speaking.source === "manual" ? "Dinilai tim" : "Dinilai otomatis",
      tone: "strong",
      note: speaking.tooShort ? "Jawaban kamu singkat, jadi nilainya belum stabil." : speaking.offTopic ? "Jawaban kamu belum sesuai pertanyaannya." : "Nilai speaking terpisah dan tidak mengubah level pilihan ganda.",
      percent: speaking.ielts ? Math.max(0, Math.min(100, (Number(speaking.ielts) / 9) * 100)) : 0,
      percentLabel: speaking.ielts ? `IELTS ${fmt(speaking.ielts)}` : speaking.cefr,
    }));
  } else {
    skills.push(skillCard({
      name: "Speaking",
      value: "N/A",
      unit: "",
      raw: "tidak termasuk",
      badge: "Belum ada rekaman",
      tone: "muted",
      note: "Bagian speaking tidak masuk ke hasil ini, jadi level kamu murni dari soal pilihan ganda.",
      percent: 0,
      percentLabel: "Tidak termasuk",
    }));
  }

  const details = speaking && speaking.aspects?.length ? {
    title: "Evaluasi Detail Speaking",
    subtitle: "Dinilai otomatis dari rekaman dengan lima aspek kemampuan.",
    band: speaking.cefr || "",
    groups: [{
      title: "Speaking",
      meta: speaking.source === "manual" ? "Dinilai tim Titik Nol" : "Dinilai otomatis",
      band: speaking.cefr || "-",
      criteria: speaking.aspects.map((aspect) => ({
        label: aspect.label,
        value: aspect.cefr || (aspect.score === null || aspect.score === undefined ? "-" : `${Math.round(aspect.score)}`),
        note: aspect.score === null || aspect.score === undefined ? "" : `${Math.round(aspect.score)} dari 100`,
      })),
    }],
  } : null;

  return {
    kind: "placement",
    testName: "Placement Test",
    name,
    code: result.code || "",
    date: dateText(result.date),
    summary: level.summary || "Hasil Placement Test kamu sudah selesai diproses.",
    score: { value: String(score), max: `/ ${total}`, scale: `Skor ${score} dari ${total}`, labelTop: "Skor Placement Test", label: level.label || "-", percent, caption: "Level ini dipakai untuk menempatkan kamu di kelas yang paling sesuai." },
    meta: [
      { label: "Program", value: level.program || "-" },
      { label: "Tanggal Tes", value: dateText(result.date) },
      { label: "Skor", value: `${score} dari ${total}` },
      { label: "Level", value: level.label || "-", accent: true },
    ],
    skills,
    gap: {
      title: "Posisi Skor dan Level Berikutnya",
      subtitle: next ? `Skor kamu ${score} dari ${total}. Level ${next.label} mulai di ${next.min}.` : `Skor kamu ${score} dari ${total}, dan kamu sudah di level tertinggi.`,
      badge: next ? `Level berikutnya: ${next.label}` : "Level tertinggi",
      rows: [{
        name: "Skor pilihan ganda",
        value: String(score),
        target: next ? String(next.min) : String(total),
        delta: next ? `${Math.max(0, next.min - score)} poin lagi` : "sudah maksimal",
        tone: next && next.min - score > 0 ? "mid" : "strong",
        percent: Math.max(0, Math.min(100, percent)),
        marker: total && next ? Math.max(0, Math.min(100, (next.min / total) * 100)) : null,
      }],
      note: next
        ? `Selisih ${Math.max(0, next.min - score)} poin lagi ke level ${next.label}. Tutor akan memakai selisih ini untuk menyusun latihan kamu.`
        : "Kamu sudah di level tertinggi. Fokus berikutnya adalah strategi tes dan target skor.",
    },
    profile: {
      eyebrow: "Diagnostik Level",
      tag: level.label || "",
      title: `Profil: ${level.label || "-"}`,
      text: level.description || "",
      stats: [
        { label: "Skor Pilihan Ganda", value: `${score} / ${total}` },
        { label: "Level", value: level.label || "-" },
        { label: "Program", value: level.program || "-" },
      ],
      cta: { label: "Konsultasi Hasil Gratis", href: whatsapp },
    },
    details,
    plan: [
      next
        ? { title: `Target level ${next.label}`, text: `Butuh ${Math.max(0, next.min - score)} poin lagi. Latih bagian yang paling sering salah, lalu ulangi tes.` }
        : { title: "Pertahankan level tertinggi", text: "Fokus ke simulasi tes penuh dan strategi menjawab supaya skor tetap stabil." },
      { title: level.program ? `Program: ${level.program}` : "Program yang disarankan", text: level.description || "Admin akan membantu memilih program yang paling sesuai dengan level kamu." },
    ],
    programs: Array.isArray(programs) ? programs : [],
    disclaimer: "Hasil ini dipakai untuk penempatan kelas dan bukan sertifikat resmi.",
  };
}

export function buildReport(result, programs = []) {
  if (result?.level) return placementReport(result, programs);
  if (result?.skills) return bandReport(result);
  return scoreReport(result);
}
