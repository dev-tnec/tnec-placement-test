// TNEC test client.
// Placement flow: consent -> fullscreen test -> submit -> contact -> result.
// Invite flow (?undangan=token, pre-test and post-test): consent -> test -> submit -> score.
// Questions, timing, and limits come from the server; the answer key never reaches this file.

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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// The server keeps a per-question attempt open a little longer than the sum of the question times.
const PER_MODE_CLIENT_GRACE = 100;

const els = {
  testbar: $("#testbar"),
  progress: $("#progress"),
  progressLabel: $("#progress-label"),
  progressPercent: $("#progress-percent"),
  timer: $("#timer"),
  timerValue: $("#timer-value"),
  timerLabel: $("#timer-label"),
  legalDialog: $("#legal-dialog"),
  legalTitle: $("#legal-title"),
  legalBody: $("#legal-dialog-body"),
  legalAction: $("#legal-action"),
  legalNote: $("#legal-note"),
  consentForm: $("#consent-form"),
  consentBoxes: $$(".consent-box"),
  startBtn: $("#start-btn"),
  introNotice: $("#intro-notice"),
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
  navCount: $("#nav-count"),
  navAnswered: $("#nav-answered"),
  navFlagged: $("#nav-flagged"),
  finishBtn: $("#finish-btn"),
  finishNote: $("#finish-note"),
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
  submitTotal: $("#submit-total"),
  submitCancel: $("#submit-cancel"),
  submitConfirm: $("#submit-confirm"),
  speakCheckCard: $("#speak-check-card"),
  speakAnswerCard: $("#speak-answer-card"),
  speakCheckLead: $("#speak-check-lead"),
  speakCheckStart: $("#speak-check-start"),
  speakCheckStop: $("#speak-check-stop"),
  speakCheckReview: $("#speak-check-review"),
  speakCheckAudio: $("#speak-check-audio"),
  speakCheckRetry: $("#speak-check-retry"),
  speakCheckOk: $("#speak-check-ok"),
  speakingPrompt: $("#speaking-prompt"),
  speakNote: $("#speak-note"),
  speakError: $("#speak-error"),
  speakMeter: $("#speak-meter"),
  speakMeterFill: $("#speak-meter-fill"),
  speakTimer: $("#speak-timer"),
  speakStart: $("#speak-start"),
  speakStop: $("#speak-stop"),
  speakSkip: $("#speak-skip"),
  speakReview: $("#speak-review"),
  speakAudio: $("#speak-audio"),
  speakRetake: $("#speak-retake"),
  speakSend: $("#speak-send"),
  pendingWa: $("#pending-wa"),
  pendingEmailNote: $("#pending-email-note"),
  resultSpeaking: $("#result-speaking"),
  resultSpeakingCefr: $("#speaking-result-cefr"),
  resultSpeakingIelts: $("#speaking-result-ielts"),
  resultSpeakingSource: $("#speaking-result-source"),
  resultSpeakingAspects: $("#speaking-result-aspects"),
  resultSpeakingNote: $("#speaking-result-note"),
  programGrid: $("#program-grid"),
  detailsLead: $("#details-lead"),
  detailsBenefit: $("#details-benefit-score"),
  timeupDialog: $("#timeup-dialog"),
  timeupRetry: $("#timeup-retry"),
  timeupBack: $("#timeup-back"),
  toast: $("#toast"),
  live: $("#live"),
};

const state = {
  config: null,
  invite: null,
  inviteInfo: null,
  attempt: null,
  perMode: false,
  maxStrikes: 3,
  index: 0,
  answers: {},
  flagged: new Set(),
  strikes: 0,
  deadline: 0,
  questionDeadline: 0,
  autoSubmitted: false,
  timerId: null,
  warned60: false,
  timeUp: false,
  submitting: false,
  submitted: false,
  ending: false,
  lastViolationAt: 0,
  contact: null,
  delivery: null,
  restarting: false,
  toastTimer: null,
  speaking: null,
  recStream: null,
  recCtx: null,
  recAnalyser: null,
  recMeterId: null,
  recTimerId: null,
  recorder: null,
  recChunks: [],
  recStart: 0,
  recBlob: null,
  recBlobUrl: null,
  recDuration: 0,
  recMode: "check",
  checkBlobUrl: null,
  speakBusy: false,
  resultToken: null,
  pollId: null,
};

let pendingConsent = null;

init();

