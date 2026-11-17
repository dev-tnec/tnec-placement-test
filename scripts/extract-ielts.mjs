// One-shot extractor for the IELTS mockup bank (docs/prd-ielts-mockup.md).
// Reads the December package from the old platform's seed material and emits the seed migration
// db/migrations/0008_ielts_mockup.sql, plus copies the listening audio into the web app.
// Re-run when a new package with keys and audio arrives; it overwrites the migration, so review
// the diff before committing. Usage: node scripts/extract-ielts.mjs

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SOURCE = resolve(ROOT, "..", "..", "ielts-mockup");
const OUT = resolve(ROOT, "db/migrations/0008_ielts_mockup.sql");

const seed = readFileSync(resolve(SOURCE, "packages/db/src/seed.ts"), "utf8");
const passages = JSON.parse(readFileSync(resolve(SOURCE, "packages/db/content/reading-test-1.json"), "utf8"));

function block(name, until) {
  const from = seed.indexOf(`const ${name} =`);
  if (from < 0) throw new Error(`marker ${name} not found`);
  const body = seed.slice(from, seed.indexOf(until, from));
  const value = body.slice(body.indexOf("=") + 1).trim().replace(/;$/, "");
  return new Function("readingPassages", `return (${value})`)(passages);
}

const listening = block("listeningContent", "const fullSectionListeningContent");
const reading = block("fullReadingContent", "const fullSpeakingContent");
const listeningBandTable = block("listeningBandTable", "const readingBandTable");
const readingBandTable = block("readingBandTable", "const fullReadingContent");

/* HTML passages become plain text: tags stripped, entities decoded, paragraphs kept. */
function htmlToText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* Options keep letters as their key when the material already uses A to F; word values like TRUE
   get letters in order, so every choice question stores an A to F key and its label. */
function letterize(options) {
  const letters = {};
  const byValue = {};
  options.forEach((opt, i) => {
    const letter = /^[A-F]$/.test(opt.value) ? opt.value : "ABCDEF"[i];
    letters[letter] = opt.label;
    byValue[opt.value] = letter;
  });
  return { letters, byValue };
}

const sql = (value) => `'${String(value ?? "").replace(/'/g, "''")}'`;
let nextId = 1000;
const rows = [];

function pushQuestion({ test, position, skill, part, prompt, passage, options, answer, accepted, type }) {
  nextId += 1;
  const opts = ["A", "B", "C", "D", "E", "F"].map((k) => sql(type === "text" ? null : options?.[k] ?? null));
  rows.push(
    `  (${nextId}, ${sql(test)}, ${position}, ${sql(skill)}, ${sql(part)}, ${sql(prompt)}, ${sql(passage)}, ` +
    `${opts.join(", ")}, ${sql(answer)}, 60, 'aktif', ${sql(type)}, ${sql(accepted ? JSON.stringify(accepted) : null)}, ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})`,
  );
}

/* Listening: instruction sits in the passage column, so it shows above every question of a group. */
for (const [partIndex, part] of listening.parts.entries()) {
  for (const group of part.groups) {
    const isChoice = group.type === "mcq" || group.type === "matching";
    const groupLetters = isChoice ? letterize(group.options || []) : null;
    for (const q of group.questions) {
      if (isChoice) {
        const { letters, byValue } = q.options ? letterize(q.options) : groupLetters;
        pushQuestion({
          test: "ielts-mockup", position: q.number, skill: "Listening", part: partIndex + 1,
          prompt: q.prompt, passage: group.instructions, options: letters, answer: byValue[q.answers[0]], type: "choice",
        });
      } else {
        pushQuestion({
          test: "ielts-mockup", position: q.number, skill: "Listening", part: partIndex + 1,
          prompt: q.prompt, passage: group.instructions, accepted: q.answers, answer: q.answers[0], type: "text",
        });
      }
    }
  }
}

