// Full end-to-end run of the IELTS Mockup, from the invite to the graded result, against the
// DEV branch only. Run it with the dev server up:
//
//   $env:ENV_FILE = ".env.dev"; node tools/mockup/e2e-full.mjs
//
// What it does, in order:
//   1. Finds or creates the student below and issues a fresh mockup invite with a code.
//   2. Checks the invite link, tries one wrong code, then starts the attempt with the right one.
//   3. Answers every listening and reading question CORRECTLY: the key for choice questions,
//      the first accepted answer for typed questions, and two essays for the Writing tasks.
//   4. Speaks all 18 interview answers with real audio and uploads them one by one. The voice
//      is @cf/deepgram/aura-2-en on Cloudflare Workers AI when CLOUDFLARE_AI_TOKEN is set and
//      valid, and falls back to the local Windows voice when it is not.
//   5. Submits, asserts the listening and reading bands are 9, then polls the result until
//      Speechace has graded all 18 recordings and the overall band of four skills is in.
//
// It never sends an email or a WhatsApp: the invite is created directly in the database, so
// nothing enters the send queue. Speechace quota: 18 real scoring calls per run.

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadEnvFile, buildEnv, ROOT } from "@tnec/core/env";
import { newId } from "@tnec/core/store";
import { mockupCode } from "@tnec/core/mockup-bulk";
import { mockupSpeakingPlan } from "@tnec/core/speaking-mockup";
import { randomToken, sha256Hex } from "@tnec/core/crypto";
import { CONSENT_VERSION } from "@tnec/core/legal";
import { countWords } from "@tnec/core/writing";
import { overallBand } from "@tnec/core/bands";

/* The run's participant. */
const STUDENT = { name: "Aldo Dwi Kristian", email: "aldodkris@gmail.com", wa: "6285113136575" };

/* Guards: this tool writes rows, so it must never touch the main branch. */
if (!process.env.ENV_FILE || resolve(process.env.ENV_FILE) === resolve(ROOT, ".env")) {
  console.error("Refusing to run against the default env. Point ENV_FILE at the dev branch first:");
  console.error('  PowerShell:  $env:ENV_FILE = ".env.dev"');
  process.exit(1);
}
loadEnvFile();
const env = buildEnv();
const base = env.PUBLIC_WEB_URL;
const DB = env.DB;
const now = () => Math.floor(Date.now() / 1000);

let step = 0;
const ok = (label) => { step += 1; console.log(`  ${String(step).padStart(2, "0")}. OK  ${label}`); };
const fail = (label, detail) => {
  console.error(`  ${String(step + 1).padStart(2, "0")}. FAIL ${label}`);
  if (detail) console.error(detail);
  process.exit(1);
};
const check = (cond, label, detail) => (cond ? ok(label) : fail(label, detail));

/* The dev server closes idle keep-alive sockets, and a long pause (like the voice synthesis)
   can hand the next request a reset connection. Browsers retry this transparently; so do we. */
async function fetchRetry(url, options = {}, tries = 3) {
  let lastError;
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, options);
      if (res.status >= 500 && i < tries - 1) { await new Promise((r) => setTimeout(r, 1000)); continue; }
      return res;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