async function init() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("undangan");
  if (token) state.invite = token.trim();
  const resultLink = params.get("hasil");
  if (resultLink) {
    openResultLink(resultLink.trim());
    return;
  }

  try {
    state.config = state.invite
      ? await api(`/api/invites/${encodeURIComponent(state.invite)}`)
      : await api("/api/config");
  } catch (error) {
    if (state.invite && error.status) {
      showIntroNotice(error.message);
      els.startBtn.disabled = true;
      return;
    }
    toast("Tes tidak dapat dimuat. Periksa koneksi internet kamu, lalu muat ulang halaman ini.", 0);
    els.startBtn.textContent = "Muat ulang halaman";
    els.startBtn.disabled = false;
    els.startBtn.addEventListener("click", () => window.location.reload(), {
      once: true,
    });
    return;
  }

  state.inviteInfo = state.config.invite || null;
  applySettings(state.config);
  if (state.inviteInfo) applyInviteCopy(state.inviteInfo, state.config);
  if (!state.config.open) {
    showIntroNotice(
      state.inviteInfo
        ? `${state.inviteInfo.testName} sedang ditutup sementara. Hubungi admin atau tutor kamu di Titik Nol untuk menanyakan jadwalnya.`
        : "Tes penempatan sedang ditutup sementara. Silakan coba lagi nanti, atau hubungi admin Titik Nol lewat WhatsApp.",
    );
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
  els.speakCheckStart.addEventListener("click", () => startRecording("check"));
  els.speakCheckStop.addEventListener("click", stopRecording);
  els.speakCheckRetry.addEventListener("click", retryVoiceCheck);
  els.speakCheckOk.addEventListener("click", voiceCheckPassed);
  els.speakStart.addEventListener("click", () => startRecording("answer"));
  els.speakStop.addEventListener("click", stopRecording);
  els.speakRetake.addEventListener("click", retakeRecording);
  els.speakSend.addEventListener("click", sendRecording);
  els.speakSkip.addEventListener("click", skipSpeaking);
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

/* ---------- Settings from the server ---------- */

function spanText(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} detik`;
  return s ? `${m} menit ${s} detik` : `${m} menit`;
}

function setCopy(key, text) {
  for (const el of $$(`[data-copy="${key}"]`)) el.textContent = text;
}

function applySettings(config) {
  const total = config.totalQuestions;
  const seconds = config.durationSeconds;
  const wholeMinutes = seconds % 60 === 0;
  const values = {
    total: String(total),
    duration: spanText(seconds),
    strikes: String(config.maxViolations),
    "time-num": String(wholeMinutes ? seconds / 60 : seconds),
    "time-unit": wholeMinutes ? "menit" : "detik",
  };
  for (const el of $$("[data-fill]")) {
    if (values[el.dataset.fill] !== undefined) el.textContent = values[el.dataset.fill];
  }
  state.maxStrikes = config.maxViolations || 3;

  // Speaking runs on the placement test only, after the multiple choice part.
  state.speaking = config.speaking?.enabled ? config.speaking : null;
  if (state.speaking) {
    els.detailsLead.textContent =
      "Jawaban dan rekaman kamu sudah tersimpan dengan aman. Lengkapi data di bawah ini, lalu kami siapkan hasil lengkap tes kamu dan mengirimkannya ke email dan WhatsApp kamu.";
    els.detailsBenefit.innerHTML =
      "<strong>Level, skor, dan lima nilai speaking</strong> dari tes yang sudah kamu kerjakan";
    els.contactBtn.textContent = "Kirim dan siapkan hasil";
  }

  if (config.timeMode === "per") {
    setCopy("rule-time", `Tes terdiri dari ${total} soal pilihan ganda, dan setiap soal punya batas waktunya sendiri. Saat waktu satu soal habis, soal berikutnya langsung muncul, dan soal sebelumnya tidak bisa dibuka lagi.`);
    setCopy("how2-body", `Tes berlangsung paling lama ${spanText(seconds)} tanpa jeda, dengan batas waktu di setiap soal. Selama tes, layar akan otomatis masuk ke mode penuh agar kamu bisa fokus.`);
    setCopy("start-note", `Tes berlangsung paling lama ${spanText(seconds)}, dan jawaban hanya bisa dikirim satu kali.`);
  }
}

function applyInviteCopy(info, config) {
  const total = config.totalQuestions;
  const pre = info.test === "pre";
  const name = info.testName.toLowerCase();
  setCopy("eyebrow", info.testName);

  const accent = document.createElement("span");
  accent.className = "hero__accent";
  accent.textContent = spanText(config.durationSeconds);
  $("#intro-title").replaceChildren(
    `Halo ${info.firstName}, selesaikan ${name} kamu dalam `,
    accent,
    ".",
  );
  setCopy("intro-lead", pre
    ? `Tes ini berisi ${total} soal pilihan ganda. Nilainya kami pakai sebagai titik awal untuk melihat perkembangan kamu selama program.`
    : `Tes ini berisi ${total} soal pilihan ganda. Hasilnya kami pakai untuk menentukan apakah kamu sudah siap lanjut ke level berikutnya.`);

  for (const el of $$('[data-only="placement"]')) el.hidden = true;
  setCopy("step3-index", "02");
  setCopy("step3-meta", pre ? "Nilai langsung muncul" : "Nilai dan kelulusan");
  setCopy("how3-title", "Melihat nilai kamu");
  setCopy("how3-body", "Setelah jawaban terkirim, nilai kamu langsung muncul di layar dan tercatat di data kelas, jadi tutor bisa membahasnya bersama kamu.");
  setCopy("data-1", "Kami menyimpan jawaban, nilai, waktu pengerjaan, dan catatan pelanggaran selama tes, lalu mencatatnya di data kamu sebagai siswa Titik Nol.");
  setCopy("data-2", "Data itu kami pakai untuk menghitung nilai dan memantau perkembangan belajar kamu bersama tutor. Data tidak dijual dan tidak dipakai untuk iklan.");
  setCopy("data-3", pre
    ? "Setelah jawaban terkirim, nilai kamu langsung muncul di layar. Kamu tidak perlu mengisi data kontak lagi."
    : "Setelah jawaban terkirim, nilai dan hasil kelulusan kamu langsung muncul di layar. Kamu tidak perlu mengisi data kontak lagi.");
  setCopy("data-4", "Kalau waktu habis sebelum kamu selesai, percobaan ini gagal dan jawaban kamu tidak dikirim. Selama tautan ini masih berlaku, kamu bisa mengulang tes dari awal dengan waktu yang baru.");
  document.title = `${info.testName} - Titik Nol English Course`;
}

function showIntroNotice(message) {
  els.introNotice.textContent = message;
  els.introNotice.hidden = false;
}

/* ---------- Consent ---------- */

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
  if (!state.config) return;
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
  els.startBtn.disabled = !allChecked || !state.config?.open;
}

function attemptBody() {
  return {
    consent: { accepted: true, version: state.config.consentVersion },
    ...(state.invite ? { invite: state.invite } : {}),
  };
}

async function startTest(event) {
  event.preventDefault();
  if (!state.config || els.startBtn.disabled) return;

  els.startBtn.disabled = true;
  const label = els.startBtn.firstChild;
  const original = label.textContent;
  label.textContent = "Menyiapkan tes... ";
  await requestFullscreen();

  try {
    const data = await api("/api/attempts", { method: "POST", body: attemptBody() });
    beginAttempt(data);
  } catch (error) {
    await exitFullscreen();
    toast(error.message || "Tes gagal dimulai. Silakan coba lagi.");
    if (error.status === 423 || error.status === 410 || error.status === 404) {
      showIntroNotice(error.message);
    } else {
      els.startBtn.disabled = false;
    }
  } finally {
    label.textContent = original;
  }
}

function beginAttempt(data) {
  state.attempt = {
    id: data.attemptId,
    questions: data.questions,
    total: data.total,
  };
  state.perMode = data.timeMode === "per";
  state.maxStrikes = data.maxViolations || state.maxStrikes;
  state.index = 0;
  state.answers = {};
  state.flagged = new Set();
  state.strikes = 0;
  state.deadline = Date.now() + (data.secondsLeft + (state.perMode ? PER_MODE_CLIENT_GRACE : 0)) * 1000;
  state.questionDeadline = 0;
  state.autoSubmitted = false;
  state.warned60 = false;
  state.timeUp = false;
  state.submitting = false;
  state.submitted = false;
  state.ending = false;
  state.lastViolationAt = 0;
  state.contact = null;
  state.delivery = null;

  els.contactForm.reset();
  clearErrors();
  clearRecording();
  els.fsWarning.hidden = Boolean(document.fullscreenElement);

  // Per-question time moves forward only, so there is nothing to go back to or flag.
  els.prevBtn.hidden = state.perMode;
  els.flagBtn.hidden = state.perMode;
  els.timerLabel.textContent = state.perMode ? "untuk soal ini" : "tersisa";
  els.navCount.textContent = `${data.total} soal`;
  els.submitTotal.textContent = String(data.total);
  els.finishNote.textContent = state.perMode
    ? "Setiap soal punya waktunya sendiri. Soal berikutnya muncul otomatis saat waktu habis, dan jawaban terkirim setelah soal terakhir."
    : "Periksa kembali jawaban kamu sebelum mengirim, karena jawaban tidak bisa diubah setelah terkirim.";

  showScreen("test");
  buildNavigator();
  renderQuestion();
  startTimer();
}

function showScreen(name, { focus = true } = {}) {
  for (const key of ["intro", "test", "speaking", "details", "result", "pending", "score"]) {
    $(`#screen-${key}`).hidden = key !== name;
  }
  document.body.dataset.screen = name;
  els.testbar.hidden = name !== "test";
  window.scrollTo(0, 0);

  if (!focus) return;
  const target = {
    intro: "#intro-title",
    speaking: "#speaking-title",
    details: "#details-title",
    result: "#result-level",
    pending: "#pending-title",
    score: "#score-title",
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
    button.disabled = state.perMode;
    button.addEventListener("click", () => goTo(i));
    els.navGrid.append(button);
  }
  syncNavigator();
}

