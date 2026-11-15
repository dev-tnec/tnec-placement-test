// TNEC internal dashboard client.
// Views come from the approved prototype. Data comes from /api/admin/bootstrap and every change
// goes through the admin API, after which the data is reloaded so the screen matches D1.

/* ===================== Core helpers ===================== */
let NOW = Date.now();
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR, WIB = 7 * HOUR;
let ME = "";
const PAGE_SIZE = 15;
const KEYS = ["A", "B", "C", "D"];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const main = document.getElementById("main");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (name, cls = "") => `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
const pad = (n) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function dp(ts) { const d = new Date(ts + WIB); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), i: d.getUTCMinutes(), s: d.getUTCSeconds() }; }
function fmtDate(ts) { const p = dp(ts); return `${p.d} ${MONTHS[p.m]} ${p.y}`; }
function fmtDateLong(ts) { const p = dp(ts); return `${p.d} ${MONTHS_LONG[p.m]} ${p.y}`; }
function fmtTime(ts, withSec) { const p = dp(ts); return `${pad(p.h)}.${pad(p.i)}${withSec ? "." + pad(p.s) : ""}`; }
function fmtDateTime(ts) { const p = dp(ts), n = dp(NOW); return `${p.d} ${MONTHS[p.m]}${p.y === n.y ? "" : " " + p.y}, ${fmtTime(ts)}`; }
function dayNumber(ts) { const p = dp(ts); return Math.round(Date.UTC(p.y, p.m, p.d) / DAY); }
function fmtRelative(ts) {
  const diff = NOW - ts;
  if (diff < 2 * MIN) return "baru saja";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} menit lalu`;
  const days = dayNumber(NOW) - dayNumber(ts);
  if (days <= 0) return `${Math.floor(diff / HOUR)} jam lalu`;
  if (days === 1) return "kemarin";
  if (days < 7) return `${days} hari lalu`;
  return fmtDate(ts);
}
const fmtClock = (sec) => `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
function fmtSpan(sec) { const m = Math.floor(sec / 60), s = sec % 60; if (!m) return `${s} detik`; return s ? `${m} menit ${s} detik` : `${m} menit`; }
const fmtNum = (n, digits = 0) => Number(n).toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtRp = (n) => (n ? `Rp ${fmtNum(n)}` : "");
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
function fmtWa(wa) { if (!wa) return ""; const local = "0" + String(wa).replace(/^62/, ""); return local.replace(/^(\d{4})(\d{4})(\d+)$/, "$1 $2 $3"); }
function normalizeWa(v) { let d = String(v).replace(/\D/g, ""); if (d.startsWith("0")) d = "62" + d.slice(1); else if (d.startsWith("8")) d = "62" + d; return d; }
function initials(name) { return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(""); }
const firstName = (name) => String(name).split(/\s+/)[0];
function joinWords(list) { if (list.length <= 1) return list.join(""); if (list.length === 2) return `${list[0]} dan ${list[1]}`; return `${list.slice(0, -1).join(", ")}, dan ${list[list.length - 1]}`; }
function toDateInput(ts) { if (!ts) return ""; const p = dp(ts); return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`; }
function fromDateInput(v) { return v ? Date.parse(`${v}T08:00:00+07:00`) : null; }

/* API calls. A 401 means the session ended, so the browser goes back to the login page. */
async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (response.status === 401) { window.location.assign("/admin/login"); throw new Error("Sesi berakhir."); }
  if (!response.ok) { const err = new Error(data?.error || "Permintaan gagal diproses. Coba lagi."); err.field = data?.field; err.status = response.status; throw err; }
  return data;
}

/* Runs a change, reloads the data, and redraws. Errors become a toast. */
async function mutate(work, success) {
  try {
    const result = await work();
    await loadData();
    render();
    if (success) toast(typeof success === "function" ? success(result) : success);
    return result;
  } catch (error) {
    if (error.message !== "Sesi berakhir.") toast(error.message);
    return null;
  }
}

/* ===================== Reference data ===================== */
const STAGES = [
  { key: "baru", label: "Baru", dot: "red" },
  { key: "dihubungi", label: "Dihubungi", dot: "yellow" },
  { key: "konsultasi", label: "Konsultasi", dot: "blue" },
  { key: "terdaftar", label: "Terdaftar", dot: "done" },
  { key: "lepas", label: "Tidak lanjut", dot: "ring" },
];
const stageOf = (k) => STAGES.find((s) => s.key === k) || STAGES[0];
const SOURCES = ["Placement test", "WhatsApp", "Instagram", "Datang langsung", "Rekomendasi alumni"];
const MODES = ["Offline di Pare", "Online", "Online dan offline"];
const SKILLS = ["Grammar", "Vocabulary", "Reading"];
const ATTEMPT_STATUS = {
  done: { label: "Selesai", dot: "navy" },
  nocontact: { label: "Tanpa kontak", dot: "yellow" },
  progress: { label: "Sedang berjalan", dot: "blue" },
  timeout: { label: "Waktu habis", dot: "ring" },
  violation: { label: "Pelanggaran", dot: "red" },
  void: { label: "Dibatalkan", dot: "ring", muted: true },
};
const FOCUS_TYPES = ["fullscreen_exit", "tab_hidden", "window_blur"];
const LOG_TEXT = {
  consent: "Menyetujui syarat, kebijakan privasi, dan pernyataan kejujuran",
  start: "Tes dimulai dalam mode layar penuh",
  fullscreen_exit: "Keluar dari layar penuh",
  tab_hidden: "Pindah ke tab atau aplikasi lain",
  window_blur: "Jendela browser kehilangan fokus",
  copy_attempt: "Percobaan menyalin teks diblokir",
  shortcut_blocked: "Shortcut developer diblokir",
  submit: "Jawaban dikirim dan dinilai di server",
  timeout: "Waktu habis, tes dihentikan tanpa mengirim jawaban",
  violation_stop: "Batas pelanggaran tercapai, tes dihentikan tanpa mengirim jawaban",
  email_sent: "Kontak diisi dan email hasil terkirim",
  email_failed: "Kontak diisi, tetapi email hasil gagal terkirim",
  email_resent: "Email hasil dikirim ulang",
  voided: "Hasil dibatalkan",
  restored: "Hasil dipulihkan",
};
const TEST_META = {
  placement: { name: "Placement Test", nav: "tes-placement", who: "calon siswa", purpose: "Tes untuk calon siswa. Hasilnya dipakai untuk merekomendasikan level dan program yang paling cocok." },
  pre: { name: "Pre-test", nav: "tes-pre", who: "siswa terdaftar", purpose: "Tes untuk siswa terdaftar sebelum kelas dimulai. Nilainya menjadi titik awal untuk melihat perkembangan siswa selama program." },
  post: { name: "Post-test", nav: "tes-post", who: "siswa terdaftar", purpose: "Tes di akhir program. Hasilnya menentukan apakah siswa bisa lanjut ke level berikutnya atau perlu mengulang level yang sama." },
};
const TEST_KEYS = ["placement", "pre", "post"];

/* ===================== Database (loaded from D1) ===================== */
const db = { tests: {}, levels: [], programs: [], tutors: [], tutorIds: new Map(), periods: [], classes: [], students: [], attempts: [], enrolledAt: [], publicUrl: location.origin, whatsapp: { configured: false } };
let dataReady = false;
// Detail caches keep the last loaded copy while a fresh copy loads, so pages do not flicker after a change.
const studentDetails = new Map();
const attemptDetails = new Map();

async function loadData() {
  const data = await api("/api/admin/bootstrap");
  NOW = data.now || Date.now();
  ME = data.me.name;
  db.me = data.me;
  db.publicUrl = data.publicUrl;
  db.whatsapp = data.whatsapp;
  db.levels = data.levels;
  db.tests = Object.fromEntries(TEST_KEYS.map((k) => [k, { key: k, settings: data.tests[k].settings, questions: data.tests[k].questions, stats: data.tests[k].stats }]));
  db.students = data.students;
  db.attempts = data.attempts;
  db.enrolledAt = data.enrolledAt;
  db.programs = data.catalog.programs;
  db.tutors = data.catalog.tutors.map((t) => t.name);
  db.tutorIds = new Map(data.catalog.tutors.map((t) => [t.name, t.id]));
  db.periods = data.catalog.periods;
  db.classes = data.catalog.classes;
  for (const entry of studentDetails.values()) entry.stale = true;
  for (const entry of attemptDetails.values()) entry.stale = true;
  dataReady = true;
  $("#account-name").textContent = db.me.name;
  $("#account-role").textContent = db.me.role === "pendidikan" ? "Tim pendidikan" : "Admin";
  $("#account-avatar").textContent = initials(db.me.name);
}

const testOf = (key) => db.tests[key];
const levelByKey = (k) => db.levels.find((l) => l.key === k);
function levelForScore(score) { return db.levels.find((l) => score >= l.min && score <= l.max) || db.levels[db.levels.length - 1]; }
const activeQuestions = (t) => t.questions.filter((q) => q.status === "aktif");
const questionById = (t, id) => t.questions.find((q) => q.id === Number(id));
function questionNumber(t, q) { const i = activeQuestions(t).indexOf(q); return i >= 0 ? i + 1 : null; }
const studentById = (id) => db.students.find((s) => s.id === id);
const attemptById = (id) => db.attempts.find((a) => a.id === id);
const attemptsOf = (sid, testKey) => db.attempts.filter((a) => a.studentId === sid && (!testKey || a.test === testKey)).sort((x, y) => y.startedAt - x.startedAt);
const isGraded = (a) => a.status === "done" || a.status === "nocontact";
const isSubmitted = (a) => isGraded(a) || a.status === "void";
const latestGraded = (sid, testKey = "placement") => attemptsOf(sid, testKey).find((a) => a.status === "done");
const lastActivityAt = (s) => s.lastActivityAt || s.createdAt;
function testSeconds(t) { return t.settings.timeMode === "total" ? t.settings.totalSeconds : activeQuestions(t).reduce((sum, q) => sum + q.seconds, 0); }
function attemptTotal(a) { return a.total || activeQuestions(testOf(a.test)).length; }
const nilaiOf = (a) => (a && a.score !== null && a.score !== undefined ? Math.round((a.score / attemptTotal(a)) * 100) : null);
const programById = (id) => db.programs.find((p) => p.id === id);
const durationById = (p, id) => (p ? p.durations.find((d) => d.id === id) : null) || null;
const durationOf = (s) => durationById(programById(s.programId), s.durationId);
const periodById = (id) => db.periods.find((p) => p.id === id);
const classById = (id) => db.classes.find((c) => c.id === id);
const classLabel = (c) => (c ? `${c.tutor} / ${c.code}` : "");
const classesFor = (programId, periodId) => db.classes.filter((c) => c.programId === programId && c.periodId === periodId);
const studentsInClass = (c) => db.students.filter((s) => s.classId === c.id);
const periodsSorted = () => [...db.periods].sort((a, b) => a.start - b.start);
function endOf(s) { const p = periodById(s.periodId), d = durationOf(s); return p && d ? p.start + d.days * DAY : null; }
function periodState(p) {
  if (p.start > NOW) return { key: "soon", label: "Akan datang", dot: "blue" };
  const ends = db.students.filter((s) => s.periodId === p.id && s.stage === "terdaftar").map(endOf).filter(Boolean);
  if (!ends.length || Math.max(...ends) > NOW) return { key: "run", label: "Berjalan", dot: "navy" };
  return { key: "done", label: "Selesai", dot: "ring" };
}
function currentPeriod() { const past = periodsSorted().filter((p) => p.start <= NOW); return past[past.length - 1] || periodsSorted()[0]; }

/* Question accuracy comes from D1, grouped for the last 7 and 30 days. */
function accuracyMap(testKey, since = 0) {
  const t = testOf(testKey);
  const bucket = NOW - since <= 8 * DAY ? t.stats.d7 : t.stats.d30;
  return new Map(Object.entries(bucket || {}).map(([id, st]) => [Number(id), st]));
}

/* Loads one detail record into a cache. Returns the cached copy, or null on the first load. */
function loadDetail(cache, key, url, shape, isCurrent) {
  const entry = cache.get(key);
  if (entry && !entry.stale) return entry.data;
  const slot = entry || { data: null, stale: true, loading: false };
  if (!slot.loading) {
    slot.loading = true;
    cache.set(key, slot);
    api(url).then((raw) => {
      cache.set(key, { data: shape(raw), stale: false, loading: false });
      if (isCurrent()) render();
    }).catch((error) => {
      slot.loading = false;
      if (error.message !== "Sesi berakhir.") toast(error.message);
    });
  }
  return slot.data;
}

/* Student activities load when a record page opens. Null means the first load is still running. */
function studentFeed(id) {
  const d = loadDetail(studentDetails, id, `/api/admin/students/${encodeURIComponent(id)}`, (raw) => raw,
    () => route().parts[0] === "siswa" && route().parts[1] === id);
  return d ? d.activities : null;
}

/* Answers and the system log load when a submission page opens. */
function withDetail(a) {
  if (!a) return a;
  const d = loadDetail(attemptDetails, a.id, `/api/admin/attempts/${a.id}`,
    (raw) => ({ answers: raw.answers, log: raw.log, device: raw.device, country: raw.country, consent: raw.consent }),
    () => route().parts[3] === a.id);
  return d ? { ...a, ...d, loading: false } : { ...a, answers: null, log: null, consent: "", loading: true };
}

/* ===================== UI state ===================== */
const attemptFilter = (days) => ({ q: "", status: "all", level: "", days, period: "", program: "", result: "", page: 1, selected: new Set() });
const ui = {
  period: 7,
  test: "placement",
  students: { q: "", stage: "all", level: "", program: "", period: "", tutor: "", sort: "activity", dir: "desc", page: 1, selected: new Set() },
  questions: { placement: { q: "", skill: "all" }, pre: { q: "", skill: "all" }, post: { q: "", skill: "all" } },
  attempts: { placement: attemptFilter("30"), pre: attemptFilter("all"), post: attemptFilter("all") },
  classes: { period: "", program: "" },
  answers: "all",
  lastPath: null,
};
const T = () => testOf(ui.test);


/* ===================== Shared render pieces ===================== */
function dotHtml(kind) { return kind === "done" ? icon("check-circle", "status__icon") : `<span class="dot dot--${kind}" aria-hidden="true"></span>`; }
function statusHtml(label, kind, muted) { return `<span class="status${muted ? " status--muted" : ""}">${dotHtml(kind)}${esc(label)}</span>`; }
const stageHtml = (key) => { const s = stageOf(key); return statusHtml(s.label, s.dot, key === "lepas"); };
const attemptStatusHtml = (a) => { const s = ATTEMPT_STATUS[a.status]; return statusHtml(s.label, s.dot, s.muted); };
const passHtml = (a) => (a.passed === null ? `<span class="muted">Tidak ada</span>` : a.passed ? statusHtml("Lulus", "done") : statusHtml("Belum lulus", "red"));
const personHtml = (name, text) => `<span class="person"><span class="avatar avatar--xs" aria-hidden="true">${esc(initials(name))}</span>${esc(text)}</span>`;
const classCell = (s) => { const c = classById(s.classId); return c ? personHtml(c.tutor, classLabel(c)) : `<span class="muted nowrap">Belum ada kelas</span>`; };
const programCell = (s) => { const p = programById(s.programId), d = durationOf(s); return p ? `${esc(p.name)}<span class="cell-sub">${esc(d ? d.label : "Durasi belum dipilih")}</span>` : `<span class="muted">Belum dipilih</span>`; };
const periodCell = (s) => { const p = periodById(s.periodId); return p ? `<span class="nowrap">${esc(fmtDate(p.start))}</span>` : `<span class="muted nowrap">Belum ditentukan</span>`; };
const options = (list, current) => list.map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(current) ? " selected" : ""}>${esc(label)}</option>`).join("");
const chip = (action, value, label, n, pressed) => `<button class="chip" type="button" data-action="${action}" data-value="${esc(value)}" aria-pressed="${pressed}">${esc(label)}${n === null ? "" : ` <span class="chip__n">${n}</span>`}</button>`;
const periodOptions = (first) => [["", first], ...periodsSorted().map((p) => [p.id, `${fmtDate(p.start)}${p.start > NOW ? ", akan datang" : ""}`])];
const programOptions = (first, onlyActive) => [["", first], ...db.programs.filter((p) => !onlyActive || p.status === "aktif").map((p) => [p.id, p.name])];

function pageHead({ crumbs = null, title, desc = "", actions = "", lead = "" }) {
  const crumbHtml = crumbs
    ? `<nav class="crumbs" aria-label="Lokasi halaman">${crumbs.map((c, i) => (i < crumbs.length - 1 ? `<a href="${c[1]}">${esc(c[0])}</a>${icon("chevron-right", "icon--sm")}` : `<span aria-current="page">${esc(c[0])}</span>`)).join("")}</nav>`
    : "";
  return `${crumbHtml}<header class="page-head">
    <div class="${lead ? "record" : "page-head__text"}">${lead}<div class="page-head__text"><h1 class="page-title" tabindex="-1">${esc(title)}</h1>${desc}</div></div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ""}
  </header>`;
}

function emptyHtml(title, desc, action = "") {
  return `<div class="empty"><p class="empty__title">${esc(title)}</p><p class="empty__desc">${esc(desc)}</p>${action}</div>`;
}

function pagerHtml(scope, page, total, noun) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0, to = Math.min(total, page * PAGE_SIZE);
  return `<div class="panel__foot">
    <span>Menampilkan ${from} sampai ${to} dari ${total} ${noun}</span>
    <span class="row-actions">
      <span>Halaman ${page} dari ${pages}</span>
      <button class="btn btn--quiet btn--sm" type="button" data-action="page" data-scope="${scope}" data-value="${page - 1}" ${page <= 1 ? "disabled" : ""}>Sebelumnya</button>
      <button class="btn btn--quiet btn--sm" type="button" data-action="page" data-scope="${scope}" data-value="${page + 1}" ${page >= pages ? "disabled" : ""}>Berikutnya</button>
    </span>
  </div>`;
}

function levelCell(s) {
  const a = latestGraded(s.id);
  if (!a) return `<span class="muted nowrap">Belum tes</span>`;
  const l = levelByKey(a.levelKey);
  return `${esc(l ? l.label : a.levelKey)}<span class="cell-sub tnum">${a.score} dari ${attemptTotal(a)}</span>`;
}

function sortHeader(scope, key, label, current, dir, cls = "") {
  const active = current === key;
  const aria = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  return `<th scope="col" class="${cls}" aria-sort="${aria}"><button class="sort" type="button" data-action="sort" data-scope="${scope}" data-value="${key}">${esc(label)}${icon(active ? (dir === "asc" ? "chevron-up" : "chevron-down") : "sort")}</button></th>`;
}

function applyWidths(root = document) { $$("[data-w]", root).forEach((el) => { el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.w)))}%`; }); }


