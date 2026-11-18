import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api, exitFullscreen, requestFullscreen, normalizeWhatsapp, EMAIL_RE, FOCUS_TYPES, KEY_LETTERS,
  REC_MIMES, CHECK_SECONDS, recordingSupported, spanText, PER_MODE_CLIENT_GRACE,
} from "./lib.js";
import { createLiveWaveform } from "./live-waveform.js";
import { Intro, TestScreen, SpeakingScreen, DetailsScreen, Dialogs, ErrorScreen, Footer } from "./screens.jsx";

export default function App() {
  const [config, setConfig] = useState(null);
  const [inviteInfo, setInviteInfo] = useState(null);
  const [inviteToken, setInviteToken] = useState("");
  const [notice, setNotice] = useState("");
  const [loadFailed, setLoadFailed] = useState("");
  const [loadStatus, setLoadStatus] = useState(0);
  const [screen, setScreen] = useState("intro");
  const [consent, setConsent] = useState({ terms: false, privacy: false, honesty: false });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [startBusy, setStartBusy] = useState(false);
  const [attempt, setAttempt] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState(() => new Set());
  const [perMode, setPerMode] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [maxStrikes, setMaxStrikes] = useState(3);
  const [strikes, setStrikes] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [questionLeft, setQuestionLeft] = useState(0);
  const [ending, setEnding] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogs, setDialogs] = useState({ violation: false, limit: false, submit: false, timeup: false });
  const [legal, setLegal] = useState(null);
  const [toast, setToast] = useState(null);
  const [live, setLive] = useState("");
  const [fsWarning, setFsWarning] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(() => new Set());
  const [audioNote, setAudioNote] = useState("");
  const [contact, setContact] = useState({ name: "", email: "", whatsapp: "", branch: "" });
  const [contactErrors, setContactErrors] = useState({});
  const [contactBusy, setContactBusy] = useState(false);
  const [stage, setStage] = useState("check");
  const [mockup, setMockup] = useState(null);
  const [placementSpeak, setPlacementSpeak] = useState(null);
  const [recording, setRecording] = useState(null);
  const [checkUrl, setCheckUrl] = useState(null);
  const [recUrl, setRecUrl] = useState(null);
  const [recBlob, setRecBlob] = useState(null);
  const [speakError, setSpeakError] = useState("");
  const [showSkip, setShowSkip] = useState(false);
  const [checkStartHidden, setCheckStartHidden] = useState(false);
  const [speakBusy, setSpeakBusy] = useState(false);
  const [sendLabel, setSendLabel] = useState("Kirim rekaman");
  const [prepLeft, setPrepLeft] = useState(null);
  const [canRecord, setCanRecord] = useState(false);
  const [noteOverride, setNoteOverride] = useState("");
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [sectionPlan, setSectionPlan] = useState(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [sectionLeft, setSectionLeft] = useState(0);
  const [speakingLeft, setSpeakingLeft] = useState(null);

  const deadline = useRef(0);
  const questionDeadline = useRef(0);
  const warned60 = useRef(false);
  const timeUp = useRef(false);
  const autoSubmitted = useRef(false);
  const autoSubmitRef = useRef(false);
  const lastViolationAt = useRef(0);
  const strikesRef = useRef(0);
  const recStream = useRef(null);
  const recorder = useRef(null);
  const recChunks = useRef([]);
  const recStart = useRef(0);
  const recMode = useRef("check");
  const recDuration = useRef(0);
  const recTimer = useRef(null);
  const prepTimer = useRef(null);
  const toastTimer = useRef(null);
  const liveTimer = useRef(null);
  const wave = useRef(null);
  const checkUrlRef = useRef(null);
  const recUrlRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const introTitleRef = useRef(null);
  const speakingTitleRef = useRef(null);
  const detailsTitleRef = useRef(null);
  const codeInputRef = useRef(null);
  const checkStartRef = useRef(null);
  const answerStartRef = useRef(null);

  const screenRef = useRef(screen);
  const attemptRef = useRef(attempt);
  const indexRef = useRef(index);
  const answersRef = useRef(answers);
  const perModeRef = useRef(perMode);
  const endingRef = useRef(ending);
  const submittedRef = useRef(submitted);
  const maxStrikesRef = useRef(maxStrikes);
  const mockupRef = useRef(mockup);
  const placementSpeakRef = useRef(placementSpeak);
  const currentSpeakingRef = useRef(null);
  const isTestingRef = useRef(() => false);
  const tickRef = useRef(null);
  const openSubmitRef = useRef(null);
  const submitAnswersRef = useRef(null);
  const registerViolationRef = useRef(null);
  const keydownRef = useRef(null);
  const chooseRef = useRef(null);
  const nextRef = useRef(null);
  const prevRef = useRef(null);
  const sectionDeadline = useRef(0);
  const sectionLocked = useRef(false);
  const sectionModeRef = useRef(false);
  const sectionIndexRef = useRef(0);
  const sectionPlanRef = useRef(null);
  const endSectionRef = useRef(null);
  const speakingDeadline = useRef(0);
  const speakingLocked = useRef(false);
  const speakingCountRef = useRef(0);
  const finishSpeakingByTimeRef = useRef(null);

  // Keep the latest state in refs for the timer and event callbacks, but only after the commit:
  // writing refs during render is impure and can tear under concurrent rendering.
  useEffect(() => {
    screenRef.current = screen;
    attemptRef.current = attempt;
    indexRef.current = index;
    answersRef.current = answers;
    perModeRef.current = perMode;
    endingRef.current = ending;
    submittedRef.current = submitted;
    maxStrikesRef.current = maxStrikes;
    mockupRef.current = mockup;
    placementSpeakRef.current = placementSpeak;
    autoSubmitRef.current = autoSubmit;
  });

  const showToast = useCallback((message, duration = 5000) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    if (duration === 0) return;
    toastTimer.current = setTimeout(() => setToast(null), duration);
  }, []);

  const announce = useCallback((message) => {
    setLive("");
    clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => setLive(message), 50);
  }, []);

  const mockupPart = mockup?.plan?.parts[mockup.pi];
  const mockupQuestion = mockupPart?.questions[mockup.qi];
  // The placement speaking bank: the questions picked for this attempt, one recording each.
  const placementQuestion = placementSpeak ? placementSpeak.list[placementSpeak.index] : null;
  const speakingOn = Boolean(config?.speaking?.enabled) || Boolean(placementSpeak);

  const currentSpeaking = useMemo(() => {
    if (mockup?.started && !mockup.done && mockupPart && mockupQuestion) {
      return { min: 5, max: mockupPart.speakSeconds, seconds: mockupPart.speakSeconds, minSeconds: 5, prompt: mockupQuestion.text };
    }
    if (placementQuestion) {
      return { ...config.speaking, min: config.speaking.minSeconds, max: config.speaking.seconds, prompt: placementQuestion.prompt, position: placementQuestion.position,
        index: placementSpeak.index, total: placementSpeak.list.length };
    }
    if (speakingOn) return { ...config.speaking, min: config.speaking.minSeconds, max: config.speaking.seconds, prompt: config.speaking.prompt };
    return null;
  }, [mockup, mockupPart, mockupQuestion, config, placementQuestion, speakingOn]);
  currentSpeakingRef.current = currentSpeaking;

  const question = attempt?.questions[index];
  // The listening audio is one file for Part 1 to Part 4. It lives on the first Listening section,
  // and it stays mounted while the student moves between all listening questions.
  const audioSection = useMemo(() => {
    if (!attempt || !question || question.skill !== "Listening") return null;
    return attempt.sections.find((item) => item.skill === "Listening" && item.audio) || null;
  }, [attempt, question]);

  useEffect(() => {
    if (!audioSection) return;
    const played = audioPlayed.has(audioSection.id);
    setAudioNote(played
      ? "Audio Listening sudah diputar. Lanjutkan menjawab soal Part 1 sampai Part 4."
      : "Putar audio Listening untuk Part 1 sampai Part 4 saat kamu siap. Audio hanya bisa diputar satu kali, jadi pastikan tempatmu tenang dan speaker atau headsetmu menyala.");
    // The note follows the listening block, not every play state change; play and end set it directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSection?.id]);

  const durationText = spanText(config?.durationSeconds ?? 300);
  const currentSection = sectionPlan?.[sectionIndex] || null;
  const sectionMode = Boolean(currentSection);
  const sectionSkill = currentSection?.skill || null;
  const sectionQuestions = useMemo(() => {
    if (!attempt || !sectionSkill) return [];
    return attempt.questions.map((q, i) => ({ q, i })).filter(({ q }) => q.skill === sectionSkill);
  }, [attempt, sectionSkill]);
  const sectionPosition = sectionQuestions.findIndex(({ i }) => i === index);
  const sectionTotal = sectionQuestions.length;
  const finishLabel = sectionSkill === "Listening" ? "Lanjut ke Reading" : sectionSkill === "Reading" ? "Lanjut ke Writing" : mockup?.plan ? "Lanjut ke Speaking" : "Selesaikan dan kirim";
  const sectionNote = sectionMode
    ? `Bagian ${sectionSkill} terkunci saat waktunya habis atau saat kamu menekan tombol selesai. Kamu tidak bisa kembali ke bagian ini.`
    : "";
  const finishNote = sectionMode
    ? sectionNote
    : perMode
      ? "Setiap soal punya waktunya sendiri. Soal berikutnya muncul otomatis saat waktu habis, dan jawaban terkirim setelah soal terakhir. Tombol kirim baru bisa dipakai setelah semua soal dijawab."
      : "Periksa kembali jawaban kamu sebelum mengirim, karena jawaban tidak bisa diubah setelah terkirim. Semua soal juga harus sudah dijawab sebelum jawaban bisa dikirim.";

  /* ---------- Load the test settings ---------- */

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oldResult = params.get("hasil");
    if (oldResult) {
      window.location.replace(`/hasil?token=${encodeURIComponent(oldResult.trim())}`);
      return;
    }
    const token = params.get("undangan")?.trim() || "";
    setInviteToken(token);
    const url = token ? `/api/invites/${encodeURIComponent(token)}` : "/api/config";
    api(url).then((data) => {
      setConfig(data);
      setInviteInfo(data.invite || null);
      setMaxStrikes(data.maxViolations || 3);
      if (!data.open) {
        setNotice(data.invite
          ? `${data.invite.testName} sedang ditutup sementara. Hubungi admin atau tutor kamu di Titik Nol untuk menanyakan jadwalnya.`
          : "Tes penempatan sedang ditutup sementara. Silakan coba lagi nanti, atau hubungi admin Titik Nol lewat WhatsApp.");
      }
      if (data.invite) document.title = `${data.invite.testName} - Titik Nol English Course`;
    }).catch((error) => {
      if (token && error.status) {
        setNotice(error.message);
        setLoadStatus(error.status);
        setLoadFailed("invite");
      } else {
        setLoadFailed("network");
        setNotice("Tes tidak dapat dimuat. Periksa koneksi internet kamu, lalu muat ulang halaman ini.");
      }
    });
  }, []);

  /* ---------- Screen, body state, and focus ---------- */

  useEffect(() => {
    document.body.dataset.screen = screen;
    window.scrollTo(0, 0);
    const target = screen === "intro" ? introTitleRef.current : screen === "speaking" ? speakingTitleRef.current : screen === "details" ? detailsTitleRef.current : null;
    target?.focus({ preventScroll: true });
  }, [screen]);

  useEffect(() => {
    const handler = () => { if (document.fullscreenElement) setFsWarning(false); };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => () => {
    clearInterval(recTimer.current);
    clearInterval(prepTimer.current);
    clearTimeout(toastTimer.current);
    clearTimeout(liveTimer.current);
    if (recStream.current) recStream.current.getTracks().forEach((track) => track.stop());
    wave.current?.destroy();
  }, []);

  /* ---------- Start and attempt ---------- */

  const attemptBody = () => ({
    consent: { accepted: true, version: config.consentVersion },
    ...(inviteToken ? { invite: inviteToken } : {}),
    ...(inviteInfo?.needsCode ? { inviteCode: code.trim() } : {}),
  });

  function beginAttempt(data) {
    const isPer = data.timeMode === "per";
    const plan = Array.isArray(data.sectionPlan) && data.sectionPlan.length ? data.sectionPlan : null;
    const first = plan?.[0] || null;
    const firstIndex = first ? data.questions.findIndex((q) => q.skill === first.skill) : 0;
    setAttempt({ id: data.attemptId, questions: data.questions, total: data.total, sections: data.sections || [] });
    setPerMode(isPer);
    setAutoSubmit(Boolean(data.autoSubmit));
    setMaxStrikes(data.maxViolations || 3);
    setSectionPlan(plan);
    setSectionIndex(0);
    setSectionLeft(first ? first.seconds : 0);
    setSpeakingLeft(null);
    sectionPlanRef.current = plan;
    sectionIndexRef.current = 0;
    sectionLocked.current = false;
    sectionModeRef.current = Boolean(plan);
    sectionDeadline.current = first ? Date.now() + first.seconds * 1000 : 0;
    speakingDeadline.current = 0;
    speakingLocked.current = false;
    speakingCountRef.current = 0;
    setIndex(firstIndex < 0 ? 0 : firstIndex);
    setAnswers({});
    setFlagged(new Set());
    setStrikes(0);
    strikesRef.current = 0;
    deadline.current = Date.now() + (data.secondsLeft + (isPer ? PER_MODE_CLIENT_GRACE : 0)) * 1000;
    questionDeadline.current = 0;
    warned60.current = false;
    timeUp.current = false;
    autoSubmitted.current = false;
    setEnding(false);
    setSubmitted(false);
    setSubmitting(false);
    setTimeLeft(data.secondsLeft + (isPer ? PER_MODE_CLIENT_GRACE : 0));
    setQuestionLeft(0);
    setFsWarning(!document.fullscreenElement);
    setMockup(data.mockupSpeaking ? { plan: data.mockupSpeaking, started: false, done: false, pi: 0, qi: 0 } : null);
    setPlacementSpeak(Array.isArray(data.speakingQuestions) && data.speakingQuestions.length ? { list: data.speakingQuestions, index: 0 } : null);
    setStage("check");
    setRecording(null);
    clearCheck();
    clearRecording();
    setSpeakError("");
    setShowSkip(false);
    setCheckStartHidden(false);
    setSpeakBusy(false);
    setSendLabel("Kirim rekaman");
    setPrepLeft(null);
    setCanRecord(false);
    setNoteOverride("");
    setVideoPlaying(false);
    setAudioPlayed(new Set());
    setAudioNote("");
    setContact({ name: "", email: "", whatsapp: "", branch: "" });
    setContactErrors({});
    setDialogs({ violation: false, limit: false, submit: false, timeup: false });
    setLegal(null);
    setScreen("test");
  }

  async function startTest() {
    if (!config?.open || startBusy) return;
    if (!(consent.terms && consent.privacy && consent.honesty)) return;
    if (inviteInfo?.needsCode) {
      setCodeError("");
      if (code.trim().length < 6) {
        setCodeError("Masukkan kode 6 karakter yang ada di pesan WhatsApp kamu.");
        codeInputRef.current?.focus();
        return;
      }
    }
    setStartBusy(true);
    await requestFullscreen();
    try {
      const data = await api("/api/attempts", { method: "POST", body: attemptBody() });
      beginAttempt(data);
    } catch (error) {
      await exitFullscreen();
      if (error.status === 403 && inviteInfo?.needsCode) {
        setCodeError(error.message || "Kode belum benar.");
        codeInputRef.current?.focus();
        codeInputRef.current?.select();
      } else {
        showToast(error.message || "Tes gagal dimulai. Silakan coba lagi.");
      }
      if (error.status === 423 || error.status === 410 || error.status === 404) setNotice(error.message);
    } finally {
      setStartBusy(false);
    }
  }

  /* ---------- Questions ---------- */

  function goTo(position) {
    if (!attempt || ending) return;
    if (position < 0 || position >= attempt.total) return;
    if (perMode && position <= index) return;
    if (sectionModeRef.current) {
      const skill = sectionPlanRef.current?.[sectionIndexRef.current]?.skill;
      if (skill && attempt.questions[position]?.skill !== skill) return;
    }
    setIndex(position);
  }

  const choose = (questionId, letter) => setAnswers((current) => ({ ...current, [questionId]: letter }));

  function answerText(questionId, value) {
    setAnswers((current) => {
      const next = { ...current };
      // The raw text is stored as typed: trimming here would strip the space after every
      // word, because this value flows straight back into the controlled input.
      if (value.trim()) next[questionId] = value;
      else delete next[questionId];
      return next;
    });
  }

  function next() {
    if (!attempt) return;
    if (sectionModeRef.current) {
      const skill = sectionPlanRef.current?.[sectionIndexRef.current]?.skill;
      const indices = attempt.questions.map((q, i) => (q.skill === skill ? i : -1)).filter((i) => i >= 0);
      const position = indices.indexOf(index);
      if (position === indices.length - 1) { endSectionRef.current?.(); return; }
      goTo(indices[position + 1]);
      return;
    }
    if (index === attempt.total - 1) { openSubmit(); return; }
    goTo(index + 1);
  }

  function prev() {
    if (!attempt) return;
    if (sectionModeRef.current) {
      const skill = sectionPlanRef.current?.[sectionIndexRef.current]?.skill;
      const indices = attempt.questions.map((q, i) => (q.skill === skill ? i : -1)).filter((i) => i >= 0);
      const position = indices.indexOf(index);
      if (position > 0) goTo(indices[position - 1]);
      return;
    }
    goTo(index - 1);
  }

  function toggleFlag() {
    if (!attempt || perMode) return;
    const id = attempt.questions[index].id;
    setFlagged((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  chooseRef.current = choose;
  nextRef.current = next;
  prevRef.current = prev;

  /* ---------- Timer ---------- */

  function tick() {
    if (!attemptRef.current) return;
    if (sectionModeRef.current) {
      const remaining = Math.max(0, Math.ceil((sectionDeadline.current - Date.now()) / 1000));
      setSectionLeft(remaining);
      if (remaining === 0) endSectionRef.current?.();
      return;
    }
    if (perModeRef.current) {
      const remaining = Math.max(0, Math.ceil((questionDeadline.current - Date.now()) / 1000));
      setQuestionLeft(remaining);
      if (remaining === 0 && !endingRef.current && !submittedRef.current) {
        if (indexRef.current < attemptRef.current.total - 1) {
          announce("Waktu soal ini habis. Soal berikutnya sudah muncul.");
          setIndex(indexRef.current + 1);
        } else if (!autoSubmitted.current) {
          autoSubmitted.current = true;
          submitAnswersRef.current?.();
        }
      }
      return;
    }
    const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
    setTimeLeft(remaining);
    if (remaining > 0 && remaining <= 60 && !warned60.current) {
      warned60.current = true;
      announce("Sisa waktu satu menit.");
    }
    if (remaining === 0 && !timeUp.current) {
      timeUp.current = true;
      if (autoSubmitRef.current) {
        if (!autoSubmitted.current) { autoSubmitted.current = true; submitAnswersRef.current?.(); }
        return;
      }
      setEnding(true);
      setDialogs((current) => ({ ...current, timeup: true }));
    }
  }
  tickRef.current = tick;

  useEffect(() => {
    if (screen !== "test" || !attempt || ending) return undefined;
    const id = setInterval(() => tickRef.current?.(), 250);
    return () => clearInterval(id);
  }, [screen, attempt, ending]);

  useEffect(() => {
    if (screen !== "test" || !attempt || !perMode) return;
    const current = attempt.questions[index];
    questionDeadline.current = Date.now() + (current?.seconds || 30) * 1000;
    setQuestionLeft(current?.seconds || 30);
  }, [screen, attempt, perMode, index]);

  /* ---------- Section timers ---------- */

  function finishAttempt() {
    autoSubmitted.current = true;
    submitAnswersRef.current?.();
  }

  function finishWrittenSection() {
    if (mockupRef.current && !mockupRef.current.done) { beginMockupSpeaking(); return; }
    finishAttempt();
  }

  function endSection() {
    if (!sectionPlanRef.current || sectionLocked.current) return;
    sectionLocked.current = true;
    setDialogs((current) => ({ ...current, violation: false }));
    const nextIndex = sectionIndexRef.current + 1;
    const next = sectionPlanRef.current[nextIndex];
    if (!next || next.skill === "Speaking") { finishWrittenSection(); return; }
    sectionIndexRef.current = nextIndex;
    setSectionIndex(nextIndex);
    const first = attemptRef.current?.questions.findIndex((q) => q.skill === next.skill) ?? -1;
    if (first >= 0) setIndex(first);
    sectionDeadline.current = Date.now() + next.seconds * 1000;
    setSectionLeft(next.seconds);
    sectionLocked.current = false;
    announce(`Bagian ${next.skill} dimulai.`);
  }
  endSectionRef.current = endSection;

  function finishSpeakingByTime() {
    if (speakingLocked.current) return;
    speakingLocked.current = true;
    setSpeakingLeft(0);
    if (speakingCountRef.current === 0) { skipSpeaking(); return; }
    setMockup((current) => ({ ...current, done: true }));
    clearInterval(prepTimer.current);
    prepTimer.current = null;
    releaseMic();
    finishAttempt();
  }
  finishSpeakingByTimeRef.current = finishSpeakingByTime;

  useEffect(() => {
    if (screen !== "speaking" || !mockup?.started || mockup?.done || speakingLeft === null) return undefined;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((speakingDeadline.current - Date.now()) / 1000));
      setSpeakingLeft(remaining);
      if (remaining === 0) finishSpeakingByTimeRef.current?.();
    }, 250);
    return () => clearInterval(id);
  }, [screen, mockup?.started, mockup?.done, speakingLeft === null]);

  /* ---------- Submit and contact ---------- */

  function openSubmit(force = false) {
    if (!attempt || submitting || ending) return;
    const missing = attempt.total - Object.keys(answers).length;
    if (missing > 0) {
      const first = attempt.questions.findIndex((item) => !answers[item.id]);
      const onThisQuestion = first === index;
      const message = onThisQuestion
        ? "Soal ini belum dijawab. Pilih jawabannya dulu, baru jawaban bisa dikirim."
        : perMode
          ? `Masih ada ${missing} soal yang belum dijawab dan sudah tidak bisa dibuka lagi. Jawaban terkirim otomatis saat waktu soal terakhir habis.`
          : `Masih ada ${missing} soal yang belum dijawab. Soal ${first + 1} terbuka sekarang.`;
      if (!perMode && !onThisQuestion && first >= 0) goTo(first);
      showToast(message);
      announce(message);
      return;
    }
    if (!force && mockup && !mockup.done) { beginMockupSpeaking(); return; }
    setDialogs((current) => ({ ...current, submit: true }));
  }
  openSubmitRef.current = openSubmit;

  async function submitAnswers() {
    if (!attempt || submitting) return;
    if (!autoSubmitted.current && Object.keys(answers).length < attempt.total) { openSubmit(); return; }
    setSubmitting(true);
    setEnding(true);
    setDialogs((current) => ({ ...current, submit: false, violation: false }));
    try {
      await api(`/api/attempts/${attempt.id}/submit`, { method: "POST", body: { answers } });
      setSubmitted(true);
      if (inviteInfo) {
        await exitFullscreen();
        window.location.assign(`/hasil?attempt=${encodeURIComponent(attempt.id)}`);
        return;
      }
      if (speakingOn) {
        await exitFullscreen();
        enterSpeaking();
      } else {
        setScreen("details");
        await exitFullscreen();
      }
    } catch (error) {
      setSubmitting(false);
      if (Date.now() < deadline.current) {
        setEnding(false);
        showToast(`${error.message || "Jawaban gagal dikirim."} Jawaban kamu masih tersimpan di halaman ini, silakan coba kirim lagi.`);
        if (sectionModeRef.current) { setDialogs((current) => ({ ...current, submit: true })); return; }
        if (perMode) { setQuestionLeft(0); return; }
      } else {
        timeUp.current = true;
        setEnding(true);
        showToast(error.message || "Jawaban gagal dikirim karena waktu sudah habis.");
        setDialogs((current) => ({ ...current, timeup: true }));
      }
    }
  }
  submitAnswersRef.current = submitAnswers;

  async function saveContact(event) {
    event.preventDefault();
    if (!attempt || !submitted) return;
    const name = contact.name.trim();
    const email = contact.email.trim();
    const whatsapp = contact.whatsapp.trim();
    const errors = {};
    if (name.length < 2) errors.name = "Nama harus terdiri dari minimal 2 karakter.";
    if (!EMAIL_RE.test(email)) errors.email = "Alamat email belum benar. Periksa kembali penulisannya.";
    if (!normalizeWhatsapp(whatsapp)) errors.whatsapp = "Nomor WhatsApp belum benar. Contoh penulisan yang benar: 08123456789.";
    if (!contact.branch) errors.branch = "Pilih cabang tempat kamu ingin belajar.";
    setContactErrors(errors);
    if (Object.keys(errors).length) return;
    setContactBusy(true);
    try {
      const data = await api(`/api/attempts/${attempt.id}/contact`, { method: "POST", body: { name, email, whatsapp, branch: contact.branch } });
      if (data.resultToken) {
        window.location.assign(`/hasil?token=${encodeURIComponent(data.resultToken)}`);
        return;
      }
      showToast("Data sudah tersimpan, tetapi tautan hasil belum siap. Muat ulang halaman ini sebentar lagi.");
    } catch (error) {
      showToast(error.message || "Data gagal disimpan. Silakan coba lagi.");
    } finally {
      setContactBusy(false);
    }
  }

  /* ---------- Legal ---------- */

  function openLegal(kind, box = null) {
    if (!config) return;
    const doc = kind === "terms" ? config.terms : config.privacy;
    if (!doc) return;
    setLegal({ kind, box, doc });
  }

  function confirmLegal() {
    const box = legal?.box;
    setLegal(null);
    if (box) setConsent((current) => ({ ...current, [box]: true }));
  }

  /* ---------- Anti-cheat ---------- */

  function isTesting() {
    return Boolean(attemptRef.current && !submittedRef.current && !endingRef.current && screenRef.current === "test");
  }
  isTestingRef.current = isTesting;

  function registerViolation(type) {
    if (!isTesting()) return;
    const now = Date.now();
    if (now - lastViolationAt.current < 1200) return;
    lastViolationAt.current = now;
    api(`/api/attempts/${attempt.id}/violation`, { method: "POST", body: { type } }).catch(() => {});
    if (!FOCUS_TYPES.has(type)) return;
    const count = strikesRef.current + 1;
    strikesRef.current = count;
    setStrikes(count);
    if (count >= maxStrikesRef.current) {
      // The limit pauses the test behind a choice, it does not end it: the student keeps the
      // answers by continuing, or leaves the test page after a confirmation.
      setDialogs((current) => ({ ...current, violation: false, limit: true }));
      return;
    }
    setDialogs((current) => ({ ...current, violation: true }));
  }
  registerViolationRef.current = registerViolation;

  async function reenterFullscreen() {
    await requestFullscreen();
    setDialogs((current) => ({ ...current, violation: false, limit: false }));
  }

  function onKeydown(event) {
    if (!isTesting()) return;
    if (document.querySelector("dialog[open]")) return;
    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;
    const blocked = event.key === "F12"
      || (mod && event.shiftKey && ["i", "j", "c"].includes(key))
      || (mod && ["u", "s", "p", "a"].includes(key));
    if (blocked) {
      event.preventDefault();
      registerViolation("shortcut_blocked");
      return;
    }
    if (event.target.closest("input, textarea")) return;
    const current = attemptRef.current.questions[indexRef.current];
    if (!mod && !event.altKey && KEY_LETTERS.has(key.toUpperCase()) && current.type !== "text" && current.options?.[key.toUpperCase()]) {
      chooseRef.current?.(current.id, key.toUpperCase());
      return;
    }
    if (event.key === "ArrowRight") { event.preventDefault(); nextRef.current?.(); return; }
    if (event.key === "ArrowLeft") { event.preventDefault(); prevRef.current?.(); return; }
    if (event.key === "Enter") { event.preventDefault(); nextRef.current?.(); }
  }
  keydownRef.current = onKeydown;

  useEffect(() => {
    const fullscreen = () => { if (!document.fullscreenElement) registerViolationRef.current?.("fullscreen_exit"); };
    const visibility = () => { if (document.hidden) registerViolationRef.current?.("tab_hidden"); };
    const blur = () => { if (!document.hidden) registerViolationRef.current?.("window_blur"); };
    const beforeUnload = (event) => {
      if (!isTestingRef.current()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const block = (event) => {
      if (!isTestingRef.current()) return;
      event.preventDefault();
      if (["copy", "cut", "contextmenu"].includes(event.type)) registerViolationRef.current?.("copy_attempt");
    };
    const key = (event) => keydownRef.current?.(event);
    document.addEventListener("fullscreenchange", fullscreen);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    window.addEventListener("beforeunload", beforeUnload);
    for (const type of ["copy", "cut", "paste", "contextmenu", "dragstart"]) document.addEventListener(type, block);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("fullscreenchange", fullscreen);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      window.removeEventListener("beforeunload", beforeUnload);
      for (const type of ["copy", "cut", "paste", "contextmenu", "dragstart"]) document.removeEventListener(type, block);
      document.removeEventListener("keydown", key);
    };
  }, []);

  /* ---------- Retry and back ---------- */

  async function retry(failed) {
    setDialogs({ violation: false, limit: false, submit: false, timeup: false });
    setEnding(false);
    await requestFullscreen();
    try {
      const data = await api("/api/attempts", { method: "POST", body: attemptBody() });
      beginAttempt(data);
    } catch (error) {
      showToast(error.message || "Tes baru gagal dimulai. Silakan coba lagi.");
      setDialogs((current) => ({ ...current, [failed]: true }));
    }
  }

  async function backToStart() {
    setDialogs({ violation: false, limit: false, submit: false, timeup: false });
    // The student already confirmed the exit inside the dialog, so the browser's own
    // leave-site nag must not fire on top of it. Ending goes through state, because the
    // ref-sync effect rewrites the ref from state on the next commit.
    setEnding(true);
    endingRef.current = true;
    await exitFullscreen();
    window.location.reload();
  }

  /* ---------- Audio ---------- */

  async function playListeningAudio() {
    if (!audioSection || !attempt) return;
    const audio = audioRef.current;
    // The first click marks the play on the server. After that the same button pauses and resumes,
    // but never seeks and never starts over once the audio has ended.
    if (audioPlayed.has(audioSection.id)) {
      if (!audio || audio.ended) return;
      if (audio.paused) {
        try { await audio.play(); } catch { setAudioNote("Browser kamu memblokir suara. Periksa izin suara di address bar, lalu muat ulang halaman."); }
      } else {
        audio.pause();
      }
      return;
    }
    try {
      await api(`/api/attempts/${attempt.id}/audio-played`, { method: "POST", body: { sectionId: audioSection.id } });
    } catch (error) {
      setAudioNote(error.message || "Audio bagian ini sudah pernah diputar.");
      setAudioPlayed((current) => new Set(current).add(audioSection.id));
      return;
    }
    setAudioPlayed((current) => new Set(current).add(audioSection.id));
    try {
      await audio?.play();
    } catch {
      setAudioNote("Browser kamu memblokir suara. Periksa izin suara di address bar, lalu muat ulang halaman.");
    }
    setAudioNote("Audio Listening sedang diputar. Dengarkan sampai selesai; audionya tidak bisa diputar lagi.");
  }

  function onAudioEnded() {
    if (!audioSection) return;
    setAudioPlayed((current) => new Set(current).add(audioSection.id));
    setAudioNote("Audio selesai. Lanjutkan menjawab soal listening, lalu bagian reading.");
  }

  /* ---------- Speaking ---------- */

  function clearCheck() {
    if (checkUrlRef.current) URL.revokeObjectURL(checkUrlRef.current);
    checkUrlRef.current = null;
    setCheckUrl(null);
  }

  function clearRecording() {
    if (recUrlRef.current) URL.revokeObjectURL(recUrlRef.current);
    recUrlRef.current = null;
    setRecUrl(null);
    setRecBlob(null);
    setRecording(null);
    setSendLabel("Kirim rekaman");
    setNoteOverride("");
  }

  function releaseMic() {
    wave.current?.stop();
    if (recStream.current) recStream.current.getTracks().forEach((track) => track.stop());
    recStream.current = null;
  }

  function speakUnavailable(message, retry = false) {
    setSpeakError(message);
    setShowSkip(true);
    setCheckStartHidden(!retry);
    setRecording(null);
  }

  async function ensureMicStream() {
    if (recStream.current) return recStream.current;
    recStream.current = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    return recStream.current;
  }

  const setWaveContainer = useCallback((node) => {
    if (wave.current) { wave.current.destroy(); wave.current = null; }
    if (node) wave.current = createLiveWaveform(node, { height: 24 });
  }, []);

  async function startRecording(mode) {
    if (speakBusy || recorder.current) return;
    const limits = mode === "check" ? CHECK_SECONDS : currentSpeakingRef.current;
    if (!limits) return;
    setSpeakBusy(true);
    recMode.current = mode;
    try {
      await ensureMicStream();
    } catch {
      setSpeakBusy(false);
      speakUnavailable("Rekaman tidak bisa dimulai karena browser kamu belum mengizinkan mikrofonnya. Ketuk ikon gembok atau ikon mikrofon di address bar, pilih Izinkan untuk situs ini, lalu tekan tombol rekam sekali lagi. Kalau kamu memilih lanjut tanpa rekaman, hasil tes kamu tetap kami proses, hanya tanpa nilai speaking.", true);
      return;
    }
    setSpeakBusy(false);
    const mime = REC_MIMES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    const rec = new MediaRecorder(recStream.current, mime ? { mimeType: mime } : undefined);
    recorder.current = rec;
    recChunks.current = [];
    rec.ondataavailable = (event) => { if (event.data.size) recChunks.current.push(event.data); };
    rec.onstop = finishRecording;
    rec.start();
    recStart.current = Date.now();
    setSpeakError("");
    setShowSkip(false);
    setNoteOverride("");
    setRecording({ mode, elapsed: 0 });
    wave.current?.start(recStream.current).then((ok) => {
      if (!ok) setSpeakError("Grafik suara tidak bisa ditampilkan, tetapi rekaman tetap berjalan.");
    });
    announce("Perekaman dimulai.");
    clearInterval(recTimer.current);
    recTimer.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recStart.current) / 1000);
      setRecording((current) => (current ? { ...current, elapsed } : current));
      if (elapsed >= limits.max) stopRecording();
    }, 250);
  }

  function stopRecording() {
    clearInterval(recTimer.current);
    recTimer.current = null;
    wave.current?.stop();
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  function finishRecording() {
    const rec = recorder.current;
    recorder.current = null;
    const duration = Math.max(1, Math.round((Date.now() - recStart.current) / 1000));
    recDuration.current = duration;
    const type = (rec?.mimeType || REC_MIMES[0]).split(";")[0];
    const blob = new Blob(recChunks.current, { type });
    recChunks.current = [];
    setRecording(null);
    setRecBlob(blob);
    if (recMode.current === "check") {
      if (checkUrlRef.current) URL.revokeObjectURL(checkUrlRef.current);
      checkUrlRef.current = URL.createObjectURL(blob);
      setCheckUrl(checkUrlRef.current);
      announce("Rekaman percobaan siap didengarkan.");
      return;
    }
    if (recUrlRef.current) URL.revokeObjectURL(recUrlRef.current);
    recUrlRef.current = URL.createObjectURL(blob);
    setRecUrl(recUrlRef.current);
    setSendLabel(mockupRef.current?.started && !mockupRef.current?.done ? "Lanjut" : "Kirim rekaman");
    announce("Jawaban selesai direkam, dan siap untuk didengarkan.");
  }

  function retryVoiceCheck() {
    clearCheck();
    setSpeakError("");
    setShowSkip(false);
    setCheckStartHidden(false);
    checkStartRef.current?.focus();
  }

  function voiceCheckPassed() {
    clearCheck();
    setStage("answer");
    if (mockupRef.current?.started) {
      setMockupQuestion(0, 0);
      return;
    }
    setCanRecord(true);
    answerStartRef.current?.focus();
  }

  function retakeRecording() {
    clearRecording();
    answerStartRef.current?.focus();
  }

  async function sendRecording() {
    if (!recBlob || speakBusy || !attempt) return;
    const isMockup = mockupRef.current?.started && !mockupRef.current?.done;
    // The duration gate, before anything leaves the browser: a recording under the minimum is
    // refused here already, and the server checks it again without slack.
    const limits = currentSpeakingRef.current;
    if (!isMockup && limits && recDuration.current < (limits.min || 1)) {
      clearRecording();
      setNoteOverride(`Rekaman kamu ${recDuration.current} detik, minimal ${limits.min} detik. Rekam ulang jawaban kamu.`);
      answerStartRef.current?.focus();
      return;
    }
    setSpeakBusy(true);
    setSendLabel(isMockup ? "Menyimpan..." : "Mengirim...");
    try {
      if (isMockup) {
        const part = mockupRef.current.plan.parts[mockupRef.current.pi];
        const item = part.questions[mockupRef.current.qi];
        await api(`/api/attempts/${attempt.id}/speaking-answer?part=${part.part}&prompt=${item.no}`, {
          method: "POST",
          headers: { "content-type": recBlob.type, "x-duration": String(recDuration.current) },
          body: recBlob,
        });
        speakingCountRef.current += 1;
        clearRecording();
        advanceMockupSpeaking();
      } else {
        const queue = placementSpeakRef.current;
        const position = queue && limits?.position ? `?position=${limits.position}` : "";
        await api(`/api/attempts/${attempt.id}/speaking${position}`, {
          method: "POST",
          headers: { "content-type": recBlob.type, "x-duration": String(recDuration.current) },
          body: recBlob,
        });
        speakingCountRef.current += 1;
        clearRecording();
        // More questions from the bank are waiting: the same mic check is done, so go straight
        // to the next answer. The last question finishes the speaking part.
        if (queue && queue.index + 1 < queue.list.length) {
          setPlacementSpeak({ list: queue.list, index: queue.index + 1 });
          setStage("answer");
          setCanRecord(false);
          setNoteOverride("");
          answerStartRef.current?.focus();
        } else {
          releaseMic();
          setScreen("details");
        }
      }
    } catch (error) {
      if (!isMockup && ["speaking_closed", "speaking_off", "speaking_done"].includes(error.code)) {
        showToast(error.message);
        releaseMic();
        setScreen("details");
        return;
      }
      showToast(error.message || "Rekaman gagal disimpan. Periksa koneksi kamu, lalu coba lagi.");
      if (error.code === "speaking_short") setNoteOverride(error.message);
    } finally {
      setSpeakBusy(false);
      setSendLabel(isMockup ? "Lanjut" : "Kirim rekaman");
    }
  }

  async function skipSpeaking() {
    if (!attempt || speakBusy) return;
    const isMockup = mockupRef.current?.started && !mockupRef.current?.done;
    setSpeakBusy(true);
    try {
      await api(`/api/attempts/${attempt.id}/speaking-skip`, { method: "POST", body: { reason: "mic" } });
      if (isMockup) {
        speakingLocked.current = true;
        setMockup((current) => ({ ...current, done: true }));
        clearRecording();
        releaseMic();
        finishAttempt();
      } else {
        clearRecording();
        releaseMic();
        setScreen("details");
      }
    } catch (error) {
      showToast(error.message || "Bagian ini belum bisa dilewati. Coba lagi.");
    } finally {
      setSpeakBusy(false);
    }
  }

  function enterSpeaking() {
    if (!config?.speaking?.enabled && !placementSpeakRef.current) { setScreen("details"); return; }
    clearRecording();
    clearCheck();
    setStage("check");
    setSpeakError("");
    setShowSkip(false);
    setCheckStartHidden(false);
    setCanRecord(false);
    setPrepLeft(null);
    setSpeakingLeft(null);
    setScreen("speaking");
    if (!recordingSupported()) {
      speakUnavailable("Browser atau perangkat ini tidak mendukung perekaman suara, jadi bagian speaking tidak bisa dikerjakan. Silakan lanjut tanpa rekaman: hasil tes kamu tetap kami proses, hanya tanpa nilai speaking.", false);
    }
  }

  /* ---------- Mockup speaking ---------- */

  function beginMockupSpeaking() {
    if (!mockup?.plan) return;
    clearInterval(prepTimer.current);
    prepTimer.current = null;
    const speakingSeconds = sectionPlanRef.current?.find((s) => s.skill === "Speaking")?.seconds || 900;
    speakingDeadline.current = Date.now() + speakingSeconds * 1000;
    setSpeakingLeft(speakingSeconds);
    speakingLocked.current = false;
    speakingCountRef.current = 0;
    setMockup((current) => ({ ...current, started: true, done: false, pi: 0, qi: 0 }));
    setStage("check");
    setScreen("speaking");
    setSpeakError("");
    setShowSkip(false);
    setCheckStartHidden(false);
    setCanRecord(false);
    setPrepLeft(null);
    setVideoPlaying(false);
    clearRecording();
    clearCheck();
  }

  function setMockupQuestion(pi, qi) {
    clearInterval(prepTimer.current);
    prepTimer.current = null;
    setMockup((current) => (current ? { ...current, pi, qi } : current));
    setStage("answer");
    setSpeakError("");
    setShowSkip(false);
    setCheckStartHidden(false);
    setCanRecord(false);
    setPrepLeft(null);
    setVideoPlaying(false);
    setNoteOverride("");
    clearRecording();
    clearCheck();
    setSendLabel("Lanjut");
  }

  async function playMockupVideo() {
    const video = videoRef.current;
    if (!video?.getAttribute("src")) return;
    setVideoPlaying(true);
    try {
      await video.play();
    } catch {
      setVideoPlaying(false);
      mockupVideoFinished();
    }
  }

  function mockupVideoFinished() {
    setVideoPlaying(false);
    if (!mockupRef.current?.started) return;
    const part = mockupRef.current.plan.parts[mockupRef.current.pi];
    if (part.prepSeconds) startMockupPrep(part.prepSeconds);
    else setCanRecord(true);
  }

  function startMockupPrep(seconds) {
    clearInterval(prepTimer.current);
    let left = seconds;
    setPrepLeft(left);
    setCanRecord(false);
    prepTimer.current = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(prepTimer.current);
        prepTimer.current = null;
        setPrepLeft(null);
        setCanRecord(true);
        announce("Waktu persiapan selesai. Mulai menjawab.");
      } else {
        setPrepLeft(left);
      }
    }, 1000);
  }

  function advanceMockupSpeaking() {
    const current = mockupRef.current;
    if (!current?.plan) return;
    const part = current.plan.parts[current.pi];
    if (current.qi + 1 < part.questions.length) { setMockupQuestion(current.pi, current.qi + 1); return; }
    if (current.pi + 1 < current.plan.parts.length) { setMockupQuestion(current.pi + 1, 0); return; }
    speakingLocked.current = true;
    setMockup((value) => ({ ...value, done: true }));
    clearInterval(prepTimer.current);
    prepTimer.current = null;
    releaseMic();
    finishAttempt();
  }

  /* ---------- Render ---------- */

  return (
    <>
      <a className="skip-link" href="#main">Lewati ke konten</a>
      <main id="main">
        {screen === "intro" ? (
          loadFailed === "invite" ? (
            <ErrorScreen status={loadStatus} message={notice} onBack={() => { window.location.assign("/"); }} />
          ) : (
          <Intro
            config={config}
            invite={inviteInfo}
            consent={consent}
            onConsent={setConsent}
            code={code}
            onCode={(value) => { setCode(value); setCodeError(""); }}
            codeError={codeError}
            codeInputRef={codeInputRef}
            busy={startBusy}
            onStart={startTest}
            onOpenLegal={openLegal}
            notice={notice}
            loadFailed={loadFailed}
            onReload={() => window.location.reload()}
            titleRef={introTitleRef}
          />
          )
        ) : null}
        {screen === "test" && attempt ? (
          <TestScreen
            attempt={attempt}
            index={index}
            answers={answers}
            flagged={flagged}
            perMode={perMode}
            timeLeft={timeLeft}
            questionLeft={questionLeft}
            sectionMode={sectionMode}
            sectionSkill={sectionSkill}
            sectionTotal={sectionTotal}
            sectionPosition={sectionPosition}
            sectionLeft={sectionLeft}
            sectionQuestions={sectionQuestions}
            finishLabel={finishLabel}
            onSectionFinish={endSection}
            onChoose={choose}
            onAnswerText={answerText}
            onPrev={prev}
            onNext={next}
            onSkip={() => {
              if (sectionMode) {
                const nextItem = sectionQuestions[sectionPosition + 1];
                if (nextItem) goTo(nextItem.i);
              } else {
                goTo(index + 1);
              }
            }}
            onFlag={toggleFlag}
            onGoTo={goTo}
            onFinish={() => openSubmit()}
            audioSection={audioSection}
            audioPlayed={audioPlayed}
            audioNote={audioNote}
            onPlayAudio={playListeningAudio}
            onAudioEnded={onAudioEnded}
            audioRef={audioRef}
            fsWarning={fsWarning}
            finishNote={finishNote}
          />
        ) : null}
        {screen === "speaking" ? (
          <SpeakingScreen
            stage={stage}
            mockup={mockup}
            speaking={currentSpeaking}
            recording={recording}
            speakError={speakError}
            showSkip={showSkip}
            checkUrl={checkUrl}
            recUrl={recUrl}
            speakBusy={speakBusy}
            prepLeft={prepLeft}
            canRecord={canRecord}
            sendLabel={sendLabel}
            checkStartHidden={checkStartHidden}
            noteOverride={noteOverride}
            videoPlaying={videoPlaying}
            speakingLeft={speakingLeft}
            checkStartRef={checkStartRef}
            answerStartRef={answerStartRef}
            onStartRecording={startRecording}
            onStop={stopRecording}
            onRetryCheck={retryVoiceCheck}
            onCheckOk={voiceCheckPassed}
            onRetake={retakeRecording}
            onSend={sendRecording}
            onSkip={skipSpeaking}
            onPlayVideo={playMockupVideo}
            onVideoEnded={mockupVideoFinished}
            onVideoError={mockupVideoFinished}
            videoRef={videoRef}
            waveContainerRef={setWaveContainer}
            onOpenPrivacy={() => openLegal("privacy")}
            titleRef={speakingTitleRef}
          />
        ) : null}
        {screen === "details" ? (
          <DetailsScreen
            values={contact}
            errors={contactErrors}
            busy={contactBusy}
            speakingOn={speakingOn}
            total={config?.totalQuestions ?? 25}
            onChange={(field, value) => setContact((current) => ({ ...current, [field]: value }))}
            onSubmit={saveContact}
            onOpenPrivacy={() => openLegal("privacy")}
            titleRef={detailsTitleRef}
          />
        ) : null}
      </main>
      <Footer />
      <Dialogs
        dialogs={dialogs}
        strikes={strikes}
        maxStrikes={maxStrikes}
        answered={Object.keys(answers).length}
        total={attempt?.total ?? config?.totalQuestions ?? 25}
        duration={durationText}
        legal={legal}
        onClose={(name) => setDialogs((current) => ({ ...current, [name]: false }))}
        onViolationClose={reenterFullscreen}
        onRetry={retry}
        onBack={backToStart}
        onConfirmSubmit={submitAnswers}
        onLegalConfirm={confirmLegal}
        onLegalClose={() => setLegal(null)}
      />
      {toast ? <div className="toast" role="status" aria-live="polite">{toast}</div> : null}
      <div className="sr-only" aria-live="polite">{live}</div>
    </>
  );
}
