// TNEC test client.
// Placement flow: consent -> fullscreen test -> submit -> contact -> result.
// Invite flow (?undangan=token, pre-test and post-test): consent -> test -> submit -> score.
// Questions, timing, and limits come from the server; the answer key never reaches this file.

import { createLiveWaveform } from "./live-waveform.js";

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
const KEY_LETTERS = new Set(["A", "B", "C", "D", "E", "F"]);
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
  passageLabel: $("#passage-label"),
  passageImage: $("#passage-image"),
  passageText: $("#passage-text"),
  prompt: $("#question-prompt"),
  optionsList: $("#options-list"),
  answerField: $("#answer-field"),
  answerInput: $("#answer-input"),
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
  speakTimer: $("#speak-timer"),
  recWave: $("#rec-wave"),
  speakStart: $("#speak-start"),
  speakStop: $("#speak-stop"),
  speakSkip: $("#speak-skip"),
  speakReview: $("#speak-review"),
  speakAudio: $("#speak-audio"),
  speakRetake: $("#speak-retake"),
  speakSend: $("#speak-send"),
  detailsLead: $("#details-lead"),
  detailsBenefit: $("#details-benefit-score"),
  timeupDialog: $("#timeup-dialog"),
  timeupRetry: $("#timeup-retry"),
  timeupBack: $("#timeup-back"),
  codeField: $("#code-field"),
  codeInput: $("#invite-code"),
  codeError: $("#code-error"),
  audioCard: $("#audio-card"),
  audioPlay: $("#audio-play"),
  audioNote: $("#audio-note"),
  listeningAudio: $("#listening-audio"),
  toast: $("#toast"),
  live: $("#live"),
};