/* ===================== View: Ringkasan ===================== */
function viewOverview() {
  const P = ui.period;
  const since = NOW - P * DAY, prevSince = since - P * DAY;
  const placement = testOf("placement");
  const own = db.attempts.filter((a) => a.test === "placement");
  const cur = own.filter((a) => a.startedAt >= since);
  const prev = own.filter((a) => a.startedAt >= prevSince && a.startedAt < since);
  const submitted = cur.filter(isSubmitted).length, submittedPrev = prev.filter(isSubmitted).length;
  const graded = cur.filter(isGraded);
  const timeouts = cur.filter((a) => a.status === "timeout").length;
  const stopped = cur.filter((a) => a.status === "violation").length;
  const avg = graded.length ? graded.reduce((sum, a) => sum + a.score, 0) / graded.length : 0;
  const levelCounts = db.levels.map((l) => ({ level: l, n: graded.filter((a) => a.levelKey === l.key).length }));
  const peak = levelCounts.reduce((b, c) => (c.n > b.n ? c : b), levelCounts[0]);
  const maxLevel = Math.max(1, peak.n);
  const enrolled = db.enrolledAt.filter((at) => at >= since).length;
  const newLeads = db.students.filter((s) => s.createdAt >= since).length;
  const diff = submitted - submittedPrev;
  const deltaText = diff === 0 ? `sama dengan ${P} hari sebelumnya` : `${diff > 0 ? "naik" : "turun"} ${Math.abs(diff)} dibanding ${P} hari sebelumnya`;
  const stopText = timeouts + stopped === 0 ? "tidak ada tes yang berhenti di tengah jalan" : `${timeouts} berhenti karena waktu habis dan ${stopped} karena pelanggaran`;
  const queue = db.students.filter((s) => s.stage === "baru").sort((a, b) => a.createdAt - b.createdAt);
  const stats = accuracyMap("placement", since);
  const hardest = activeQuestions(placement).map((q) => ({ q, st: stats.get(q.id) })).filter((x) => x.st && x.st.n >= 5)
    .sort((a, b) => a.st.correct / a.st.n - b.st.correct / b.st.n).slice(0, 5);
  const stat = (label, value, note) => `<div class="stat"><p class="stat__label">${esc(label)}</p><p class="stat__value">${value}</p><p class="stat__note">${esc(note)}</p></div>`;

  const queueRows = queue.slice(0, 6).map((s) => {
    const days = Math.floor((NOW - s.createdAt) / DAY);
    const p = programById(s.programId);
    return `<tr data-href="#/siswa/${s.id}">
      <td><a class="cell-main" href="#/siswa/${s.id}">${esc(s.name)}</a><span class="cell-sub">${esc(s.city)}, ${esc(fmtWa(s.wa))}</span></td>
      <td>${levelCell(s)}</td>
      <td class="hide-md">${p ? esc(p.name) : `<span class="muted">Belum dipilih</span>`}<span class="cell-sub">${esc(p ? p.mode : "")}</span></td>
      <td><span class="${days >= 2 ? "is-late" : ""}">${days < 1 ? "Hari ini" : `${days} hari`}</span><span class="cell-sub">sejak ${esc(fmtDateTime(s.createdAt))}</span></td>
      <td class="hide-lg">${esc(s.source)}</td>
      <td class="is-action"><span class="row-actions">
        <button class="icon-btn" type="button" data-action="wa" data-id="${s.id}" aria-label="Chat WhatsApp ${esc(s.name)}" title="Chat WhatsApp">${icon("message")}</button>
        <button class="btn btn--quiet btn--sm" type="button" data-action="mark-contacted" data-id="${s.id}">Tandai dihubungi</button>
      </span></td>
    </tr>`;
  }).join("");

  main.innerHTML = `
    ${pageHead({
      title: "Ringkasan",
      desc: `<p class="page-desc">Kondisi placement test dan calon siswa yang perlu ditindaklanjuti dalam ${P} hari terakhir, sampai ${esc(fmtDateLong(NOW))}.</p>`,
      actions: `<div class="seg seg--sm" role="group" aria-label="Periode data">
        <button class="seg__item" type="button" data-action="period" data-value="7" aria-pressed="${P === 7}">7 hari</button>
        <button class="seg__item" type="button" data-action="period" data-value="30" aria-pressed="${P === 30}">30 hari</button>
      </div>`,
    })}
    <div class="stack">
      <section class="panel" aria-label="Angka utama">
        <div class="stats">
          ${stat("Submission placement test", fmtNum(submitted), deltaText)}
          ${stat("Tingkat selesai", `${pct(submitted, cur.length)}%`, stopText)}
          ${stat("Skor rata-rata", `${fmtNum(avg, 1)}<small> / ${activeQuestions(placement).length}</small>`, graded.length ? `level terbanyak ${peak.level.label}` : "belum ada tes yang dinilai")}
          ${stat("Siswa terdaftar", fmtNum(enrolled), `dari ${newLeads} calon siswa baru`)}
        </div>
      </section>

      <section class="panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">Perlu dihubungi <span class="count-pill">${queue.length}</span></h2>
            <p class="panel__desc">Calon siswa berstatus Baru, diurutkan dari yang paling lama menunggu. Tandai setelah menghubungi supaya tidak ada yang dihubungi dua kali.</p>
          </div>
          <a class="btn btn--quiet btn--sm" href="#/siswa?status=baru">Buka di Database Siswa</a>
        </header>
        ${queue.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th scope="col">Calon siswa</th><th scope="col">Hasil placement</th><th scope="col" class="hide-md">Program diminati</th><th scope="col">Menunggu</th><th scope="col" class="hide-lg">Sumber</th><th scope="col" class="is-action"><span class="sr-only">Aksi</span></th></tr></thead>
          <tbody>${queueRows}</tbody></table></div>
          ${queue.length > 6 ? `<div class="panel__foot"><span>${queue.length - 6} calon siswa lain masih menunggu.</span><a class="link-btn" href="#/siswa?status=baru">Lihat semuanya</a></div>` : ""}`
          : emptyHtml("Semua calon siswa baru sudah dihubungi.", "Calon siswa yang baru mengisi kontak setelah placement test akan muncul di sini.")}
      </section>

      <div class="grid-2">
        <section class="panel">
          <header class="panel__head"><div>
            <h2 class="panel__title">Sebaran level placement</h2>
            <p class="panel__desc">Dari ${graded.length} submission placement test yang dinilai dalam ${P} hari terakhir.</p>
          </div></header>
          ${graded.length ? `<ul class="dist">${levelCounts.map((c) => `<li class="dist__row">
            <span class="dist__name">${esc(c.level.label)}<span class="cell-sub">skor ${c.level.min} sampai ${c.level.max}</span></span>
            <span class="bar" aria-hidden="true"><span class="bar__fill${c === peak ? " is-peak" : ""}" data-w="${(c.n / maxLevel) * 100}"></span></span>
            <span class="dist__val">${c.n}<span class="cell-sub">${pct(c.n, graded.length)}%</span></span>
          </li>`).join("")}</ul>` : emptyHtml("Belum ada submission dalam periode ini.", "Coba lihat periode 30 hari.")}
        </section>

        <section class="panel">
          <header class="panel__head">
            <div>
              <h2 class="panel__title">Soal placement yang paling sering salah</h2>
              <p class="panel__desc">Persentase jawaban benar dalam ${P} hari terakhir. Soal dengan angka di bawah 35% sebaiknya ditinjau ulang oleh tim pendidikan.</p>
            </div>
            <a class="btn btn--quiet btn--sm" href="#/tes/placement/soal">Buka bank soal</a>
          </header>
          ${hardest.length ? `<ul class="dist">${hardest.map(({ q, st }) => {
            const p = pct(st.correct, st.n);
            return `<li class="dist__row dist__row--q">
              <span class="dist__name">Soal ${questionNumber(placement, q)}<span class="cell-sub clamp-1">${esc(q.prompt)}</span></span>
              <span class="bar" aria-hidden="true"><span class="bar__fill${p < 35 ? " is-low" : ""}" data-w="${p}"></span></span>
              <span class="dist__val">${p}%<span class="cell-sub">${st.correct} dari ${st.n}</span></span>
              <button class="link-btn" type="button" data-action="edit-question" data-test="placement" data-id="${q.id}">Tinjau</button>
            </li>`;
          }).join("")}</ul>` : emptyHtml("Datanya belum cukup.", "Persentase muncul setelah satu soal dijawab minimal 5 peserta dalam periode ini.")}
        </section>
      </div>
    </div>`;
  return "Ringkasan";
}


/* ===================== View: Database Siswa ===================== */
function studentMatches(s, f, ignoreStage) {
  if (!ignoreStage && f.stage !== "all" && s.stage !== f.stage) return false;
  if (f.program && s.programId !== f.program) return false;
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

function viewStudents(params) {
  const f = ui.students;
  const st = params.get("status");
  if (st && (st === "all" || STAGES.some((s) => s.key === st))) { f.stage = st; f.page = 1; history.replaceState(null, "", "#/siswa"); }
  const per = params.get("periode");
  if (per && periodById(per)) { Object.assign(f, { period: per, stage: "terdaftar", page: 1 }); history.replaceState(null, "", "#/siswa"); }
  main.innerHTML = `
    ${pageHead({
      title: "Database Siswa",
      desc: `<p class="page-desc">Semua calon siswa dan siswa terdaftar. Peserta placement test masuk otomatis setelah mengisi kontak, sedangkan yang datang lewat WhatsApp, Instagram, atau langsung ke kantor bisa ditambahkan manual.</p>`,
      actions: `<button class="btn btn--quiet" type="button" data-action="export-students">${icon("download")}Ekspor CSV</button>
        <button class="btn btn--primary" type="button" data-action="new-student">${icon("plus")}Tambah siswa</button>`,
    })}
    <section class="panel">
      <div class="toolbar"><div class="chips" id="students-chips" role="group" aria-label="Saring status"></div></div>
      <div class="toolbar toolbar--last">
        <label class="search"><span class="sr-only">Cari siswa</span>${icon("search")}<input class="input" type="search" data-input="students-q" placeholder="Cari nama, email, WhatsApp, atau kelas" value="${esc(f.q)}" autocomplete="off"></label>
        <select class="select select--auto" data-change="students-period" aria-label="Saring periode">${options([...periodOptions("Semua periode"), ["none", "Belum ditentukan"]], f.period)}</select>
        <select class="select select--auto" data-change="students-program" aria-label="Saring program">${options(programOptions("Semua program"), f.program)}</select>
        <select class="select select--auto hide-sm" data-change="students-tutor" aria-label="Saring tutor">${options([["", "Semua tutor"], ["none", "Belum ada kelas"], ...db.tutors.map((t) => [t, t])], f.tutor)}</select>
        <select class="select select--auto hide-sm" data-change="students-level" aria-label="Saring level placement">${options([["", "Semua level"], ["none", "Belum tes"], ...db.levels.map((l) => [l.key, l.label])], f.level)}</select>
        <button class="link-btn" type="button" data-action="students-reset" id="students-reset">Hapus filter</button>
      </div>
      <div id="students-results"></div>
    </section>`;
  renderStudentsResults();
  return "Database Siswa";
}

function renderStudentsResults() {
  const f = ui.students;
  const box = $("#students-results");
  if (!box) return;
  const base = db.students.filter((s) => studentMatches(s, f, true));
  const counts = { all: base.length };
  STAGES.forEach((st) => { counts[st.key] = base.filter((s) => s.stage === st.key).length; });
  $("#students-chips").innerHTML = [["all", "Semua"], ...STAGES.map((s) => [s.key, s.label])].map(([k, label]) => chip("students-stage", k, label, counts[k], f.stage === k)).join("");
  $("#students-reset").hidden = !(f.q || f.level || f.program || f.period || f.tutor || f.stage !== "all");

  const last = new Map(db.students.map((s) => [s.id, lastActivityAt(s)]));
  const score = new Map(db.students.map((s) => [s.id, latestGraded(s.id)?.score ?? -1]));
  const sorters = {
    name: (a, b) => a.name.localeCompare(b.name, "id"),
    score: (a, b) => score.get(a.id) - score.get(b.id),
    activity: (a, b) => last.get(a.id) - last.get(b.id),
    period: (a, b) => (periodById(a.periodId)?.start || 0) - (periodById(b.periodId)?.start || 0),
  };
  const rows = (f.stage === "all" ? base : base.filter((s) => s.stage === f.stage)).sort((a, b) => sorters[f.sort](a, b) * (f.dir === "asc" ? 1 : -1));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  f.page = Math.min(Math.max(1, f.page), pages);
  const pageRows = rows.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE);
  const allOnPage = pageRows.length > 0 && pageRows.every((s) => f.selected.has(s.id));

  box.innerHTML = rows.length ? `<div class="table-wrap"><table class="table">
    <caption class="sr-only">Daftar siswa</caption>
    <thead><tr>
      <th scope="col" class="is-check"><input type="checkbox" data-change="select-page" data-scope="students" aria-label="Pilih semua siswa di halaman ini" ${allOnPage ? "checked" : ""}></th>
      ${sortHeader("students", "name", "Siswa", f.sort, f.dir)}
      <th scope="col" class="hide-xl">WhatsApp</th>
      <th scope="col">Program</th>
      ${sortHeader("students", "period", "Periode", f.sort, f.dir, "hide-md")}
      <th scope="col" class="hide-tab">Tutor / Kelas</th>
      ${sortHeader("students", "score", "Level", f.sort, f.dir, "hide-lg")}
      <th scope="col">Status</th>
      ${sortHeader("students", "activity", "Aktivitas terakhir", f.sort, f.dir, "is-wrap hide-tab")}
      <th scope="col" class="is-action hide-xl"><span class="sr-only">Buka</span></th>
    </tr></thead>
    <tbody>${pageRows.map((s) => `<tr data-href="#/siswa/${s.id}" class="${f.selected.has(s.id) ? "is-selected" : ""}">
      <td class="is-check"><input type="checkbox" data-change="select-row" data-scope="students" value="${s.id}" aria-label="Pilih ${esc(s.name)}" ${f.selected.has(s.id) ? "checked" : ""}></td>
      <td><a class="cell-main" href="#/siswa/${s.id}">${esc(s.name)}</a><span class="cell-sub cell-ellipsis">${esc(s.email)}</span></td>
      <td class="hide-xl tnum nowrap">${esc(fmtWa(s.wa))}</td>
      <td>${programCell(s)}</td>
      <td class="hide-md">${periodCell(s)}</td>
      <td class="hide-tab">${classCell(s)}</td>
      <td class="hide-lg">${levelCell(s)}</td>
      <td>${stageHtml(s.stage)}</td>
      <td class="hide-tab">${esc(fmtRelative(last.get(s.id)))}</td>
      <td class="is-action chev hide-xl">${icon("chevron-right")}</td>
    </tr>`).join("")}</tbody></table></div>
    ${pagerHtml("students", f.page, rows.length, "siswa")}`
    : emptyHtml("Tidak ada siswa yang cocok dengan pencarian ini.", "Coba kata kunci lain atau hapus filter yang sedang aktif.", `<button class="btn btn--quiet btn--sm" type="button" data-action="students-reset">Hapus filter</button>`);
  updateBulkBar();
}

/* ===================== View: student record (full page) ===================== */
const FEED_ICON = { system: "user", test: "clipboard", email: "mail", stage: "flag", note: "note", wa: "message", void: "ban", class: "layers" };

function resultCell(a) {
  if (a.score === null) return `<span class="muted">Tidak dinilai</span>`;
  if (a.test === "placement") return `<strong class="tnum">${a.score}</strong><span class="muted tnum"> / ${attemptTotal(a)}</span>`;
  return `<strong class="tnum">${nilaiOf(a)}</strong><span class="muted"> nilai</span>`;
}
function outcomeCell(a) {
  if (a.test === "placement") { const l = a.levelKey ? levelByKey(a.levelKey) : null; return l ? esc(l.label) : `<span class="muted">Tidak ada</span>`; }
  if (a.test === "post") return passHtml(a);
  return a.score === null ? `<span class="muted">Tidak ada</span>` : `<span class="muted">Nilai awal</span>`;
}

function viewStudent(id) {
  const s = studentById(id);
  if (!s) {
    main.innerHTML = `${pageHead({ crumbs: [["Database Siswa", "#/siswa"], ["Tidak ditemukan", ""]], title: "Siswa tidak ditemukan" })}
      <section class="panel">${emptyHtml("Data siswa ini sudah dihapus atau tautannya salah.", "Kembali ke Database Siswa untuk mencari dengan nama atau nomor WhatsApp.", `<a class="btn btn--quiet btn--sm" href="#/siswa">Kembali ke Database Siswa</a>`)}</section>`;
    return "Siswa tidak ditemukan";
  }
  const placement = latestGraded(s.id, "placement");
  const level = placement ? levelByKey(placement.levelKey) : null;
  const pre = latestGraded(s.id, "pre"), post = latestGraded(s.id, "post");
  const attempts = attemptsOf(s.id);
  const feedData = studentFeed(s.id);
  const feed = feedData || [];
  const prog = programById(s.programId), dur = durationOf(s), per = periodById(s.periodId), cls = classById(s.classId);
  const end = endOf(s);
  const choices = prog && per ? classesFor(prog.id, per.id) : [];
  const classSelect = prog && per
    ? `<select class="select" id="rec-class" data-change="student-class" data-id="${s.id}">${options([["", choices.length ? "Belum ada kelas" : "Belum ada kelas untuk program ini"], ...choices.map((c) => [c.id, classLabel(c)])], s.classId || "")}</select>`
    : `<select class="select" id="rec-class" disabled><option>Pilih program dan periode dulu</option></select>`;
  const progressCell = (label, a, body) => `<div class="stat">
    <div class="stat__eyebrow"><p class="stat__label">${esc(label)}</p>${a ? `<a class="link-btn" href="#/tes/${a.test}/submission/${a.id}">Lihat jawaban</a>` : ""}</div>${body}</div>`;
  const preNilai = nilaiOf(pre), postNilai = nilaiOf(post);
  const delta = pre && post ? postNilai - preNilai : null;

  main.innerHTML = `
    ${pageHead({
      crumbs: [["Database Siswa", "#/siswa"], [s.name, ""]],
      lead: `<span class="avatar avatar--lg" aria-hidden="true">${esc(initials(s.name))}</span>`,
      title: s.name,
      desc: `<p class="meta-line"><span>${esc(s.email)}</span><span class="tnum">${esc(fmtWa(s.wa))}</span><span>${esc(s.city)}</span></p>`,
      actions: `<button class="btn btn--secondary" type="button" data-action="wa" data-id="${s.id}">${icon("message")}Chat WhatsApp</button>
        <button class="btn btn--quiet" type="button" data-action="edit-student" data-id="${s.id}">${icon("pencil")}Ubah data</button>
        <button class="icon-btn icon-btn--boxed" type="button" data-menu="student" data-id="${s.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Aksi lain">${icon("more")}</button>`,
    })}
    <div class="stack">
      <section class="panel" aria-label="Data utama siswa">
        <div class="props">
          <div class="prop"><label class="prop__label" for="rec-stage">Status</label><select class="select" id="rec-stage" data-change="student-stage" data-id="${s.id}">${options(STAGES.map((x) => [x.key, x.label]), s.stage)}</select></div>
          <div class="prop"><label class="prop__label" for="rec-class">Tutor / Kelas</label>${classSelect}</div>
          <div class="prop"><span class="prop__label">Program</span>${prog ? `<span class="prop__value">${esc(prog.name)}</span><span class="prop__sub">${esc(dur ? dur.label : "Durasi belum dipilih")}, ${esc(prog.mode)}</span>` : `<span class="prop__value muted">Belum dipilih</span>`}</div>
          <div class="prop"><span class="prop__label">Periode</span>${per ? `<span class="prop__value">Mulai ${esc(fmtDate(per.start))}</span><span class="prop__sub">${end ? `selesai ${esc(fmtDate(end))}` : "tanggal selesai mengikuti durasi"}</span>` : `<span class="prop__value muted">Belum ditentukan</span>`}</div>
          <div class="prop"><span class="prop__label">Level placement</span>${level ? `<span class="prop__value">${esc(level.label)}</span><span class="prop__sub">${placement.score} dari ${attemptTotal(placement)}, tes ${esc(fmtDate(placement.startedAt))}</span>` : `<span class="prop__value muted">Belum tes</span>`}</div>
          <div class="prop"><span class="prop__label">Sumber</span><span class="prop__value">${esc(s.source)}</span></div>
          <div class="prop"><span class="prop__label">Domisili</span><span class="prop__value">${esc(s.city || "Belum diisi")}</span></div>
          <div class="prop"><span class="prop__label">Masuk database</span><span class="prop__value">${esc(fmtDate(s.createdAt))}</span><span class="prop__sub">pukul ${esc(fmtTime(s.createdAt))}</span></div>
        </div>
      </section>

      <section class="panel">
        <header class="panel__head"><div>
          <h2 class="panel__title">Perkembangan belajar</h2>
          <p class="panel__desc">Placement test menentukan rekomendasi program, pre-test menjadi nilai awal sebelum kelas, dan post-test menentukan kelulusan di akhir program.</p>
        </div></header>
        <div class="stats stats--3">
          ${progressCell("Placement Test", placement, level
            ? `<p class="stat__value stat__value--text">${esc(level.label)}</p><p class="stat__note">Skor ${placement.score} dari ${attemptTotal(placement)}, ${esc(fmtDate(placement.startedAt))}</p>`
            : `<p class="stat__value stat__value--text muted">Belum tes</p><p class="stat__note">Kirim tautan tes supaya level bisa ditentukan.</p>`)}
          ${progressCell("Pre-test", pre, pre
            ? `<p class="stat__value">${preNilai}<small> / 100</small></p><p class="stat__note">${pre.score} dari ${attemptTotal(pre)} benar, ${esc(fmtDate(pre.startedAt))}</p>`
            : `<p class="stat__value stat__value--text muted">Belum dikerjakan</p><p class="stat__note">${s.stage === "terdaftar" && per ? `Dijadwalkan sebelum kelas mulai ${esc(fmtDate(per.start))}.` : "Pre-test hanya untuk siswa terdaftar."}</p>`)}
          ${progressCell("Post-test", post, post
            ? `<p class="stat__value">${postNilai}<small> / 100</small></p><p class="stat__note">${post.passed ? "Lulus, bisa lanjut ke level berikutnya" : "Belum lulus, disarankan mengulang"}${delta === null ? "" : `, ${delta >= 0 ? "naik" : "turun"} ${Math.abs(delta)} dari pre-test`}</p>`
            : `<p class="stat__value stat__value--text muted">Belum dikerjakan</p><p class="stat__note">${end ? `Dijadwalkan di akhir program, sekitar ${esc(fmtDate(end))}.` : "Post-test dikerjakan di akhir program."}</p>`)}
        </div>
      </section>

      <section class="panel">
        <header class="panel__head">
          <div><h2 class="panel__title">Riwayat tes <span class="count-pill">${attempts.length}</span></h2>
          <p class="panel__desc">Semua placement test, pre-test, dan post-test atas nama ${esc(firstName(s.name))}. Placement test yang gagal sebelum mengisi kontak tidak bisa dikaitkan ke siswa.</p></div>
          <button class="btn btn--quiet btn--sm" type="button" data-menu="send-test" data-id="${s.id}" aria-haspopup="menu" aria-expanded="false">${icon("send", "icon--sm")}Kirim tautan tes</button>
        </header>
        ${attempts.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th scope="col">Tes</th><th scope="col">Tanggal</th><th scope="col">Hasil</th><th scope="col" class="hide-sm">Level atau kelulusan</th><th scope="col" class="hide-md">Durasi</th><th scope="col" class="hide-md">Pelanggaran</th><th scope="col">Status</th><th scope="col" class="is-action"><span class="sr-only">Buka</span></th></tr></thead>
          <tbody>${attempts.map((a) => `<tr data-href="#/tes/${a.test}/submission/${a.id}">
            <td><a class="cell-main" href="#/tes/${a.test}/submission/${a.id}">${esc(TEST_META[a.test].name)}</a></td>
            <td class="nowrap">${esc(fmtDate(a.startedAt))}<span class="cell-sub">${esc(fmtTime(a.startedAt))}</span></td>
            <td class="nowrap">${resultCell(a)}</td>
            <td class="hide-sm">${outcomeCell(a)}</td>
            <td class="hide-md tnum">${fmtClock(a.durationSec)}</td>
            <td class="hide-md tnum${a.violations >= (a.maxViolations || 3) ? " is-wrong" : ""}">${a.violations}</td>
            <td>${attemptStatusHtml(a)}</td>
            <td class="is-action chev">${icon("chevron-right")}</td>
          </tr>`).join("")}</tbody></table></div>`
          : emptyHtml("Belum pernah mengerjakan tes.", "Kirim tautan placement test lewat WhatsApp supaya level dan program yang cocok bisa ditentukan.")}
      </section>

      <details class="panel fold" id="notes-fold"${ui.notesOpen ? " open" : ""}>
        <summary>
          <div><h2 class="panel__title">Catatan dan aktivitas${feedData ? ` <span class="count-pill">${feed.length}</span>` : ""}</h2>
          <p class="panel__desc">Riwayat chat, telepon, perubahan status, dan catatan tim. Disembunyikan supaya data utama siswa tetap di depan.</p></div>
          <span class="fold__action"><span class="fold__closed">Tampilkan</span><span class="fold__opened">Sembunyikan</span>${icon("chevron-down", "icon--sm")}</span>
        </summary>
        <form class="composer" data-form="note" data-id="${s.id}" novalidate>
          <label class="sr-only" for="note-text">Catatan baru</label>
          <textarea class="textarea" id="note-text" rows="3" placeholder="Contoh: sudah telepon, minta jadwal kelas malam dan rincian biaya cicilan."></textarea>
          <p class="error" id="note-err" hidden></p>
          <div class="composer__foot"><span class="hint">Catatan tersimpan atas nama ${esc(ME)}.</span><button class="btn btn--secondary btn--sm" type="submit">Simpan catatan</button></div>
        </form>
        ${feedData ? "" : `<p class="loading-line" role="status">Memuat aktivitas...</p>`}<ol class="feed">${feed.map((x) => `<li class="feed__item${x.type === "note" ? " feed__item--note" : ""}">
          <span class="feed__icon" aria-hidden="true">${icon(FEED_ICON[x.type] || "note")}</span>
          <div><p class="feed__text">${esc(x.text)}</p><p class="feed__meta">${esc(x.by || "Sistem")}, ${esc(fmtDateTime(x.at))}</p></div>
        </li>`).join("")}</ol>
      </details>
    </div>`;
  return s.name;
}


