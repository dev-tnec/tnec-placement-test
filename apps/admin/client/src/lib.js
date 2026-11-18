// Pure helpers, reference data, and derived selectors, ported one to one from the old client.
// Anything that reads db, NOW, or ui imports the live bindings from the store.

import { db, NOW, ui, ME } from "./store.js";
import { toast } from "./dom.js";
import { certPeriodKey, formatCertNumber } from "./cert-number.js";
import { branchLabel } from "@tnec/core/branches";

export const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR, WIB = 7 * HOUR;
export const COLD_DAYS = 90;

export const pad = (n) => String(n).padStart(2, "0");
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const MONTHS_LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function dp(ts) { const d = new Date(ts + WIB); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), i: d.getUTCMinutes(), s: d.getUTCSeconds() }; }
export function fmtDate(ts) { const p = dp(ts); return `${p.d} ${MONTHS[p.m]} ${p.y}`; }
export function fmtDateLong(ts) { const p = dp(ts); return `${p.d} ${MONTHS_LONG[p.m]} ${p.y}`; }
export function fmtTime(ts, withSec) { const p = dp(ts); return `${pad(p.h)}.${pad(p.i)}${withSec ? "." + pad(p.s) : ""}`; }
export function fmtDateTime(ts) { const p = dp(ts), n = dp(NOW); return `${p.d} ${MONTHS[p.m]}${p.y === n.y ? "" : " " + p.y}, ${fmtTime(ts)}`; }
export function dayNumber(ts) { const p = dp(ts); return Math.round(Date.UTC(p.y, p.m, p.d) / DAY); }
export function fmtRelative(ts) {
  const diff = NOW - ts;
  if (diff < 2 * MIN) return "baru saja";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} menit lalu`;
  const days = dayNumber(NOW) - dayNumber(ts);
  if (days <= 0) return `${Math.floor(diff / HOUR)} jam lalu`;
  if (days === 1) return "kemarin";
  if (days < 7) return `${days} hari lalu`;
  return fmtDate(ts);
}
export const fmtClock = (sec) => `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
export function fmtSpan(sec) { const m = Math.floor(sec / 60), s = sec % 60; if (!m) return `${s} detik`; return s ? `${m} menit ${s} detik` : `${m} menit`; }
export const fmtNum = (n, digits = 0) => Number(n).toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtRp = (n) => (n ? `Rp ${fmtNum(n)}` : "");
export const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
export function fmtWa(wa) { if (!wa) return ""; const local = "0" + String(wa).replace(/^62/, ""); return local.replace(/^(\d{4})(\d{4})(\d+)$/, "$1 $2 $3"); }
export function normalizeWa(v) { let d = String(v).replace(/\D/g, ""); if (d.startsWith("0")) d = "62" + d.slice(1); else if (d.startsWith("8")) d = "62" + d; return d; }
export function initials(name) { return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(""); }
export const firstName = (name) => String(name).split(/\s+/)[0];
export function joinWords(list) { if (list.length <= 1) return list.join(""); if (list.length === 2) return `${list[0]} dan ${list[1]}`; return `${list.slice(0, -1).join(", ")}, dan ${list[list.length - 1]}`; }
export function toDateInput(ts) { if (!ts) return ""; const p = dp(ts); return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`; }
export function fromDateInput(v) { return v ? Date.parse(`${v}T08:00:00+07:00`) : null; }
// fmtDate takes milliseconds, and the journey and identity fields carry plain ISO date strings.
export const dateToMs = (d) => Date.parse(`${d}T00:00:00`);
const escStr = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// A number or format that may wrap only after a slash, never inside {bulan_romawi} or a year.
export const slashWrap = (s) => escStr(s).replace(/\//g, "/<wbr>");

/* ===================== Reference data ===================== */
export const STAGES = [
  { key: "baru", label: "Baru", dot: "red" },
  { key: "dihubungi", label: "Dihubungi", dot: "yellow" },
  { key: "konsultasi", label: "Konsultasi", dot: "blue" },
  { key: "terdaftar", label: "Terdaftar", dot: "done" },
  { key: "lepas", label: "Tidak lanjut", dot: "ring" },
];
export const stageOf = (k) => STAGES.find((s) => s.key === k) || STAGES[0];
export const SOURCES = ["Placement test", "WhatsApp", "Instagram", "Datang langsung", "Rekomendasi alumni"];
export const MODES = ["Offline di Pare", "Online", "Online dan offline"];
export const SKILLS = ["Grammar", "Vocabulary", "Reading"];
export const ATTEMPT_STATUS = {
  done: { label: "Selesai", dot: "navy" },
  nocontact: { label: "Tanpa kontak", dot: "yellow" },
  progress: { label: "Sedang berjalan", dot: "blue" },
  timeout: { label: "Waktu habis", dot: "ring" },
  violation: { label: "Pelanggaran", dot: "red" },
  void: { label: "Dibatalkan", dot: "ring", muted: true },
};
export const FOCUS_TYPES = ["fullscreen_exit", "tab_hidden", "window_blur"];
export const LOG_TEXT = {
  consent: "Menyetujui syarat, kebijakan privasi, dan pernyataan kejujuran",
  start: "Tes dimulai dalam mode layar penuh",
  fullscreen_exit: "Keluar dari layar penuh",
  tab_hidden: "Pindah ke tab atau aplikasi lain",
  window_blur: "Jendela browser kehilangan fokus",
  copy_attempt: "Percobaan menyalin teks diblokir",
  shortcut_blocked: "Shortcut developer diblokir",
  submit: "Jawaban dikirim dan dinilai di server",
  audio_played: "Audio listening diputar, sekali per percobaan",
  timeout: "Waktu habis, tes dihentikan tanpa mengirim jawaban",
  violation_stop: "Batas pelanggaran tercapai, tes dihentikan tanpa mengirim jawaban",
  email_sent: "Kontak diisi dan email hasil terkirim",
  email_failed: "Kontak diisi, tetapi email hasil gagal terkirim",
  email_resent: "Email hasil dikirim ulang",
  voided: "Hasil dibatalkan",
  restored: "Hasil dipulihkan",
  speaking_uploaded: "Rekaman speaking dikirim peserta",
  speaking_student_skip: "Peserta melewati bagian speaking karena mikrofon tidak bisa dipakai",
  speaking_graded: "Speaking selesai dinilai Speechace",
  speaking_failed: "Penilaian speaking gagal, rekaman masuk antrean manual",
  speaking_manual: "Speaking dinilai manual",
  speaking_skipped: "Speaking tidak dinilai, hasil dikirim tanpa nilai speaking",
};
/* The speaking recording of a placement attempt. 'failed' and 'graded' with needsReview wait for the team. */
export const SPEAKING_STATUS = {
  pending: { label: "Menunggu penilaian", dot: "blue" },
  grading: { label: "Sedang dinilai", dot: "blue" },
  graded: { label: "Selesai dinilai", dot: "navy" },
  failed: { label: "Perlu dinilai", dot: "red" },
  manual: { label: "Nilai manual", dot: "yellow" },
  skipped: { label: "Tidak dinilai", dot: "ring", muted: true },
};
export const speakingNeedsAttention = (a) => Boolean(a.speaking && (a.speaking.status === "failed" || a.speaking.needsReview));
export const SPEAKING_ASPECTS = [["pronunciation", "Pronunciation"], ["fluency", "Fluency"], ["grammar", "Grammar"], ["vocab", "Vocabulary"], ["coherence", "Coherence"]];
export const speakingAudioUrl = (id) => `/api/admin/speaking/${encodeURIComponent(id)}/audio`;
export const TEST_META = {
  placement: { name: "Placement Test", nav: "tes-placement", who: "calon siswa" },
  pre: { name: "Pre-test", nav: "tes-pre", who: "siswa terdaftar" },
  post: { name: "Post-test", nav: "tes-post", who: "siswa terdaftar" },
  "ielts-mockup": { name: "IELTS Mockup", nav: "tes-ielts", who: "siswa undangan" },
};
export const SISWA_CHIPS = [
  ["all", "Semua"],
  ["aktif", "Aktif"],
  ["selesai", "Selesai"],
  ["lepas", "Tidak lanjut"],
];

/* ===================== Derived selectors ===================== */
export const testOf = (key) => db.tests[key];
export const levelByKey = (k) => db.levels.find((l) => l.key === k);
export function levelForScore(score) { return db.levels.find((l) => score >= l.min && score <= l.max) || db.levels[db.levels.length - 1]; }
/* The mockup bank is split into packages. The selected package drives the bank, the sections,
   the new-question target, and the position numbers; other tests have no packages. */
export const packageOf = (t) => {
  if (t.key !== "ielts-mockup") return null;
  const list = t.packages || [];
  const id = ui.package?.[t.key];
  return list.find((p) => p.id === id) || list[0] || null;
};
export const packageQuestions = (t) => {
  const pkg = packageOf(t);
  return pkg ? t.questions.filter((q) => q.packageId === pkg.id) : t.questions;
};
export const packageSections = (t) => {
  const pkg = packageOf(t);
  return pkg ? t.sections.filter((s) => s.packageId === pkg.id) : t.sections;
};
export const activeQuestions = (t) => packageQuestions(t).filter((q) => q.status === "aktif");
export const questionById = (t, id) => t.questions.find((q) => q.id === Number(id));
export function questionNumber(t, q) { const i = activeQuestions(t).indexOf(q); return i >= 0 ? i + 1 : null; }
export const studentById = (id) => db.students.find((s) => s.id === id);
export const attemptById = (id) => db.attempts.find((a) => a.id === id);
export const attemptsOf = (sid, testKey) => db.attempts.filter((a) => a.studentId === sid && (!testKey || a.test === testKey)).sort((x, y) => y.startedAt - x.startedAt);
export const latestAttemptOf = (sid, testKey) => attemptsOf(sid, testKey)[0] || null;
export const isGraded = (a) => a.status === "done" || a.status === "nocontact";
export const isSubmitted = (a) => isGraded(a) || a.status === "void";
export const latestGraded = (sid, testKey = "placement") => attemptsOf(sid, testKey).find((a) => a.status === "done");
export const lastActivityAt = (s) => s.lastActivityAt || s.createdAt;
export function testSeconds(t) { return t.settings.timeMode === "total" ? t.settings.totalSeconds : activeQuestions(t).reduce((sum, q) => sum + q.seconds, 0); }
export function attemptTotal(a) { return a.total || activeQuestions(testOf(a.test)).length; }
export const nilaiOf = (a) => (a && a.score !== null && a.score !== undefined ? Math.round((a.score / attemptTotal(a)) * 100) : null);
export const programById = (id) => db.programs.find((p) => p.id === id);
export const durationById = (p, id) => (p ? p.durations.find((d) => d.id === id) : null) || null;
export const durationOf = (s) => durationById(programById(s.programId), s.durationId);
export const periodById = (id) => db.periods.find((p) => p.id === id);
export const periodLabel = (pid) => { const p = periodById(pid); return p ? fmtDate(p.start) : "-"; };
export const classById = (id) => db.classes.find((c) => c.id === id);
export const classLabel = (c) => (c ? `${c.tutor} / ${c.code}` : "");
export const classesFor = (programId, periodId) => db.classes.filter((c) => c.programId === programId && c.periodId === periodId);
export const studentsInClass = (c) => db.students.filter((s) => s.classId === c.id);
export const periodsSorted = () => db.periods.toSorted((a, b) => a.start - b.start);
export function endOf(s) { const p = periodById(s.periodId), d = durationOf(s); return p && d ? p.start + d.days * DAY : null; }
export function periodState(p) {
  if (p.start > NOW) return { key: "soon", label: "Akan datang", dot: "blue" };
  const ends = db.students.filter((s) => s.periodId === p.id && s.stage === "terdaftar").map(endOf).filter(Boolean);
  if (!ends.length || Math.max(...ends) > NOW) return { key: "run", label: "Berjalan", dot: "navy" };
  return { key: "done", label: "Selesai", dot: "ring" };
}
export function currentPeriod() { const past = periodsSorted().filter((p) => p.start <= NOW); return past[past.length - 1] || periodsSorted()[0]; }
export const enrolledIn = (pred) => db.students.filter((s) => s.stage === "terdaftar" && pred(s)).length;

/* Question accuracy comes from the database, grouped for the last 7 and 30 days. */
export function accuracyMap(testKey, since = 0) {
  const t = testOf(testKey);
  const bucket = NOW - since <= 8 * DAY ? t.stats.d7 : t.stats.d30;
  return new Map(Object.entries(bucket || {}).map(([id, st]) => [Number(id), st]));
}

/* ===================== Leads and Database Siswa ===================== */
export const isColdLead = (s) => s.stage !== "lepas" && s.daftarCount === 0 && lastActivityAt(s) < NOW - COLD_DAYS * DAY;
export const leads = () => db.students.filter((s) => s.daftarCount === 0);
export const isRegistered = (s) => s.daftarCount > 0;
export function siswaChipOf(s) {
  if (s.stage === "lepas") return "lepas";
  return s.pendaftaranStatus === "selesai" ? "selesai" : "aktif";
}
export function studentMatches(s, f, ignoreStage) {
  if (!ignoreStage && f.stage !== "all" && siswaChipOf(s) !== f.stage) return false;
  if (f.program && s.programId !== f.program) return false;
  if (f.branch && s.branch !== f.branch) return false;
  if (f.period === "none") { if (s.periodId) return false; } else if (f.period && s.periodId !== f.period) return false;
  if (f.tutor) { const c = classById(s.classId); if (f.tutor === "none" ? c : !c || c.tutor !== f.tutor) return false; }
  if (f.level) {
    const a = latestGraded(s.id);
    if (f.level === "none") { if (a) return false; } else if (!a || a.levelKey !== f.level) return false;
  }
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const c = classById(s.classId);
    const text = `${s.name} ${s.email} ${s.city} ${c ? classLabel(c) : ""}`.toLowerCase();
    const waHit = digits.length >= 3 && (s.wa.includes(digits) || `0${s.wa.slice(2)}`.includes(digits));
    if (!text.includes(q) && !waHit) return false;
  }
  return true;
}

/* ===================== Submission filters ===================== */
export function attemptMatches(a, f, ignoreStatus) {
  if (a.test !== ui.test) return false;
  if (!ignoreStatus && f.status !== "all") {
    if (f.status === "failed") { if (a.status !== "timeout" && a.status !== "violation") return false; }
    else if (a.status !== f.status) return false;
  }
  const s = a.studentId ? studentById(a.studentId) : null;
  if (f.branch && (!s || s.branch !== f.branch)) return false;
  if (ui.test === "placement") {
    if (f.speaking === "review" && !speakingNeedsAttention(a)) return false;
    if (f.speaking === "waiting" && !(a.speaking && (a.speaking.status === "pending" || a.speaking.status === "grading"))) return false;
    if (f.level && a.levelKey !== f.level) return false;
    if (f.days !== "all" && a.startedAt < NOW - Number(f.days) * DAY) return false;
  } else {
    if (f.period && (!s || s.periodId !== f.period)) return false;
    if (f.program && (!s || s.programId !== f.program)) return false;
    if (f.result && (a.passed === null || String(a.passed) !== f.result)) return false;
  }
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const c = s ? classById(s.classId) : null;
    const text = `${s ? `${s.name} ${s.email}` : a.contactName || "tanpa nama"} ${c ? classLabel(c) : ""} ${a.id}`.toLowerCase();
    const waHit = s && digits.length >= 3 && (s.wa.includes(digits) || `0${s.wa.slice(2)}`.includes(digits));
    if (!text.includes(q) && !waHit) return false;
  }
  return true;
}

/* ===================== Certificates ===================== */
export const certTypeById = (id) => db.certs.types.find((t) => t.id === id);
export const certById = (id) => db.certs.issued.find((c) => c.id === id);
export const certTemplateOf = (key) => db.certs.templates.find((t) => t.key === key);
export const certsOfStudent = (sid) => db.certs.issued.filter((c) => c.studentId === sid);
export const certPageUrl = (id) => `/admin/certificates/${encodeURIComponent(id)}`;
export const openCertPage = (id) => window.open(certPageUrl(id), "_blank", "noopener");
export const todayIso = () => toDateInput(NOW);
/** The last number used by a type in the period of `iso`. The next certificate gets this plus one. */
export const certCounter = (type, iso, reset = type.reset) => type.counters[certPeriodKey(reset, iso)] || 0;
export const nextCertNumber = (type, iso) => formatCertNumber(type.format, certCounter(type, iso) + 1, type.code, iso);
/** The highest number already issued for a type in the period of `iso`. Nomor terakhir cannot go below it. */
export function topIssuedSeq(typeId, reset, iso) {
  const period = certPeriodKey(reset, iso);
  return db.certs.issued.reduce((top, c) => (c.typeId === typeId && c.period === period && c.seq > top ? c.seq : top), 0);
}
export const certTypeName = (c) => certTypeById(c.typeId)?.name || certTemplateOf(c.template)?.name || c.template;
export function certMatches(c, f, ignoreStatus) {
  if (!ignoreStatus && f.status !== "all" && (f.status === "batal") !== Boolean(c.revokedAt)) return false;
  if (f.type && c.typeId !== f.type) return false;
  if (f.q) {
    const s = c.studentId ? studentById(c.studentId) : null;
    if (!`${c.number} ${c.recipient} ${s ? `${s.name} ${s.email}` : ""}`.toLowerCase().includes(f.q.trim().toLowerCase())) return false;
  }
  return true;
}
/* Template fields the student record can fill in, by field key, so any template using these keys gets them. */
export function certPrefill(s) {
  if (!s) return {};
  const prog = programById(s.programId), per = periodById(s.periodId), end = endOf(s);
  return { program: prog ? prog.name : "", mulai: per ? per.startDate : "", selesai: end ? toDateInput(end) : "" };
}
/* Typed values stay. Empty fields, and fields still holding the previous student's values, take the new prefill. */
export function mergeCertValues(typed, prefill, oldPrefill = {}) {
  const out = { ...typed };
  for (const [k, v] of Object.entries(prefill)) if (!typed[k] || typed[k] === oldPrefill[k]) out[k] = v;
  return out;
}
export const levelLabel = (key) => (key && levelByKey(key) ? levelByKey(key).label : "");

/* ===================== WhatsApp message drafts ===================== */
export function greetingFor(s) {
  const intro = `Halo ${firstName(s.name)}, saya ${firstName(ME)} dari Titik Nol English Course.`;
  if (s.stage === "terdaftar" || s.stage === "lepas") return `${intro} `;
  const a = latestGraded(s.id, "placement");
  const level = a ? levelByKey(a.levelKey) : null;
  if (level) return `${intro} Terima kasih sudah mengerjakan placement test Titik Nol. Hasilnya menunjukkan level kamu ada di ${level.label}, jadi ${level.program} paling cocok untuk mulai belajar. Kalau kamu mau, saya bisa bantu jelaskan pilihan durasi dan jadwal kelas terdekat.`;
  return `${intro} Saya mau menindaklanjuti minat kamu untuk belajar bahasa Inggris di Titik Nol. Kalau berkenan, saya bisa bantu jelaskan pilihan program dan jadwal kelas terdekat.`;
}

export function testLinkText(s, key, link, expiresAt, code, packageName, packageTotal) {
  const t = testOf(key);
  const count = key === "ielts-mockup" && packageTotal ? packageTotal : activeQuestions(t).length;
  const facts = `${count} soal dan dikerjakan dalam ${fmtSpan(testSeconds(t))}`;
  const first = firstName(s.name);
  const until = expiresAt ? ` Tautan ini khusus untuk kamu dan berlaku sampai ${fmtDateLong(expiresAt)}.` : "";
  if (key === "placement") return `Halo ${first}, ini tautan placement test Titik Nol English Course:\n${link}\n\nTesnya berisi ${facts}. Setelah selesai, rekomendasi level dan program akan dikirim ke email kamu. Kerjakan di tempat yang tenang dengan koneksi internet yang stabil, ya.`;
  if (key === "ielts-mockup") return `Halo ${first}, ini tautan IELTS Mockup dari Titik Nol English Course:\n${link}\n\nKode akses kamu: ${code}\n\n${packageName ? `Paket soal kamu: ${packageName}. ` : ""}Masukkan kode itu sebelum tes dimulai. Tesnya berisi ${facts}, audio listening diputar satu kali, dan hasilnya berupa perkiraan band untuk Listening, Reading, Writing, dan Speaking. Kerjakan di tempat yang tenang dengan koneksi internet yang stabil, ya.${until}`;
  if (key === "pre") return `Halo ${first}, sebelum kelas dimulai, silakan kerjakan pre-test lewat tautan ini:\n${link}\n\nPre-test berisi ${facts}. Nilainya kami pakai sebagai titik awal untuk melihat perkembangan kamu selama program.${until}`;
  return `Halo ${first}, program kamu sudah hampir selesai. Silakan kerjakan post-test lewat tautan ini:\n${link}\n\nPost-test berisi ${facts}. Hasilnya kami pakai untuk menentukan apakah kamu sudah siap lanjut ke level berikutnya.${until}`;
}

/* ===================== CSV export ===================== */
// Cells that start with a formula character are prefixed so spreadsheet apps show them as text.
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportStudents(list) {
  downloadCsv(`database-siswa-${toDateInput(NOW)}.csv`, [
    ["ID", "Nama", "Email", "WhatsApp", "Tempat lahir", "Tanggal lahir", "Kota/Kabupaten", "Provinsi", "Kode pos", "Jenjang pendidikan", "Tahu TN dari", "Jumlah daftar", "Sumber", "Status", "Program", "Durasi", "Periode", "Tutor / Kelas", "Level placement", "Pre-test", "Post-test", "Masuk database"],
    ...list.map((s) => {
      const a = latestGraded(s.id), p = programById(s.programId), d = durationOf(s), per = periodById(s.periodId), c = classById(s.classId);
      return [s.id, s.name, s.email, fmtWa(s.wa), s.tempatLahir, s.tanggalLahir, s.city, s.provinsi, s.kodePos, s.jenjang, s.tahuDari, s.daftarCount, s.source,
        siswaChipOf(s) === "lepas" ? "Tidak lanjut" : siswaChipOf(s) === "selesai" ? "Selesai" : "Aktif",
        p ? p.name : "", d ? d.label : "", per ? fmtDate(per.start) : "", classLabel(c), a ? levelLabel(a.levelKey) : "", nilaiOf(latestGraded(s.id, "pre")) ?? "", nilaiOf(latestGraded(s.id, "post")) ?? "", fmtDateTime(s.createdAt)];
    }),
  ]);
  toast(`${list.length} baris siswa diekspor ke CSV.`);
}

export function exportAttempts(list) {
  const key = ui.test;
  const head = key === "placement"
    ? ["ID", "Nama", "Email", "WhatsApp", "Dimulai", "Status", "Skor", "Total soal", "Level", "Durasi", "Pelanggaran", "Email hasil", "Perangkat", "Negara"]
    : ["ID", "Nama", "Email", "Program", "Periode", "Tutor / Kelas", "Dimulai", "Status", "Nilai", ...(key === "post" ? ["Hasil", "Batas lulus"] : []), "Durasi", "Pelanggaran"];
  downloadCsv(`${key}-test-${toDateInput(NOW)}.csv`, [head, ...list.map((a) => {
    const s = a.studentId ? studentById(a.studentId) : null;
    const name = s ? s.name : a.contactName;
    if (key === "placement") return [a.id, name, s ? s.email : "", s ? fmtWa(s.wa) : "", fmtDateTime(a.startedAt), ATTEMPT_STATUS[a.status].label, a.score ?? "", a.score !== null ? attemptTotal(a) : "", levelLabel(a.levelKey), fmtClock(a.durationSec), a.violations, a.emailStatus === "sent" ? "Terkirim" : a.emailStatus === "failed" ? "Gagal" : "", a.device, a.country];
    const per = s ? periodById(s.periodId) : null;
    return [a.id, name, s ? s.email : "", s && programById(s.programId) ? programById(s.programId).name : "", per ? fmtDate(per.start) : "", s ? classLabel(classById(s.classId)) : "", fmtDateTime(a.startedAt), ATTEMPT_STATUS[a.status].label, nilaiOf(a) ?? "", ...(key === "post" ? [a.passed === null ? "" : a.passed ? "Lulus" : "Belum lulus", a.passScore ?? ""] : []), fmtClock(a.durationSec), a.violations];
  })]);
  toast(`${list.length} baris submission diekspor ke CSV.`);
}

/* The all-tests Submission page exports one CSV in one shape, whatever mix of tests is in it. */
export function exportAllAttempts(list) {
  downloadCsv(`submission-semua-tes-${toDateInput(NOW)}.csv`, [
    ["ID", "Nama", "Email", "WhatsApp", "Tes", "Cabang", "Dimulai", "Status", "Skor", "Nilai", "Band keseluruhan", "Level atau kelulusan", "Durasi", "Pelanggaran"],
    ...list.map((a) => {
      const s = a.studentId ? studentById(a.studentId) : null;
      return [
        a.id, s ? s.name : a.contactName, s ? s.email : "", s ? fmtWa(s.wa) : "",
        TEST_META[a.test]?.name || a.test, s?.branch ? branchLabel(s.branch) : "",
        fmtDateTime(a.startedAt), ATTEMPT_STATUS[a.status].label,
        a.test === "placement" && a.score !== null ? `${a.score} / ${attemptTotal(a)}` : "",
        a.test !== "placement" && a.test !== "ielts-mockup" && a.score !== null ? nilaiOf(a) : "",
        a.test === "ielts-mockup" ? a.bands?.overall ?? "" : "",
        a.test === "placement" ? levelLabel(a.levelKey) : a.test === "post" ? (a.passed === null ? "" : a.passed ? "Lulus" : "Belum lulus") : "",
        fmtClock(a.durationSec), a.violations,
      ];
    }),
  ]);
  toast(`${list.length} baris submission diekspor ke CSV.`);
}

export function exportLeads() {
  const list = leads().sort((a, b) => lastActivityAt(b) - lastActivityAt(a));
  downloadCsv(`lead-placement-${toDateInput(NOW)}.csv`, [
    ["Nama", "Email", "WhatsApp", "Kota", "Sumber", "Status tindak lanjut", "Skor placement", "Level", "Tes terakhir", "Dingin", "Masuk database"],
    ...list.map((s) => {
      const a = latestGraded(s.id, "placement");
      return [s.name, s.email, fmtWa(s.wa), s.city, s.source, stageOf(s.stage).label,
        a ? a.score : "", a ? levelLabel(a.levelKey) : "", a ? fmtDateTime(a.startedAt) : "",
        isColdLead(s) ? "Ya" : "", fmtDateTime(s.createdAt)];
    }),
  ]);
  toast(`${list.length} lead diekspor ke CSV.`);
}
