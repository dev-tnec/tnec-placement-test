// TNEC Placement Test client.
// Flow: consent -> fullscreen test -> submit -> contact -> result.
// The answer key lives on the server; this file only holds the attempt.

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const LEVEL_ORDER = [
  "starter",
  "basic",
  "intermediate",
  "advanced",
  "toefl-prep",
  "toefl-scoring",
];
const LEVEL_LABELS = {
  starter: "Starter",
  basic: "Basic",
  intermediate: "Intermediate",
  advanced: "Advanced",
  "toefl-prep": "TOEFL/IELTS Prep",
  "toefl-scoring": "TOEFL/IELTS Scoring",
};
const CHOICES = ["A", "B", "C", "D"];
const FOCUS_TYPES = new Set(["fullscreen_exit", "tab_hidden", "window_blur"]);
const MAX_STRIKES = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const els = {
  testbar: $("#testbar"),
  progress: $("#progress"),
  progressLabel: $("#progress-label"),
  progressPercent: $("#progress-percent"),
  timer: $("#timer"),
  timerValue: $("#timer-value"),
  legalDialog: $("#legal-dialog"),
  legalTitle: $("#legal-title"),
  legalBody: $("#legal-dialog-body"),
  legalAction: $("#legal-action"),
  legalNote: $("#legal-note"),
  consentForm: $("#consent-form"),
  consentBoxes: $$(".consent-box"),
  startBtn: $("#start-btn"),
  fsWarning: $("#fs-warning"),
  flagBtn: $("#flag-btn"),
  flagText: $("#flag-text"),
  questionBadge: $("#question-badge"),
  passage: $("#passage"),
  passageText: $("#passage-text"),
  prompt: $("#question-prompt"),
  optionsList: $("#options-list"),
  prevBtn: $("#prev-btn"),
  skipBtn: $("#skip-btn"),
  nextBtn: $("#next-btn"),
  nextLabel: $("#next-label"),
  navGrid: $("#nav-grid"),
  navAnswered: $("#nav-answered"),
  navFlagged: $("#nav-flagged"),
  finishBtn: $("#finish-btn"),
  contactForm: $("#contact-form"),
  name: $("#name"),
  email: $("#email"),
  whatsapp: $("#whatsapp"),
  contactBtn: $("#contact-btn"),
  errName: $("#err-name"),
  errEmail: $("#err-email"),
  errWa: $("#err-wa"),
  resultLevel: $("#result-level"),
  resultSummary: $("#result-summary"),
  resultScore: $("#result-score"),
  resultTotal: $("#result-total"),
  resultIndex: $("#result-index"),
  levelLadder: $("#level-ladder"),
  resultProgram: $("#result-program"),
  resultDescription: $("#result-description"),
  waBtn: $("#wa-btn"),
  retryBtn: $("#retry-btn"),
  emailNote: $("#result-email-note"),
  violationDialog: $("#violation-dialog"),
  violationCount: $("#violation-count"),
  violationClose: $("#violation-close"),
  endDialog: $("#end-dialog"),
  endRetry: $("#end-retry"),
  endBack: $("#end-back"),
  submitDialog: $("#submit-dialog"),
  submitAnswered: $("#submit-answered"),
  submitCancel: $("#submit-cancel"),
  submitConfirm: $("#submit-confirm"),
  timeupDialog: $("#timeup-dialog"),
  timeupRetry: $("#timeup-retry"),
  timeupBack: $("#timeup-back"),
  toast: $("#toast"),
  live: $("#live"),
};

const state = {
  config: null,
  attempt: null,
  index: 0,
  answers: {},
  flagged: new Set(),
  strikes: 0,
  deadline: 0,
  timerId: null,
  warned60: false,
  timeUp: false,
  submitting: false,
  submitted: false,
  ending: false,
  lastViolationAt: 0,
  contact: null,
  emailSent: false,
  restarting: false,
  toastTimer: null,
};

let pendingConsent = null;

init();