/* ===================== View: Program & Kelas ===================== */
const enrolledIn = (pred) => db.students.filter((s) => s.stage === "terdaftar" && pred(s)).length;

function viewPrograms(tab) {
  const tabs = [["program", "Program", db.programs.length], ["periode", "Periode", db.periods.length], ["kelas", "Kelas & Tutor", db.classes.length]];
  if (!tabs.some((t) => t[0] === tab)) tab = "program";
  const actions = tab === "program"
    ? `<button class="btn btn--primary" type="button" data-action="new-program">${icon("plus")}Tambah program</button>`
    : tab === "periode"
      ? `<button class="btn btn--primary" type="button" data-action="new-period">${icon("plus")}Tambah periode</button>`
      : `<button class="btn btn--quiet" type="button" data-action="new-tutor">${icon("user")}Tambah tutor</button><button class="btn btn--primary" type="button" data-action="new-class">${icon("plus")}Tambah kelas</button>`;
  main.innerHTML = `
    ${pageHead({ title: "Program & Kelas", desc: `<p class="page-desc">Daftar program, durasi, periode, kelas, dan tutor. Isi daftar ini muncul sebagai pilihan saat menambah atau mengubah data siswa.</p>`, actions })}
    <nav class="seg tabs" aria-label="Bagian program dan kelas">
      ${tabs.map(([key, label, n]) => `<a class="seg__item" href="#/program/${key}"${key === tab ? ' aria-current="page"' : ""}>${esc(label)} <span class="seg__n">${n}</span></a>`).join("")}
    </nav>
    <div id="tab-body"></div>`;
  if (tab === "program") renderProgramTab();
  else if (tab === "periode") renderPeriodTab();
  else renderClassTab();
  return { program: "Program", periode: "Periode", kelas: "Kelas & Tutor" }[tab];
}

function renderProgramTab() {
  $("#tab-body").innerHTML = `<section class="panel">
    <header class="panel__head"><div>
      <h2 class="panel__title">Program</h2>
      <p class="panel__desc">Setiap program punya beberapa pilihan durasi dan harga. Program nonaktif tetap tersimpan di data siswa lama, tetapi tidak muncul di formulir.</p>
    </div></header>
    <div class="table-wrap"><table class="table">
      <thead><tr><th scope="col">Program</th><th scope="col">Durasi dan harga</th><th scope="col" class="hide-md">Tutor</th><th scope="col" class="is-num is-wrap hide-sm">Siswa terdaftar</th><th scope="col" class="hide-md">Status</th><th scope="col" class="is-action"><span class="sr-only">Aksi</span></th></tr></thead>
      <tbody>${db.programs.map((p) => `<tr data-row-action="edit-program" data-id="${p.id}" class="${p.status === "aktif" ? "" : "is-draft"}">
        <td><span class="cell-main">${esc(p.name)}</span><span class="cell-sub">${esc(p.mode)}${p.status === "aktif" ? "" : ", nonaktif"}</span></td>
        <td><div class="tags">${p.durations.map((d) => `<span class="tag">${esc(d.label)}${d.price ? ` <small>${esc(fmtRp(d.price))}</small>` : ""}</span>`).join("")}</div></td>
        <td class="hide-md">${esc(p.tutors.join(", ") || "Belum ada")}</td>
        <td class="is-num hide-sm">${enrolledIn((s) => s.programId === p.id)}</td>
        <td class="hide-md">${p.status === "aktif" ? statusHtml("Aktif", "navy") : statusHtml("Nonaktif", "ring", true)}</td>
        <td class="is-action"><span class="row-actions">
          <button class="btn btn--quiet btn--sm" type="button" data-action="edit-program" data-id="${p.id}">Ubah</button>
          <button class="icon-btn" type="button" data-menu="program" data-id="${p.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Aksi lain untuk ${esc(p.name)}">${icon("more")}</button>
        </span></td>
      </tr>`).join("")}</tbody>
    </table></div>
  </section>`;
}

function renderPeriodTab() {
  $("#tab-body").innerHTML = `<section class="panel">
    <header class="panel__head"><div>
      <h2 class="panel__title">Periode</h2>
      <p class="panel__desc">Tanggal mulai kelas. Siswa memilih satu periode saat mendaftar, dan periode dipakai sebagai filter di Database Siswa serta hasil pre-test dan post-test.</p>
    </div></header>
    <div class="table-wrap"><table class="table">
      <thead><tr><th scope="col">Periode</th><th scope="col">Status</th><th scope="col" class="is-num">Kelas</th><th scope="col" class="is-num">Siswa terdaftar</th><th scope="col" class="is-action"><span class="sr-only">Aksi</span></th></tr></thead>
      <tbody>${periodsSorted().reverse().map((p) => {
        const st = periodState(p);
        const n = enrolledIn((s) => s.periodId === p.id);
        return `<tr data-row-action="edit-period" data-id="${p.id}">
          <td><span class="cell-main">Mulai ${esc(fmtDateLong(p.start))}</span>${p.note ? `<span class="cell-sub">${esc(p.note)}</span>` : ""}</td>
          <td>${statusHtml(st.label, st.dot, st.key === "done")}</td>
          <td class="is-num">${db.classes.filter((c) => c.periodId === p.id).length}</td>
          <td class="is-num">${n ? `<a class="link-btn" href="#/siswa?periode=${p.id}">${n} siswa</a>` : `<span class="muted">0</span>`}</td>
          <td class="is-action"><span class="row-actions">
            <button class="btn btn--quiet btn--sm" type="button" data-action="edit-period" data-id="${p.id}">Ubah</button>
            <button class="icon-btn" type="button" data-menu="period" data-id="${p.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Aksi lain untuk periode ${esc(fmtDate(p.start))}">${icon("more")}</button>
          </span></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>
  </section>`;
}

function renderClassTab() {
  const f = ui.classes;
  const list = db.classes.filter((c) => (!f.period || c.periodId === f.period) && (!f.program || c.programId === f.program))
    .sort((a, b) => periodById(b.periodId).start - periodById(a.periodId).start || a.code.localeCompare(b.code, "id", { numeric: true }));
  $("#tab-body").innerHTML = `<div class="stack">
    <section class="panel">
      <header class="panel__head"><div>
        <h2 class="panel__title">Kelas</h2>
        <p class="panel__desc">Satu kelas berisi satu program di satu periode dengan satu tutor. Di data siswa, kelas tampil sebagai Tutor / Kelas, misalnya Aldo / C1.</p>
      </div></header>
      <div class="toolbar toolbar--last toolbar--flush">
        <select class="select select--auto" data-change="classes-period" aria-label="Saring periode">${options(periodOptions("Semua periode"), f.period)}</select>
        <select class="select select--auto" data-change="classes-program" aria-label="Saring program">${options(programOptions("Semua program"), f.program)}</select>
      </div>
      ${list.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">Kelas</th><th scope="col">Program</th><th scope="col" class="hide-tab">Periode</th><th scope="col">Tutor</th><th scope="col">Siswa</th><th scope="col" class="is-action"><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${list.map((c) => {
          const n = studentsInClass(c).length;
          return `<tr data-row-action="edit-class" data-id="${c.id}">
            <td><span class="cell-main">${esc(c.code)}</span></td>
            <td>${esc(programById(c.programId)?.name || "Program sudah dihapus")}</td>
            <td class="hide-tab nowrap">${esc(fmtDate(periodById(c.periodId).start))}</td>
            <td>${personHtml(c.tutor, c.tutor)}</td>
            <td><div class="acc"><span class="bar" aria-hidden="true"><span class="bar__fill${n > c.capacity ? " is-low" : ""}" data-w="${pct(n, c.capacity)}"></span></span><span class="acc__val nowrap">${n} / ${c.capacity}</span></div></td>
            <td class="is-action"><span class="row-actions">
              <button class="btn btn--quiet btn--sm" type="button" data-action="edit-class" data-id="${c.id}">Ubah</button>
              <button class="icon-btn" type="button" data-menu="class" data-id="${c.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Aksi lain untuk kelas ${esc(c.code)}">${icon("more")}</button>
            </span></td>
          </tr>`;
        }).join("")}</tbody></table></div>`
        : emptyHtml("Belum ada kelas untuk filter ini.", "Tambah kelas baru atau pilih periode lain.")}
    </section>

    <section class="panel">
      <header class="panel__head"><div>
        <h2 class="panel__title">Tutor</h2>
        <p class="panel__desc">Program yang bisa diajar setiap tutor diatur dari formulir program.</p>
      </div></header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">Tutor</th><th scope="col">Program yang diajar</th><th scope="col" class="is-num">Kelas</th><th scope="col" class="is-num hide-sm">Siswa</th><th scope="col" class="is-action"><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${db.tutors.map((t) => {
          const classes = db.classes.filter((c) => c.tutor === t);
          return `<tr>
            <td>${personHtml(t, t)}</td>
            <td>${esc(db.programs.filter((p) => p.tutors.includes(t)).map((p) => p.name).join(", ") || "Belum mengajar program apa pun")}</td>
            <td class="is-num">${classes.length}</td>
            <td class="is-num hide-sm">${classes.reduce((sum, c) => sum + studentsInClass(c).length, 0)}</td>
            <td class="is-action"><button class="icon-btn" type="button" data-menu="tutor" data-id="${esc(t)}" aria-haspopup="menu" aria-expanded="false" aria-label="Aksi lain untuk ${esc(t)}">${icon("more")}</button></td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
    </section>
  </div>`;
  applyWidths($("#tab-body"));
}

/* ===================== View: tests (Placement, Pre-test, Post-test) ===================== */
function testSummary(t) {
  const n = activeQuestions(t).length;
  const time = t.settings.timeMode === "total" ? `waktu total ${fmtSpan(t.settings.totalSeconds)}` : `waktu per soal dengan total ${fmtSpan(testSeconds(t))}`;
  const who = TEST_META[t.key].who;
  const open = t.settings.open ? `${statusHtml("Dibuka", "navy")} untuk ${who}` : `${statusHtml("Ditutup", "ring", true)} sementara`;
  const pass = t.key === "post" ? ` Nilai kelulusan ${t.settings.passScore}.` : "";
  return `<p class="page-desc">${esc(TEST_META[t.key].purpose)}</p><p class="page-desc">${n} soal aktif dengan ${esc(time)}.${pass} Tes sedang ${open}.</p>`;
}

function viewTest(key, tab) {
  ui.test = key;
  const t = T(), meta = TEST_META[key];
  const own = db.attempts.filter((a) => a.test === key);
  const tabs = [["soal", "Soal & Jawaban", t.questions.length], ["submission", "Submission", own.length], ["pengaturan", "Pengaturan", null]];
  if (!tabs.some((x) => x[0] === tab)) tab = "soal";
  const actions = tab === "soal"
    ? `<button class="btn btn--primary" type="button" data-action="new-question">${icon("plus")}Tambah soal</button>`
    : tab === "submission" ? `<button class="btn btn--quiet" type="button" data-action="export-attempts">${icon("download")}Ekspor CSV</button>` : "";
  main.innerHTML = `
    ${pageHead({ title: meta.name, desc: testSummary(t), actions })}
    <nav class="seg tabs" aria-label="Bagian ${esc(meta.name)}">
      ${tabs.map(([k, label, n]) => `<a class="seg__item" href="#/tes/${key}/${k}"${k === tab ? ' aria-current="page"' : ""}>${esc(label)}${n === null ? "" : ` <span class="seg__n">${n}</span>`}</a>`).join("")}
    </nav>
    <div id="tab-body"></div>`;
  if (tab === "soal") renderQuestionsTab();
  else if (tab === "submission") renderAttemptsTab();
  else renderSettingsTab();
  return `${meta.name}, ${{ soal: "Soal & Jawaban", submission: "Submission", pengaturan: "Pengaturan" }[tab]}`;
}

function levelMismatchNotice() {
  if (ui.test !== "placement") return "";
  const n = activeQuestions(T()).length;
  const top = db.levels[db.levels.length - 1].max;
  if (n === top) return "";
  return `<div class="notice" role="note">${icon("alert")}<div class="notice__body">
    Jumlah soal aktif sekarang <strong>${n}</strong>, tetapi ambang level masih berakhir di skor <strong>${top}</strong>.
    Sesuaikan ambang level supaya peserta dengan skor tertinggi tetap mendapat level yang benar.
    <a class="link-btn" href="#/tes/placement/pengaturan?bagian=level">Buka ambang level</a>
  </div></div>`;
}

/* --- Soal & Jawaban --- */
function renderQuestionsTab() {
  const t = T(), f = ui.questions[ui.test];
  const counts = { all: t.questions.length };
  SKILLS.forEach((k) => { counts[k] = t.questions.filter((q) => q.skill === k).length; });
  $("#tab-body").innerHTML = `<div class="stack">
    ${levelMismatchNotice()}
    <section class="panel">
      <div class="toolbar toolbar--last">
        <label class="search"><span class="sr-only">Cari soal</span>${icon("search")}<input class="input" type="search" data-input="questions-q" placeholder="Cari teks soal atau pilihan jawaban" value="${esc(f.q)}" autocomplete="off"></label>
        <div class="chips" id="questions-chips" role="group" aria-label="Saring skill">${[["all", "Semua"], ...SKILLS.map((k) => [k, k])].map(([k, label]) => chip("questions-skill", k, label, counts[k], f.skill === k)).join("")}</div>
        <p class="toolbar__meta">Urutan di tabel sama dengan urutan soal di tes.</p>
      </div>
      <div id="questions-results"></div>
    </section>
  </div>`;
  renderQuestionsResults();
}

function renderQuestionsResults() {
  const box = $("#questions-results");
  if (!box) return;
  const t = T(), f = ui.questions[ui.test];
  const per = t.settings.timeMode === "per";
  const stats = accuracyMap(ui.test, NOW - 30 * DAY);
  const q = f.q.trim().toLowerCase();
  const rows = t.questions.filter((x) => (f.skill === "all" || x.skill === f.skill)
    && (!q || `${x.prompt} ${x.passage} ${Object.values(x.options).join(" ")}`.toLowerCase().includes(q)));
  $$("#questions-chips .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.value === f.skill)));
  box.innerHTML = rows.length ? `<div class="table-wrap"><table class="table">
    <caption class="sr-only">Bank soal ${esc(TEST_META[ui.test].name)}</caption>
    <thead><tr>
      <th scope="col" class="is-no">No</th><th scope="col">Soal dan pilihan jawaban</th><th scope="col" class="hide-md">Skill</th>
      <th scope="col" class="hide-sm is-wrap">Dijawab benar, 30 hari</th>${per ? `<th scope="col" class="is-num">Waktu</th>` : ""}
      <th scope="col" class="hide-tab">Status</th><th scope="col" class="is-action"><span class="sr-only">Aksi</span></th>
    </tr></thead>
    <tbody>${rows.map((x) => {
      const num = questionNumber(t, x);
      const st = stats.get(x.id);
      const p = st ? pct(st.correct, st.n) : 0;
      const acc = st && st.n >= 5
        ? `<div class="acc"><span class="bar" aria-hidden="true"><span class="bar__fill${p < 35 ? " is-low" : ""}" data-w="${p}"></span></span><span class="acc__val">${p}%</span></div><span class="cell-sub">${st.correct} dari ${st.n} peserta</span>`
        : `<span class="muted">Belum ada data</span>`;
      return `<tr data-row-action="edit-question" data-id="${x.id}" class="${x.status === "draf" ? "is-draft" : ""}">
        <td class="is-no is-top">${num ? pad(num) : `<span class="muted">Draf</span>`}</td>
        <td>
          ${x.passage ? `<span class="q-tag">${icon("book", "icon--sm")}Dengan bacaan</span>` : ""}
          <p class="q-prompt">${esc(x.prompt)}</p>
          <ul class="opts" aria-label="Pilihan jawaban, kunci ${x.answer}">${KEYS.map((k) => `<li class="opt${k === x.answer ? " is-key" : ""}"><span class="opt__key">${k}</span><span class="opt__text">${esc(x.options[k])}</span></li>`).join("")}</ul>
        </td>
        <td class="hide-md">${esc(x.skill)}</td>
        <td class="hide-sm">${acc}</td>
        ${per ? `<td class="is-num">${x.seconds} dtk</td>` : ""}
        <td class="hide-tab">${x.status === "aktif" ? statusHtml("Aktif", "navy") : statusHtml("Draf", "ring", true)}</td>
        <td class="is-action"><span class="row-actions">
          <button class="btn btn--quiet btn--sm" type="button" data-action="edit-question" data-id="${x.id}">Ubah</button>
          <button class="icon-btn" type="button" data-menu="question" data-id="${x.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Aksi lain untuk soal ${num || "draf"}">${icon("more")}</button>
        </span></td>
      </tr>`;
    }).join("")}</tbody></table></div>`
    : emptyHtml("Tidak ada soal yang cocok dengan pencarian ini.", "Coba kata kunci lain atau pilih skill yang berbeda.");
  applyWidths(box);
}

/* --- Submission --- */
function attemptMatches(a, f, ignoreStatus) {
  if (a.test !== ui.test) return false;
  if (!ignoreStatus && f.status !== "all") {
    if (f.status === "failed") { if (a.status !== "timeout" && a.status !== "violation") return false; }
    else if (a.status !== f.status) return false;
  }
  const s = a.studentId ? studentById(a.studentId) : null;
  if (ui.test === "placement") {
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

function renderAttemptsTab() {
  const f = ui.attempts[ui.test];
  const filters = ui.test === "placement"
    ? `<select class="select select--auto" data-change="attempts-level" aria-label="Saring level">${options([["", "Semua level"], ...db.levels.map((l) => [l.key, l.label])], f.level)}</select>
       <select class="select select--auto" data-change="attempts-days" aria-label="Rentang waktu">${options([["7", "7 hari terakhir"], ["30", "30 hari terakhir"], ["all", "Semua waktu"]], f.days)}</select>`
    : `<select class="select select--auto" data-change="attempts-period" aria-label="Saring periode">${options(periodOptions("Semua periode"), f.period)}</select>
       <select class="select select--auto" data-change="attempts-program" aria-label="Saring program">${options(programOptions("Semua program"), f.program)}</select>
       ${ui.test === "post" ? `<select class="select select--auto" data-change="attempts-result" aria-label="Saring hasil">${options([["", "Semua hasil"], ["true", "Lulus"], ["false", "Belum lulus"]], f.result)}</select>` : ""}`;
  $("#tab-body").innerHTML = `<section class="panel">
    <div class="toolbar"><div class="chips" id="attempts-chips" role="group" aria-label="Saring status submission"></div></div>
    <div class="toolbar toolbar--last">
      <label class="search"><span class="sr-only">Cari submission</span>${icon("search")}<input class="input" type="search" data-input="attempts-q" placeholder="${ui.test === "placement" ? "Cari nama, email, WhatsApp, atau ID" : "Cari nama, email, atau kelas"}" value="${esc(f.q)}" autocomplete="off"></label>
      ${filters}
    </div>
    <div id="attempts-results"></div>
  </section>`;
  renderAttemptsResults();
}

function attemptRow(a) {
  const s = a.studentId ? studentById(a.studentId) : null;
  const sel = ui.attempts[a.test].selected.has(a.id);
  const href = `#/tes/${a.test}/submission/${a.id}`;
  const person = s
    ? `<a class="cell-main" href="${href}">${esc(s.name)}</a><span class="cell-sub cell-ellipsis">${esc(s.email)}</span>`
    : `<a class="cell-main" href="${href}">${a.contactName ? esc(a.contactName) : "Tanpa nama"}</a><span class="cell-sub">ID ${esc(a.short)}</span>`;
  const check = `<td class="is-check"><input type="checkbox" data-change="select-row" data-scope="attempts" value="${a.id}" aria-label="Pilih submission ${esc(s ? s.name : a.contactName || a.short)}" ${sel ? "checked" : ""}></td>`;
  const tail = `<td class="hide-lg nowrap">${esc(fmtDateTime(a.startedAt))}</td><td>${attemptStatusHtml(a)}</td><td class="is-action chev hide-xl">${icon("chevron-right")}</td>`;
  if (a.test === "placement") {
    const level = a.levelKey ? levelByKey(a.levelKey) : null;
    const email = a.emailStatus === "sent" ? "Terkirim" : a.emailStatus === "failed" ? `<span class="is-wrong">Gagal</span>` : `<span class="muted">Tidak ada</span>`;
    return `<tr data-href="${href}" class="${sel ? "is-selected" : ""}">${check}<td>${person}</td>
      <td class="nowrap">${resultCell(a)}</td>
      <td class="hide-sm">${level ? esc(level.label) : `<span class="muted">Tidak ada</span>`}</td>
      <td class="hide-md tnum">${fmtClock(a.durationSec)}</td>
      <td class="hide-md tnum${a.violations >= (a.maxViolations || 3) ? " is-wrong" : ""}">${a.violations}</td>
      <td class="hide-xl">${email}</td>${tail}</tr>`;
  }
  const pre = a.test === "post" && s ? latestGraded(s.id, "pre") : null;
  const d = pre && a.score !== null ? nilaiOf(a) - nilaiOf(pre) : null;
  return `<tr data-href="${href}" class="${sel ? "is-selected" : ""}">${check}<td>${person}</td>
    <td class="hide-md">${s ? programCell(s) : ""}</td>
    <td class="hide-tab">${s ? classCell(s) : ""}</td>
    ${a.test === "post" ? `<td class="hide-xl tnum">${pre ? nilaiOf(pre) : `<span class="muted">Tidak ada</span>`}</td>` : ""}
    <td class="nowrap">${resultCell(a)}${d === null ? "" : `<span class="cell-sub"><span class="delta ${d >= 0 ? "delta--up" : "delta--down"}">${d >= 0 ? "naik" : "turun"} ${Math.abs(d)}</span> dari pre-test</span>`}</td>
    ${a.test === "post" ? `<td>${passHtml(a)}</td>` : `<td class="hide-lg tnum">${fmtClock(a.durationSec)}</td>`}
    ${tail}</tr>`;
}