/* Reading: the passage text is copied to every question of its part, as the PRD requires. */
for (const [partIndex, part] of reading.parts.entries()) {
  const passage = `${part.title}\n\n${htmlToText(part.passageHtml)}`;
  for (const group of part.groups) {
    const isChoice = ["mcq", "matching", "tfng", "ynng"].includes(group.type);
    const groupLetters = isChoice ? letterize(group.options || []) : null;
    for (const q of group.questions) {
      if (isChoice) {
        const { letters, byValue } = q.options ? letterize(q.options) : groupLetters;
        pushQuestion({
          test: "ielts-mockup", position: 40 + q.number, skill: "Reading", part: partIndex + 1,
          prompt: q.prompt, passage, options: letters, answer: byValue[q.answers[0]], type: "choice",
        });
      } else {
        pushQuestion({
          test: "ielts-mockup", position: 40 + q.number, skill: "Reading", part: partIndex + 1,
          prompt: q.prompt, passage, accepted: q.answers, answer: q.answers[0], type: "text",
        });
      }
    }
  }
}

/* The conversion tables are thresholds; every raw score 0 to 40 gets its own row. */
function bandRows(skill, table) {
  const out = [];
  for (let raw = 0; raw <= 40; raw += 1) {
    const entry = table.find((t) => t.raw <= raw);
    out.push(`  ('ielts-mockup', ${sql(skill)}, ${raw}, ${entry.band})`);
  }
  return out;
}

const header = `-- IELTS Mockup (docs/prd-ielts-mockup.md): the question model for text answers and parts,
-- the audio and band columns, the band scale table, and the December Test 1 bank. The question rows
-- are generated by scripts/extract-ielts.mjs from the source material; do not edit them by hand.

ALTER TABLE questions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'choice';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS part INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS accepted TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_e TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_f TEXT;
ALTER TABLE questions ALTER COLUMN option_a DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN option_b DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN option_c DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN option_d DROP NOT NULL;
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_answer_check;
ALTER TABLE questions ADD CONSTRAINT questions_answer_check
  CHECK (type = 'text' OR answer IN ('A', 'B', 'C', 'D', 'E', 'F'));

ALTER TABLE tests ADD COLUMN IF NOT EXISTS auto_submit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS audio_played_at BIGINT;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS bands TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS code_tries INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS band_scales (
  test_key TEXT NOT NULL,
  skill    TEXT NOT NULL,
  raw      INTEGER NOT NULL,
  band     NUMERIC(3,1) NOT NULL,
  PRIMARY KEY (test_key, skill, raw)
);

UPDATE tests SET auto_submit = 1, audio_url = '/audio/ielts-dec-1.mp3' WHERE key = 'ielts-mockup';

-- The December bank: 40 listening questions and 40 reading questions.
INSERT INTO questions
  (id, test_key, position, skill, part, prompt, passage, option_a, option_b, option_c, option_d, option_e, option_f, answer, seconds, status, type, accepted, created_at, updated_at)
VALUES
${rows.join(",\n")}
ON CONFLICT (id) DO NOTHING;

-- Raw to band conversion for the two scored skills, one row per raw score. The skill labels match
-- the question skill column exactly.
DELETE FROM band_scales WHERE test_key = 'ielts-mockup';
INSERT INTO band_scales (test_key, skill, raw, band) VALUES
${[...bandRows("Listening", listeningBandTable), ...bandRows("Reading", readingBandTable)].join(",\n")}
ON CONFLICT (test_key, skill, raw) DO NOTHING;
`;

writeFileSync(OUT, header);
mkdirSync(resolve(ROOT, "apps/web/public/audio"), { recursive: true });
copyFileSync(resolve(SOURCE, "listening-dec/December test 1 full.mp3"), resolve(ROOT, "apps/web/public/audio/ielts-dec-1.mp3"));

console.log(`wrote ${OUT}`);
console.log(`questions: ${rows.length} (listening ${listening.parts.flatMap((p) => p.groups.flatMap((g) => g.questions)).length}, reading ${reading.parts.flatMap((p) => p.groups.flatMap((g) => g.questions)).length})`);
console.log(`band rows: ${bandRows("Listening", listeningBandTable).length + bandRows("Reading", readingBandTable).length}`);