async function call(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetchRetry(`${base}${path}`, {
    method,
    headers: { ...(body && !(body instanceof Buffer) ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body instanceof Buffer ? body : body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

/* ---------- 1. The participant and the invite ---------- */

let student = await DB.prepare("SELECT id FROM students WHERE whatsapp = ?").bind(STUDENT.wa).first();
if (!student) {
  const id = newId("stu");
  const t = now();
  await DB.prepare(`INSERT INTO students (id, name, email, whatsapp, source, stage, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'IELTS Mockup', 'terdaftar', ?, ?)`).bind(id, STUDENT.name, STUDENT.email, STUDENT.wa, t, t).run();
  student = { id };
  ok(`created student ${STUDENT.name}`);
} else {
  ok(`student ${STUDENT.name} already exists`);
}

const pkg = await DB.prepare(`SELECT id, name FROM question_packages
    WHERE test_key = 'ielts-mockup' AND is_active = 1
    ORDER BY (SELECT COUNT(*) FROM questions q WHERE q.package_id = question_packages.id AND q.status = 'aktif') DESC
    LIMIT 1`).first();
check(pkg, `question package ${pkg?.name}`);

const token = randomToken(24);
const code = mockupCode();
const t = now();
await DB.prepare(`INSERT INTO invites (id, token_hash, student_id, test_key, code, package_id, created_at, expires_at)
    VALUES (?, ?, ?, 'ielts-mockup', ?, ?, ?, ?)`)
  .bind(newId("inv"), await sha256Hex(token), student.id, code, pkg.id, t, t + 24 * 3600).run();
console.log(`\nInvite link : ${base}/?undangan=${token}`);
console.log(`Invite code : ${code}\n`);
ok("invite created");

/* ---------- 2. The link, the wrong code, and the real start ---------- */

const invite = await call(`/api/invites/${token}`);
check(invite.status === 200 && invite.data.invite.needsCode, "the invite link opens and asks for the code");
check(invite.data.invite.testName === "IELTS Mockup", `the link names the test: ${invite.data.invite.testName}`);

const consent = { accepted: true, version: CONSENT_VERSION };
const wrong = await call("/api/attempts", { method: "POST", body: { consent, invite: token, inviteCode: "WRONG1" } });
check(wrong.status === 403, "a wrong code is refused", JSON.stringify(wrong.data));

const start = await call("/api/attempts", { method: "POST", body: { consent, invite: token, inviteCode: code } });
if (start.status !== 200) fail("the attempt did not start", JSON.stringify(start.data));
const attempt = start.data;
const attemptId = attempt.attemptId;
ok(`attempt started: ${attemptId}`);

const plan = attempt.sectionPlan || [];
check(plan.length === 4 && plan[0].skill === "Listening" && plan[0].seconds === 1920, "the section plan lists Listening 32, Reading 60, Writing 60, Speaking 15");
check(attempt.questions.length === 82, `82 questions delivered (${attempt.questions.length})`);
check(attempt.sections.length === 12, `12 sections delivered (${attempt.sections.length})`);

/* ---------- 3. Every answer, correct ---------- */

const ids = attempt.questions.map((q) => q.id);
const marks = await DB.prepare(`SELECT id, type, skill, answer, accepted, min_words FROM questions WHERE id IN (${ids.map(() => "?").join(",")})`)
  .bind(...ids).all();
const byId = new Map(marks.results.map((q) => [q.id, q]));

const ESSAY_TASK_1 = `The maps illustrate the changes that took place in the town of Dalton between 1937 and 2007.
Overall, the town grew considerably over the seventy year period, and the farmland in the north was replaced by residential and commercial buildings, while the river in the south remained the only unchanged feature.
In 1937, the town was small and surrounded by farmland on three sides. A school and a post office stood on the main road, which ran from west to east, and a small residential area lay in the centre. The river crossed the southern corner of the town, and a bridge connected the main road to the small village on the other bank.
By 2007, the town had expanded in every direction. The farmland to the north had been converted into a large residential district, and a new industrial zone had been built in the east along the railway. The school was enlarged and a new hospital was constructed next to it. The village south of the river joined the town, and the old bridge was replaced by a wider one that carried the main road, which was straightened to cope with the heavier traffic.`;

const ESSAY_TASK_2 = `Some people believe that difficult experiences are the best teachers, while others argue that steady guidance produces better learning. In my opinion, both elements matter, but a person ultimately learns the most when a real challenge is combined with the right support.
First of all, difficult experiences force us to pay full attention. When a task is hard, we cannot rely on habit, so we question our methods, look for better ones, and remember the lesson for a long time. For example, many people say that their first demanding project at work taught them more than a year of comfortable routine, because failure showed them exactly where their weaknesses were.
However, difficulty alone can also break motivation. A student who faces a hard subject without any guidance may decide that the subject is impossible and simply give up. Guidance turns a wall into a staircase: a good teacher breaks the problem into steps, so progress feels possible and effort is rewarded. This is why coaching, mentoring, and clear feedback remain so valuable in schools and companies.
In conclusion, the best learning happens when difficulty and support work together. The challenge supplies the pressure that makes us grow, and the guidance supplies the map that keeps us moving. Therefore, I believe that education and training should be designed to offer both: real problems to solve and someone experienced to lean on when the problem refuses to bend. That combination, more than either element on its own, is what turns an ordinary learner into a confident one.`;

const answers = {};
let typed = 0;
let essays = 0;
for (const q of attempt.questions) {
  const mark = byId.get(q.id);
  if (!mark) fail(`question ${q.id} is missing from the bank`);
  if (mark.type === "choice") {
    answers[q.id] = mark.answer;
  } else if (mark.type === "text") {
    const accepted = JSON.parse(mark.accepted || "[]");
    if (!accepted.length) fail(`text question ${q.id} has no accepted answers`);
    answers[q.id] = accepted[0];
    typed += 1;
  } else {
    const min = mark.min_words || 150;
    const essay = mark.skill === "Writing" && countWords(ESSAY_TASK_2) >= min ? ESSAY_TASK_2 : ESSAY_TASK_1;
    if (countWords(essay) < min) fail(`the prepared essay is shorter than the ${min} word minimum`);
    answers[q.id] = essay;
    essays += 1;
  }
}
check(true, `answers prepared: ${attempt.questions.length - typed - essays} choice, ${typed} typed with the accepted answer, ${essays} essays`);

/* ---------- 4. The 18 spoken answers ---------- */

function wavSeconds(buf) {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return null;
  const byteRate = buf.readUInt32LE(28);
  const dataSize = buf.readUInt32LE(40);
  return byteRate ? Math.max(1, Math.round(dataSize / byteRate)) : null;
}

const voiceDir = mkdtempSync(join(tmpdir(), "tnec-tts-"));
let voiceMode = "unset";

async function cloudflareVoice(text) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_TOKEN || process.env.CLOUDFLARE_EMAIL_TOKEN;
  if (!accountId || !token) return { error: "no credentials" };
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/deepgram/aura-2-en`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (res.status === 401 || res.status === 403) return { error: `unauthorized (${res.status})` };
  if (!res.ok) return { error: `http ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "";
  let audio = buf;
  if (contentType.includes("json")) {
    const parsed = JSON.parse(buf.toString("utf8"));
    const b64 = parsed?.result?.audio ?? parsed?.audio;
    if (!b64) return { error: "the response carried no audio" };
    audio = Buffer.from(b64, "base64");
  }
  if (wavSeconds(audio)) return { wav: audio };
  return { error: `unsupported audio format (${audio.subarray(0, 4).toString("hex")})` };
}

function windowsVoiceBatch(texts) {
  const manifest = join(voiceDir, "texts.json");
  writeFileSync(manifest, JSON.stringify(texts));
  const script = join(voiceDir, "speak.ps1");
  writeFileSync(script, [
    "$texts = Get-Content -Raw $args[0] | ConvertFrom-Json",
    "Add-Type -AssemblyName System.Speech",
    "$i = 0",
    "foreach ($t in $texts) {",
    "  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "  $s.SetOutputToWaveFile((Join-Path $args[1] (\"$i.wav\")))",
    "  $s.Speak([string]$t)",
    "  $s.Dispose()",
    "  $i++",
    "}",
  ].join("\n"));
  const run = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, manifest, voiceDir], {
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
  });
  if (run.status !== 0) return { error: `the Windows voice failed: ${String(run.stderr || run.stdout || run.error || "").slice(0, 400)}` };
  return { wavs: texts.map((_, i) => readFileSync(join(voiceDir, `${i}.wav`))) };
}

const plan18 = mockupSpeakingPlan();
const spokenTexts = [];
for (const part of plan18.parts) {
  for (const q of part.questions) {
    spokenTexts.push(part.cue && part.cue.length ? [part.cue[0], ...part.cue.slice(2)].join(" ") : q.text);
  }
}
const first = await cloudflareVoice(spokenTexts[0]);
if (!first.error) {
  voiceMode = "@cf/deepgram/aura-2-en";
  ok("the Cloudflare voice works");
} else {
  console.log(`  ..  Cloudflare voice unavailable (${first.error}); falling back to the local Windows voice.`);
  console.log("      Set CLOUDFLARE_AI_TOKEN with Workers AI permission in the env file to use aura-2.");
  voiceMode = "Windows System.Speech";
}
const audio = [];
if (voiceMode === "@cf/deepgram/aura-2-en") {
  audio.push(first.wav);
  for (let i = 1; i < spokenTexts.length; i += 1) {
    const one = await cloudflareVoice(spokenTexts[i]);
    if (one.error) fail(`the Cloudflare voice failed on answer ${i + 1}`, one.error);
    audio.push(one.wav);
  }
} else {
  const batch = windowsVoiceBatch(spokenTexts);
  if (batch.error) fail(batch.error);
  audio.push(...batch.wavs);
}
check(audio.length === 18, `18 answers spoken with ${voiceMode}`);

let spoken = 0;
let at = 0;
for (const part of plan18.parts) {
  for (const q of part.questions) {
    const wav = audio[at];
    const seconds = wavSeconds(wav);
    if (!seconds) fail(`answer ${at + 1} is not a valid WAV`);
    const up = await fetchRetry(`${base}/api/attempts/${attemptId}/speaking-answer?part=${part.part}&prompt=${q.no}`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav", "x-duration": String(seconds) },
      body: wav,
    });
    let data = null;
    try { data = await up.json(); } catch { data = null; }
    if (up.status !== 200 || !data?.ok) fail(`speaking upload failed for part ${part.part} prompt ${q.no}`, JSON.stringify(data));
    spoken += 1;
    at += 1;
  }
}
check(true, `18 speaking answers uploaded, Speechace queue started`);

/* ---------- 5. Submit and the final bands ---------- */

const submit = await call(`/api/attempts/${attemptId}/submit`, { method: "POST", body: { answers } });
if (submit.status !== 200 || !submit.data?.ok) fail("the submission was refused", JSON.stringify(submit.data));
check(submit.data.total === 82, "the 82 answers were submitted and graded on the server");
// While the 18 recordings are still being scored, the result is withheld until they are done.
check(submit.data.result === null && submit.data.speaking?.status === "pending", "the result waits for the speaking scores");

console.log("\nWaiting for Speechace to grade the 18 recordings...");
let result = null;
for (let i = 0; i < 180; i += 1) {
  await new Promise((r) => setTimeout(r, 5000));
  const poll = await call(`/api/attempts/${attemptId}/result`);
  if (poll.status === 200 && poll.data?.ready) { result = poll.data.result; break; }
  if (i % 6 === 5) console.log(`  ..  still grading (${Math.round((i + 1) * 5 / 60)} minutes in)`);
}
if (!result) fail("the result never became ready");

const band = (skill) => result.skills.find((s) => s.skill === skill);
const listening = band("Listening");
const reading = band("Reading");
const writing = band("Writing");
check(listening.raw === 40 && listening.band === 9, `Listening raw ${listening.raw} of 40, band ${listening.band}`);
check(reading.raw === 40 && reading.band === 9, `Reading raw ${reading.raw} of 40, band ${reading.band}`);
check(result.writingStatus === "graded", `Writing graded by the ${process.env.GEMINI_MOCK ? "local mock" : "AI"}, band ${writing?.band}`);

const speaking = result.skills.find((s) => s.skill === "Speaking");
check(Boolean(speaking), `Speaking graded, band ${speaking?.band}`);
const overall = overallBand(result.skills.map((s) => s.band));
check(result.overall === overall, `overall band ${result.overall} is the mean of the four skills`);

console.log("\nAll four skills:");
for (const s of result.skills) {
  const raw = s.raw !== undefined && s.raw !== null ? `, raw ${s.raw} of ${s.total}` : "";
  console.log(`  ${s.skill.padEnd(10)} band ${s.band}${raw}`);
}
console.log(`\nE2E PASSED, all ${step} checks green.`);
console.log(`Result page : ${base}/hasil?attempt=${attemptId}`);
console.log(`Submission  : the dashboard shows it under IELTS Mockup, Submission, and in the Sesi roster once you assign one.`);
process.exit(0);