function renderQuestion() {
  const question = state.attempt.questions[state.index];
  els.questionBadge.textContent = `Soal ${state.index + 1} \u00b7 ${question.skill || "Grammar"}`;
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

  if (state.perMode) state.questionDeadline = Date.now() + (question.seconds || 30) * 1000;
  syncQuestionChrome();
  syncNavigator();
  if (state.perMode) tick();
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
  if (!state.attempt || state.ending) return;
  if (index < 0 || index >= state.attempt.total) return;
  if (state.perMode && index <= state.index) return;
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
  if (!state.attempt || state.perMode) return;
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
  if (state.perMode) {
    tickQuestion();
    return;
  }
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

// Per-question mode: when a question runs out of time the next one opens.
// After the last question the answers are sent automatically, once.
function tickQuestion() {
  if (state.ending || state.submitted) return;
  const remaining = Math.max(0, Math.ceil((state.questionDeadline - Date.now()) / 1000));
  els.timerValue.textContent = formatTime(remaining);
  els.timer.classList.toggle("is-warning", remaining > 0 && remaining <= 5);
  if (remaining > 0) return;

  if (state.index < state.attempt.total - 1) {
    announce("Waktu soal ini habis. Soal berikutnya sudah muncul.");
    state.index += 1;
    renderQuestion();
    return;
  }
  if (!state.autoSubmitted) {
    state.autoSubmitted = true;
    submitAnswers();
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
    const data = await api(`/api/attempts/${state.attempt.id}/submit`, {
      method: "POST",
      body: { answers: state.answers },
    });
    state.submitted = true;
    if (data.result) {
      renderScore(data.result);
      showScreen("score");
      await exitFullscreen();
    } else if (state.speaking) {
      await exitFullscreen();
      enterSpeaking();
    } else {
      showScreen("details");
      await exitFullscreen();
    }
  } catch (error) {
    state.submitting = false;
    if (Date.now() < state.deadline) {
      state.ending = false;
      toast(
        `${error.message || "Jawaban gagal dikirim."} Jawaban kamu masih tersimpan di halaman ini, silakan coba kirim lagi.`,
      );
      if (state.perMode) {
        // Keep the last question open so the answers can be sent again with the button.
        els.timerValue.textContent = formatTime(0);
        return;
      }
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
    state.delivery = data.delivery || null;
    if (data.result) {
      renderResult(data.result, { programs: data.programs });
      showScreen("result");
    } else {
      renderPending();
      showScreen("pending");
      if (data.resultToken) pollResult(data.resultToken);
    }
  } catch (error) {
    toast(error.message || "Data gagal disimpan. Silakan coba lagi.");
  } finally {
    els.contactBtn.disabled = false;
    els.contactBtn.textContent = state.speaking ? "Kirim dan siapkan hasil" : "Lihat hasil saya";
  }
}

/* ---------- Speaking ---------- */

// Chrome and Edge record webm, Firefox ogg, and Safari mp4. The server accepts all of them.
const REC_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"];

// The voice check records a few seconds and is never uploaded. The answer recording is the one sent.
const CHECK_SECONDS = { min: 3, max: 10 };

const recordingSupported = () => Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);

function answerInstruction() {
  const sp = state.speaking;
  return `Jawab dalam bahasa Inggris selama ${sp.minSeconds} sampai ${sp.seconds} detik, dalam satu tarikan tanpa membaca teks. Tekan Mulai jawab saat kamu siap.`;
}

function enterSpeaking() {
  const sp = state.speaking;
  if (!sp) {
    showScreen("details");
    return;
  }
  clearRecording();
  clearCheckRecording();
  els.speakingPrompt.textContent = sp.prompt;
  els.speakNote.textContent = answerInstruction();
  els.speakCheckCard.hidden = false;
  els.speakAnswerCard.hidden = true;
  resetCheckUi();
  showScreen("speaking");
  if (!recordingSupported()) {
    speakUnavailable("Browser ini tidak bisa merekam suara, jadi bagian speaking dilewati. Tes kamu tetap bisa dilanjutkan.");
  }
}

function resetCheckUi() {
  els.speakError.hidden = true;
  els.speakMeter.hidden = true;
  els.speakTimer.hidden = true;
  els.speakCheckStart.hidden = false;
  els.speakCheckStart.disabled = false;
  els.speakCheckStop.hidden = true;
  els.speakSkip.hidden = true;
  els.speakCheckReview.hidden = true;
}

function speakUnavailable(message) {
  els.speakError.textContent = message;
  els.speakError.hidden = false;
  els.speakCheckStart.hidden = true;
  els.speakCheckStop.hidden = true;
  els.speakMeter.hidden = true;
  els.speakTimer.hidden = true;
  els.speakSkip.hidden = false;
}

async function ensureMicStream() {
  if (state.recStream) return state.recStream;
  state.recStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return state.recStream;
}

/** Records either the voice check or the answer. The limits differ per mode. */
async function startRecording(mode) {
  if (state.speakBusy || state.recorder) return;
  const limits = mode === "check" ? CHECK_SECONDS : state.speaking;
  state.speakBusy = true;
  state.recMode = mode;
  const startBtn = mode === "check" ? els.speakCheckStart : els.speakStart;
  const stopBtn = mode === "check" ? els.speakCheckStop : els.speakStop;
  startBtn.disabled = true;
  try {
    await ensureMicStream();
  } catch {
    state.speakBusy = false;
    startBtn.disabled = false;
    speakUnavailable("Mikrofon tidak bisa dipakai. Periksa izin mikrofon di browser kamu, atau lanjutkan tanpa rekaman.");
    return;
  }
  state.speakBusy = false;

  const mime = REC_MIMES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  const recorder = new MediaRecorder(state.recStream, mime ? { mimeType: mime } : undefined);
  state.recorder = recorder;
  state.recChunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) state.recChunks.push(event.data);
  };
  recorder.onstop = finishRecording;
  recorder.start();

  state.recStart = Date.now();
  startBtn.hidden = true;
  els.speakError.hidden = true;
  els.speakMeter.hidden = false;
  els.speakTimer.hidden = false;
  stopBtn.hidden = false;
  stopBtn.disabled = limits.min > 1;
  startMeter();
  announce("Perekaman dimulai.");

  state.recTimerId = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.recStart) / 1000);
    els.speakTimer.textContent = formatTime(elapsed);
    if (stopBtn.disabled && elapsed >= limits.min) {
      stopBtn.disabled = false;
      stopBtn.focus();
    }
    if (elapsed >= limits.max) stopRecording();
  }, 250);
}

