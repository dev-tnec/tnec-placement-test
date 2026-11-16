// Level thresholds match the JotForm 252018413812044 conditions.
// 0-5 Starter, 6-10 Basic, 11-15 Intermediate, 16-19 Advanced,
// 20-23 TOEFL/IELTS Preparation, 24-25 TOEFL/IELTS Scoring.

export const LEVELS = [
  {
    key: "starter",
    min: 0,
    max: 5,
    label: "Starter",
    program: "Program Starter",
    summary: "Kamu masih berada di tahap awal, dan itu hal yang wajar.",
    description:
      "Pada tahap ini, fokusnya adalah membangun kosakata dasar, memahami pola kalimat sederhana, dan membiasakan diri memakai bahasa Inggris. Program Starter membantu kamu membangun fondasi itu pelan-pelan, dengan banyak latihan dan koreksi langsung dari tutor.",
  },
  {
    key: "basic",
    min: 6,
    max: 10,
    label: "Basic",
    program: "Program Basic",
    summary: "Pola dasar sudah terbentuk, dan sekarang tinggal diperkuat.",
    description:
      "Kamu sudah mengenal pola dasar dan mampu menangani percakapan sehari-hari yang sederhana. Program Basic memperkuat tata bahasa, menambah kosakata, dan melatih kamu menyusun kalimat yang lebih panjang dengan lebih percaya diri.",
  },
  {
    key: "intermediate",
    min: 11,
    max: 15,
    label: "Intermediate",
    program: "Program Intermediate",
    summary: "Bekal harian kamu sudah cukup, dan sekarang saatnya merapikan akurasi.",
    description:
      "Kamu sudah punya bekal yang cukup untuk percakapan sehari-hari dan mampu memahami teks sederhana. Program Intermediate merapikan tata bahasa, menambah variasi struktur kalimat, dan melatih kelancaran bicara serta menulis.",
  },
  {
    key: "advanced",
    min: 16,
    max: 19,
    label: "Advanced",
    program: "Program Advanced",
    summary: "Kamu sudah menguasai struktur kalimat yang kompleks.",
    description:
      "Kalimat kompleks dan kosakata yang lebih luas sudah kamu kuasai. Program Advanced mempertajam nuansa makna, idiom, dan gaya tulisan akademik supaya bahasa Inggris kamu terasa lebih alami.",
  },
  {
    key: "toefl-prep",
    min: 20,
    max: 23,
    label: "TOEFL/IELTS Preparation",
    program: "Kelas TOEFL/IELTS Preparation",
    summary: "Kemampuan bahasa Inggris kamu sudah kuat, dan sekarang waktunya menguasai strategi tes.",
    description:
      "Tahap berikutnya adalah strategi menghadapi tes, mulai dari memahami tipe soal, mengatur waktu, sampai memilih teknik menjawab yang tepat. Kelas Preparation membahas keempat kemampuan dengan simulasi bertahap.",
  },
  {
    key: "toefl-scoring",
    min: 24,
    max: 25,
    label: "TOEFL/IELTS Scoring",
    program: "Kelas TOEFL/IELTS Scoring",
    summary: "Kamu sudah berada di level atas, dan fokusnya sekarang adalah mencapai target skor.",
    description:
      "Saat ini kamu perlu simulasi tes penuh, analisis kesalahan, dan strategi untuk menaikkan skor ke target yang kamu butuhkan. Kelas Scoring memakai latihan intensif dengan evaluasi di setiap sesi.",
  },
];

export function levelForScore(score) {
  return (
    LEVELS.find((level) => score >= level.min && score <= level.max) ||
    LEVELS[LEVELS.length - 1]
  );
}

export function publicLevel(level) {
  return {
    key: level.key,
    label: level.label,
    program: level.program,
    summary: level.summary,
    description: level.description,
  };
}