function renderAttemptsResults() {
  const box = $("#attempts-results");
  if (!box) return;
  const f = ui.attempts[ui.test];
  const base = db.attempts.filter((a) => attemptMatches(a, f, true));
  const chipsList = ui.test === "placement"
    ? [["all", "Semua"], ["done", "Selesai"], ["nocontact", "Tanpa kontak"], ["failed", "Gagal"], ["void", "Dibatalkan"]]
    : [["all", "Semua"], ["done", "Selesai"], ["failed", "Gagal"], ["void", "Dibatalkan"]];
  const countOf = (k) => (k === "all" ? base.length : k === "failed" ? base.filter((a) => a.status === "timeout" || a.status === "violation").length : base.filter((a) => a.status === k).length);
  $("#attempts-chips").innerHTML = chipsList.map(([k, label]) => chip("attempts-status", k, label, countOf(k), f.status === k)).join("");
  const rows = base.filter((a) => attemptMatches(a, f, false));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  f.page = Math.min(Math.max(1, f.page), pages);
  const pageRows = rows.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE);
  const allOnPage = pageRows.length > 0 && pageRows.every((a) => f.selected.has(a.id));
  const head = ui.test === "placement"
    ? `<th scope="col">Peserta</th><th scope="col">Skor</th><th scope="col" class="hide-sm">Level</th><th scope="col" class="hide-md">Durasi</th><th scope="col" class="hide-md">Pelanggaran</th><th scope="col" class="hide-xl">Email hasil</th>`
    : `<th scope="col">Siswa</th><th scope="col" class="hide-md">Program</th><th scope="col" class="hide-tab">Tutor / Kelas</th>${ui.test === "post" ? `<th scope="col" class="hide-xl">Pre-test</th><th scope="col">Nilai</th><th scope="col">Hasil</th>` : `<th scope="col">Nilai</th><th scope="col" class="hide-lg">Durasi</th>`}`;
  box.innerHTML = rows.length ? `<div class="table-wrap"><table class="table">
    <caption class="sr-only">Daftar submission ${esc(TEST_META[ui.test].name)}</caption>
    <thead><tr>
      <th scope="col" class="is-check"><input type="checkbox" data-change="select-page" data-scope="attempts" aria-label="Pilih semua submission di halaman ini" ${allOnPage ? "checked" : ""}></th>
      ${head}<th scope="col" class="hide-lg">Waktu</th><th scope="col">Status</th><th scope="col" class="is-action hide-xl"><span class="sr-only">Buka</span></th>
    </tr></thead>
    <tbody>${pageRows.map(attemptRow).join("")}</tbody></table></div>
    ${pagerHtml("attempts", f.page, rows.length, "submission")}`
    : emptyHtml("Tidak ada submission yang cocok dengan filter ini.", ui.test === "placement" ? "Coba rentang waktu yang lebih panjang atau hapus kata kunci pencarian." : "Coba periode atau program lain, atau hapus kata kunci pencarian.");
  updateBulkBar();
}

/* --- Pengaturan --- */
function renderSettingsTab() {
  const t = T(), st = t.settings, key = ui.test;
  const own30 = db.attempts.filter((a) => a.test === key && a.startedAt >= NOW - 30 * DAY);
  const graded30 = own30.filter(isGraded);
  const avgDur = graded30.length ? Math.round(graded30.reduce((s, a) => s + a.durationSec, 0) / graded30.length) : 0;
  const timeoutShare = pct(own30.filter((a) => a.status === "timeout").length, own30.length);
  const levelRows = db.levels.map((l, i) => `<tr>
    <td><span class="cell-main">${esc(l.label)}</span></td>
    <td><label class="sr-only" for="lv-min-${i}">Skor minimum ${esc(l.label)}</label><input class="input tnum" id="lv-min-${i}" type="number" min="0" max="100" value="${l.min}" data-input="levels-dirty" ${i === 0 ? "readonly" : ""}></td>
    <td><label class="sr-only" for="lv-max-${i}">Skor maksimum ${esc(l.label)}</label><input class="input tnum" id="lv-max-${i}" type="number" min="0" max="100" value="${l.max}" data-input="levels-dirty"></td>
    <td class="hide-sm">${esc(l.program)}</td>
  </tr>`).join("");
  const accessHint = key === "placement"
    ? "Kalau ditutup, halaman tes menampilkan pesan bahwa tes sedang tidak tersedia. Pakai ini saat tim sedang merombak soal."
    : "Siswa terdaftar membuka tes lewat tautan pribadi dari admin. Kalau ditutup, tautan itu menampilkan pesan bahwa tes belum dibuka.";

  $("#tab-body").innerHTML = `<div class="stack">
    <section class="panel" id="panel-time">
      <header class="panel__head"><div>
        <h2 class="panel__title">Waktu pengerjaan</h2>
        <p class="panel__desc">Pilih satu cara menghitung waktu. Aturan baru berlaku untuk peserta yang memulai tes setelah disimpan, sedangkan peserta yang sedang mengerjakan tetap memakai aturan lama.</p>
      </div></header>
      <div class="panel__body">
        <div class="modes" role="radiogroup" aria-label="Cara menghitung waktu">
          <label class="mode${st.timeMode === "total" ? " is-on" : ""}"><input type="radio" name="time-mode" value="total" data-change="time-mode" ${st.timeMode === "total" ? "checked" : ""}><span class="mode__mark" aria-hidden="true"></span>
            <span><span class="mode__title">Waktu total</span><span class="mode__desc">Satu hitungan mundur untuk seluruh tes. Peserta bebas berpindah soal dan boleh kembali ke soal sebelumnya selama waktunya masih ada.</span></span></label>
          <label class="mode${st.timeMode === "per" ? " is-on" : ""}"><input type="radio" name="time-mode" value="per" data-change="time-mode" ${st.timeMode === "per" ? "checked" : ""}><span class="mode__mark" aria-hidden="true"></span>
            <span><span class="mode__title">Waktu per soal</span><span class="mode__desc">Setiap soal punya hitungan sendiri. Saat waktunya habis, tes pindah ke soal berikutnya, soal itu dianggap kosong, dan peserta tidak bisa kembali.</span></span></label>
        </div>
        <div class="time-grid">
          <div class="time-fields">
            <div class="field" data-mode-field="total">
              <span class="label" id="lbl-total">Durasi tes</span>
              <div class="unit-row" role="group" aria-labelledby="lbl-total">
                <label class="unit"><input class="input tnum" type="number" id="set-min" min="0" max="60" value="${Math.floor(st.totalSeconds / 60)}" data-input="time-dirty"><span>menit</span></label>
                <label class="unit"><input class="input tnum" type="number" id="set-sec" min="0" max="59" step="5" value="${st.totalSeconds % 60}" data-input="time-dirty"><span>detik</span></label>
              </div>
            </div>
            <div class="field" data-mode-field="per">
              <label class="label" for="set-per">Waktu bawaan per soal</label>
              <div class="unit-row">
                <span class="unit"><input class="input tnum" type="number" id="set-per" min="5" max="180" value="${st.perDefault}" data-input="time-dirty"><span>detik</span></span>
                <button class="btn btn--quiet btn--sm" type="button" data-action="apply-per-all">Terapkan ke semua soal</button>
              </div>
              <p class="hint">Waktu tiap soal juga bisa diubah satu per satu lewat tombol Ubah di bagian Soal & Jawaban.</p>
            </div>
            <p class="error" id="set-time-err" hidden></p>
          </div>
          <div class="readout" aria-live="polite">
            <span class="readout__label">Total waktu tes</span>
            <span class="readout__value" id="readout-value"></span>
            <span class="readout__sub" id="readout-sub"></span>
          </div>
        </div>
        <p class="note note--gap">${graded30.length ? `Dalam 30 hari terakhir, peserta yang menyelesaikan tes ini rata-rata butuh ${esc(fmtSpan(avgDur))}, dan ${timeoutShare}% percobaan berhenti karena waktu habis. Angka ini bisa jadi patokan sebelum mengubah durasi.` : "Belum ada submission dalam 30 hari terakhir, jadi belum ada patokan durasi dari data peserta."}</p>
      </div>
      <div class="panel__foot panel__foot--end">
        <button class="link-btn" type="button" data-action="time-reset" id="time-reset" hidden>Batalkan perubahan</button>
        <button class="btn btn--primary" type="button" data-action="time-save" id="time-save" disabled>Simpan pengaturan waktu</button>
      </div>
    </section>

    ${key === "post" ? `<section class="panel" id="panel-pass">
      <header class="panel__head"><div>
        <h2 class="panel__title">Nilai kelulusan</h2>
        <p class="panel__desc">Siswa dengan nilai post-test di bawah batas ini disarankan mengulang level yang sama. Nilai dihitung dari persentase jawaban benar, dari 0 sampai 100.</p>
      </div></header>
      <div class="panel__body time-grid">
        <div class="field">
          <label class="label" for="set-pass">Nilai minimum lulus</label>
          <div class="unit-row"><span class="unit"><input class="input tnum" type="number" id="set-pass" min="0" max="100" value="${st.passScore}" data-input="pass-dirty"><span>dari 100</span></span></div>
          <p class="hint">Hasil post-test yang sudah masuk tetap memakai batas saat dinilai.</p>
          <p class="error" id="set-pass-err" hidden></p>
        </div>
        <div class="readout" aria-live="polite"><span class="readout__label">Kalau batas ini dipakai</span><span class="readout__value" id="pass-value"></span><span class="readout__sub" id="pass-sub"></span></div>
      </div>
      <div class="panel__foot panel__foot--end"><button class="btn btn--primary" type="button" data-action="pass-save" id="pass-save" disabled>Simpan nilai kelulusan</button></div>
    </section>` : ""}

    <section class="panel" id="panel-rules">
      <header class="panel__head"><div>
        <h2 class="panel__title">Akses dan aturan tes</h2>
        <p class="panel__desc">Atur kapan tes bisa dikerjakan dan seberapa ketat aturan fokusnya.</p>
      </div></header>
      <div class="panel__body rules">
        <div class="field">
          <label class="switch"><input type="checkbox" id="set-open" data-change="rules-dirty" ${st.open ? "checked" : ""}><span class="switch__track" aria-hidden="true"></span>Tes dibuka untuk ${esc(TEST_META[key].who)}</label>
          <p class="hint">${esc(accessHint)}</p>
        </div>
        <div class="field">
          <label class="label" for="set-viol">Batas pelanggaran fokus</label>
          <select class="select select--auto" id="set-viol" data-change="rules-dirty">${options([1, 2, 3, 4, 5].map((n) => [n, `${n} kali`]), st.maxViolations)}</select>
          <p class="hint">Keluar dari layar penuh, pindah tab, atau berpindah jendela dihitung sebagai pelanggaran. Saat batasnya tercapai, tes berhenti dan peserta diminta mengulang.</p>
        </div>
      </div>
      <div class="panel__foot panel__foot--end"><button class="btn btn--primary" type="button" data-action="rules-save" id="rules-save" disabled>Simpan aturan tes</button></div>
    </section>

    ${key === "placement" ? `<section class="panel" id="panel-levels">
      <header class="panel__head"><div>
        <h2 class="panel__title">Ambang level</h2>
        <p class="panel__desc">Skor menentukan level dan program yang direkomendasikan di halaman hasil. Rentang skor harus menyambung tanpa celah dari 0 sampai jumlah soal aktif, yaitu ${activeQuestions(t).length}.</p>
      </div></header>
      ${levelMismatchNotice() ? `<div class="panel__body">${levelMismatchNotice()}</div>` : ""}
      <div class="table-wrap"><table class="table levels-table">
        <thead><tr><th scope="col">Level</th><th scope="col">Skor minimum</th><th scope="col">Skor maksimum</th><th scope="col" class="hide-sm">Program rekomendasi</th></tr></thead>
        <tbody>${levelRows}</tbody>
      </table></div>
      <div class="panel__foot">
        <p class="error" id="levels-err" hidden></p>
        <span class="row-actions push-end"><button class="btn btn--primary" type="button" data-action="levels-save" id="levels-save" disabled>Simpan ambang level</button></span>
      </div>
    </section>` : ""}
  </div>`;
  syncTimeForm();
  if (key === "post") syncPassForm();
}

function syncTimeForm() {
  const t = T();
  const mode = $('input[name="time-mode"]:checked')?.value || t.settings.timeMode;
  $$("[data-mode-field]").forEach((el) => { el.hidden = el.dataset.modeField !== mode; });
  $$(".mode").forEach((el) => el.classList.toggle("is-on", el.querySelector("input").checked));
  const n = activeQuestions(t).length;
  const total = mode === "total" ? (Number($("#set-min").value) || 0) * 60 + (Number($("#set-sec").value) || 0) : activeQuestions(t).reduce((s, q) => s + q.seconds, 0);
  $("#readout-value").textContent = fmtClock(Math.max(0, total));
  $("#readout-sub").textContent = mode === "total"
    ? `untuk ${n} soal aktif, sekitar ${n ? Math.round(total / n) : 0} detik per soal`
    : `jumlah waktu ${n} soal aktif, rata-rata ${n ? Math.round(total / n) : 0} detik per soal`;
  const st = t.settings;
  const dirty = mode !== st.timeMode || (mode === "total" && total !== st.totalSeconds) || (mode === "per" && Number($("#set-per").value) !== st.perDefault);
  $("#time-save").disabled = !dirty;
  $("#time-reset").hidden = !dirty;
}