function stopRecording() {
  clearInterval(state.recTimerId);
  state.recTimerId = null;
  stopMeter();
  if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
}

function finishRecording() {
  const recorder = state.recorder;
  state.recorder = null;
  state.recDuration = Math.max(1, Math.round((Date.now() - state.recStart) / 1000));
  const type = (recorder?.mimeType || REC_MIMES[0]).split(";")[0];
  state.recBlob = new Blob(state.recChunks, { type });
  state.recChunks = [];

  els.speakCheckStop.hidden = true;
  els.speakStop.hidden = true;
  els.speakMeter.hidden = true;
  els.speakTimer.hidden = true;

  if (state.recMode === "check") {
    if (state.checkBlobUrl) URL.revokeObjectURL(state.checkBlobUrl);
    state.checkBlobUrl = URL.createObjectURL(state.recBlob);
    els.speakCheckAudio.src = state.checkBlobUrl;
    els.speakCheckReview.hidden = false;
    announce("Rekaman percobaan siap didengarkan.");
    els.speakCheckOk.focus();
    return;
  }

  if (state.recBlobUrl) URL.revokeObjectURL(state.recBlobUrl);
  state.recBlobUrl = URL.createObjectURL(state.recBlob);
  els.speakAudio.src = state.recBlobUrl;
  els.speakReview.hidden = false;
  els.speakNote.textContent = "Dengarkan jawaban kamu. Kalau ada yang kurang jelas, rekam ulang. Kalau sudah pas, kirim rekamannya.";
  announce("Jawaban selesai direkam, dan siap untuk didengarkan.");
  els.speakSend.focus();
}

