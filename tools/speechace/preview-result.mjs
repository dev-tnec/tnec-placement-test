// Prints the exact WhatsApp and email result a student receives when speaking is active.
// Run: node tools/speechace/preview-result.mjs
import { buildResultWhatsApp } from "@tnec/core/whatsapp";
import { buildResultEmail } from "@tnec/core/email";
import { speakingFacts } from "@tnec/core/speaking-result";
import { levelForScore } from "@tnec/core/levels";
import { writeFileSync } from "node:fs";

const level = levelForScore(13); // Intermediate, 13 dari 25

const speechaceScores = {
  source: "speechace",
  overall: { cefr: "B2", ielts: 6, score: 72 },
  aspects: {
    pronunciation: { cefr: "B2", ielts: 6.5, score: 78 },
    fluency: { cefr: "B2", ielts: 6.5, score: 80 },
    grammar: { cefr: "B1", ielts: 5.5, score: 62 },
    vocab: { cefr: "B1", ielts: 5.5, score: 64 },
    coherence: { cefr: "B2", ielts: 6, score: 70 },
  },
  relevance: "TRUE",
  issues: [],
  notes: ["Use more specific nouns instead of general words like 'good' and 'nice'.", "Add linking words such as 'because' and 'however' to connect your ideas."],
};
const facts = speakingFacts({
  status: "graded",
  cefr_overall: "B2",
  ielts_overall: 6,
  transcript: "I really like visiting Malang because the weather is cool and the food is very good. My favorite place is the square near my house, where I can sit with my friends in the evening.",
  scores: JSON.stringify(speechaceScores),
});

const manualScores = {
  source: "manual",
  overall: { cefr: "B1", ielts: 5.5, score: null },
  aspects: {
    pronunciation: { cefr: "B2", ielts: null, score: null },
    fluency: { cefr: "B1", ielts: null, score: null },
    grammar: { cefr: "B1", ielts: null, score: null },
  },
  note: "Jawabanmu jelas, tetapi banyak jeda panjang. Latih bicara tanpa berhenti di tengah kalimat.",
};
const manualFacts = speakingFacts({
  status: "manual",
  cefr_overall: "B1",
  ielts_overall: 5.5,
  transcript: "",
  scores: JSON.stringify(manualScores),
});

const base = { name: "Rani Puspita Lestari", email: "rani.puspita@example.com", score: 13, total: 25, level };

const waAuto = buildResultWhatsApp({ ...base, speaking: facts, resultUrl: "https://tes.example.test/hasil?token=abc123" });
const waManual = buildResultWhatsApp({ ...base, speaking: manualFacts, resultUrl: "https://tes.example.test/hasil?token=abc123" });
const waPlain = buildResultWhatsApp({ ...base, resultUrl: "https://tes.example.test/hasil?token=abc123" });
const emailAuto = buildResultEmail({ ...base, speaking: facts, resultUrl: "https://tes.example.test/hasil?token=abc123" });
const emailManual = buildResultEmail({ ...base, speaking: manualFacts, resultUrl: "https://tes.example.test/hasil?token=abc123" });

console.log("===== WHATSAPP, dinilai Speechace =====\n");
console.log(waAuto);
console.log("\n\n===== WHATSAPP, dinilai manual oleh tim =====\n");
console.log(waManual);
console.log("\n\n===== WHATSAPP, tanpa speaking =====\n");
console.log(waPlain);
console.log("\n\n===== EMAIL, subjek =====\n");
console.log(emailAuto.subject);
console.log("\n\n===== EMAIL, versi teks =====\n");
console.log(emailAuto.text);

const out = new URL("../tmp-preview-email.html", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
writeFileSync(out, emailAuto.html, "utf8");
console.log(`\n\nEmail HTML (Speechace) tersimpan di ${out}`);