function syncPassForm() {
  const v = Number($("#set-pass").value);
  const recent = db.attempts.filter((a) => a.test === "post" && a.status === "done" && a.startedAt >= NOW - 30 * DAY);
  const passCount = recent.filter((a) => nilaiOf(a) >= v).length;
  $("#pass-value").textContent = recent.length ? `${pct(passCount, recent.length)}% lulus` : "Belum ada data";
  $("#pass-sub").textContent = recent.length ? `${passCount} dari ${recent.length} siswa pada post-test 30 hari terakhir mencapai nilai ${v}` : "Belum ada post-test dalam 30 hari terakhir";
  $("#pass-save").disabled = v === T().settings.passScore;
}


/* ===================== View: submission detail (full page) ===================== */
function viewAttempt(key, id) {
  ui.test = key;
  const meta = TEST_META[key];
  const a = withDetail(attemptById(id));
  const crumbsBase = [[meta.name, `#/tes/${key}/soal`], ["Submission", `#/tes/${key}/submission`]];
  if (!a || a.test !== key) {
    main.innerHTML = `${pageHead({ crumbs: [...crumbsBase, ["Tidak ditemukan", ""]], title: "Submission tidak ditemukan" })}
      <section class="panel">${emptyHtml("Submission ini sudah dihapus atau tautannya salah.", "Kembali ke daftar submission untuk mencari dengan nama atau ID.", `<a class="btn btn--quiet btn--sm" href="#/tes/${key}/submission">Kembali ke daftar submission</a>`)}</section>`;
    return "Submission tidak ditemukan";
  }
  const t = testOf(key);
  const s = a.studentId ? studentById(a.studentId) : null;
  const level = a.levelKey ? levelByKey(a.levelKey) : null;
  const total = attemptTotal(a);
  const title = s ? s.name : a.contactName || "Submission tanpa nama";
  let notice = "";
  if (a.status === "void") notice = `<div class="notice" role="note">${icon("ban")}<div class="notice__body">Hasil ini dibatalkan oleh ${esc(a.voidBy)} pada ${esc(fmtDateTime(a.voidAt))}. Alasan: ${esc(a.voidReason || "tidak diisi.")} Skornya tidak dihitung di ringkasan dan profil siswa.</div></div>`;
  else if (a.status === "timeout") notice = `<div class="notice notice--neutral" role="note">${icon("clock")}<div class="notice__body">Tes berhenti karena waktu habis sebelum jawaban dikirim. Sistem tidak menyimpan jawaban dari percobaan yang gagal, jadi yang tercatat hanya waktu dan pelanggarannya.</div></div>`;
  else if (a.status === "violation") notice = `<div class="notice notice--neutral" role="note">${icon("alert")}<div class="notice__body">Tes berhenti setelah ${a.violations} kali pelanggaran fokus. Sistem tidak menyimpan jawaban dari percobaan yang gagal, jadi yang tercatat hanya waktu dan pelanggarannya.</div></div>`;
  else if (a.status === "nocontact") notice = `<div class="notice notice--neutral" role="note">${icon("user")}<div class="notice__body">Peserta sudah mengirim jawaban, tetapi menutup halaman sebelum mengisi nama, email, dan WhatsApp. Hasilnya tersimpan tanpa kontak dan tidak masuk ke Database Siswa.</div></div>`;
  else if (a.status === "progress") notice = `<div class="notice notice--neutral" role="note">${icon("clock")}<div class="notice__body">Tes ini sedang dikerjakan atau ditinggalkan sebelum selesai. Hasilnya muncul di sini setelah jawaban dikirim.</div></div>`;

  // Answer rows keep the order the questions were shown in. The key is the one stored at grading time;
  // rows graded before the dashboard existed fall back to the current key of the same question.
  const answerRows = (a.answers || []).map((x, i) => {
    const q = questionById(t, x.questionId);
    return { no: i + 1, q, r: { choice: x.choice, ok: x.ok, key: x.key || (q ? q.answer : "") } };
  });
  const hasAnswers = answerRows.length > 0;
  const skillRows = hasAnswers ? SKILLS.map((k) => {
    const rows = answerRows.filter((x) => x.q && x.q.skill === k);
    return { k, ok: rows.filter((x) => x.r.ok).length, n: rows.length };
  }).filter((r) => r.n) : [];
  const wrong = answerRows.filter((x) => x.r.choice && !x.r.ok).length;
  const blank = answerRows.filter((x) => !x.r.choice).length;
  const filter = ui.answers;
  const shownAnswers = answerRows.filter((x) => filter === "all" || (filter === "wrong" ? x.r.choice && !x.r.ok : !x.r.choice));
  let strike = 0;
  const logRows = (a.log || []).map((e) => {
    let text = LOG_TEXT[e.type] || e.type;
    if (e.strike) { strike += 1; text += `, pelanggaran ke-${strike}`; }
    if ((e.type === "email_sent" || e.type === "email_failed" || e.type === "email_resent") && s && s.email) text += ` ke ${s.email}`;
    if (e.type === "consent" && a.consent) text += ` versi ${a.consent}`;
    if (e.by) text += ` oleh ${e.by}`;
    return `<li class="feed__item"><span class="feed__icon" aria-hidden="true">${icon(e.strike ? "alert" : e.type.startsWith("email") ? "mail" : e.type === "voided" ? "ban" : "clock")}</span>
      <div><p class="feed__text">${esc(text)}</p><p class="feed__meta"><span class="log__time">${esc(fmtDate(e.at))}, ${esc(fmtTime(e.at, true))}</span></p></div></li>`;
  }).join("");
  const cell = (label, value, sub) => `<div class="stat"><p class="stat__label">${esc(label)}</p><p class="stat__value${/^\d/.test(value) ? "" : " stat__value--text"}">${value}</p><p class="stat__note">${esc(sub)}</p></div>`;
  const canResend = key === "placement" && a.status === "done";
  const pre = key === "post" && s ? latestGraded(s.id, "pre") : null;
  const nilai = nilaiOf(a);
  const c = s ? classById(s.classId) : null;
  const detailNote = a.loading ? "rincian sedang dimuat" : hasAnswers ? `${wrong} salah dan ${blank} kosong` : "";
  let cells;
  if (key === "placement") {
    cells = cell("Skor", a.score === null ? "Tidak dinilai" : `${a.score}<small> / ${total}</small>`, a.score === null ? "percobaan gagal tidak punya skor" : detailNote || `${a.score} jawaban benar`)
      + cell("Level", level ? esc(level.label) : "Tidak ada", level ? level.program : "level hanya untuk tes yang dinilai");
  } else {
    cells = cell("Nilai", nilai === null ? "Tidak dinilai" : `${nilai}<small> / 100</small>`, a.score === null ? "percobaan gagal tidak punya nilai" : [`${a.score} dari ${total} benar`, detailNote].filter(Boolean).join(", "))
      + (key === "post"
        ? cell("Hasil", a.passed === null ? "Tidak ada" : a.passed ? "Lulus" : "Belum lulus", a.passed === null ? "hasil hanya untuk tes yang dinilai" : `batas ${a.passScore}${pre ? `, pre-test ${nilaiOf(pre)}, ${nilai - nilaiOf(pre) >= 0 ? "naik" : "turun"} ${Math.abs(nilai - nilaiOf(pre))}` : ""}`)
        : cell("Tutor / Kelas", c ? esc(classLabel(c)) : "Belum ada kelas", s && programById(s.programId) ? `${programById(s.programId).name}, periode ${periodById(s.periodId) ? fmtDate(periodById(s.periodId).start) : "belum ditentukan"}` : "program belum dipilih"));
  }
  cells += cell("Durasi", fmtClock(a.durationSec), `dari batas ${fmtClock(a.limitSec)}`) + cell("Pelanggaran fokus", String(a.violations), `batas ${a.maxViolations || t.settings.maxViolations} kali sebelum tes berhenti`);
  const loadingRow = (text) => `<p class="loading-line" role="status">${esc(text)}</p>`;

  main.innerHTML = `
    ${pageHead({
      crumbs: [...crumbsBase, [`ID ${a.short}`, ""]],
      title,
      desc: `<p class="meta-line"><span>${esc(meta.name)}</span><span>Dimulai ${esc(fmtDateTime(a.startedAt))}</span>${a.device ? `<span>${esc(a.device)}</span>` : ""}${a.country ? `<span>${esc(a.country)}</span>` : ""}<span>${attemptStatusHtml(a)}</span></p>`,
      actions: `${s ? `<a class="btn btn--quiet" href="#/siswa/${s.id}">${icon("user")}Buka profil siswa</a>` : ""}
        ${canResend ? `<button class="btn btn--secondary" type="button" data-action="resend-email" data-id="${a.id}">${icon("send")}Kirim ulang email hasil</button>` : ""}
        <button class="icon-btn icon-btn--boxed" type="button" data-menu="attempt" data-id="${a.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Aksi lain">${icon("more")}</button>`,
    })}
    <div class="stack">
      ${notice}
      <section class="panel" aria-label="Ringkasan submission">
        <div class="stats">${cells}</div>
        ${skillRows.length ? `<div class="skills">${skillRows.map((r) => `<div class="skill">
          <div class="skill__top"><span class="skill__name">${esc(r.k)}</span><span class="skill__val">${r.ok} dari ${r.n} benar</span></div>
          <span class="bar" aria-hidden="true"><span class="bar__fill" data-w="${pct(r.ok, r.n)}"></span></span>
        </div>`).join("")}</div>` : ""}
      </section>

      <section class="panel">
        <header class="panel__head"><div>
          <h2 class="panel__title">Jawaban</h2>
          <p class="panel__desc">${a.loading ? "Jawaban sedang dimuat dari database." : hasAnswers ? "Kunci yang tampil adalah kunci saat submission ini dinilai, jadi tetap akurat walaupun soalnya sudah diubah." : "Jawaban tidak tersimpan karena tes berhenti sebelum dikirim."}</p>
        </div></header>
        ${a.loading ? loadingRow("Memuat jawaban...") : hasAnswers ? `<div class="toolbar toolbar--last toolbar--flush"><div class="chips" role="group" aria-label="Saring jawaban">
            ${chip("answers-filter", "all", "Semua", answerRows.length, filter === "all")}${chip("answers-filter", "wrong", "Salah", wrong, filter === "wrong")}${chip("answers-filter", "blank", "Kosong", blank, filter === "blank")}
          </div></div>
          ${shownAnswers.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th scope="col" class="is-no">No</th><th scope="col">Soal</th><th scope="col">Jawaban</th><th scope="col" class="hide-sm">Kunci</th><th scope="col">Hasil</th></tr></thead>
            <tbody>${shownAnswers.map(({ no, q, r }) => `<tr>
              <td class="is-no">${pad(no)}</td>
              <td>${q ? `<span class="clamp-1">${esc(q.prompt)}</span>` : `<span class="muted">Soal ini sudah dihapus dari bank soal.</span>`}</td>
              <td>${r.choice ? `<span class="${r.ok ? "" : "is-wrong"}">${r.choice}${q ? `, ${esc(q.options[r.choice])}` : ""}</span>` : `<span class="muted">Tidak dijawab</span>`}</td>
              <td class="hide-sm">${esc(r.key)}${q && q.options[r.key] ? `, ${esc(q.options[r.key])}` : ""}</td>
              <td>${r.ok ? `<span class="result result--ok">${icon("check")}Benar</span>` : r.choice ? `<span class="result result--bad">${icon("x")}Salah</span>` : `<span class="result result--none">Kosong</span>`}</td>
            </tr>`).join("")}</tbody></table></div>` : emptyHtml("Tidak ada jawaban di kelompok ini.", "Pilih kelompok lain untuk melihat jawabannya.")}`
          : ""}
      </section>

      <section class="panel">
        <header class="panel__head"><div>
          <h2 class="panel__title">Catatan sistem</h2>
          <p class="panel__desc">Urutan kejadian selama tes, termasuk persetujuan, pelanggaran fokus, dan pengiriman email. Alamat IP tidak disimpan.</p>
        </div></header>
        ${a.loading ? loadingRow("Memuat catatan sistem...") : `<ol class="feed">${logRows}</ol>`}
      </section>
    </div>`;
  return `${meta.name} ${a.short}`;
}

/* ===================== Router ===================== */
function route() {
  const raw = location.hash.replace(/^#\/?/, "") || "ringkasan";
  const [path, query] = raw.split("?");
  return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(query || "") };
}

function render() {
  if (!dataReady) return;
  closeMenu();
  let { parts, params } = route();
  if (parts[0] === "tes" && !TEST_KEYS.includes(parts[1])) {
    parts = ["tes", "placement", ["soal", "submission", "pengaturan"].includes(parts[1]) ? parts[1] : "soal"];
    history.replaceState(null, "", `#/${parts.join("/")}`);
  }
  const path = parts.join("/");
  let title, nav;
  if (parts[0] === "siswa" && parts[1]) { title = viewStudent(parts[1]); nav = "siswa"; }
  else if (parts[0] === "siswa") { title = viewStudents(params); nav = "siswa"; }
  else if (parts[0] === "tes" && parts[2] === "submission" && parts[3]) { title = viewAttempt(parts[1], parts[3]); nav = TEST_META[parts[1]].nav; }
  else if (parts[0] === "tes") { title = viewTest(parts[1], parts[2] || "soal"); nav = TEST_META[parts[1]].nav; }
  else if (parts[0] === "program") { title = viewPrograms(parts[1] || "program"); nav = "program"; }
  else { title = viewOverview(); nav = "ringkasan"; }
  $$(".nav__link").forEach((a) => { if (a.dataset.nav === nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const fresh = db.students.filter((s) => s.stage === "baru").length;
  $("#nav-new").innerHTML = fresh ? `<span aria-hidden="true">${fresh}</span><span class="sr-only">, ${fresh} calon siswa baru</span>` : "";
  $("#nav-new").hidden = !fresh;
  document.title = `${title} | Dasbor Titik Nol`;
  applyWidths();
  updateBulkBar();
  if (path !== ui.lastPath) {
    window.scrollTo(0, 0);
    ui.answers = "all";
    $("#main h1")?.focus({ preventScroll: true });
  }
  if (params.get("bagian") === "level") $("#panel-levels")?.scrollIntoView({ block: "start" });
  ui.lastPath = path;
}

/* ===================== Sidebar ===================== */
function setNav(collapsed, persist = true) {
  document.body.classList.toggle("nav-collapsed", collapsed);
  const b = $(".nav-toggle");
  const label = collapsed ? "Lebarkan menu" : "Ciutkan menu";
  b.setAttribute("aria-expanded", String(!collapsed));
  b.setAttribute("aria-label", label);
  b.title = label;
  b.querySelector("use").setAttribute("href", collapsed ? "#i-panel-open" : "#i-panel-close");
  if (persist) { try { localStorage.setItem("tnec-nav-collapsed", collapsed ? "1" : "0"); } catch (e) { /* storage can be off */ } }
}

/* ===================== Toasts ===================== */
function toast(message, action) {
  const region = $("#toasts");
  const el = document.createElement("div");
  el.className = "toast";
  const text = document.createElement("span");
  text.textContent = message;
  el.appendChild(text);
  if (action) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "toast__action"; b.textContent = action.label;
    b.addEventListener("click", () => { el.remove(); action.run(); });
    el.appendChild(b);
  }
  region.appendChild(el);
  while (region.children.length > 3) region.firstElementChild.remove();
  setTimeout(() => el.remove(), action ? 7000 : 5000);
}

/* ===================== Menus ===================== */
let menuState = null;
function openMenu(anchor, items) {
  if (menuState && menuState.anchor === anchor) { closeMenu(true); return; }
  closeMenu();
  const menu = $("#menu");
  menu.innerHTML = items.map((it, i) => {
    if (it.sep) return `<div class="menu__sep" role="separator"></div>`;
    if (it.heading) return `<p class="menu__label">${esc(it.heading)}</p>`;
    return `<button class="menu__item${it.danger ? " menu__item--danger" : ""}" type="button" role="menuitem" data-index="${i}" ${it.disabled ? "disabled" : ""}>${it.icon ? icon(it.icon, "icon--sm") : ""}<span>${esc(it.label)}</span></button>`;
  }).join("");
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = r.right - mw;
  if (left < 8) left = Math.min(r.left, window.innerWidth - mw - 8);
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${top}px`;
  anchor.setAttribute("aria-expanded", "true");
  menuState = { anchor, items };
  menu.querySelector(".menu__item:not([disabled])")?.focus();
}
function closeMenu(returnFocus) {
  if (!menuState) return;
  $("#menu").hidden = true;
  menuState.anchor.setAttribute("aria-expanded", "false");
  if (returnFocus && document.contains(menuState.anchor)) menuState.anchor.focus();
  menuState = null;
}

function contextMenu(el) {
  const kind = el.dataset.menu, id = el.dataset.id;
  if (kind === "question") {
    const t = T(), q = questionById(t, id), idx = t.questions.indexOf(q);
    return [
      { label: "Ubah soal", icon: "pencil", run: () => openQuestionEditor(q.id) },
      { label: "Duplikat sebagai draf", icon: "copy", run: () => questionAction(q, "duplicate", "Salinan soal tersimpan sebagai draf di bawah soal aslinya.") },
      { sep: true },
      { label: "Pindah ke atas", icon: "arrow-up", disabled: idx === 0, run: () => questionAction(q, "up", "Urutan soal diperbarui.") },
      { label: "Pindah ke bawah", icon: "arrow-down", disabled: idx === t.questions.length - 1, run: () => questionAction(q, "down", "Urutan soal diperbarui.") },
      { label: q.status === "aktif" ? "Jadikan draf" : "Aktifkan di tes", icon: q.status === "aktif" ? "eye-off" : "eye", run: () => questionAction(q, "toggle", q.status === "aktif" ? "Soal sekarang draf dan tidak tampil di tes." : "Soal aktif kembali di tes.") },
      { sep: true },
      { label: "Hapus soal", icon: "trash", danger: true, run: () => deleteQuestion(q) },
    ];
  }
  if (kind === "student") {
    const s = studentById(id);
    return [{ label: "Hapus siswa", icon: "trash", danger: true, run: () => deleteStudents([s.id], true) }];
  }
  if (kind === "send-test") {
    const s = studentById(id);
    return [{ heading: "Kirim tautan lewat WhatsApp" }, ...TEST_KEYS.map((k) => ({ label: TEST_META[k].name, run: () => sendTestLink(s, k) }))];
  }
  if (kind === "attempt") {
    const a = attemptById(id);
    const items = [];
    if (a.status === "done" || a.status === "nocontact") items.push({ label: "Batalkan hasil", icon: "ban", run: () => voidAttempt(a) });
    if (a.status === "void") items.push({ label: "Pulihkan hasil", icon: "undo", run: () => mutate(() => api(`/api/admin/attempts/${a.id}/restore`, { method: "POST" }), "Hasil dipulihkan dan kembali dihitung.") });
    if (items.length) items.push({ sep: true });
    items.push({ label: "Hapus submission", icon: "trash", danger: true, run: () => deleteAttempts([a.id], true) });
    return items;
  }
  if (kind === "bulk-stage") return [{ heading: "Ubah status menjadi" }, ...STAGES.map((st) => ({ label: st.label, run: () => bulkStudents("stage", st.key, `Status siswa terpilih sekarang ${st.label}.`) }))];
  if (kind === "bulk-period") return [{ heading: "Atur periode menjadi" }, ...periodsSorted().filter((p) => p.start > NOW - 20 * DAY).map((p) => ({ label: fmtDate(p.start), run: () => bulkStudents("period", p.id, `Siswa terpilih diatur ke periode ${fmtDate(p.start)}. Atur kelasnya dari halaman siswa.`) })), { sep: true }, { label: "Kosongkan periode", run: () => bulkStudents("period", null, "Periode siswa terpilih dikosongkan.") }];
  if (kind === "program") {
    const p = programById(id);
    const used = db.students.some((s) => s.programId === p.id) || db.classes.some((c) => c.programId === p.id);
    return [
      { label: p.status === "aktif" ? "Nonaktifkan program" : "Aktifkan program", icon: p.status === "aktif" ? "eye-off" : "eye", run: () => mutate(() => api(`/api/admin/programs/${p.id}`, { method: "PUT", body: { ...p, status: p.status === "aktif" ? "nonaktif" : "aktif" } }), p.status === "aktif" ? `${p.name} nonaktif dan tidak muncul di formulir siswa.` : `${p.name} aktif dan muncul lagi di formulir siswa.`) },
      { sep: true },
      { label: used ? "Hapus program, masih dipakai" : "Hapus program", icon: "trash", danger: true, disabled: used, run: () => confirmThen(`Hapus ${p.name}?`, "Program ini belum dipakai siswa atau kelas mana pun, jadi aman dihapus.", "Hapus program", () => api(`/api/admin/programs/${p.id}`, { method: "DELETE" }), `${p.name} dihapus.`) },
    ];
  }
  if (kind === "period") {
    const p = periodById(id);
    const used = db.students.some((s) => s.periodId === p.id) || db.classes.some((c) => c.periodId === p.id);
    return [
      { label: "Lihat siswa periode ini", icon: "users", run: () => { location.hash = `#/siswa?periode=${p.id}`; } },
      { sep: true },
      { label: used ? "Hapus periode, masih dipakai" : "Hapus periode", icon: "trash", danger: true, disabled: used, run: () => confirmThen(`Hapus periode ${fmtDate(p.start)}?`, "Periode ini belum punya siswa atau kelas, jadi aman dihapus.", "Hapus periode", () => api(`/api/admin/periods/${p.id}`, { method: "DELETE" }), "Periode dihapus.") },
    ];
  }
  if (kind === "class") {
    const c = classById(id);
    const n = studentsInClass(c).length;
    return [
      { label: "Lihat siswa kelas ini", icon: "users", run: () => { Object.assign(ui.students, { q: c.code, stage: "all", program: c.programId, period: c.periodId, tutor: c.tutor, level: "", page: 1 }); location.hash = "#/siswa"; } },
      { sep: true },
      { label: n ? "Hapus kelas, masih ada siswa" : "Hapus kelas", icon: "trash", danger: true, disabled: !!n, run: () => confirmThen(`Hapus kelas ${c.code}?`, "Kelas ini belum berisi siswa, jadi aman dihapus.", "Hapus kelas", () => api(`/api/admin/classes/${c.id}`, { method: "DELETE" }), `Kelas ${c.code} dihapus.`) },
    ];
  }
  if (kind === "tutor") {
    const used = db.classes.some((c) => c.tutor === id);
    return [{ label: used ? "Hapus tutor, masih mengajar" : "Hapus tutor", icon: "trash", danger: true, disabled: used, run: () => confirmThen(`Hapus ${id}?`, "Tutor ini belum mengajar kelas mana pun. Namanya juga dihapus dari daftar tutor setiap program.", "Hapus tutor", () => api(`/api/admin/tutors/${db.tutorIds.get(id)}`, { method: "DELETE" }), `${id} dihapus dari daftar tutor.`) }];
  }
  return [];
}