/** Wipes the voice check recording so the student can try again. */
function clearCheckRecording() {
  if (state.checkBlobUrl) URL.revokeObjectURL(state.checkBlobUrl);
  state.checkBlobUrl = null;
  if (els.speakCheckAudio.getAttribute("src")) {
    els.speakCheckAudio.removeAttribute("src");
    els.speakCheckAudio.load();
  }
  els.speakCheckReview.hidden = true;
}

function retryVoiceCheck() {
  clearCheckRecording();
  resetCheckUi();
  els.speakCheckStart.focus();
}

/** The voice is clear, so the answer phase begins. The microphone stays on meanwhile. */
function voiceCheckPassed() {
  clearCheckRecording();
  els.speakCheckCard.hidden = true;
  els.speakAnswerCard.hidden = false;
  els.speakStart.focus();
}

function clearRecording() {
  if (state.recBlobUrl) URL.revokeObjectURL(state.recBlobUrl);
  state.recBlobUrl = null;
  state.recBlob = null;
  state.recChunks = [];
  state.recorder = null;
  if (els.speakAudio.getAttribute("src")) {
    els.speakAudio.removeAttribute("src");
    els.speakAudio.load();
  }
  els.speakReview.hidden = true;
  els.speakStart.hidden = false;
  els.speakStart.disabled = false;
  els.speakStop.hidden = true;
  els.speakSend.disabled = false;
  els.speakRetake.disabled = false;
  $("#speak-send-label").textContent = "Kirim rekaman";
}

/** Releases the microphone once the speaking part is over. */
function releaseMic() {
  stopMeter();
  if (state.recStream) state.recStream.getTracks().forEach((track) => track.stop());
  state.recStream = null;
}

function retakeRecording() {
  clearRecording();
  els.speakNote.textContent = answerInstruction();
  els.speakStart.focus();
}