const state = {
  config: null,
  invite: null,
  inviteInfo: null,
  inviteCode: "",
  attempt: null,
  perMode: false,
  autoSubmit: false,
  sections: [],
  audioPlayed: new Set(),
  audioSection: null,
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
  restarting: false,
  toastTimer: null,
  speaking: null,
  recStream: null,
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
    // Old emailed links open the React report now.
    window.location.replace(`/hasil?token=${encodeURIComponent(resultLink.trim())}`);
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
  if (state.inviteInfo) applyInviteCopy(state.inviteInfo, state.config);  if (!state.config.open) {
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
  $("#speak-video-play").addEventListener("click", playMockupVideo);
  $("#speak-video").addEventListener("ended", mockupVideoFinished);
  $("#speak-video").addEventListener("error", () => { if (state.mockupSpeaking?.started) mockupVideoFinished(); });
  els.codeInput.addEventListener("input", () => { state.inviteCode = els.codeInput.value.trim(); syncConsent(); });
  els.audioPlay.addEventListener("click", playListeningAudio);
  els.violationClose.addEventListener("click", reenterFullscreen);
  els.endRetry.addEventListener("click", retry);
  els.endBack.addEventListener("click", backToStart);
  els.timeupRetry.addEventListener("click", retry);
  els.timeupBack.addEventListener("click", backToStart);
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

/* One play per section per attempt, enforced by the server: the first press marks the section, a
   second press gets a refusal. After the audio ends the button disappears. */
async function playListeningAudio() {
  const section = state.audioSection;
  if (!section || !state.attempt) return;
  els.audioPlay.disabled = true;
  try {
    await api(`/api/attempts/${state.attempt.id}/audio-played`, { method: "POST", body: { sectionId: section.id } });
  } catch (error) {
    els.audioNote.textContent = error.message || "Audio bagian ini sudah pernah diputar.";
    els.audioPlay.hidden = true;
    state.audioPlayed.add(section.id);
    return;
  }
  state.audioPlayed.add(section.id);
  els.listeningAudio.play().catch(() => {
    els.audioNote.textContent = "Browser kamu memblokir suara. Periksa izin suara di address bar, lalu muat ulang halaman.";
  });
  els.audioNote.textContent = `Audio ${section.title} sedang diputar. Dengarkan sampai selesai; audionya tidak bisa diputar lagi.`;
  els.listeningAudio.addEventListener("ended", () => {
    els.audioPlay.hidden = true;
    els.audioNote.textContent = "Audio selesai. Lanjutkan menjawab soal listening, lalu bagian reading.";
  }, { once: true });
}

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
  state.speaking = config.speaking?.enabled
    ? { ...config.speaking, min: config.speaking.minSeconds, max: config.speaking.seconds }
    : null;
  if (state.speaking) {
    els.detailsLead.textContent =
      "Jawaban dan rekaman kamu sudah tersimpan dengan aman. Lengkapi data di bawah ini, lalu kami siapkan hasil lengkap tes kamu dan mengirimkannya ke email dan WhatsApp kamu.";
    els.detailsBenefit.innerHTML =
      "<strong>Level, skor, dan lima nilai speaking</strong> dari tes yang sudah kamu kerjakan";
    els.contactBtn.textContent = "Kirim dan siapkan hasil";
  }

  if (config.timeMode === "per") {
    setCopy("rule-time", `Tes terdiri dari ${total} soal pilihan ganda, dan setiap soal punya batas waktunya sendiri. Saat waktu satu soal habis, soal berikutnya langsung muncul, dan soal sebelumnya tidak bisa dibuka lagi. Tombol kirim baru bisa dipakai setelah semua soal dijawab.`);
    setCopy("how2-body", `Tes berlangsung paling lama ${spanText(seconds)} tanpa jeda, dengan batas waktu di setiap soal. Selama tes, layar akan otomatis masuk ke mode penuh agar kamu bisa fokus.`);
    setCopy("start-note", `Tes berlangsung paling lama ${spanText(seconds)}, dan jawaban hanya bisa dikirim satu kali.`);
  }
}

function applyInviteCopy(info, config) {
  const total = config.totalQuestions;
  const pre = info.test === "pre";
  const ielts = info.test === "ielts-mockup";
  const name = ielts ? "IELTS Mockup" : info.testName.toLowerCase();
  setCopy("eyebrow", info.testName);

  const accent = document.createElement("span");
  accent.className = "hero__accent";
  accent.textContent = spanText(config.durationSeconds);
  $("#intro-title").replaceChildren(
    ielts
      ? `Halo ${info.firstName}, kerjakan ${name} ${info.packageName || "paket Desember"} dalam `
      : `Halo ${info.firstName}, selesaikan ${name} kamu dalam `,
    accent,
    ".",
  );
  setCopy("intro-lead", ielts
    ? "Mock test ini meniru tes IELTS sungguhan: bagian Listening dengan satu audio, bagian Reading dari tiga bacaan, dua task Writing yang dinilai AI, dan speaking bersama examiner lewat video. Hasilnya berupa perkiraan band untuk Listening, Reading, Writing, dan Speaking."
    : pre
      ? `Tes ini berisi ${total} soal pilihan ganda. Nilainya kami pakai sebagai titik awal untuk melihat perkembangan kamu selama program.`
      : `Tes ini berisi ${total} soal pilihan ganda. Hasilnya kami pakai untuk menentukan apakah kamu sudah siap lanjut ke level berikutnya.`);

  for (const el of $$('[data-only="placement"]')) el.hidden = true;
  els.codeField.hidden = !info.needsCode;
  setCopy("step3-index", "02");
  setCopy("step3-meta", ielts ? "Band langsung muncul" : pre ? "Nilai langsung muncul" : "Nilai dan kelulusan");
  setCopy("how3-title", ielts ? "Melihat band kamu" : "Melihat nilai kamu");
  setCopy("how3-body", ielts
    ? "Setelah jawaban terkirim, band Listening, Reading, dan Writing muncul, lalu band Speaking menyusul setelah rekaman dinilai otomatis."
    : "Setelah jawaban terkirim, nilai kamu langsung muncul di layar dan tercatat di data kelas, jadi tutor bisa membahasnya bersama kamu.");
  setCopy("data-1", "Kami menyimpan jawaban, nilai, waktu pengerjaan, dan catatan pelanggaran selama tes, lalu mencatatnya di data kamu sebagai siswa Titik Nol.");
  setCopy("data-2", "Data itu kami pakai untuk menghitung nilai dan memantau perkembangan belajar kamu bersama tutor. Data tidak dijual dan tidak dipakai untuk iklan.");
  setCopy("data-3", ielts
    ? "Setelah jawaban terkirim, band kamu langsung muncul di layar. Esai Writing dinilai AI dan rekaman speaking dinilai otomatis, tanpa nama atau kontak kamu. Kamu tidak perlu mengisi data kontak lagi."
    : pre
      ? "Setelah jawaban terkirim, nilai kamu langsung muncul di layar. Kamu tidak perlu mengisi data kontak lagi."
      : "Setelah jawaban terkirim, nilai dan hasil kelulusan kamu langsung muncul di layar. Kamu tidak perlu mengisi data kontak lagi.");
  setCopy("data-4", ielts
    ? "Kalau waktu habis, jawaban kamu yang sudah terisi terkirim otomatis dan tetap menghasilkan band. Selama tautan dan kodemu belum dipakai, kamu bisa mengulang dari awal."
    : "Kalau waktu habis sebelum kamu selesai, percobaan ini gagal dan jawaban kamu tidak dikirim. Selama tautan ini masih berlaku, kamu bisa mengulang tes dari awal dengan waktu yang baru.");
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
  const codeOk = !state.inviteInfo?.needsCode || state.inviteCode.length >= 6;
  els.startBtn.disabled = !allChecked || !codeOk || !state.config?.open;
}

function attemptBody() {
  return {
    consent: { accepted: true, version: state.config.consentVersion },
    ...(state.invite ? { invite: state.invite } : {}),
    ...(state.inviteInfo?.needsCode ? { inviteCode: state.inviteCode } : {}),
  };
}

async function startTest(event) {
  event.preventDefault();
  if (!state.config || els.startBtn.disabled) return;
  if (state.inviteInfo?.needsCode) {
    els.codeError.hidden = true;
    if (state.inviteCode.length < 6) {
      els.codeError.textContent = "Masukkan kode 6 karakter yang ada di pesan WhatsApp kamu.";
      els.codeError.hidden = false;
      els.codeInput.focus();
      return;
    }
  }

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
    if (error.status === 403 && state.inviteInfo?.needsCode) {
      els.codeError.textContent = error.message || "Kode belum benar.";
      els.codeError.hidden = false;
      els.codeInput.focus();
      els.codeInput.select();
    } else {
      toast(error.message || "Tes gagal dimulai. Silakan coba lagi.");
    }
    if (error.status === 423 || error.status === 410 || error.status === 404) {
      showIntroNotice(error.message);
    } else if (error.status !== 403) {
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
  state.autoSubmit = Boolean(data.autoSubmit);
  state.sections = data.sections || [];
  state.audioPlayed = new Set();
  state.audioSection = null;
  state.mockupSpeaking = data.mockupSpeaking ? { plan: data.mockupSpeaking, done: false, started: false, pi: 0, qi: 0 } : null;
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
    ? "Setiap soal punya waktunya sendiri. Soal berikutnya muncul otomatis saat waktu habis, dan jawaban terkirim setelah soal terakhir. Tombol kirim baru bisa dipakai setelah semua soal dijawab."
    : "Periksa kembali jawaban kamu sebelum mengirim, karena jawaban tidak bisa diubah setelah terkirim. Semua soal juga harus sudah dijawab sebelum jawaban bisa dikirim.";

  showScreen("test");
  buildNavigator();
  renderQuestion();
  startTimer();
}

function showScreen(name, { focus = true } = {}) {
  for (const key of ["intro", "test", "speaking", "details"]) {
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
  const section = question.sectionId ? state.sections.find((s) => s.id === question.sectionId) : null;
  const partLabel = question.part ? ` \u00b7 Bagian ${question.part}` : "";
  els.questionBadge.textContent = `Soal ${state.index + 1} \u00b7 ${question.skill || "Grammar"}${partLabel}`;
  els.prompt.textContent = question.prompt;

  // The section owns the reading passage or listening instructions, so every question of the
  // section shows the same text and a later shuffle cannot separate them.
  const passage = section?.passage || question.passage;
  const image = section?.image || "";
  els.passageLabel.textContent = section?.title || "Bacaan";
  if (image) {
    els.passageImage.src = image;
    els.passageImage.alt = section?.title || "Gambar soal";
    els.passageImage.hidden = false;
  } else {
    els.passageImage.hidden = true;
    els.passageImage.removeAttribute("src");
    els.passageImage.alt = "";
  }
  if (passage || image) {
    els.passage.hidden = false;
    els.passageText.hidden = !passage;
    els.passageText.textContent = passage || "";
  } else {
    els.passage.hidden = true;
    els.passageText.hidden = false;
    els.passageText.textContent = "";
  }

  // The audio belongs to the section too. One play per section, tracked on the server.
  state.audioSection = section && section.audio ? section : null;
  els.audioCard.hidden = !state.audioSection;
  if (state.audioSection) {
    if (els.listeningAudio.getAttribute("src") !== state.audioSection.audio) els.listeningAudio.src = state.audioSection.audio;
    const played = state.audioPlayed.has(state.audioSection.id);
    els.audioPlay.hidden = played;
    els.audioPlay.disabled = played;
    els.audioNote.textContent = played
      ? `Audio ${state.audioSection.title} sudah diputar. Lanjutkan menjawab soalnya.`
      : `Putar audio ${state.audioSection.title} saat kamu siap. Audio hanya bisa diputar satu kali, jadi pastikan tempatmu tenang dan speaker atau headsetmu menyala.`;
  }

  els.optionsList.replaceChildren();
  if (question.type === "text") {
    const field = document.createElement("div");
    field.className = "field answer-field";
    const label = document.createElement("label");
    label.className = "label";
    label.htmlFor = `q-${question.id}`;
    label.textContent = "Jawaban kamu";
    const input = document.createElement("input");
    input.className = "input";
    input.id = `q-${question.id}`;
    input.type = "text";
    input.autocomplete = "off";
    input.maxLength = 300;
    input.value = state.answers[question.id] || "";
    input.addEventListener("input", () => answerText(question.id, input.value));
    field.append(label, input);
    els.optionsList.append(field);
  } else if (question.type === "longtext") {
    const field = document.createElement("div");
    field.className = "field answer-field";
    const label = document.createElement("label");
    label.className = "label";
    label.htmlFor = `q-${question.id}`;
    label.textContent = "Tulisan kamu";
    const area = document.createElement("textarea");
    area.className = "textarea";
    area.id = `q-${question.id}`;
    area.rows = 12;
    area.maxLength = 20000;
    area.autocomplete = "off";
    area.value = state.answers[question.id] || "";
    const counter = document.createElement("p");
    counter.className = "micro";
    const update = () => {
      const words = area.value.trim().split(/\s+/).filter(Boolean).length;
      const minimum = question.minWords || 150;
      counter.textContent = `${words} kata, minimal ${minimum} kata`;
      counter.classList.toggle("is-warning", words < minimum);
    };
    area.addEventListener("input", () => { answerText(question.id, area.value); update(); });
    update();
    field.append(label, area, counter);
    els.optionsList.append(field);
  } else {
    const letters = Object.keys(question.options || {});
    for (const letter of letters) {
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

/** A typed answer counts as answered only when it is not blank. */
function answerText(questionId, value) {
  const trimmed = value.trim();
  if (trimmed) state.answers[questionId] = trimmed;
  else delete state.answers[questionId];
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

// The answers go out only after every question is answered. The manual send is gated here and in
// openSubmit; the per-question auto send after the last question is the one exception, because
// its blanks come from question timeouts, and those questions cannot be opened again.
function openSubmit() {
  if (!state.attempt || state.submitting || state.ending) return;
  const missing = state.attempt.total - Object.keys(state.answers).length;
  if (missing > 0) {
    const first = state.attempt.questions.findIndex((q) => !state.answers[q.id]);
    const onThisQuestion = first === state.index;
    const message = onThisQuestion
      ? "Soal ini belum dijawab. Pilih jawabannya dulu, baru jawaban bisa dikirim."
      : state.perMode
        ? `Masih ada ${missing} soal yang belum dijawab dan sudah tidak bisa dibuka lagi. Jawaban terkirim otomatis saat waktu soal terakhir habis.`
        : `Masih ada ${missing} soal yang belum dijawab. Soal ${first + 1} terbuka sekarang.`;
    if (!state.perMode && !onThisQuestion && first >= 0) goTo(first);
    toast(message);
    announce(message);
    return;
  }
  if (state.mockupSpeaking && !state.mockupSpeaking.done) {
    beginMockupSpeaking();
    return;
  }
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
      // A mockup with auto submit sends whatever is answered; every other test fails the attempt.
      if (state.autoSubmit) {
        if (!state.autoSubmitted) {
          state.autoSubmitted = true;
          submitAnswers();
        }
        return;
      }
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
  if (!state.autoSubmitted && Object.keys(state.answers).length < state.attempt.total) {
    openSubmit();
    return;
  }  state.submitting = true;
  state.ending = true;
  clearInterval(state.timerId);
  closeDialogs();

  try {
    const data = await api(`/api/attempts/${state.attempt.id}/submit`, {
      method: "POST",
      body: { answers: state.answers },
    });
    state.submitted = true;
    // Every result is the React report now, including the wait while the mockup speaking is scored.
    if (state.inviteInfo) {
      await exitFullscreen();
      window.location.assign(`/hasil?attempt=${encodeURIComponent(state.attempt.id)}`);
      return;
    }
    if (state.speaking) {
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
    // The report opens right away and shows the wait itself while a recording is scored.
    if (data.resultToken) {
      window.location.assign(`/hasil?token=${encodeURIComponent(data.resultToken)}`);
      return;
    }
    toast("Data sudah tersimpan, tetapi tautan hasil belum siap. Muat ulang halaman ini sebentar lagi.");
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
    speakUnavailable("Browser atau perangkat ini tidak mendukung perekaman suara, jadi bagian speaking tidak bisa dikerjakan. Silakan lanjut tanpa rekaman: hasil tes kamu tetap kami proses, hanya tanpa nilai speaking.");
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

/* The recording feedback and the problem notices appear inside the visible card, right above the
   buttons the student pressed, never as a box floating on top of the page. */
function placeSpeakFeedback(...nodes) {
  const actions = els.speakAnswerCard.hidden
    ? els.speakCheckCard.querySelector(".speak-actions")
    : els.speakAnswerCard.querySelector(".speak-actions");
  actions.before(...nodes);
}

function speakUnavailable(message, { retry = false } = {}) {
  placeSpeakFeedback(els.speakError, els.speakSkip);
  els.speakError.textContent = message;
  els.speakError.hidden = false;
  // With a permission problem the student can fix it in the address bar and record again,
  // so the record button stays available. Only a browser that cannot record at all hides it.
  els.speakCheckStart.hidden = !retry;
  els.speakCheckStart.disabled = false;
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
    speakUnavailable(
      "Rekaman tidak bisa dimulai karena browser kamu belum mengizinkan mikrofonnya. Ketuk ikon gembok atau ikon mikrofon di address bar, pilih Izinkan untuk situs ini, lalu tekan tombol rekam sekali lagi. Kalau kamu memilih lanjut tanpa rekaman, hasil tes kamu tetap kami proses, hanya tanpa nilai speaking.",
      { retry: true },
    );
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
  els.speakSkip.hidden = true;
  placeSpeakFeedback(els.speakMeter);
  els.speakMeter.hidden = false;
  els.speakTimer.hidden = false;
  stopBtn.hidden = false;
  stopBtn.disabled = limits.min > 1;
  els.recWave.hidden = false;
  recWave.start(state.recStream).then((ok) => { if (!ok) els.recWave.hidden = true; });
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
  recWave.stop();
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
  if (state.mockupSpeaking?.started) {
    setMockupQuestion(0, 0);
    return;
  }
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
  recWave.stop();
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
  if (state.mockupSpeaking && !state.mockupSpeaking.done) {
    const plan = state.mockupSpeaking.plan;
    const part = plan.parts[state.mockupSpeaking.pi];
    const question = part.questions[state.mockupSpeaking.qi];
    state.speakBusy = true;
    els.speakSend.disabled = true;
    els.speakRetake.disabled = true;
    $("#speak-send-label").textContent = "Menyimpan...";
    try {
      await api(`/api/attempts/${state.attempt.id}/speaking-answer?part=${part.part}&prompt=${question.no}`, {
        method: "POST",
        headers: { "content-type": state.recBlob.type, "x-duration": String(state.recDuration) },
        body: state.recBlob,
      });
      clearRecording();
      advanceMockupSpeaking();
    } catch (error) {
      toast(error.message || "Rekaman gagal disimpan. Periksa koneksi kamu, lalu coba lagi.");
    } finally {
      state.speakBusy = false;
      els.speakSend.disabled = false;
      els.speakRetake.disabled = false;
      $("#speak-send-label").textContent = "Lanjut";
    }
    return;
  }
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
  if (state.mockupSpeaking && !state.mockupSpeaking.done) {
    state.speakBusy = true;
    els.speakSkip.disabled = true;
    try {
      await api(`/api/attempts/${state.attempt.id}/speaking-skip`, { method: "POST", body: { reason: "mic" } });
      state.mockupSpeaking.done = true;
      clearRecording();
      releaseMic();
      openSubmit();
    } catch (error) {
      toast(error.message || "Bagian ini belum bisa dilewati. Coba lagi.");
    } finally {
      state.speakBusy = false;
      els.speakSkip.disabled = false;
    }
    return;
  }
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

/* ---------- The IELTS mockup speaking runner ---------- */

function beginMockupSpeaking() {
  if (!state.mockupSpeaking?.plan) return;
  state.mockupSpeaking.started = true;
  state.mockupSpeaking.done = false;
  state.mockupSpeaking.pi = 0;
  state.mockupSpeaking.qi = 0;
  state.speaking = null;
  const lead = $("#speak-check-lead");
  if (lead) lead.textContent = "Rekam sebentar saja, lalu dengarkan hasilnya. Kalau suara kamu terdengar jelas, kamu siap menjawab pertanyaan dari examiner.";
  els.speakAnswerCard.querySelector(".badge").textContent = "IELTS Mockup Speaking";
  els.speakCheckCard.hidden = false;
  els.speakAnswerCard.hidden = true;
  resetCheckUi();
  showScreen("speaking");
}

function setMockupQuestion(pi, qi) {
  const plan = state.mockupSpeaking?.plan;
  if (!plan) return;
  const part = plan.parts[pi];
  const question = part.questions[qi];
  state.mockupSpeaking.pi = pi;
  state.mockupSpeaking.qi = qi;
  state.speaking = { enabled: true, min: 5, max: part.speakSeconds, seconds: part.speakSeconds, minSeconds: 5, prompt: question.text };
  $("#speaking-step").textContent = `Part ${part.part} · Pertanyaan ${qi + 1} dari ${part.questions.length}`;
  els.speakingPrompt.textContent = question.text;
  const cue = $("#speaking-cue");
  cue.hidden = !part.cue;
  if (part.cue) {
    cue.replaceChildren();
    for (const [i, line] of part.cue.entries()) {
      const p = document.createElement("p");
      p.className = i === 0 ? "speak-cue__title" : "speak-cue__line";
      p.textContent = line;
      cue.append(p);
    }
  }
  els.speakNote.textContent = part.part === 2
    ? "Tonton examiner, gunakan 60 detik untuk menyiapkan jawaban, lalu rekam."
    : "Tonton pertanyaan dari examiner, lalu rekam jawabanmu. Kamu bisa memutar ulang pertanyaannya sebelum mulai.";
  const wrap = $("#speak-video-wrap");
  const video = $("#speak-video");
  const play = $("#speak-video-play");
  wrap.hidden = false;
  video.src = question.video;
  video.load();
  play.hidden = false;
  play.disabled = false;
  $("#speak-prep").hidden = true;
  clearInterval(state.prepId);
  state.prepId = null;
  clearRecording();
  els.speakStart.hidden = true;
  els.speakStop.hidden = true;
  els.speakReview.hidden = true;
  els.speakMeter.hidden = true;
  els.speakTimer.hidden = true;
  els.speakError.hidden = true;
  els.speakSkip.hidden = true;
  $("#speak-send-label").textContent = "Lanjut";
}

async function playMockupVideo() {
  const video = $("#speak-video");
  const play = $("#speak-video-play");
  if (!video.getAttribute("src")) return;
  play.disabled = true;
  try {
    await video.play();
  } catch {
    play.disabled = false;
    mockupVideoFinished();
  }
}

function mockupVideoFinished() {
  if (!state.mockupSpeaking?.started) return;
  const part = state.mockupSpeaking.plan.parts[state.mockupSpeaking.pi];
  const play = $("#speak-video-play");
  play.hidden = false;
  play.disabled = false;
  if (part.prepSeconds) {
    startMockupPrep(part.prepSeconds);
  } else {
    els.speakStart.hidden = false;
    els.speakStart.disabled = false;
    els.speakStart.focus();
  }
}

function startMockupPrep(seconds) {
  clearInterval(state.prepId);
  let left = seconds;
  const prep = $("#speak-prep");
  prep.hidden = false;
  prep.textContent = `Waktu persiapan: ${left} detik`;
  els.speakStart.hidden = true;
  state.prepId = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(state.prepId);
      state.prepId = null;
      prep.hidden = true;
      els.speakStart.hidden = false;
      els.speakStart.disabled = false;
      els.speakStart.focus();
      announce("Waktu persiapan selesai. Mulai menjawab.");
    } else {
      prep.textContent = `Waktu persiapan: ${left} detik`;
    }
  }, 1000);
}

function advanceMockupSpeaking() {
  const plan = state.mockupSpeaking?.plan;
  if (!plan) return;
  const { pi, qi } = state.mockupSpeaking;
  const part = plan.parts[pi];
  if (qi + 1 < part.questions.length) {
    setMockupQuestion(pi, qi + 1);
    return;
  }
  if (pi + 1 < plan.parts.length) {
    setMockupQuestion(pi + 1, 0);
    return;
  }
  state.mockupSpeaking.done = true;
  clearInterval(state.prepId);
  state.prepId = null;
  releaseMic();
  openSubmit();
}

/* The sound wave is the ElevenLabs UI LiveWaveform component, ported to a small vanilla module
   because this app has no React. It draws a live mirrored spectrum of the microphone. */
const recWave = createLiveWaveform(els.recWave, { height: 24 });

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

  const current = state.attempt.questions[state.index];
  if (!mod && !event.altKey && KEY_LETTERS.has(key.toUpperCase()) && current.type !== "text" && current.options?.[key.toUpperCase()]) {
    choose(current.id, key.toUpperCase());
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