/* ===================== Dialog helpers ===================== */
function clearErrors(root) {
  $$(".error", root).forEach((e) => { e.hidden = true; e.textContent = ""; });
  $$(".is-invalid", root).forEach((e) => { e.classList.remove("is-invalid"); e.removeAttribute("aria-invalid"); });
}
function fieldError(input, errId, message) {
  const err = $(`#${errId}`);
  if (err) { err.textContent = message; err.hidden = false; }
  if (input) { input.classList.add("is-invalid"); input.setAttribute("aria-invalid", "true"); if (err) input.setAttribute("aria-describedby", errId); }
}
function confirmDialog({ title, message, confirmLabel, danger = true, reasonLabel = "", reasonPlaceholder = "" }) {
  const dlg = $("#dlg-confirm");
  $("#cf-title").textContent = title;
  $("#cf-message").textContent = message;
  $("#cf-reason-field").hidden = !reasonLabel;
  $("#cf-reason-label").textContent = reasonLabel;
  $("#cf-reason").value = "";
  $("#cf-reason").placeholder = reasonPlaceholder;
  const ok = $("#cf-ok");
  ok.textContent = confirmLabel;
  ok.className = `btn ${danger ? "btn--danger" : "btn--primary"}`;
  dlg.returnValue = "";
  dlg.showModal();
  (reasonLabel ? $("#cf-reason") : $("#cf-cancel")).focus();
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => resolve({ ok: dlg.returnValue === "ok", reason: $("#cf-reason").value.trim() }), { once: true });
  });
}
async function confirmThen(title, message, confirmLabel, work, success) {
  const r = await confirmDialog({ title, message, confirmLabel });
  if (r.ok) await mutate(work, success);
}
function busy(button, label) {
  if (!button) return () => {};
  const old = button.textContent;
  button.disabled = true;
  button.textContent = label;
  return () => { button.disabled = false; button.textContent = old; };
}

let formSpec = null;
function openFormDialog(spec) {
  formSpec = spec;
  const dlg = $("#dlg-form");
  $("#gf-title").textContent = spec.title;
  $("#gf-sub").textContent = spec.sub || "";
  $("#gf-save").textContent = spec.submitLabel;
  $("#gf-body").innerHTML = spec.fields.map((f) => {
    const attrs = `class="${f.type === "select" ? "select" : f.type === "textarea" ? "textarea" : "input"}" id="gf-${f.id}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ""}${f.min !== undefined ? ` min="${f.min}"` : ""}${f.max !== undefined ? ` max="${f.max}"` : ""}`;
    const control = f.type === "select" ? `<select ${attrs}>${options(f.options, f.value ?? "")}</select>`
      : f.type === "textarea" ? `<textarea ${attrs} rows="3">${esc(f.value ?? "")}</textarea>`
      : `<input ${attrs} type="${f.type || "text"}" value="${esc(f.value ?? "")}" autocomplete="off">`;
    return `<div class="field"><label class="label" for="gf-${f.id}">${esc(f.label)}</label>${control}${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ""}<p class="error" id="gf-${f.id}-err" hidden></p></div>`;
  }).join("");
  clearErrors(dlg);
  dlg.showModal();
  $(`#gf-${spec.fields[0].id}`).focus();
}

/* ===================== Questions ===================== */
let editingQuestionId = null;
function openQuestionEditor(id) {
  const t = T();
  const q = id ? questionById(t, id) : null;
  editingQuestionId = q ? q.id : null;
  const dlg = $("#dlg-question");
  clearErrors(dlg);
  const num = q ? questionNumber(t, q) : null;
  const name = TEST_META[ui.test].name;
  $("#qe-title").textContent = q ? (num ? `Ubah soal ${num}` : "Ubah soal draf") : "Tambah soal";
  $("#qe-sub").textContent = q ? `${name}, ${q.skill}, ${q.status === "aktif" ? "aktif di tes" : "masih draf dan belum tampil di tes"}` : `${name}. Soal baru masuk di urutan terakhir.`;
  $("#qe-prompt").value = q ? q.prompt : "";
  $("#qe-has-passage").checked = !!(q && q.passage);
  $("#qe-passage").value = q ? q.passage : "";
  $("#qe-passage-field").hidden = !(q && q.passage);
  $("#qe-options").innerHTML = KEYS.map((k) => `<div class="opt-row${q && q.answer === k ? " is-key" : ""}">
    <label class="key-label"><input class="key-radio" type="radio" name="qe-key" value="${k}" data-change="qe-key" ${q && q.answer === k ? "checked" : ""}><span class="key" aria-hidden="true">${k}</span><span class="sr-only">Tandai ${k} sebagai jawaban benar</span></label>
    <input class="input" id="qe-opt-${k}" type="text" aria-label="Teks pilihan ${k}" value="${esc(q ? q.options[k] : "")}" autocomplete="off">
    <span class="opt-flag">Kunci</span>
  </div>`).join("");
  $("#qe-skill").value = q ? q.skill : "Grammar";
  $("#qe-status").value = q ? q.status : "aktif";
  const per = t.settings.timeMode === "per";
  $("#qe-seconds-field").hidden = !per;
  $("#qe-meta").className = per ? "form-grid form-grid--3" : "form-grid";
  $("#qe-seconds").value = q ? q.seconds : t.settings.perDefault;
  $("#qe-time-hint").textContent = per
    ? "Mode waktu per soal sedang aktif, jadi waktu di atas hanya berlaku untuk soal ini."
    : `Mode waktu ${name} sekarang total ${fmtSpan(t.settings.totalSeconds)} untuk seluruh tes, jadi soal ini tidak punya waktu sendiri. Ganti mode di bagian Pengaturan kalau ingin memakai waktu per soal.`;
  $("#qe-delete").hidden = !q;
  $("#qe-note").hidden = !q;
  dlg.showModal();
  $("#qe-prompt").focus();
}

async function saveQuestion(form) {
  clearErrors(form);
  const t = T();
  const prompt = $("#qe-prompt").value.trim();
  const hasPassage = $("#qe-has-passage").checked;
  const passage = hasPassage ? $("#qe-passage").value.trim() : "";
  const opts = {};
  KEYS.forEach((k) => { opts[k] = $(`#qe-opt-${k}`).value.trim(); });
  const key = form.querySelector('input[name="qe-key"]:checked')?.value || "";
  const per = t.settings.timeMode === "per";
  const seconds = Number($("#qe-seconds").value);
  let first = null;
  const fail = (input, errId, msg) => { fieldError(input, errId, msg); if (!first) first = input; };
  if (!prompt) fail($("#qe-prompt"), "qe-prompt-err", "Teks soal wajib diisi.");
  if (hasPassage && !passage) fail($("#qe-passage"), "qe-passage-err", "Bacaan wajib diisi kalau opsi bacaan dicentang.");
  const empty = KEYS.filter((k) => !opts[k]);
  if (empty.length) {
    empty.forEach((k) => $(`#qe-opt-${k}`).classList.add("is-invalid"));
    fail($(`#qe-opt-${empty[0]}`), "qe-options-err", empty.length === 4 ? "Isi keempat pilihan jawaban." : `Pilihan ${joinWords(empty)} masih kosong.`);
  } else if (new Set(KEYS.map((k) => opts[k].toLowerCase())).size < 4) {
    fail($("#qe-opt-A"), "qe-options-err", "Ada pilihan jawaban yang sama. Setiap pilihan harus berbeda.");
  } else if (!key) {
    fail(form.querySelector(".key-radio"), "qe-options-err", "Pilih satu jawaban yang benar dengan mengklik hurufnya.");
  }
  if (per && (!Number.isInteger(seconds) || seconds < 5 || seconds > 180)) fail($("#qe-seconds"), "qe-seconds-err", "Waktu soal harus antara 5 dan 180 detik.");
  if (first) { first.focus(); return; }

  const body = { prompt, passage, options: opts, answer: key, skill: $("#qe-skill").value, status: $("#qe-status").value, ...(per ? { seconds } : {}) };
  const done = busy(form.querySelector('[type="submit"]'), "Menyimpan...");
  const editing = editingQuestionId;
  const result = await mutate(
    () => api(editing ? `/api/admin/tests/${ui.test}/questions/${editing}` : `/api/admin/tests/${ui.test}/questions`, { method: editing ? "PUT" : "POST", body }),
    (r) => (editing ? `Soal tersimpan.${r.keyChanged ? " Kunci baru berlaku untuk submission berikutnya." : ""}` : body.status === "aktif" ? "Soal baru tersimpan di urutan terakhir." : "Soal baru tersimpan sebagai draf."),
  );
  done();
  if (result) $("#dlg-question").close();
}

function questionAction(q, action, success) {
  return mutate(() => api(`/api/admin/tests/${ui.test}/questions/${q.id}/${action}`, { method: "POST" }), success);
}
async function deleteQuestion(q) {
  const num = questionNumber(T(), q);
  const r = await confirmDialog({
    title: num ? `Hapus soal ${num}?` : "Hapus soal draf ini?",
    message: "Soal ini tidak akan tampil lagi di tes. Submission yang sudah masuk tetap menyimpan jawaban dan nilainya.",
    confirmLabel: "Hapus soal",
  });
  if (!r.ok) return;
  if ($("#dlg-question").open) $("#dlg-question").close();
  await mutate(() => api(`/api/admin/tests/${ui.test}/questions/${q.id}`, { method: "DELETE" }), "Soal dihapus.");
}

/* ===================== Students ===================== */
let editingStudentId = null;
function fillClassOptions(classId) {
  const pid = $("#sf-program").value, per = $("#sf-period").value;
  const list = pid && per ? classesFor(pid, per) : [];
  $("#sf-class").innerHTML = pid && per
    ? options([["", list.length ? "Belum ada kelas" : "Belum ada kelas untuk program dan periode ini"], ...list.map((c) => [c.id, classLabel(c)])], classId || "")
    : `<option value="">Pilih program dan periode dulu</option>`;
  $("#sf-class").disabled = !(pid && per);
}
function fillDurationOptions(durationId) {
  const p = programById($("#sf-program").value);
  $("#sf-duration").innerHTML = p ? options(p.durations.map((d) => [d.id, `${d.label}${d.price ? `, ${fmtRp(d.price)}` : ""}`]), durationId || "") : `<option value="">Pilih program dulu</option>`;
  $("#sf-duration").disabled = !p;
}
function openStudentForm(id) {
  const s = id ? studentById(id) : null;
  editingStudentId = s ? s.id : null;
  const dlg = $("#dlg-student");
  clearErrors(dlg);
  $("#sf-title").textContent = s ? "Ubah data siswa" : "Tambah siswa";
  $("#sf-sub").textContent = s ? "Perubahan langsung terlihat oleh seluruh tim admin dan pendidikan." : "Peserta placement test masuk otomatis. Formulir ini untuk calon siswa yang datang lewat jalur lain.";
  $("#sf-name").value = s ? s.name : "";
  $("#sf-wa").value = s ? fmtWa(s.wa) : "";
  $("#sf-email").value = s ? s.email : "";
  $("#sf-city").value = s ? s.city : "";
  $("#sf-source").innerHTML = options(SOURCES.map((x) => [x, x]), s ? s.source : "WhatsApp");
  $("#sf-stage").innerHTML = options(STAGES.map((x) => [x.key, x.label]), s ? s.stage : "baru");
  $("#sf-program").innerHTML = options([["", "Belum dipilih"], ...db.programs.filter((p) => p.status === "aktif" || (s && p.id === s.programId)).map((p) => [p.id, `${p.name}, ${p.mode}`])], s ? s.programId || "" : "");
  fillDurationOptions(s ? s.durationId : "");
  $("#sf-period").innerHTML = options(periodOptions("Belum ditentukan"), s ? s.periodId || "" : "");
  fillClassOptions(s ? s.classId : "");
  $("#sf-note-field").hidden = !!s;
  $("#sf-note").value = "";
  $("#sf-save").textContent = s ? "Simpan perubahan" : "Simpan siswa";
  dlg.showModal();
  $("#sf-name").focus();
}