async function sendRecording() {
  if (!state.recBlob || state.speakBusy || !state.attempt) return;
  state.speakBusy = true;
  els.speakSend.disabled = true;
  els.speakRetake.disabled = true;
  $("#speak-send-label").textContent = "Mengirim...";
  try {
    await api(`/api/attempts/${state.attempt.id}/speaking`, {
      method: "POST",
      headers: { "content-type": state.recBlob.type, "x-duration": String(state.recDuration) },
      body: state.recBlob,
    });
    clearRecording();
    releaseMic();
    showScreen("details");
  } catch (error) {
    if (error.code === "speaking_closed" || error.code === "speaking_off" || error.code === "speaking_done") {
      toast(error.message);
      releaseMic();
      showScreen("details");
      return;
    }
    toast(error.message || "Rekaman gagal dikirim. Periksa koneksi kamu, lalu coba lagi.");
    if (error.code === "speaking_short") els.speakNote.textContent = error.message;
  } finally {
    state.speakBusy = false;
    els.speakSend.disabled = false;
    els.speakRetake.disabled = false;
    $("#speak-send-label").textContent = "Kirim rekaman";
  }
}

async function skipSpeaking() {
  if (!state.attempt || state.speakBusy) return;
  state.speakBusy = true;
  els.speakSkip.disabled = true;
  try {
    await api(`/api/attempts/${state.attempt.id}/speaking-skip`, {
      method: "POST",
      body: { reason: "mic" },
    });
    clearRecording();
    releaseMic();
    showScreen("details");
  } catch (error) {
    toast(error.message || "Bagian ini belum bisa dilewati. Coba lagi.");
  } finally {
    state.speakBusy = false;
    els.speakSkip.disabled = false;
  }
}

function startMeter() {
  try {
    state.recCtx = new AudioContext();
    const source = state.recCtx.createMediaStreamSource(state.recStream);
    state.recAnalyser = state.recCtx.createAnalyser();
    state.recAnalyser.fftSize = 1024;
    source.connect(state.recAnalyser);
  } catch {
    state.recCtx = null;
    state.recAnalyser = null;
    return;
  }
  const data = new Uint8Array(state.recAnalyser.fftSize);
  const tick = () => {
    if (!state.recAnalyser) return;
    state.recAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) {
      const x = (value - 128) / 128;
      sum += x * x;
    }
    const level = Math.min(1, Math.sqrt(sum / data.length) * 6);
    els.speakMeterFill.style.transform = `scaleX(${level.toFixed(3)})`;
    els.speakMeter.classList.toggle("is-loud", level > 0.9);
    state.recMeterId = requestAnimationFrame(tick);
  };
  tick();
}

function stopMeter() {
  cancelAnimationFrame(state.recMeterId);
  state.recMeterId = null;
  state.recAnalyser = null;
  if (state.recCtx) state.recCtx.close().catch(() => {});
  state.recCtx = null;
  els.speakMeterFill.style.transform = "scaleX(0)";
  els.speakMeter.classList.remove("is-loud");
}

/* ---------- Waiting for the score, and the result behind a private link ---------- */

// The waiting screen checks the result every few seconds, so a student who stays on the page sees
// the full result without waiting for the email. The link from the email uses the same endpoint.
const RESULT_POLL_MS = 6000;

function stopResultPoll() {
  clearInterval(state.pollId);
  state.pollId = null;
}

async function pollResult(token, { publicView = false } = {}) {
  stopResultPoll();
  state.resultToken = token;
  const check = async () => {
    if (document.hidden) return;
    let data;
    try {
      data = await api(`/api/results/${encodeURIComponent(token)}`);
    } catch {
      return; // a network blip should not end the wait; the next tick tries again
    }
    if (!data.ready) return;
    stopResultPoll();
    renderResult(data.result, { programs: data.programs, publicView });
    showScreen("result");
  };
  await check();
  if (state.pollId === null && document.body.dataset.screen !== "result") {
    state.pollId = setInterval(check, RESULT_POLL_MS);
  }
}

/* The waiting screen, shown when the recording is still being scored. */
function renderPending() {
  const name = state.contact?.name || "";
  const waText = `Halo Admin Titik Nol, saya ${name}. Saya baru selesai mengerjakan tes penempatan dan ingin menanyakan hasil saya.`;
  els.pendingWa.href = `https://wa.me/${state.config.whatsapp}?text=${encodeURIComponent(waText)}`;

  const to = state.contact?.email || "email kamu";
  const viaEmail = state.delivery?.email === "sending" || state.delivery?.email === "sent";
  const viaWa = state.delivery?.whatsapp === "sending" || state.delivery?.whatsapp === "sent";
  let note;
  if (viaEmail && viaWa) note = `Setelah penilaian selesai, hasilnya kami kirim ke ${to} dan ke WhatsApp kamu.`;
  else if (viaEmail) note = `Setelah penilaian selesai, hasilnya kami kirim ke ${to}.`;
  else if (viaWa) note = "Setelah penilaian selesai, hasilnya kami kirim ke WhatsApp kamu.";
  else note = "Hasil belum bisa kami kirim ke email maupun WhatsApp, jadi hubungi admin lewat tombol di bawah.";
  els.pendingEmailNote.textContent = note;
}