async function init() {
  try {
    state.config = await api("/api/config");
  } catch {
    toast("Tes tidak dapat dimuat. Periksa koneksi internet kamu, lalu muat ulang halaman ini.", 0);
    els.startBtn.textContent = "Muat ulang halaman";
    els.startBtn.disabled = false;
    els.startBtn.addEventListener("click", () => window.location.reload(), {
      once: true,
    });
    return;
  }

  els.consentBoxes.forEach((box) =>
    box.addEventListener("change", syncConsent),
  );
  els.consentForm.addEventListener("submit", startTest);
  els.contactForm.addEventListener("submit", saveContact);
  els.prevBtn.addEventListener("click", prev);
  els.nextBtn.addEventListener("click", next);
  els.skipBtn.addEventListener("click", () => goTo(state.index + 1));
  els.flagBtn.addEventListener("click", toggleFlag);
  els.finishBtn.addEventListener("click", openSubmit);
  els.submitCancel.addEventListener("click", () => els.submitDialog.close());
  els.submitConfirm.addEventListener("click", submitAnswers);
  els.violationClose.addEventListener("click", reenterFullscreen);
  els.endRetry.addEventListener("click", retry);
  els.endBack.addEventListener("click", backToStart);
  els.timeupRetry.addEventListener("click", retry);
  els.timeupBack.addEventListener("click", backToStart);
  els.retryBtn.addEventListener("click", retry);
  els.legalAction.addEventListener("click", confirmLegal);
  els.legalDialog.addEventListener("close", () => {
    pendingConsent = null;
    els.legalNote.hidden = true;
  });
  els.legalDialog.addEventListener("cancel", (event) => {
    if (pendingConsent) event.preventDefault();
  });
  $$("[data-legal]").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const box = trigger.matches(".consent-box")
        ? trigger
        : trigger.closest(".check")?.querySelector(".consent-box") || null;
      openLegal(trigger.dataset.legal, box);
    });
  });

  for (const dialog of [
    els.violationDialog,
    els.endDialog,
    els.timeupDialog,
  ]) {
    dialog.addEventListener("cancel", (event) => event.preventDefault());
  }

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) registerViolation("fullscreen_exit");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) registerViolation("tab_hidden");
  });
  window.addEventListener("blur", () => {
    if (!document.hidden) registerViolation("window_blur");
  });
  window.addEventListener("beforeunload", (event) => {
    if (!isTesting()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  for (const type of ["copy", "cut", "paste", "contextmenu", "dragstart"]) {
    document.addEventListener(type, (event) => {
      if (!isTesting()) return;
      event.preventDefault();
      if (type === "copy" || type === "cut" || type === "contextmenu") {
        registerViolation("copy_attempt");
      }
    });
  }

  document.addEventListener("keydown", onKeydown);
  syncConsent();
}

function renderDoc(container, doc) {
  const fragment = document.createDocumentFragment();
  const updated = document.createElement("p");
  updated.className = "micro disclosure__updated";
  updated.textContent = `Berlaku sejak ${doc.updated}.`;
  fragment.append(updated);

  for (const section of doc.sections) {
    const heading = document.createElement("h4");
    heading.textContent = section.heading;
    fragment.append(heading);
    for (const paragraph of section.paragraphs) {
      const p = document.createElement("p");
      p.textContent = paragraph;
      fragment.append(p);
    }
  }
  container.replaceChildren(fragment);
}

function openLegal(kind, consentBox = null) {
  const doc = kind === "terms" ? state.config.terms : state.config.privacy;
  if (!doc) return;
  pendingConsent = consentBox;
  els.legalTitle.textContent = doc.title;
  renderDoc(els.legalBody, doc);
  els.legalAction.textContent = consentBox ? "Setuju" : "Tutup";
  els.legalAction.classList.toggle("btn--primary", Boolean(consentBox));
  els.legalAction.classList.toggle("btn--secondary", !consentBox);
  els.legalNote.hidden = !consentBox;
  if (!els.legalDialog.open) els.legalDialog.showModal();
  els.legalTitle.focus({ preventScroll: true });
  els.legalDialog.querySelector(".dialog__body--scroll").scrollTop = 0;
}

function confirmLegal() {
  const box = pendingConsent;
  els.legalDialog.close();
  if (!box) return;
  box.checked = true;
  box.dispatchEvent(new Event("change", { bubbles: true }));
}

function syncConsent() {
  const allChecked = els.consentBoxes.every((box) => box.checked);
  els.startBtn.disabled = !allChecked;
}

async function startTest(event) {
  event.preventDefault();
  if (!state.config || els.startBtn.disabled) return;

  els.startBtn.disabled = true;
  els.startBtn.textContent = "Menyiapkan tes...";
  await requestFullscreen();

  try {
    const data = await api("/api/attempts", {
      method: "POST",
      body: {
        consent: { accepted: true, version: state.config.consentVersion },
      },
    });
    beginAttempt(data);
  } catch (error) {
    await exitFullscreen();
    toast(error.message || "Tes gagal dimulai. Silakan coba lagi.");
    els.startBtn.disabled = false;
    els.startBtn.textContent = "Mulai tes sekarang";
  }
}

function beginAttempt(data) {
  state.attempt = {
    id: data.attemptId,
    questions: data.questions,
    total: data.total,
  };
  state.index = 0;
  state.answers = {};
  state.flagged = new Set();
  state.strikes = 0;
  state.deadline = Date.now() + data.secondsLeft * 1000;
  state.warned60 = false;
  state.timeUp = false;
  state.submitting = false;
  state.submitted = false;
  state.ending = false;
  state.lastViolationAt = 0;
  state.contact = null;
  state.emailSent = false;

  els.contactForm.reset();
  clearErrors();
  els.fsWarning.hidden = Boolean(document.fullscreenElement);

  showScreen("test");
  buildNavigator();
  renderQuestion();
  startTimer();
}

function showScreen(name, { focus = true } = {}) {
  for (const key of ["intro", "test", "details", "result"]) {
    $(`#screen-${key}`).hidden = key !== name;
  }
  document.body.dataset.screen = name;
  els.testbar.hidden = name !== "test";
  window.scrollTo(0, 0);

  if (!focus) return;
  const target = {
    intro: "#intro-title",
    details: "#details-title",
    result: "#result-level",
  }[name];
  if (target) $(target).focus({ preventScroll: true });
}

/* ---------- Test rendering ---------- */

function buildNavigator() {
  els.navGrid.replaceChildren();
  for (let i = 0; i < state.attempt.total; i += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-btn";
    button.textContent = String(i + 1);
    button.addEventListener("click", () => goTo(i));
    els.navGrid.append(button);
  }
  syncNavigator();
}

function renderQuestion() {
  const question = state.attempt.questions[state.index];
  els.questionBadge.textContent = `Soal ${state.index + 1} \u00b7 Grammar & Structure`;
  els.prompt.textContent = question.prompt;

  if (question.passage) {
    els.passage.hidden = false;
    els.passageText.textContent = question.passage;
  } else {
    els.passage.hidden = true;
    els.passageText.textContent = "";
  }

  els.optionsList.replaceChildren();
  for (const letter of CHOICES) {
    const label = document.createElement("label");
    label.className = "option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = `q-${question.id}`;
    input.value = letter;
    input.className = "sr-only";
    input.checked = state.answers[question.id] === letter;
    input.addEventListener("change", () => choose(question.id, letter));

    const key = document.createElement("span");
    key.className = "option__key";
    key.textContent = letter;

    const text = document.createElement("span");
    text.className = "option__text";
    text.textContent = question.options[letter];

    const mark = document.createElement("span");
    mark.className = "option__mark";
    mark.setAttribute("aria-hidden", "true");

    label.append(input, key, text, mark);
    if (input.checked) label.classList.add("is-selected");
    els.optionsList.append(label);
  }

  syncQuestionChrome();
  syncNavigator();
}

function choose(questionId, letter) {
  state.answers[questionId] = letter;
  syncOptionSelection();
  syncNavigator();
}

function syncOptionSelection() {
  const question = state.attempt.questions[state.index];
  $$(".option", els.optionsList).forEach((label) => {
    const input = $("input", label);
    const selected = input.value === state.answers[question.id];
    input.checked = selected;
    label.classList.toggle("is-selected", selected);
  });
}

function syncQuestionChrome() {
  const total = state.attempt.total;
  const position = state.index + 1;
  const answered = Object.keys(state.answers).length;

  els.progressLabel.textContent = `Soal ${position} dari ${total}`;
  els.progressPercent.textContent = `${Math.round((position / total) * 100)}% selesai`;
  els.progress.max = total;
  els.progress.value = position;
  els.progress.textContent = `${Math.round((position / total) * 100)}%`;

  els.prevBtn.disabled = state.index === 0;
  els.nextLabel.textContent =
    state.index === total - 1 ? "Selesaikan tes" : "Soal selanjutnya";

  const flagged = state.flagged.has(state.attempt.questions[state.index].id);
  els.flagBtn.setAttribute("aria-pressed", String(flagged));
  els.flagBtn.classList.toggle("btn--flagged", flagged);
  els.flagText.textContent = flagged ? "Ditandai" : "Tandai soal";

  els.navAnswered.textContent = String(answered);
  els.navFlagged.textContent = String(state.flagged.size);

  announce(`Soal ${position} dari ${total}, dan ${answered} soal sudah dijawab.`);
}

function syncNavigator() {
  const questions = state.attempt.questions;
  $$(".nav-btn", els.navGrid).forEach((button, index) => {
    const question = questions[index];
    button.classList.toggle("is-answered", Boolean(state.answers[question.id]));
    button.classList.toggle("is-current", index === state.index);
    button.classList.toggle("is-flagged", state.flagged.has(question.id));
    button.setAttribute(
      "aria-label",
      `Soal ${index + 1}${state.answers[question.id] ? ", sudah dijawab" : ""}${
        state.flagged.has(question.id) ? ", ditandai" : ""
      }`,
    );
    if (index === state.index) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  els.navAnswered.textContent = String(Object.keys(state.answers).length);
  els.navFlagged.textContent = String(state.flagged.size);
}

function goTo(index) {
  if (!state.attempt) return;
  if (index < 0 || index >= state.attempt.total) return;
  state.index = index;
  renderQuestion();
}

function prev() {
  goTo(state.index - 1);
}

function next() {
  if (!state.attempt) return;
  if (state.index === state.attempt.total - 1) {
    openSubmit();
    return;
  }
  goTo(state.index + 1);
}

function toggleFlag() {
  if (!state.attempt) return;
  const question = state.attempt.questions[state.index];
  if (state.flagged.has(question.id)) state.flagged.delete(question.id);
  else state.flagged.add(question.id);
  syncQuestionChrome();
  syncNavigator();
}

function openSubmit() {
  if (!state.attempt || state.submitting || state.ending) return;
  els.submitAnswered.textContent = String(Object.keys(state.answers).length);
  if (!els.submitDialog.open) els.submitDialog.showModal();
}

/* ---------- Timer ---------- */

function startTimer() {
  clearInterval(state.timerId);
  tick();
  state.timerId = setInterval(tick, 250);
}

function tick() {
  if (!state.attempt) return;
  const remaining = Math.max(
    0,
    Math.ceil((state.deadline - Date.now()) / 1000),
  );
  els.timerValue.textContent = formatTime(remaining);
  els.timer.classList.toggle("is-warning", remaining > 0 && remaining <= 60);

  if (remaining > 0 && remaining <= 60 && !state.warned60) {
    state.warned60 = true;
    announce("Sisa waktu satu menit.");
  }

  if (remaining === 0) {
    clearInterval(state.timerId);
    if (!state.timeUp) {
      state.timeUp = true;
      state.ending = true;
      if (!els.timeupDialog.open) els.timeupDialog.showModal();
    }
  }
}

function formatTime(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

/* ---------- Submit and result ---------- */

async function submitAnswers() {
  if (!state.attempt || state.submitting) return;
  state.submitting = true;
  state.ending = true;
  clearInterval(state.timerId);
  closeDialogs();

  try {
    await api(`/api/attempts/${state.attempt.id}/submit`, {
      method: "POST",
      body: { answers: state.answers },
    });
    state.submitted = true;
    showScreen("details");
    await exitFullscreen();
  } catch (error) {
    state.submitting = false;
    if (Date.now() < state.deadline) {
      state.ending = false;
      toast(
        `${error.message || "Jawaban gagal dikirim."} Jawaban kamu masih tersimpan di halaman ini, silakan coba kirim lagi.`,
      );
      startTimer();
    } else {
      state.timeUp = true;
      state.ending = true;
      toast(error.message || "Jawaban gagal dikirim karena waktu sudah habis.");
      if (!els.timeupDialog.open) els.timeupDialog.showModal();
    }
  }
}

async function saveContact(event) {
  event.preventDefault();
  if (!state.attempt || !state.submitted) return;

  const name = els.name.value.trim();
  const email = els.email.value.trim();
  const whatsapp = els.whatsapp.value.trim();

  clearErrors();
  let firstInvalid = null;

  if (name.length < 2) {
    setError("name", "Nama harus terdiri dari minimal 2 karakter.");
    firstInvalid = firstInvalid || els.name;
  }
  if (!EMAIL_RE.test(email)) {
    setError("email", "Alamat email belum benar. Periksa kembali penulisannya.");
    firstInvalid = firstInvalid || els.email;
  }
  if (!normalizeWhatsapp(whatsapp)) {
    setError("wa", "Nomor WhatsApp belum benar. Contoh penulisan yang benar: 08123456789.");
    firstInvalid = firstInvalid || els.whatsapp;
  }
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  els.contactBtn.disabled = true;
  els.contactBtn.textContent = "Menyimpan...";

  try {
    const data = await api(`/api/attempts/${state.attempt.id}/contact`, {
      method: "POST",
      body: { name, email, whatsapp },
    });
    state.contact = { name, email };
    state.emailSent = Boolean(data.emailSent);
    renderResult(data.result);
    showScreen("result");
  } catch (error) {
    toast(error.message || "Data gagal disimpan. Silakan coba lagi.");
  } finally {
    els.contactBtn.disabled = false;
    els.contactBtn.textContent = "Lihat hasil saya";
  }
}

function renderResult(result) {
  const level = result.level;
  const levelIndex = Math.max(0, LEVEL_ORDER.indexOf(level.key));

  els.resultLevel.textContent = level.label;
  els.resultSummary.textContent = level.summary;
  els.resultScore.textContent = String(result.score);
  els.resultTotal.textContent = `/ ${result.total}`;
  els.resultIndex.textContent = String(levelIndex + 1).padStart(2, "0");
  els.resultProgram.textContent = level.program;
  els.resultDescription.textContent = level.description;

  els.levelLadder.replaceChildren();
  LEVEL_ORDER.forEach((key, index) => {
    const item = document.createElement("li");
    item.className = "ladder__item";
    if (index < levelIndex) item.classList.add("is-done");
    if (index === levelIndex) item.classList.add("is-current");

    const dot = document.createElement("span");
    dot.className = "ladder__dot";
    dot.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "ladder__label";
    label.textContent = LEVEL_LABELS[key];

    item.append(dot, label);

    if (index === levelIndex) {
      const you = document.createElement("span");
      you.className = "ladder__you";
      you.textContent = "Level kamu";
      item.append(you);
    }
    els.levelLadder.append(item);
  });

  const contactName = state.contact?.name || "";
  const waText = `Halo Admin Titik Nol, saya ${contactName}. Saya baru selesai mengerjakan tes penempatan dengan hasil ${level.label} (${result.score} dari ${result.total}) dan ingin berkonsultasi tentang program yang sesuai.`;
  els.waBtn.href = `https://wa.me/${state.config.whatsapp}?text=${encodeURIComponent(waText)}`;

  els.emailNote.textContent = state.emailSent
    ? `Hasil juga sudah kami kirim ke ${state.contact?.email || "email kamu"}. Silakan periksa kotak masuk atau folder spam.`
    : "Email hasil belum berhasil dikirim. Simpan halaman ini, atau hubungi admin melalui WhatsApp.";
}

async function retry() {
  if (state.restarting || !state.config) return;
  state.restarting = true;
  const failedDialog = els.endDialog.open
    ? els.endDialog
    : els.timeupDialog.open
      ? els.timeupDialog
      : null;
  closeDialogs();
  await requestFullscreen();

  try {
    const data = await api("/api/attempts", {
      method: "POST",
      body: {
        consent: { accepted: true, version: state.config.consentVersion },
      },
    });
    beginAttempt(data);
  } catch (error) {
    toast(error.message || "Tes baru gagal dimulai. Silakan coba lagi.");
    if (failedDialog && !failedDialog.open) failedDialog.showModal();
  } finally {
    state.restarting = false;
  }
}

async function backToStart() {
  closeDialogs();
  await exitFullscreen();
  window.location.reload();
}

/* ---------- Anti-cheat ---------- */

function isTesting() {
  return Boolean(
    state.attempt &&
      !state.submitted &&
      !state.ending &&
      document.body.dataset.screen === "test",
  );
}

function registerViolation(type) {
  if (!isTesting()) return;

  const now = Date.now();
  if (now - state.lastViolationAt < 1200) return;
  state.lastViolationAt = now;

  api(`/api/attempts/${state.attempt.id}/violation`, {
    method: "POST",
    body: { type },
  }).catch(() => {});

  if (!FOCUS_TYPES.has(type)) return;

  state.strikes += 1;
  if (state.strikes >= MAX_STRIKES) {
    state.ending = true;
    clearInterval(state.timerId);
    if (els.violationDialog.open) els.violationDialog.close();
    if (!els.endDialog.open) els.endDialog.showModal();
    return;
  }

  els.violationCount.textContent = String(state.strikes);
  if (!els.violationDialog.open) els.violationDialog.showModal();
}

async function reenterFullscreen() {
  await requestFullscreen();
  els.violationDialog.close();
}

async function requestFullscreen() {
  const element = document.documentElement;
  if (!element.requestFullscreen || document.fullscreenElement) {
    return Boolean(document.fullscreenElement);
  }
  try {
    // Some browsers leave the promise pending without a user gesture.
    await Promise.race([
      element.requestFullscreen({ navigationUI: "hide" }),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    return Boolean(document.fullscreenElement);
  } catch {
    return false;
  }
}

async function exitFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* the browser may refuse outside a user gesture, which is fine */
  }
}

function onKeydown(event) {
  if (!isTesting()) return;
  if ($("dialog[open]")) return;

  const key = event.key.toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  const blockedCombo =
    event.key === "F12" ||
    (mod && event.shiftKey && ["i", "j", "c"].includes(key)) ||
    (mod && ["u", "s", "p", "a"].includes(key));

  if (blockedCombo) {
    event.preventDefault();
    registerViolation("shortcut_blocked");
    return;
  }

  if (event.target.closest("input, textarea")) return;

  if (!mod && !event.altKey && CHOICES.includes(key.toUpperCase())) {
    choose(state.attempt.questions[state.index].id, key.toUpperCase());
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    next();
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    prev();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    next();
  }
}

/* ---------- Form helpers ---------- */

function normalizeWhatsapp(value) {
  const digits = String(value || "").replace(/\D/g, "");
  let normalized = null;
  if (digits.startsWith("62")) normalized = digits;
  else if (digits.startsWith("0")) normalized = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) normalized = `62${digits}`;
  if (!normalized || normalized.length < 10 || normalized.length > 15) {
    return null;
  }
  return `+${normalized}`;
}

function setError(field, message) {
  const map = {
    name: [els.errName, els.name],
    email: [els.errEmail, els.email],
    wa: [els.errWa, els.whatsapp],
  };
  const [errorEl, inputEl] = map[field];
  errorEl.textContent = message;
  inputEl.setAttribute("aria-invalid", "true");
}

function clearErrors() {
  for (const [errorEl, inputEl] of [
    [els.errName, els.name],
    [els.errEmail, els.email],
    [els.errWa, els.whatsapp],
  ]) {
    errorEl.textContent = "";
    inputEl.removeAttribute("aria-invalid");
  }
}

/* ---------- Utilities ---------- */

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON response */
  }

  if (!response.ok) {
    throw new Error(data?.error || "Permintaan gagal diproses. Silakan coba lagi.");
  }
  return data;
}

function announce(message) {
  els.live.textContent = "";
  window.setTimeout(() => {
    els.live.textContent = message;
  }, 50);
}

function toast(message, duration = 5000) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(state.toastTimer);
  if (duration === 0) return;
  state.toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, duration);
}

function closeDialogs() {
  for (const dialog of $$("dialog[open]")) dialog.close();
}