async function saveStudent(form) {
  clearErrors(form);
  const name = $("#sf-name").value.trim().replace(/\s+/g, " ");
  const waRaw = $("#sf-wa").value.trim();
  const wa = normalizeWa(waRaw);
  const email = $("#sf-email").value.trim().toLowerCase();
  const stage = $("#sf-stage").value;
  const programId = $("#sf-program").value || null, periodId = $("#sf-period").value || null;
  let first = null;
  const fail = (input, errId, msg) => { fieldError(input, errId, msg); if (!first) first = input; };
  if (name.length < 2) fail($("#sf-name"), "sf-name-err", "Nama minimal 2 karakter.");
  if (!waRaw) fail($("#sf-wa"), "sf-wa-err", "Nomor WhatsApp wajib diisi.");
  else if (!/^62\d{8,13}$/.test(wa)) fail($("#sf-wa"), "sf-wa-err", "Nomor WhatsApp terlihat belum lengkap. Periksa lagi jumlah digitnya.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail($("#sf-email"), "sf-email-err", "Format email belum benar.");
  if (stage === "terdaftar" && (!programId || !periodId)) {
    const target = !programId ? $("#sf-program") : $("#sf-period");
    target.classList.add("is-invalid");
    if (!first) first = target;
    toast("Siswa berstatus Terdaftar perlu program dan periode.");
  }
  if (first) { first.focus(); return; }
  const body = {
    name, wa, email, city: $("#sf-city").value.trim(), source: $("#sf-source").value, stage,
    programId, durationId: programId ? $("#sf-duration").value || null : null, periodId, classId: $("#sf-class").value || null,
  };
  if (!editingStudentId) body.note = $("#sf-note").value.trim();
  const done = busy($("#sf-save"), "Menyimpan...");
  try {
    const editing = editingStudentId;
    const r = await api(editing ? `/api/admin/students/${editing}` : "/api/admin/students", { method: editing ? "PATCH" : "POST", body });
    $("#dlg-student").close();
    await loadData();
    if (!editing) location.hash = `#/siswa/${r.id}`;
    render();
    toast(editing ? `Data ${firstName(name)} tersimpan.` : `${name} ditambahkan ke database.`);
  } catch (error) {
    if (error.field === "wa") fieldError($("#sf-wa"), "sf-wa-err", error.message);
    else if (error.field === "email") fieldError($("#sf-email"), "sf-email-err", error.message);
    else toast(error.message);
  } finally {
    done();
  }
}

function patchStudent(s, body, success) {
  return mutate(() => api(`/api/admin/students/${s.id}`, { method: "PATCH", body }), success);
}
function markContacted(s) {
  const before = s.stage;
  return patchStudent(s, { stage: "dihubungi" }).then((ok) => {
    if (ok) toast(`${firstName(s.name)} ditandai sudah dihubungi.`, { label: "Urungkan", run: () => patchStudent(s, { stage: before }, "Status dikembalikan.") });
  });
}
async function deleteStudents(ids, single) {
  const list = ids.map(studentById).filter(Boolean);
  if (!list.length) return;
  const r = await confirmDialog({
    title: single ? `Hapus data ${list[0].name}?` : `Hapus ${list.length} siswa?`,
    message: "Data kontak, kelas, catatan, dan riwayat aktivitas akan terhapus. Submission placement test tetap tersimpan tanpa nama, sedangkan pre-test dan post-test ikut terhapus.",
    confirmLabel: single ? "Hapus siswa" : `Hapus ${list.length} siswa`,
  });
  if (!r.ok) return;
  const ok = await mutate(() => (single ? api(`/api/admin/students/${ids[0]}`, { method: "DELETE" }) : api("/api/admin/students/bulk", { method: "POST", body: { action: "delete", ids } })),
    single ? `Data ${list[0].name} dihapus.` : `${list.length} siswa dihapus.`);
  if (ok) { ids.forEach((id) => ui.students.selected.delete(id)); if (single && route().parts[1]) location.hash = "#/siswa"; else render(); }
}
async function bulkStudents(action, value, success) {
  const ids = [...ui.students.selected];
  const ok = await mutate(() => api("/api/admin/students/bulk", { method: "POST", body: { action, value, ids } }), success);
  if (ok) { ui.students.selected.clear(); render(); }
}

/* ===================== Students: status, class, WhatsApp, and test links ===================== */
async function refresh() { await loadData(); render(); }
const sessionEnded = (error) => error && error.message === "Sesi berakhir.";

function setStage(s, stage) {
  if (!s || s.stage === stage) return Promise.resolve(null);
  return patchStudent(s, { stage }, `Status ${firstName(s.name)} sekarang ${stageOf(stage).label}.`).then((r) => { if (!r) render(); return r; });
}
function setClass(s, classId) {
  const c = classById(classId);
  if (!s || (s.classId || null) === (c ? c.id : null)) return Promise.resolve(null);
  const success = c ? `${firstName(s.name)} sekarang di kelas ${classLabel(c)}.` : `${firstName(s.name)} tidak lagi terdaftar di kelas mana pun.`;
  return patchStudent(s, { classId: c ? c.id : null }, success).then((r) => { if (!r) render(); return r; });
}

function greetingFor(s) {
  const intro = `Halo ${firstName(s.name)}, saya ${firstName(ME)} dari Titik Nol English Course.`;
  if (s.stage === "terdaftar" || s.stage === "lepas") return `${intro} `;
  const a = latestGraded(s.id, "placement");
  const level = a ? levelByKey(a.levelKey) : null;
  if (level) return `${intro} Terima kasih sudah mengerjakan placement test Titik Nol. Hasilnya menunjukkan level kamu ada di ${level.label}, jadi ${level.program} paling cocok untuk mulai belajar. Kalau kamu mau, saya bisa bantu jelaskan pilihan durasi dan jadwal kelas terdekat.`;
  return `${intro} Saya mau menindaklanjuti minat kamu untuk belajar bahasa Inggris di Titik Nol. Kalau berkenan, saya bisa bantu jelaskan pilihan program dan jadwal kelas terdekat.`;
}

function testLinkText(s, key, link, expiresAt) {
  const t = testOf(key);
  const facts = `${activeQuestions(t).length} soal dan dikerjakan dalam ${fmtSpan(testSeconds(t))}`;
  const first = firstName(s.name);
  const until = expiresAt ? ` Tautan ini khusus untuk kamu dan berlaku sampai ${fmtDateLong(expiresAt)}.` : "";
  if (key === "placement") return `Halo ${first}, ini tautan placement test Titik Nol English Course:\n${link}\n\nTesnya berisi ${facts}. Setelah selesai, rekomendasi level dan program akan dikirim ke email kamu. Kerjakan di tempat yang tenang dengan koneksi internet yang stabil, ya.`;
  if (key === "pre") return `Halo ${first}, sebelum kelas dimulai, silakan kerjakan pre-test lewat tautan ini:\n${link}\n\nPre-test berisi ${facts}. Nilainya kami pakai sebagai titik awal untuk melihat perkembangan kamu selama program.${until}`;
  return `Halo ${first}, program kamu sudah hampir selesai. Silakan kerjakan post-test lewat tautan ini:\n${link}\n\nPost-test berisi ${facts}. Hasilnya kami pakai untuk menentukan apakah kamu sudah siap lanjut ke level berikutnya.${until}`;
}

/* Messages go out through AttCos on the server. The browser never sees the API key. */
let waState = null;
function openWhatsApp(s, opts = {}) {
  if (!s) return;
  if (!s.wa) { toast("Siswa ini belum punya nomor WhatsApp."); return; }
  waState = { id: s.id, label: opts.label || "Mengirim pesan" };
  const dlg = $("#dlg-wa");
  clearErrors(dlg);
  $("#wa-title").textContent = opts.title || `Kirim WhatsApp ke ${firstName(s.name)}`;
  $("#wa-sub").textContent = `${s.name}, ${fmtWa(s.wa)}`;
  $("#wa-text").value = opts.text || greetingFor(s);
  $("#wa-link-field").hidden = !opts.link;
  $("#wa-link").value = opts.link || "";
  $("#wa-link-hint").textContent = opts.linkHint || "";
  $("#wa-copy").textContent = "Salin";
  const on = db.whatsapp.configured;
  $("#wa-off").hidden = on;
  $("#wa-send").disabled = !on;
  syncWaForm();
  dlg.showModal();
  const box = $("#wa-text");
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
}
function syncWaForm() {
  const s = waState ? studentById(waState.id) : null;
  const text = $("#wa-text").value;
  $("#wa-count").textContent = `${fmtNum(text.length)} dari 4.000 karakter`;
  $("#wa-open").href = s ? `https://wa.me/${s.wa}?text=${encodeURIComponent(text.trim())}` : "#";
}
async function sendWa(form) {
  clearErrors(form);
  const s = waState ? studentById(waState.id) : null;
  if (!s) return;
  const box = $("#wa-text");
  const text = box.value.trim();
  if (!text) { fieldError(box, "wa-err", "Tulis pesan dulu sebelum mengirim."); box.focus(); return; }
  if (text.length > 4000) { fieldError(box, "wa-err", "Pesan terlalu panjang. Batasnya 4.000 karakter."); box.focus(); return; }
  const done = busy($("#wa-send"), "Mengirim...");
  let sent = false;
  try {
    await api(`/api/admin/students/${s.id}/whatsapp`, { method: "POST", body: { text, label: waState.label } });
    sent = true;
    $("#dlg-wa").close();
    toast(`Pesan WhatsApp terkirim ke ${firstName(s.name)}.`);
  } catch (error) {
    if (sessionEnded(error)) return;
    fieldError(box, "wa-err", error.message);
  } finally {
    done();
    if (!sent && !db.whatsapp.configured) $("#wa-send").disabled = true;
  }
  // Failed sends are logged too, so the activity feed is refreshed either way.
  refresh().catch(() => {});
}

async function sendTestLink(s, key) {
  const t = testOf(key), name = TEST_META[key].name;
  if (!activeQuestions(t).length) {
    toast(`${name} belum punya soal aktif. Aktifkan soal dulu sebelum mengirim tautan.`, { label: "Buka soal", run: () => { location.hash = `#/tes/${key}/soal`; } });
    return;
  }
  if (!t.settings.open) {
    toast(`${name} masih ditutup. Buka tesnya dulu di Pengaturan supaya tautannya bisa dipakai.`, { label: "Buka pengaturan", run: () => { location.hash = `#/tes/${key}/pengaturan`; } });
    return;
  }
  try {
    const r = await api(`/api/admin/students/${s.id}/invite`, { method: "POST", body: { test: key } });
    openWhatsApp(s, {
      title: `Kirim tautan ${name} ke ${firstName(s.name)}`,
      text: testLinkText(s, key, r.link, r.expiresAt),
      label: `Mengirim tautan ${name}`,
      link: r.link,
      linkHint: key === "placement"
        ? "Tautan umum placement test. Hasilnya masuk ke data siswa ini kalau email atau nomor WhatsApp yang diisi sama."
        : `Tautan khusus untuk ${firstName(s.name)}. Hanya bisa dipakai sekali dan berlaku sampai ${fmtDateLong(r.expiresAt)}.`,
    });
  } catch (error) {
    if (!sessionEnded(error)) toast(error.message);
  }
}

/* ===================== Programs, periods, classes, tutors ===================== */
let editingProgramId = null;
function failFrom(error, fail, fieldId) {
  if (sessionEnded(error)) return false;
  return fail(fieldId, error.message);
}
function durationRow(d = {}) {
  return `<div class="dur-row" data-dur-id="${esc(d.id || "")}">
    <input class="input" type="text" aria-label="Nama durasi" placeholder="Contoh: 1 bulan" value="${esc(d.label || "")}">
    <input class="input tnum" type="number" min="1" max="365" aria-label="Jumlah hari" placeholder="30" value="${esc(d.days || "")}">
    <input class="input tnum dur-price" type="number" min="0" step="50000" aria-label="Harga dalam rupiah" placeholder="Boleh kosong" value="${esc(d.price || "")}">
    <button class="icon-btn" type="button" data-action="pg-remove-duration" aria-label="Hapus durasi ini">${icon("trash", "icon--sm")}</button>
  </div>`;
}
function openProgramDialog(id) {
  const p = id ? programById(id) : null;
  editingProgramId = p ? p.id : null;
  const dlg = $("#dlg-program");
  clearErrors(dlg);
  $("#pg-title").textContent = p ? `Ubah ${p.name}` : "Tambah program";
  $("#pg-sub").textContent = p ? `${enrolledIn((s) => s.programId === p.id)} siswa terdaftar memakai program ini.` : "Program baru langsung bisa dipilih di formulir siswa.";
  $("#pg-name").value = p ? p.name : "";
  $("#pg-mode").innerHTML = options(MODES.map((m) => [m, m]), p ? p.mode : "Offline di Pare");
  $("#pg-status").value = p ? p.status : "aktif";
  $("#pg-durations").innerHTML = `<div class="dur-row dur-head" aria-hidden="true"><span>Nama durasi</span><span>Hari</span><span class="dur-price">Harga (Rp)</span><span></span></div>`
    + (p ? p.durations : [{}]).map(durationRow).join("");
  $("#pg-tutors").innerHTML = db.tutors.length
    ? db.tutors.map((t) => `<label class="check"><input type="checkbox" value="${esc(t)}" ${p && p.tutors.includes(t) ? "checked" : ""}><span>${esc(t)}</span></label>`).join("")
    : `<p class="hint">Belum ada tutor. Tambahkan tutor di tab Kelas &amp; Tutor, lalu centang namanya di sini.</p>`;
  dlg.showModal();
  $("#pg-name").focus();
}
async function saveProgram(form) {
  clearErrors(form);
  const name = $("#pg-name").value.trim().replace(/\s+/g, " ");
  const rows = $$("#pg-durations .dur-row:not(.dur-head)").map((row) => {
    const [label, days, price] = $$("input", row);
    return { id: row.dataset.durId, label: label.value.trim(), days: Number(days.value), price: price.value === "" ? null : Number(price.value), inputs: [label, days, price] };
  });
  let first = null;
  const fail = (input, errId, msg) => { fieldError(input, errId, msg); if (!first) first = input || $("#pg-name"); };
  if (!name) fail($("#pg-name"), "pg-name-err", "Nama program wajib diisi.");
  else if (db.programs.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== editingProgramId)) fail($("#pg-name"), "pg-name-err", "Nama program ini sudah ada.");
  if (!rows.length) fail(null, "pg-dur-err", "Tambahkan minimal satu durasi.");
  for (const r of rows) {
    if (!r.label) { fail(r.inputs[0], "pg-dur-err", "Setiap durasi perlu nama, misalnya 2 minggu atau 1 bulan."); break; }
    if (!Number.isInteger(r.days) || r.days < 1 || r.days > 365) { fail(r.inputs[1], "pg-dur-err", `Jumlah hari untuk ${r.label} harus antara 1 dan 365.`); break; }
    if (r.price !== null && (!Number.isInteger(r.price) || r.price < 0)) { fail(r.inputs[2], "pg-dur-err", `Harga ${r.label} harus angka bulat dan tidak boleh negatif.`); break; }
  }
  if (!first && new Set(rows.map((r) => r.label.toLowerCase())).size < rows.length) fail(rows[0].inputs[0], "pg-dur-err", "Ada nama durasi yang sama. Setiap durasi harus berbeda.");
  const old = editingProgramId ? programById(editingProgramId) : null;
  if (!first && old) {
    const kept = new Set(rows.map((r) => r.id).filter(Boolean));
    const inUse = old.durations.filter((d) => !kept.has(d.id)).find((d) => db.students.some((s) => s.durationId === d.id));
    if (inUse) fail(null, "pg-dur-err", `Durasi ${inUse.label} masih dipakai ${db.students.filter((s) => s.durationId === inUse.id).length} siswa, jadi belum bisa dihapus.`);
  }
  if (first) { first.focus(); return; }
  const body = {
    name, mode: $("#pg-mode").value, status: $("#pg-status").value,
    tutors: $$("#pg-tutors input:checked").map((x) => x.value),
    durations: rows.map((r) => ({ id: r.id || null, label: r.label, days: r.days, price: r.price })),
  };
  const done = busy($("#pg-save"), "Menyimpan...");
  try {
    await api(old ? `/api/admin/programs/${old.id}` : "/api/admin/programs", { method: old ? "PUT" : "POST", body });
    $("#dlg-program").close();
    await refresh();
    toast(old ? `${name} tersimpan.` : `${name} ditambahkan dan bisa dipilih di formulir siswa.`);
  } catch (error) {
    if (sessionEnded(error)) return;
    if (/^Nama program/.test(error.message)) { fieldError($("#pg-name"), "pg-name-err", error.message); $("#pg-name").focus(); }
    else fieldError(null, "pg-dur-err", error.message);
  } finally {
    done();
  }
}

function openPeriodDialog(id) {
  const p = id ? periodById(id) : null;
  openFormDialog({
    title: p ? "Ubah periode" : "Tambah periode", sub: "Periode adalah tanggal mulai kelas. Di Pare biasanya tanggal 10 dan 25 setiap bulan.",
    submitLabel: p ? "Simpan periode" : "Tambah periode",
    fields: [
      { id: "start", label: "Tanggal mulai", type: "date", value: p ? p.startDate : "" },
      { id: "note", label: "Catatan", value: p ? p.note : "", placeholder: "Contoh: periode libur akhir tahun", hint: "Boleh dikosongkan." },
    ],
    async onSubmit(v, fail) {
      if (!v.start) return fail("start", "Pilih tanggal mulai.");
      if (db.periods.some((x) => x !== p && x.startDate === v.start)) return fail("start", "Periode dengan tanggal ini sudah ada.");
      try {
        await api(p ? `/api/admin/periods/${p.id}` : "/api/admin/periods", { method: p ? "PUT" : "POST", body: { startDate: v.start, note: v.note } });
      } catch (error) { return failFrom(error, fail, "start"); }
      await refresh();
      toast(p ? "Periode tersimpan." : `Periode ${fmtDate(fromDateInput(v.start))} ditambahkan.`);
      return true;
    },
  });
}

function openClassDialog(id) {
  const c = id ? classById(id) : null;
  const programs = db.programs.filter((p) => p.status === "aktif" || (c && p.id === c.programId));
  const missing = [!programs.length && "program aktif", !db.periods.length && "periode", !db.tutors.length && "tutor"].filter(Boolean);
  if (!c && missing.length) { toast(`Tambahkan ${joinWords(missing)} dulu sebelum membuat kelas.`); return; }
  const nextPeriod = periodsSorted().find((p) => p.start > NOW) || currentPeriod();
  const defaultPeriod = c ? c.periodId : (periodById(ui.classes.period) ? ui.classes.period : nextPeriod.id);
  const defaultProgram = c ? c.programId : (programs.some((p) => p.id === ui.classes.program) ? ui.classes.program : programs[0].id);
  const defaultTutor = c ? c.tutor : (programById(defaultProgram).tutors[0] || db.tutors[0]);
  openFormDialog({
    title: c ? `Ubah kelas ${c.code}` : "Tambah kelas", sub: "Kelas menggabungkan satu program, satu periode, dan satu tutor.",
    submitLabel: c ? "Simpan kelas" : "Tambah kelas",
    fields: [
      { id: "code", label: "Kode kelas", value: c ? c.code : `C${db.classes.filter((x) => x.periodId === defaultPeriod).length + 1}`, placeholder: "Contoh: C1", hint: "Kode harus unik dalam satu periode." },
      { id: "program", label: "Program", type: "select", value: defaultProgram, options: programs.map((p) => [p.id, p.name]) },
      { id: "period", label: "Periode", type: "select", value: defaultPeriod, options: periodsSorted().map((p) => [p.id, fmtDate(p.start)]) },
      { id: "tutor", label: "Tutor", type: "select", value: defaultTutor, options: db.tutors.map((t) => [t, t]), hint: "Tutor harus tercentang di program yang dipilih." },
      { id: "capacity", label: "Kapasitas", type: "number", value: c ? c.capacity : 20, min: 1, max: 100 },
    ],
    async onSubmit(v, fail) {
      const code = v.code.toUpperCase().replace(/\s+/g, "");
      const capacity = Number(v.capacity);
      const p = programById(v.program);
      if (!code) return fail("code", "Kode kelas wajib diisi.");
      if (code.length > 8) return fail("code", "Kode kelas maksimal 8 karakter.");
      if (db.classes.some((x) => x !== c && x.periodId === v.period && x.code === code)) return fail("code", `Kode ${code} sudah dipakai di periode ini.`);
      if (!p || !p.tutors.includes(v.tutor)) return fail("tutor", `${v.tutor} belum tercatat sebagai tutor ${p ? p.name : "program ini"}. Centang namanya di formulir program dulu.`);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return fail("capacity", "Kapasitas harus antara 1 dan 100 siswa.");
      if (c && (c.programId !== v.program || c.periodId !== v.period) && studentsInClass(c).length) return fail("program", "Program dan periode kelas yang sudah berisi siswa tidak bisa diganti. Buat kelas baru lalu pindahkan siswanya.");
      let r;
      try {
        r = await api(c ? `/api/admin/classes/${c.id}` : "/api/admin/classes", { method: c ? "PUT" : "POST", body: { code, programId: v.program, periodId: v.period, tutorId: db.tutorIds.get(v.tutor), capacity } });
      } catch (error) { return failFrom(error, fail, error.field === "tutor" ? "tutor" : "code"); }
      await refresh();
      toast(c ? `Kelas ${code} tersimpan.` : `Kelas ${r.label} ditambahkan.`);
      return true;
    },
  });
}

function openTutorDialog() {
  openFormDialog({
    title: "Tambah tutor", sub: "Setelah ditambahkan, centang tutor ini di program yang dia ajar.", submitLabel: "Tambah tutor",
    fields: [{ id: "name", label: "Nama tutor", placeholder: "Contoh: Sari" }],
    async onSubmit(v, fail) {
      const name = v.name.replace(/\s+/g, " ");
      if (!name) return fail("name", "Nama tutor wajib diisi.");
      if (db.tutors.some((t) => t.toLowerCase() === name.toLowerCase())) return fail("name", "Tutor dengan nama ini sudah ada.");
      try {
        await api("/api/admin/tutors", { method: "POST", body: { name } });
      } catch (error) { return failFrom(error, fail, "name"); }
      await refresh();
      toast(`${name} ditambahkan sebagai tutor. Centang namanya di program yang dia ajar.`);
      return true;
    },
  });
}

/* ===================== Submissions ===================== */
function resendEmail(a, button) {
  if (!a) return null;
  const done = busy(button, "Mengirim...");
  return mutate(() => api(`/api/admin/attempts/${a.id}/resend-email`, { method: "POST" }), (r) => `Email hasil dikirim ulang ke ${r.email}.`).finally(done);
}
async function voidAttempt(a) {
  const r = await confirmDialog({
    title: "Batalkan hasil submission ini?",
    message: "Nilainya tidak lagi dihitung di ringkasan dan profil siswa. Jawabannya tetap tersimpan sebagai arsip, dan pembatalan bisa dipulihkan kapan saja.",
    confirmLabel: "Batalkan hasil",
    reasonLabel: "Alasan pembatalan",
    reasonPlaceholder: "Contoh: peserta mengaku dibantu teman saat mengerjakan.",
  });
  if (!r.ok) return;
  const reason = r.reason ? (/[.!?]$/.test(r.reason) ? r.reason : `${r.reason}.`) : "";
  await mutate(() => api(`/api/admin/attempts/${a.id}/void`, { method: "POST", body: { reason } }), "Hasil dibatalkan dan tidak lagi dihitung.");
}
async function deleteAttempts(ids, single) {
  if (!ids.length) return;
  const r = await confirmDialog({
    title: single ? "Hapus submission ini?" : `Hapus ${ids.length} submission?`,
    message: "Jawaban, nilai, dan catatan sistemnya akan terhapus permanen dan tidak lagi dihitung di ringkasan.",
    confirmLabel: single ? "Hapus submission" : `Hapus ${ids.length} submission`,
  });
  if (!r.ok) return;
  const key = ui.test;
  const ok = await mutate(
    () => (single ? api(`/api/admin/attempts/${ids[0]}`, { method: "DELETE" }) : api("/api/admin/attempts/bulk-delete", { method: "POST", body: { ids } })),
    single ? "Submission dihapus." : `${ids.length} submission dihapus.`,
  );
  if (!ok) return;
  ids.forEach((id) => ui.attempts[key].selected.delete(id));
  if (single && route().parts[3]) location.hash = `#/tes/${key}/submission`; else render();
}