/** The link from the email and WhatsApp, opened on its own. */
async function openResultLink(token) {
  document.title = "Hasil Tes Penempatan, Titik Nol English Course";
  state.contact = { name: "" };
  try {
    const data = await api(`/api/results/${encodeURIComponent(token)}`);
    if (data.ready) {
      renderResult(data.result, { programs: data.programs, publicView: true });
      showScreen("result");
      return;
    }
  } catch (error) {
    showIntroNotice(error.message);
    els.startBtn.disabled = true;
    return;
  }
  showScreen("pending");
  els.pendingWa.href = `https://wa.me/${state.config?.whatsapp || "6282333143544"}?text=${encodeURIComponent("Halo Admin Titik Nol, saya ingin menanyakan hasil tes penempatan saya.")}`;
  els.pendingEmailNote.textContent = "Penilaian speaking kamu masih berjalan. Halaman ini menyegarkan sendiri, jadi tunggu sebentar saja.";
  await pollResult(token, { publicView: true });
}

function renderResult(result, { programs = [], publicView = false } = {}) {
  const level = result.level;
  const levelIndex = Math.max(0, LEVEL_ORDER.indexOf(level.key));

  els.resultLevel.textContent = level.label;
  els.resultSummary.textContent = level.summary;
  els.resultScore.textContent = String(result.score);
  els.resultTotal.textContent = `/ ${result.total}`;
  els.resultIndex.textContent = String(levelIndex + 1).padStart(2, "0");
  els.resultProgram.textContent = level.program;
  els.resultDescription.textContent = level.description;

  renderSpeakingResult(result.speaking);
  renderProgramGrid(programs);

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

  // A visitor from the emailed link has no attempt to repeat, and no channels to report on.
  els.retryBtn.hidden = publicView;
  const contactName = state.contact?.name || "";
  const waText = `Halo Admin Titik Nol, saya ${contactName}. Saya baru selesai mengerjakan tes penempatan dengan hasil ${level.label} (${result.score} dari ${result.total}) dan ingin berkonsultasi tentang program yang sesuai.`;
  els.waBtn.href = `https://wa.me/${state.config?.whatsapp || "6282333143544"}?text=${encodeURIComponent(waText)}`;
  els.emailNote.textContent = publicView
    ? "Ini halaman hasil lengkap kamu. Simpan tautannya agar kamu bisa membukanya kembali kapan saja."
    : deliveryNote(state.delivery, state.contact?.email);
}

/* The speaking block of the result, with the five aspects and the note from the grader. */
function renderSpeakingResult(sp) {
  if (!sp) {
    els.resultSpeaking.hidden = true;
    return;
  }
  els.resultSpeaking.hidden = false;
  els.resultSpeakingCefr.textContent = sp.cefr;
  els.resultSpeakingIelts.textContent = sp.ielts === null || sp.ielts === undefined ? "-" : Number(sp.ielts).toFixed(1);
  els.resultSpeakingSource.textContent = sp.source === "manual" ? "dinilai oleh tim Titik Nol" : "dinilai otomatis oleh Speechace";

  els.resultSpeakingAspects.replaceChildren();
  for (const aspect of sp.aspects) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "aspect-name";
    name.textContent = aspect.label;
    const cefr = document.createElement("span");
    cefr.className = "aspect-cefr";
    cefr.textContent = aspect.cefr || "-";
    li.append(name, cefr);
    if (aspect.score !== null && aspect.score !== undefined) {
      const score = document.createElement("span");
      score.className = "aspect-score";
      score.textContent = `${Math.round(aspect.score)} / 100`;
      li.append(score);
    }
    els.resultSpeakingAspects.append(li);
  }

  const notes = [];
  if (sp.tooShort) notes.push("Jawaban kamu kurang dari 20 kata, jadi nilai keseluruhannya belum stabil.");
  if (sp.offTopic) notes.push("Jawaban kamu belum sesuai dengan pertanyaannya.");
  if (sp.transcript) notes.push(`Transkrip jawaban kamu: "${sp.transcript}"`);
  notes.push(...(sp.notes || []).slice(0, 2));
  els.resultSpeakingNote.textContent = notes.join(" ");
  els.resultSpeakingNote.hidden = notes.length === 0;
}

/* The program cards, each linking to its product page on titiknolenglish.com. */
function renderProgramGrid(cards) {
  els.programGrid.replaceChildren();
  if (!cards.length) {
    els.programGrid.hidden = true;
    return;
  }
  els.programGrid.hidden = false;
  for (const card of cards) {
    const link = document.createElement("a");
    link.className = "program-card";
    link.href = card.url;
    link.target = "_blank";
    link.rel = "noopener";

    if (card.image) {
      const img = document.createElement("img");
      img.className = "program-card__img";
      img.src = card.image;
      img.alt = card.name;
      img.loading = "lazy";
      link.append(img);
    }

    const body = document.createElement("div");
    body.className = "program-card__body";
    if (card.recommended) {
      const tag = document.createElement("p");
      tag.className = "program-card__tag";
      tag.textContent = "Rekomendasi kami";
      body.append(tag);
    }
    const name = document.createElement("p");
    name.className = "program-card__name";
    name.textContent = card.name;
    body.append(name);
    if (card.recommended && card.levelLabel) {
      const meta = document.createElement("p");
      meta.className = "program-card__meta";
      meta.textContent = `Sesuai level ${card.levelLabel} kamu`;
      body.append(meta);
    } else if (card.levels?.length) {
      const meta = document.createElement("p");
      meta.className = "program-card__meta";
      meta.textContent = `Untuk level ${card.levels.join(", ")}`;
      body.append(meta);
    }
    link.append(body);
    els.programGrid.append(link);
  }
}

// The email and WhatsApp go out in the background after the result appears, so the note says
// where the copy is going rather than whether it has arrived.
function deliveryNote(delivery, email) {
  const to = email || "email kamu";
  const used = (channel) => channel === "sending" || channel === "sent";
  const viaEmail = used(delivery?.email);
  const viaWa = used(delivery?.whatsapp);
  const done = (!viaEmail || delivery.email === "sent") && (!viaWa || delivery.whatsapp === "sent");
  const verb = done ? "sudah kami kirim" : "sedang kami kirim";
  if (viaEmail && viaWa) return `Salinan hasil ini ${verb} ke ${to} dan ke WhatsApp kamu. Kalau emailnya belum masuk dalam beberapa menit, periksa juga folder spam.`;
  if (viaEmail) return `Salinan hasil ini ${verb} ke ${to}. Kalau belum masuk dalam beberapa menit, periksa juga folder spam.`;
  if (viaWa) return `Salinan hasil ini ${verb} ke WhatsApp kamu.`;
  return "Salinan hasil belum bisa kami kirim ke email maupun WhatsApp kamu, jadi simpan halaman ini atau hubungi admin melalui WhatsApp.";
}

// Pre-test and post-test results. The student is already known, so there is no contact step.
function renderScore(result) {
  const first = state.inviteInfo?.firstName || "";
  $("#score-eyebrow").textContent = `Hasil ${result.testName}`;
  $("#score-title").textContent = `Nilai kamu ${result.nilai}`;
  $("#score-value").textContent = String(result.score);
  $("#score-total").textContent = `/ ${result.total}`;

  let summary;
  let headline;
  let description;
  if (result.test !== "post") {
    summary = `Terima kasih sudah mengerjakan pre-test${first ? `, ${first}` : ""}.`;
    headline = "Nilai awal kamu sudah tercatat";
    description = "Nilai ini menjadi titik awal untuk melihat perkembangan kamu selama program. Di akhir program, kamu akan mengerjakan post-test supaya kemajuan kamu bisa dibandingkan dengan nilai ini.";
  } else if (result.passed) {
    summary = `Selamat${first ? `, ${first}` : ""}. Nilai kamu sudah mencapai batas kelulusan ${result.passScore}.`;
    headline = "Kamu siap lanjut ke level berikutnya";
    description = "Tim pendidikan Titik Nol akan menghubungi kamu untuk membahas pilihan kelas di level berikutnya.";
  } else {
    summary = `${first ? `${first}, n` : "N"}ilai kamu belum mencapai batas kelulusan ${result.passScore}.`;
    headline = "Level ini perlu diperkuat dulu";
    description = "Tutor kamu akan membahas bagian yang masih perlu dilatih, lalu tim pendidikan membantu menentukan kelas berikutnya untuk kamu.";
  }
  $("#score-summary").textContent = summary;
  $("#score-headline").textContent = headline;
  $("#score-description").textContent = description;
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
    const data = await api("/api/attempts", { method: "POST", body: attemptBody() });
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
  if (state.strikes >= state.maxStrikes) {
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

// Chrome, Edge, and Opera can hold the Esc key while the test is in fullscreen (Keyboard Lock).
// A quick press then reaches the page and does nothing, and leaving fullscreen takes holding Esc
// for 2 seconds, which still counts as a strike. Firefox and Safari have no Keyboard Lock, so Esc
// still leaves fullscreen at once there. The spec asks for the lock before fullscreen starts.
function lockEscape() {
  if (!navigator.keyboard?.lock) return;
  navigator.keyboard.lock(["Escape"]).catch(() => {});
}

function unlockEscape() {
  if (navigator.keyboard?.unlock) navigator.keyboard.unlock();
}

async function requestFullscreen() {
  const element = document.documentElement;
  if (!element.requestFullscreen || document.fullscreenElement) {
    return Boolean(document.fullscreenElement);
  }
  lockEscape();
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
  } finally {
    // Release Esc after fullscreen ends, the order the Keyboard Lock spec recommends.
    unlockEscape();
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

async function api(path, { method = "GET", body, headers } = {}) {
  const isRaw = body instanceof Blob;
  const response = await fetch(path, {
    method,
    headers: headers ?? (body && !isRaw ? { "Content-Type": "application/json" } : undefined),
    body: isRaw ? body : body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON response */
  }

  if (!response.ok) {
    const error = new Error(data?.error || "Permintaan gagal diproses. Silakan coba lagi.");
    error.status = response.status;
    error.code = data?.code || null;
    throw error;
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