/* ===================== Bulk bar ===================== */
function updateBulkBar() {
  const bar = $("#bulk");
  const { parts } = route();
  let set = null, scope = null;
  if (parts[0] === "siswa" && !parts[1]) { scope = "students"; set = ui.students.selected; }
  if (parts[0] === "tes" && parts[2] === "submission" && !parts[3] && TEST_KEYS.includes(parts[1])) { scope = "attempts"; set = ui.attempts[parts[1]].selected; }
  if (!set || !set.size) { bar.hidden = true; document.body.classList.remove("has-bulk"); return; }
  const n = set.size;
  bar.innerHTML = scope === "students"
    ? `<span class="bulk__count">${n} siswa dipilih</span><span class="bulk__actions">
        <button class="btn btn--dark btn--sm" type="button" data-menu="bulk-stage" aria-haspopup="menu" aria-expanded="false">Ubah status</button>
        <button class="btn btn--dark btn--sm" type="button" data-menu="bulk-period" aria-haspopup="menu" aria-expanded="false">Atur periode</button>
        <button class="btn btn--dark btn--sm" type="button" data-action="bulk-export" data-scope="students">Ekspor</button>
        <button class="btn btn--dark btn--sm" type="button" data-action="bulk-delete" data-scope="students">Hapus</button>
      </span><button class="icon-btn icon-btn--dark" type="button" data-action="bulk-clear" data-scope="students" aria-label="Batalkan pilihan">${icon("x")}</button>`
    : `<span class="bulk__count">${n} submission dipilih</span><span class="bulk__actions">
        <button class="btn btn--dark btn--sm" type="button" data-action="bulk-export" data-scope="attempts">Ekspor</button>
        <button class="btn btn--dark btn--sm" type="button" data-action="bulk-delete" data-scope="attempts">Hapus</button>
      </span><button class="icon-btn icon-btn--dark" type="button" data-action="bulk-clear" data-scope="attempts" aria-label="Batalkan pilihan">${icon("x")}</button>`;
  bar.hidden = false;
  document.body.classList.add("has-bulk");
}
const selectedSet = (scope) => (scope === "students" ? ui.students.selected : ui.attempts[ui.test].selected);


/* ===================== CSV export ===================== */
// Cells that start with a formula character are prefixed so spreadsheet apps show them as text.
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const levelLabel = (key) => (key && levelByKey(key) ? levelByKey(key).label : "");
function exportStudents(list) {
  downloadCsv(`database-siswa-${toDateInput(NOW)}.csv`, [
    ["ID", "Nama", "Email", "WhatsApp", "Domisili", "Sumber", "Status", "Program", "Durasi", "Periode", "Tutor / Kelas", "Level placement", "Pre-test", "Post-test", "Masuk database"],
    ...list.map((s) => {
      const a = latestGraded(s.id), p = programById(s.programId), d = durationOf(s), per = periodById(s.periodId), c = classById(s.classId);
      return [s.id, s.name, s.email, fmtWa(s.wa), s.city, s.source, stageOf(s.stage).label, p ? p.name : "", d ? d.label : "", per ? fmtDate(per.start) : "", classLabel(c), a ? levelLabel(a.levelKey) : "", nilaiOf(latestGraded(s.id, "pre")) ?? "", nilaiOf(latestGraded(s.id, "post")) ?? "", fmtDateTime(s.createdAt)];
    }),
  ]);
  toast(`${list.length} baris siswa diekspor ke CSV.`);
}
function exportAttempts(list) {
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

/* ===================== Event handlers ===================== */
const validPer = (v) => Number.isInteger(v) && v >= 5 && v <= 180;
const ACTIONS = {
  "toggle-nav": () => setNav(!document.body.classList.contains("nav-collapsed")),
  "close-dialog": (el) => el.closest("dialog").close(),
  "retry-load": () => start(),
  logout: async (el) => {
    busy(el, "Keluar...");
    try { await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }); } catch (e) { /* the login page still opens */ }
    window.location.assign("/admin/login");
  },
  period: (el) => { ui.period = Number(el.dataset.value); render(); },
  page: (el) => {
    const scope = el.dataset.scope;
    if (scope === "students") { ui.students.page = Number(el.dataset.value); renderStudentsResults(); } else { ui.attempts[ui.test].page = Number(el.dataset.value); renderAttemptsResults(); }
    main.scrollIntoView({ block: "start" });
  },
  sort: (el) => {
    const f = ui.students, key = el.dataset.value;
    if (f.sort === key) f.dir = f.dir === "asc" ? "desc" : "asc"; else { f.sort = key; f.dir = key === "name" ? "asc" : "desc"; }
    renderStudentsResults();
    $(`.sort[data-value="${key}"]`)?.focus();
  },
  "students-stage": (el) => { ui.students.stage = el.dataset.value; ui.students.page = 1; renderStudentsResults(); $(`#students-chips [data-value="${el.dataset.value}"]`)?.focus(); },
  "students-reset": () => { Object.assign(ui.students, { q: "", stage: "all", level: "", program: "", period: "", tutor: "", page: 1 }); render(); },
  "new-student": () => openStudentForm(null),
  "edit-student": (el) => openStudentForm(el.dataset.id),
  "export-students": () => exportStudents(db.students.filter((s) => studentMatches(s, ui.students, false))),
  "mark-contacted": (el) => markContacted(studentById(el.dataset.id)),
  wa: (el) => openWhatsApp(studentById(el.dataset.id)),
  "wa-copy": async (el) => {
    const input = $("#wa-link");
    try { await navigator.clipboard.writeText(input.value); el.textContent = "Tersalin"; }
    catch (e) { input.focus(); input.select(); el.textContent = "Tekan Ctrl+C"; }
    setTimeout(() => { el.textContent = "Salin"; }, 2400);
  },
  "questions-skill": (el) => { ui.questions[ui.test].skill = el.dataset.value; renderQuestionsResults(); },
  "new-question": () => openQuestionEditor(null),
  "edit-question": (el) => { if (el.dataset.test) ui.test = el.dataset.test; openQuestionEditor(el.dataset.id); },
  "question-delete-from-editor": () => { const q = questionById(T(), editingQuestionId); if (q) deleteQuestion(q); },
  "attempts-status": (el) => { const f = ui.attempts[ui.test]; f.status = el.dataset.value; f.page = 1; renderAttemptsResults(); $(`#attempts-chips [data-value="${el.dataset.value}"]`)?.focus(); },
  "export-attempts": () => exportAttempts(db.attempts.filter((a) => attemptMatches(a, ui.attempts[ui.test], false))),
  "answers-filter": (el) => { ui.answers = el.dataset.value; const y = window.scrollY; render(); window.scrollTo(0, y); },
  "resend-email": (el) => resendEmail(attemptById(el.dataset.id), el),
  "bulk-clear": (el) => { selectedSet(el.dataset.scope).clear(); render(); },
  "bulk-export": (el) => {
    const scope = el.dataset.scope, set = selectedSet(scope);
    if (scope === "students") exportStudents(db.students.filter((s) => set.has(s.id))); else exportAttempts(db.attempts.filter((a) => set.has(a.id)));
  },
  "bulk-delete": (el) => { const scope = el.dataset.scope; const ids = [...selectedSet(scope)]; if (scope === "students") deleteStudents(ids, false); else deleteAttempts(ids, false); },
  "new-program": () => openProgramDialog(null),
  "edit-program": (el) => openProgramDialog(el.dataset.id),
  "pg-add-duration": () => { $("#pg-durations").insertAdjacentHTML("beforeend", durationRow()); $$("#pg-durations .dur-row").pop().querySelector("input").focus(); },
  "pg-remove-duration": (el) => { const row = el.closest(".dur-row"); const next = row.nextElementSibling || row.previousElementSibling; row.remove(); next?.querySelector("input, button")?.focus(); },
  "new-period": () => openPeriodDialog(null),
  "edit-period": (el) => openPeriodDialog(el.dataset.id),
  "new-class": () => openClassDialog(null),
  "edit-class": (el) => openClassDialog(el.dataset.id),
  "new-tutor": () => openTutorDialog(),
  "apply-per-all": async (el) => {
    const v = Number($("#set-per").value);
    clearErrors($("#panel-time"));
    if (!validPer(v)) { fieldError($("#set-per"), "set-time-err", "Waktu bawaan per soal harus antara 5 dan 180 detik."); $("#set-per").focus(); return; }
    const key = ui.test;
    const done = busy(el, "Menerapkan...");
    await mutate(() => api(`/api/admin/tests/${key}/apply-seconds`, { method: "POST", body: { seconds: v } }),
      () => (testOf(key).settings.timeMode === "per" ? `Semua soal sekarang punya waktu ${v} detik.` : `Semua soal sekarang punya waktu ${v} detik. Pilih mode waktu per soal lalu simpan supaya waktunya berlaku.`));
    done();
  },
  "time-reset": () => renderSettingsTab(),
  "time-save": async (el) => {
    clearErrors($("#panel-time"));
    const mode = $('input[name="time-mode"]:checked').value;
    const body = { timeMode: mode };
    if (mode === "total") {
      const min = Number($("#set-min").value), sec = Number($("#set-sec").value), total = min * 60 + sec;
      if (!Number.isInteger(min) || !Number.isInteger(sec) || sec < 0 || sec > 59 || total < 60 || total > 3600) { fieldError($("#set-min"), "set-time-err", "Durasi tes harus antara 1 dan 60 menit, dengan detik dari 0 sampai 59."); $("#set-min").focus(); return; }
      body.totalSeconds = total;
    } else {
      const v = Number($("#set-per").value);
      if (!validPer(v)) { fieldError($("#set-per"), "set-time-err", "Waktu bawaan per soal harus antara 5 dan 180 detik."); $("#set-per").focus(); return; }
      body.perDefault = v;
    }
    const key = ui.test;
    const done = busy(el, "Menyimpan...");
    await mutate(() => api(`/api/admin/tests/${key}`, { method: "PUT", body }),
      () => (mode === "total" ? `Waktu total ${fmtSpan(body.totalSeconds)} tersimpan untuk tes berikutnya.` : `Waktu per soal tersimpan. Total tes sekarang ${fmtSpan(testSeconds(testOf(key)))}.`));
    done();
  },
  "pass-save": async (el) => {
    const v = Number($("#set-pass").value);
    clearErrors($("#panel-pass"));
    if (!Number.isInteger(v) || v < 0 || v > 100) { fieldError($("#set-pass"), "set-pass-err", "Nilai kelulusan harus angka bulat dari 0 sampai 100."); $("#set-pass").focus(); return; }
    const done = busy(el, "Menyimpan...");
    await mutate(() => api(`/api/admin/tests/${ui.test}`, { method: "PUT", body: { passScore: v } }), `Nilai kelulusan post-test sekarang ${v}. Hasil yang sudah masuk tetap memakai batas lama.`);
    done();
  },
  "rules-save": async (el) => {
    const open = $("#set-open").checked;
    const maxViolations = Number($("#set-viol").value);
    const done = busy(el, "Menyimpan...");
    await mutate(() => api(`/api/admin/tests/${ui.test}`, { method: "PUT", body: { open, maxViolations } }), open ? "Aturan tes tersimpan. Tes dibuka." : "Aturan tes tersimpan. Tes ditutup sementara.");
    done();
  },
  "levels-save": async (el) => {
    const rows = db.levels.map((l, i) => ({ l, min: Number($(`#lv-min-${i}`).value), max: Number($(`#lv-max-${i}`).value), i }));
    const n = activeQuestions(testOf("placement")).length;
    clearErrors($("#panel-levels"));
    const fail = (i, field, msg) => { fieldError($(`#lv-${field}-${i}`), "levels-err", msg); $(`#lv-${field}-${i}`).focus(); };
    for (const r of rows) {
      if (!Number.isInteger(r.min) || !Number.isInteger(r.max)) return fail(r.i, "max", `Isi skor minimum dan maksimum untuk level ${r.l.label}.`);
      if (r.min > r.max) return fail(r.i, "min", `Skor minimum ${r.l.label} lebih besar dari skor maksimumnya.`);
      if (r.i > 0 && r.min !== rows[r.i - 1].max + 1) return fail(r.i, "min", `Level ${r.l.label} harus dimulai tepat setelah ${rows[r.i - 1].l.label}, yaitu dari skor ${rows[r.i - 1].max + 1}.`);
    }
    if (rows[rows.length - 1].max !== n) return fail(rows.length - 1, "max", `Level terakhir harus berakhir di skor ${n}, sesuai jumlah soal aktif.`);
    const done = busy(el, "Menyimpan...");
    await mutate(() => api("/api/admin/levels", { method: "PUT", body: { levels: rows.map((r) => ({ key: r.l.key, min: r.min, max: r.max })) } }), "Ambang level tersimpan. Submission lama tetap memakai level saat dinilai.");
    done();
  },
};

const CHANGES = {
  "students-level": (el) => { ui.students.level = el.value; ui.students.page = 1; renderStudentsResults(); },
  "students-program": (el) => { ui.students.program = el.value; ui.students.page = 1; renderStudentsResults(); },
  "students-period": (el) => { ui.students.period = el.value; ui.students.page = 1; renderStudentsResults(); },
  "students-tutor": (el) => { ui.students.tutor = el.value; ui.students.page = 1; renderStudentsResults(); },
  "attempts-level": (el) => { const f = ui.attempts[ui.test]; f.level = el.value; f.page = 1; renderAttemptsResults(); },
  "attempts-days": (el) => { const f = ui.attempts[ui.test]; f.days = el.value; f.page = 1; renderAttemptsResults(); },
  "attempts-period": (el) => { const f = ui.attempts[ui.test]; f.period = el.value; f.page = 1; renderAttemptsResults(); },
  "attempts-program": (el) => { const f = ui.attempts[ui.test]; f.program = el.value; f.page = 1; renderAttemptsResults(); },
  "attempts-result": (el) => { const f = ui.attempts[ui.test]; f.result = el.value; f.page = 1; renderAttemptsResults(); },
  "classes-period": (el) => { ui.classes.period = el.value; renderClassTab(); },
  "classes-program": (el) => { ui.classes.program = el.value; renderClassTab(); },
  "select-row": (el) => {
    const set = selectedSet(el.dataset.scope);
    if (el.checked) set.add(el.value); else set.delete(el.value);
    if (el.dataset.scope === "students") renderStudentsResults(); else renderAttemptsResults();
    $(`[data-change="select-row"][value="${el.value}"]`)?.focus();
  },
  "select-page": (el) => {
    const scope = el.dataset.scope, set = selectedSet(scope);
    $$(`[data-change="select-row"][data-scope="${scope}"]`).forEach((cb) => { if (el.checked) set.add(cb.value); else set.delete(cb.value); });
    if (scope === "students") renderStudentsResults(); else renderAttemptsResults();
    $(`[data-change="select-page"][data-scope="${scope}"]`)?.focus();
  },
  "student-stage": (el) => { setStage(studentById(el.dataset.id), el.value).then(() => $("#rec-stage")?.focus()); },
  "student-class": (el) => { setClass(studentById(el.dataset.id), el.value).then(() => $("#rec-class")?.focus()); },
  "sf-program": () => { fillDurationOptions(""); fillClassOptions(""); },
  "sf-period": () => fillClassOptions(""),
  "qe-key": () => { $$("#qe-options .opt-row").forEach((row) => row.classList.toggle("is-key", row.querySelector(".key-radio").checked)); },
  "qe-passage-toggle": (el) => { $("#qe-passage-field").hidden = !el.checked; if (el.checked) $("#qe-passage").focus(); },
  "time-mode": () => { clearErrors($("#panel-time")); syncTimeForm(); },
  "rules-dirty": () => { const st = T().settings; $("#rules-save").disabled = $("#set-open").checked === st.open && Number($("#set-viol").value) === st.maxViolations; },
};

let searchTimer = null;
const INPUTS = {
  "students-q": (el) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { ui.students.q = el.value; ui.students.page = 1; renderStudentsResults(); }, 140); },
  "questions-q": (el) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { ui.questions[ui.test].q = el.value; renderQuestionsResults(); }, 140); },
  "attempts-q": (el) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { const f = ui.attempts[ui.test]; f.q = el.value; f.page = 1; renderAttemptsResults(); }, 140); },
  "time-dirty": () => { clearErrors($("#panel-time")); syncTimeForm(); },
  "pass-dirty": () => syncPassForm(),
  "levels-dirty": () => { $("#levels-save").disabled = false; },
  "wa-text": () => syncWaForm(),
};

const FORMS = {
  question: (form) => saveQuestion(form),
  student: (form) => saveStudent(form),
  program: (form) => saveProgram(form),
  wa: (form) => sendWa(form),
  generic: async (form) => {
    clearErrors(form);
    const values = {};
    formSpec.fields.forEach((f) => { values[f.id] = $(`#gf-${f.id}`).value.trim(); });
    let bad = null;
    const fail = (id, msg) => { fieldError($(`#gf-${id}`), `gf-${id}-err`, msg); if (!bad) bad = $(`#gf-${id}`); return false; };
    const done = busy($("#gf-save"), "Menyimpan...");
    let ok = false;
    try { ok = await formSpec.onSubmit(values, fail); } finally { done(); }
    if (bad) { bad.focus(); return; }
    if (ok !== false) $("#dlg-form").close();
  },
  note: async (form) => {
    const s = studentById(form.dataset.id);
    const box = $("#note-text");
    const text = box.value.trim();
    clearErrors(form);
    if (!text) { fieldError(box, "note-err", "Tulis catatan dulu sebelum menyimpan."); box.focus(); return; }
    const done = busy(form.querySelector('[type="submit"]'), "Menyimpan...");
    ui.notesOpen = true;
    const ok = await mutate(() => api(`/api/admin/students/${s.id}/notes`, { method: "POST", body: { text } }), "Catatan tersimpan.");
    done();
    if (ok) $("#note-text")?.focus();
  },
};

document.addEventListener("click", (e) => {
  const menuItem = e.target.closest("#menu .menu__item");
  if (menuItem) {
    const item = menuState && menuState.items[Number(menuItem.dataset.index)];
    closeMenu();
    if (item && !item.disabled) item.run();
    return;
  }
  const trigger = e.target.closest("[data-menu]");
  if (menuState && !e.target.closest("#menu") && trigger !== menuState.anchor) closeMenu();
  if (trigger) { openMenu(trigger, contextMenu(trigger)); return; }
  const act = e.target.closest("[data-action]");
  if (act) {
    if (act.disabled) return;
    const fn = ACTIONS[act.dataset.action];
    if (fn) { if (act.tagName === "A") e.preventDefault(); fn(act, e); }
    return;
  }
  const row = e.target.closest("tr[data-href], tr[data-row-action]");
  if (row && !e.target.closest("a, button, input, select, textarea, label")) {
    if (row.dataset.href) location.hash = row.dataset.href;
    else ACTIONS[row.dataset.rowAction]?.(row, e);
  }
});
document.addEventListener("change", (e) => { const el = e.target.closest("[data-change]"); if (el) CHANGES[el.dataset.change]?.(el, e); });
document.addEventListener("input", (e) => { const el = e.target.closest("[data-input]"); if (el) INPUTS[el.dataset.input]?.(el, e); });
document.addEventListener("submit", (e) => { const form = e.target.closest("form[data-form]"); if (form) { e.preventDefault(); FORMS[form.dataset.form]?.(form, e); } });
document.addEventListener("toggle", (e) => { if (e.target.id === "notes-fold") ui.notesOpen = e.target.open; }, true);
document.addEventListener("keydown", (e) => {
  if (!menuState) return;
  const items = $$("#menu .menu__item:not([disabled])");
  const i = items.indexOf(document.activeElement);
  if (e.key === "Escape") { e.preventDefault(); closeMenu(true); }
  else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  else if (e.key === "Tab") closeMenu();
});
window.addEventListener("resize", () => closeMenu());
window.addEventListener("scroll", () => closeMenu(), { passive: true });
window.addEventListener("hashchange", render);

/* ===================== Start ===================== */
function start() {
  main.innerHTML = `<p class="loading-line loading-line--page" role="status">Memuat data dasbor...</p>`;
  loadData().then(render).catch((error) => {
    if (sessionEnded(error)) return;
    main.innerHTML = `${pageHead({ title: "Data belum bisa dimuat" })}
      <section class="panel">${emptyHtml(error.message || "Server tidak merespons.", "Periksa koneksi internet, lalu coba lagi. Kalau masalahnya berlanjut, hubungi admin teknis.", `<button class="btn btn--primary btn--sm" type="button" data-action="retry-load">Coba lagi</button>`)}</section>`;
  });
}
let savedNav = false;
try { savedNav = localStorage.getItem("tnec-nav-collapsed") === "1"; } catch (e) { savedNav = false; }
setNav(savedNav, false);
start();
