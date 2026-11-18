import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { CHECK_SECONDS, formatTime, spanText } from "./lib.js";
import { VoiceNote } from "./voice-note.jsx";
import { parseRichText } from "@tnec/core/rich";
import { BRANCHES } from "@tnec/core/branches";

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Back = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </svg>
);
const Clock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" />
  </svg>
);
const Mic = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </svg>
);
const Stop = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);
const Flag = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 3v18M6 4h11l-2.5 4L17 12H6" />
  </svg>
);
const Check = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <img className="footer__logo" src="/assets/logo-titik-nol.png" alt="" width="110" height="19" />
        <p>Titik Nol English Course. Jl. Brawijaya No.75, Pare, Kediri, Jawa Timur.</p>
        <p className="footer__meta">Tes online Titik Nol English Course. Data kamu diproses sesuai Kebijakan Privasi.</p>
      </div>
    </footer>
  );
}

function CheckIcon() {
  return <span className="check__box" aria-hidden="true" />;
}

/* Inline runs of a parsed passage: images, then b, i, and u wrap each other, everything else is text. */
const runNodes = (runs) => runs.map((run, i) => {
  if (run.image) return <img className="rt__image" src={run.image} alt={run.alt || ""} key={i} />;
  let node = run.text;
  if (run.b) node = <strong>{node}</strong>;
  if (run.i) node = <em>{node}</em>;
  if (run.u) node = <u>{node}</u>;
  return <Fragment key={i}>{node}</Fragment>;
});

/* One parsed block: a paragraph, a quote, a table, or a bullet or numbered list. */
function RichBlock({ block }) {
  if (block.type === "p" || block.type === "quote") {
    const body = block.lines.map((runs, j) => <Fragment key={j}>{j > 0 ? <br /> : null}{runNodes(runs)}</Fragment>);
    return block.type === "quote" ? <blockquote>{body}</blockquote> : <p>{body}</p>;
  }
  if (block.type === "table") {
    return (
      <table className="rt__table">
        {block.header ? <thead><tr>{block.header.map((runs, i) => <th key={i}>{runNodes(runs)}</th>)}</tr></thead> : null}
        <tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((runs, j) => <td key={j}>{runNodes(runs)}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  const List = block.type === "ol" ? "ol" : "ul";
  return <List>{block.items.map((runs, j) => <li key={j}>{runNodes(runs)}</li>)}</List>;
}

/* A passage with the markdown-lite from @tnec/core/rich: paragraphs, bullet and numbered
   lists, and <b> <i> <u> inline tags. Built as elements, never innerHTML. */
export function RichText({ value, id, className = "" }) {
  const blocks = useMemo(() => parseRichText(value), [value]);
  if (!blocks.length) return null;
  return (
    <div className={`rt${className ? ` ${className}` : ""}`} id={id}>
      {blocks.map((block, i) => <RichBlock key={i} block={block} />)}
    </div>
  );
}

/* A used, expired, or locked invite opens this full-page error instead of the intro, like a
   404 page: the status code, the message from the server, and a way back to the start. */
export function ErrorScreen({ status, message, onBack }) {
  const titleRef = useRef(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  return (
    <section className="screen" id="screen-error" aria-labelledby="error-title">
      <div className="wrap wrap--narrow error-wrap">
        <div className="error-card">
          <p className="error-card__code" aria-hidden="true">{status || 404}</p>
          <h1 className="error-card__title" id="error-title" tabIndex={-1} ref={titleRef}>Tautan tidak bisa dibuka</h1>
          <p className="error-card__text">{message}</p>
          <button className="btn btn--primary btn--lg" type="button" onClick={onBack}>Kembali ke halaman awal</button>
        </div>
      </div>
    </section>
  );
}

export function Intro({ config, invite, consent, onConsent, code, onCode, codeError, codeInputRef, busy, onStart, onOpenLegal, notice, loadFailed, onReload, titleRef }) {
  const total = config?.totalQuestions ?? 25;
  const seconds = config?.durationSeconds ?? 300;
  const duration = spanText(seconds);
  const wholeMinutes = seconds % 60 === 0;
  const timeNum = wholeMinutes ? seconds / 60 : seconds;
  const timeUnit = wholeMinutes ? "menit" : "detik";
  const strikes = config?.maxViolations ?? 3;
  const perMode = config?.timeMode === "per";
  const isInvite = Boolean(invite);
  const isIelts = invite?.test === "ielts-mockup";
  const isPre = invite?.test === "pre";
  const sectionsMode = config?.timeMode === "sections" && isIelts;
  const sectionText = (config?.sectionPlan || []).map((s) => `${s.skill} ${Math.round(s.seconds / 60)} menit`).join(", ");
  const needsCode = Boolean(invite?.needsCode);
  const allConsent = consent.terms && consent.privacy && consent.honesty;
  const codeOk = !needsCode || code.trim().length >= 6;
  const canStart = Boolean(config?.open) && allConsent && codeOk && !busy;
  const disabled = loadFailed === "network" ? false : loadFailed ? true : !canStart;

  const title = invite ? (
    isIelts
      ? <>Halo {invite.firstName}, kerjakan IELTS Mockup {invite.packageName || "paket Desember"} dalam <span className="hero__accent">{duration}</span>.</>
      : <>Halo {invite.firstName}, selesaikan {invite.testName.toLowerCase()} kamu dalam <span className="hero__accent">{duration}</span>.</>
  ) : (
    <>Kenali level bahasa Inggris kamu dalam <span className="hero__accent">{duration}</span>.</>
  );

  const lead = invite
    ? isIelts
      ? "Mock test ini meniru tes IELTS sungguhan: bagian Listening dengan satu audio, bagian Reading dari tiga bacaan, dua task Writing yang dinilai AI, dan speaking bersama examiner lewat video. Hasilnya berupa perkiraan band untuk Listening, Reading, Writing, dan Speaking."
      : isPre
        ? `Tes ini berisi ${total} soal pilihan ganda. Nilainya kami pakai sebagai titik awal untuk melihat perkembangan kamu selama program.`
        : `Tes ini berisi ${total} soal pilihan ganda. Hasilnya kami pakai untuk menentukan apakah kamu sudah siap lanjut ke level berikutnya.`
    : `Tes ini berisi ${total} soal pilihan ganda yang mengukur kemampuan bahasa Inggris kamu. Setelah selesai, level, skor, dan rekomendasi program akan langsung muncul, dan hasilnya juga kami kirim ke email dan WhatsApp kamu.`;

  const how2 = sectionsMode
    ? `Tes berjalan dalam empat bagian dengan waktu masing-masing: ${sectionText}. Setiap bagian terkunci saat waktunya habis, dan kamu tidak bisa kembali ke bagian sebelumnya.`
    : perMode
      ? `Tes berlangsung paling lama ${duration} tanpa jeda, dengan batas waktu di setiap soal. Selama tes, layar akan otomatis masuk ke mode penuh agar kamu bisa fokus.`
      : `Tes berlangsung selama ${duration} tanpa jeda. Selama tes, layar akan otomatis masuk ke mode penuh agar kamu bisa fokus, dan waktu terus berjalan sampai tes selesai.`;

  const how3Title = invite ? (isIelts ? "Melihat band kamu" : "Melihat nilai kamu") : "Melihat hasil dan rekomendasi";
  const how3Body = invite
    ? isIelts
      ? "Setelah jawaban terkirim, band Listening, Reading, dan Writing muncul, lalu band Speaking menyusul setelah rekaman dinilai otomatis."
      : "Setelah jawaban terkirim, nilai kamu langsung muncul di layar dan tercatat di data kelas, jadi tutor bisa membahasnya bersama kamu."
    : "Setelah tes selesai, kamu mengisi nama, email, nomor WhatsApp, dan cabang tempat kamu ingin belajar. Level, skor, dan rekomendasi program akan langsung muncul, lalu kami kirimkan juga ke email dan WhatsApp kamu.";

  const ruleTime = sectionsMode
    ? `Tes terdiri dari 82 soal dan dua esai, dibagi menjadi ${sectionText}. Di dalam Listening, kamu bisa berpindah soal Part 1 sampai Part 4 selama audio diputar. Saat waktu satu bagian habis, bagian itu terkunci dan tes pindah ke bagian berikutnya.`
    : perMode
      ? `Tes terdiri dari ${total} soal pilihan ganda, dan setiap soal punya batas waktunya sendiri. Saat waktu satu soal habis, soal berikutnya langsung muncul, dan soal sebelumnya tidak bisa dibuka lagi. Tombol kirim baru bisa dipakai setelah semua soal dijawab.`
      : `Tes terdiri dari ${total} soal pilihan ganda yang harus diselesaikan dalam ${duration}. Waktu terus berjalan sejak tes dimulai dan tidak bisa dijeda. Tombol kirim baru bisa dipakai setelah semua soal dijawab.`;

  const startNote = sectionsMode
    ? `Tes berlangsung ${duration} dalam empat bagian, dan jawaban hanya bisa dikirim satu kali.`
    : perMode
      ? `Tes berlangsung paling lama ${duration}, dan jawaban hanya bisa dikirim satu kali.`
      : `Tes berlangsung ${duration}, dan jawaban hanya bisa dikirim satu kali.`;

  const data1 = invite
    ? "Kami menyimpan jawaban, nilai, waktu pengerjaan, dan catatan pelanggaran selama tes, lalu mencatatnya di data kamu sebagai siswa Titik Nol."
    : "Kami menyimpan nama, email, nomor WhatsApp, pilihan cabang belajar, jawaban, skor, waktu pengerjaan, dan catatan pelanggaran selama tes.";
  const data2 = invite
    ? "Data itu kami pakai untuk menghitung nilai dan memantau perkembangan belajar kamu bersama tutor. Data tidak dijual dan tidak dipakai untuk iklan."
    : "Data itu kami pakai untuk menghitung skor, menentukan level, mengirim hasil ke email dan WhatsApp kamu, dan menindaklanjuti konsultasi kalau kamu membutuhkannya. Data tidak dijual dan tidak dipakai untuk iklan.";
  const data3 = invite
    ? isIelts
      ? "Setelah jawaban terkirim, band kamu langsung muncul di layar. Esai Writing dinilai AI dan rekaman speaking dinilai otomatis, tanpa nama atau kontak kamu. Kamu tidak perlu mengisi data kontak lagi."
      : isPre
        ? "Setelah jawaban terkirim, nilai kamu langsung muncul di layar. Kamu tidak perlu mengisi data kontak lagi."
        : "Setelah jawaban terkirim, nilai dan hasil kelulusan kamu langsung muncul di layar. Kamu tidak perlu mengisi data kontak lagi."
    : "Setelah tes selesai, kamu mengisi nama, email, nomor WhatsApp, dan cabang tempat kamu ingin belajar. Level, skor, dan rekomendasi program akan muncul di layar, lalu dikirim ke email dan WhatsApp kamu.";
  const data4 = invite
    ? isIelts
      ? sectionsMode
        ? "Kalau waktu satu bagian habis, bagian itu terkunci dan tes pindah ke bagian berikutnya. Jawaban yang sudah terisi tetap dikirim di akhir Writing dan Speaking."
        : "Kalau waktu habis, jawaban kamu yang sudah terisi terkirim otomatis dan tetap menghasilkan band. Selama tautan dan kodemu belum dipakai, kamu bisa mengulang dari awal."
      : "Kalau waktu habis sebelum kamu selesai, percobaan ini gagal dan jawaban kamu tidak dikirim. Selama tautan ini masih berlaku, kamu bisa mengulang tes dari awal dengan waktu yang baru."
    : "Kalau waktu habis sebelum kamu selesai, percobaan ini gagal dan jawaban kamu tidak dikirim. Kamu bisa mengulang tes dari awal dengan waktu yang baru. Hasil tes ini dipakai untuk penempatan kelas, bukan sertifikat resmi.";

  const step3Index = invite ? "02" : "03";
  const step3Meta = invite ? (isIelts ? "Band langsung muncul" : isPre ? "Nilai langsung muncul" : "Nilai dan kelulusan") : "Level dan rekomendasi";

  return (
    <section className="screen" id="screen-intro" aria-labelledby="intro-title">
      <div className="hero">
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <img className="hero__logo" src="/assets/logo-titik-nol-white.png" alt="Titik Nol English Course" width="140" height="23" />
            <p className="eyebrow eyebrow--on-dark"><span className="eyebrow__dot" aria-hidden="true" /><span>{invite ? invite.testName : "Tes Penempatan Online"}</span></p>
            <h1 className="hero__title" id="intro-title" tabIndex={-1} ref={titleRef}>{title}</h1>
            <p className="hero__lead">{lead}</p>
            <div className="hero__facts">
              <span className="fact"><strong>{total}</strong><span>soal</span></span>
              <span className="fact"><strong>{timeNum}</strong><span>{timeUnit}</span></span>
              {!isInvite ? <span className="fact"><strong>6</strong><span>level</span></span> : null}
            </div>
            {notice ? <p className="banner banner--warning hero__notice" id="intro-notice" role="status">{notice}</p> : null}
          </div>

          <div className="preview" aria-hidden="true">
            <div className="preview__sheet" />
            <div className="preview__card">
              <div className="preview__top">
                <span className="preview__badge">Contoh soal</span>
                <span className="preview__timer"><Clock /> 04:12</span>
              </div>
              <p className="preview__prompt">The results ___ announced tomorrow.</p>
              <div className="preview__options">
                <span className="preview__option">was</span>
                <span className="preview__option is-selected">will be<span className="preview__check"><Check /></span></span>
                <span className="preview__option">were</span>
              </div>
              <div className="preview__foot">
                <div className="preview__dots">
                  <span className="is-filled" /><span className="is-filled" /><span className="is-filled" />
                  <span className="is-current" /><span /><span /><span /><span /><span /><span /><span /><span />
                </div>
                <span className="preview__pct">28%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="wrap wrap--narrow intro__body">
        <ol className="stepper" aria-label="Tahapan tes penempatan">
          <li className="stepper__step is-active">
            <span className="stepper__bar" /><span className="stepper__index">01</span>
            <span className="stepper__title">Mengerjakan tes</span>
            <span className="stepper__meta">{total} soal, {duration}</span>
          </li>
          {!isInvite ? (
            <li className="stepper__step">
              <span className="stepper__bar" /><span className="stepper__index">02</span>
              <span className="stepper__title">Melengkapi data</span>
              <span className="stepper__meta">Nama, email, WhatsApp, cabang</span>
            </li>
          ) : null}
          <li className="stepper__step">
            <span className="stepper__bar" /><span className="stepper__index">{step3Index}</span>
            <span className="stepper__title">Melihat hasil</span>
            <span className="stepper__meta">{step3Meta}</span>
          </li>
        </ol>

        <div className="section-head">
          <p className="eyebrow">Cara kerja</p>
          <h2 className="section-title">Tiga langkah sederhana sebelum kamu melihat hasilnya.</h2>
        </div>

        <div className="how-grid">
          <article className="how-card">
            <span className="how-card__num" aria-hidden="true">01</span>
            <h3 className="how-card__title">Membaca aturan dan menyetujui</h3>
            <p className="how-card__body">Sebelum tes dimulai, kamu perlu membaca aturan pengerjaan, syarat dan ketentuan, serta kebijakan privasi. Kalau kamu setuju, centang ketiga pernyataan yang tersedia.</p>
          </article>
          <article className="how-card">
            <span className="how-card__num" aria-hidden="true">02</span>
            <h3 className="how-card__title">Mengerjakan tes di layar penuh</h3>
            <p className="how-card__body">{how2}</p>
          </article>
          <article className="how-card">
            <span className="how-card__num" aria-hidden="true">03</span>
            <h3 className="how-card__title">{how3Title}</h3>
            <p className="how-card__body">{how3Body}</p>
          </article>
        </div>

        <section className="panel consent" aria-labelledby="consent-title">
          <div className="consent__head">
            <p className="eyebrow">Sebelum mulai</p>
            <h2 className="panel__title" id="consent-title">Baca ketentuannya dulu sebelum kamu mulai.</h2>
            <p className="panel__lead">Halaman ini menjelaskan bagaimana tes berjalan, data apa yang kami simpan, dan hasil apa yang akan kamu terima. Luangkan waktu sebentar untuk membacanya sampai selesai.</p>
          </div>

          <div className="test-rules">
            <div className="test-rules__col">
              <h3 className="test-rules__title">Cara tes berjalan</h3>
              <ol className="test-rules__list">
                <li><span className="test-rules__num" aria-hidden="true">1</span><p>{ruleTime}</p></li>
                <li><span className="test-rules__num" aria-hidden="true">2</span><p>Saat tes dimulai, layar akan otomatis masuk ke mode penuh. Selama tes berlangsung, kamu tidak bisa mengecilkan layar, berpindah tab, atau membuka aplikasi lain.</p></li>
                <li><span className="test-rules__num" aria-hidden="true">3</span><p>Setiap kali kamu keluar dari layar penuh atau berpindah tab, kejadian itu kami catat dan kamu mendapat peringatan. Kalau pelanggaran sudah mencapai {strikes} kali, tesnya berhenti dulu dan kamu memilih lanjut atau keluar; jawaban kamu tetap tersimpan kalau kamu memilih lanjut.</p></li>
                <li><span className="test-rules__num" aria-hidden="true">4</span><p>Kerjakan tes ini sendiri tanpa bantuan kamus, penerjemah, kecerdasan buatan, atau orang lain, supaya hasilnya benar-benar menggambarkan kemampuan kamu.</p></li>
              </ol>
            </div>
            <div className="test-rules__col">
              <h3 className="test-rules__title">Data dan hasil</h3>
              <ol className="test-rules__list">
                <li><span className="test-rules__num" aria-hidden="true">1</span><p>{data1}</p></li>
                <li><span className="test-rules__num" aria-hidden="true">2</span><p>{data2}</p></li>
                <li><span className="test-rules__num" aria-hidden="true">3</span><p>{data3}</p></li>
                <li><span className="test-rules__num" aria-hidden="true">4</span><p>{data4}</p></li>
              </ol>
            </div>
          </div>

          <form id="consent-form" noValidate onSubmit={(event) => { event.preventDefault(); if (loadFailed === "network") onReload(); else onStart(); }}>
            <label className="check">
              <input type="checkbox" id="consent-terms" className="consent-box" checked={consent.terms} readOnly onClick={(event) => { event.preventDefault(); onOpenLegal("terms", "terms"); }} />
              <CheckIcon />
              <span className="check__text">Saya sudah membaca dan menyetujui <a className="check__link" href="#syarat-dan-ketentuan" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenLegal("terms", "terms"); }}>Syarat dan Ketentuan</a> yang berlaku.</span>
            </label>
            <label className="check">
              <input type="checkbox" id="consent-privacy" className="consent-box" checked={consent.privacy} readOnly onClick={(event) => { event.preventDefault(); onOpenLegal("privacy", "privacy"); }} />
              <CheckIcon />
              <span className="check__text">Saya sudah membaca dan menyetujui <a className="check__link" href="#kebijakan-privasi" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenLegal("privacy", "privacy"); }}>Kebijakan Privasi</a>, termasuk pengumpulan data yang dijelaskan di atas.</span>
            </label>
            <label className="check">
              <input type="checkbox" id="consent-honesty" className="consent-box" checked={consent.honesty} onChange={(event) => onConsent({ ...consent, honesty: event.target.checked })} />
              <CheckIcon />
              <span className="check__text">Saya mengerjakan tes ini sendiri tanpa kamus, penerjemah, kecerdasan buatan, atau bantuan orang lain, dan saya memahami bahwa aktivitas di luar layar tes akan dicatat.</span>
            </label>

            <div className="consent__action">
              {needsCode ? (
                <div className="field" id="code-field">
                  <label className="label" htmlFor="invite-code">Kode akses dari pesan WhatsApp</label>
                  <input className="input" id="invite-code" ref={codeInputRef} type="text" inputMode="text" maxLength={12} autoComplete="off" placeholder="6 karakter" value={code} onChange={(event) => onCode(event.target.value)} />
                  {codeError ? <p className="error" id="code-error" role="alert">{codeError}</p> : null}
                </div>
              ) : null}
              <button className="btn btn--primary btn--lg" id="start-btn" type="submit" disabled={disabled}>
                {busy ? "Menyiapkan tes... " : loadFailed === "network" ? "Muat ulang halaman" : "Mulai tes sekarang"}<Arrow />
              </button>
              <p className="micro">{startNote}</p>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}

export function TestScreen({ attempt, index, answers, flagged, perMode, timeLeft, questionLeft, sectionMode, sectionSkill, sectionTotal, sectionPosition, sectionLeft, sectionQuestions, finishLabel, onSectionFinish, onChoose, onAnswerText, onPrev, onNext, onSkip, onFlag, onGoTo, onFinish, audioSection, audioPlayed, audioNote, onPlayAudio, onAudioEnded, audioRef, fsWarning, finishNote }) {
  const question = attempt.questions[index];
  if (!question) return null;
  const total = attempt.total;
  const section = question.sectionId ? attempt.sections.find((item) => item.id === question.sectionId) : null;
  const passage = section?.passage || question.passage;
  const image = section?.image || "";
  const navItems = (sectionMode ? sectionQuestions : attempt.questions.map((item, position) => ({ q: item, i: position })))
    .map((item, position) => ({ ...item, n: position + 1 }));
  // The navigator is split by section, so Listening shows Part 1 to Part 4 and Reading shows
  // each passage, instead of one long grid of every question in the test.
  const navGroups = [];
  for (const item of navItems) {
    const own = item.q.sectionId ? attempt.sections.find((s) => s.id === item.q.sectionId) : null;
    const key = own?.id || (item.q.part ? `part-${item.q.part}` : "all");
    const title = own?.title || (item.q.part ? `Bagian ${item.q.part}` : "");
    let group = navGroups.find((g) => g.key === key);
    if (!group) { group = { key, title, items: [] }; navGroups.push(group); }
    group.items.push(item);
  }
  const displayPosition = sectionMode ? sectionPosition + 1 : index + 1;
  const displayTotal = sectionMode ? sectionTotal : total;
  const answered = sectionMode ? sectionQuestions.filter(({ q }) => answers[q.id]).length : Object.keys(answers).length;
  const flaggedCount = sectionMode ? sectionQuestions.filter(({ q }) => flagged.has(q.id)).length : flagged.size;
  const percent = Math.round((displayPosition / displayTotal) * 100);
  const remaining = sectionMode ? sectionLeft : perMode ? questionLeft : timeLeft;
  const warning = remaining > 0 && (perMode ? remaining <= 5 : remaining <= 60);
  const nextLabel = sectionMode
    ? sectionPosition === sectionTotal - 1 ? finishLabel : "Soal selanjutnya"
    : index === total - 1 ? "Selesaikan tes" : "Soal selanjutnya";
  const isFlagged = flagged.has(question.id);
  const answer = answers[question.id];
  const minWords = question.minWords || 150;
  const words = String(answer || "").trim().split(/\s+/).filter(Boolean).length;
  const audioPlayedNow = audioSection ? audioPlayed.has(audioSection.id) : false;
  const [audioTime, setAudioTime] = useState(0);
  const [audioLength, setAudioLength] = useState(0);
  const [audioRunning, setAudioRunning] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);

  return (
    <section className="screen" id="screen-test" aria-labelledby="question-prompt">
      <div className="test-status" id="testbar">
        <div className="test-status__inner">
          <div className="testbar__progress">
            <div className="testbar__labels">
              <span id="progress-label">Soal {displayPosition} dari {displayTotal}</span>
              <span id="progress-percent">{percent}% selesai</span>
            </div>
            <progress id="progress" value={displayPosition} max={displayTotal}>{percent}%</progress>
          </div>
          <div className={`timer${warning ? " is-warning" : ""}`} id="timer" role="timer" aria-live="off">
            <Clock />
            <span id="timer-value">{formatTime(remaining)}</span>
            <span className="timer__label" id="timer-label">{sectionMode ? sectionSkill : perMode ? "untuk soal ini" : "tersisa"}</span>
          </div>
        </div>
      </div>

      <div className="wrap test-wrap">
        {fsWarning ? (
          <p className="banner banner--warning" id="fs-warning">
            Browser yang kamu pakai tidak mendukung mode layar penuh. Tes tetap bisa dikerjakan, tetapi perpindahan tab dan jendela akan kami catat.
          </p>
        ) : null}

        <div className="test-grid">
          <div className="test-main">
            {audioSection ? (
            <div className="audio-card" id="audio-card">
              <p className="audio-card__label">Audio Listening</p>
              <p className="audio-card__note" id="audio-note">{audioNote}</p>
              <VoiceNote
                label="Audio Listening"
                current={audioTime}
                duration={audioLength}
                paused={!audioRunning}
                finished={audioPlayedNow && audioLength > 0 && audioTime >= audioLength - 0.5}
                seekable={false}
                onToggle={onPlayAudio}
                failed={audioFailed}
              />
              <audio ref={audioRef} id="listening-audio" preload="metadata" src={audioSection.audio}
                onLoadedMetadata={(event) => setAudioLength(Number(event.currentTarget.duration) || 0)}
                onTimeUpdate={(event) => setAudioTime(event.currentTarget.currentTime)}
                onPlay={() => setAudioRunning(true)}
                onPause={() => setAudioRunning(false)}
                onError={() => setAudioFailed(true)}
                onEnded={() => { setAudioRunning(false); onAudioEnded(); }} />
            </div>
          ) : null}

          <div className="question-card">
            <div className="question-card__top">
              <span className="badge" id="question-badge">Soal {displayPosition} · {question.skill || "Grammar"}{question.part ? ` · Bagian ${question.part}` : ""}</span>
              {!perMode ? (
                <button className={`btn btn--ghost btn--sm${isFlagged ? " btn--flagged" : ""}`} id="flag-btn" type="button" aria-pressed={isFlagged} onClick={onFlag}>
                  <Flag /><span id="flag-text">{isFlagged ? "Ditandai" : "Tandai soal"}</span>
                </button>
              ) : null}
            </div>

            <div className="question-card__body">
              {passage || image ? (
                <div className="passage" id="passage">
                  <p className="passage__label" id="passage-label">{section?.title || "Bacaan"}</p>
                  {image ? <img className="passage__image" id="passage-image" src={image} alt={section?.title || "Gambar soal"} /> : null}
                  {passage ? <RichText value={passage} id="passage-text" className="passage__text" /> : null}
                </div>
              ) : null}

              <div className="prompt-canvas">
                <span className="prompt-canvas__corner" aria-hidden="true">Pilih jawaban yang paling tepat.</span>
                <p className="question__prompt" id="question-prompt">{question.prompt}</p>
              </div>

              <fieldset className="options">
                <legend className="sr-only">Pilihan jawaban</legend>
                <div className="options__list" id="options-list">
                  {question.type === "text" ? (
                    <div className="field answer-field">
                      <label className="label" htmlFor={`q-${question.id}`}>Jawaban kamu</label>
                      <input className="input" id={`q-${question.id}`} type="text" autoComplete="off" maxLength={300} value={answer || ""} onChange={(event) => onAnswerText(question.id, event.target.value)} />
                    </div>
                  ) : question.type === "longtext" ? (
                    <div className="field answer-field">
                      <label className="label" htmlFor={`q-${question.id}`}>Tulisan kamu</label>
                      <textarea className="textarea" id={`q-${question.id}`} rows={12} maxLength={20000} autoComplete="off" value={answer || ""} onChange={(event) => onAnswerText(question.id, event.target.value)} />
                      <p className={`micro${words < minWords ? " is-warning" : ""}`}>{words} kata, minimal {minWords} kata</p>
                    </div>
                  ) : (
                    Object.keys(question.options || {}).map((letter) => {
                      const selected = answer === letter;
                      return (
                        <label className={`option${selected ? " is-selected" : ""}`} key={letter}>
                          <input type="radio" name={`q-${question.id}`} value={letter} className="sr-only" checked={selected} onChange={() => onChoose(question.id, letter)} />
                          <span className="option__key">{letter}</span>
                          <span className="option__text">{question.options[letter]}</span>
                          <span className="option__mark" aria-hidden="true" />
                        </label>
                      );
                    })
                  )}
                </div>
              </fieldset>
            </div>

            <div className="question-card__nav">
              {!perMode ? (
                <button className="btn btn--secondary" id="prev-btn" type="button" onClick={onPrev} disabled={sectionMode ? sectionPosition === 0 : index === 0}><Back /> Sebelumnya</button>
              ) : null}
              <button className="btn btn--link" id="skip-btn" type="button" onClick={onSkip}>Lewati soal</button>
              <button className="btn btn--navy" id="next-btn" type="button" onClick={onNext}>
                <span id="next-label">{nextLabel}</span><Arrow />
              </button>
            </div>
          </div>
          </div>

          <aside className="side" aria-labelledby="nav-title">
            <div className="navigator">
              <div className="navigator__head">
                <h2 className="navigator__title" id="nav-title">Navigasi soal</h2>
                <span className="navigator__count" id="nav-count">{displayTotal} soal{sectionMode && navGroups.length > 1 ? ` · ${navGroups.length} bagian` : ""}</span>
              </div>
              <div className="legend">
                <span className="legend__item"><span className="dot dot--answered" aria-hidden="true" />Terjawab <strong id="nav-answered">{answered}</strong></span>
                <span className="legend__item"><span className="dot dot--current" aria-hidden="true" />Aktif</span>
                <span className="legend__item"><span className="dot dot--flagged" aria-hidden="true" />Ditandai <strong id="nav-flagged">{flaggedCount}</strong></span>
              </div>
              <div className="nav-groups" id="nav-grid">
                {navGroups.map((group) => (
                  <div className="nav-group" key={group.key}>
                    {group.title ? <p className="nav-group__title">{group.title}</p> : null}
                    <div className="nav-grid">
                      {group.items.map((item) => {
                        const isAnswered = Boolean(answers[item.q.id]);
                        const isCurrent = item.i === index;
                        const isItemFlagged = flagged.has(item.q.id);
                        return (
                          <button
                            className={`nav-btn${isAnswered ? " is-answered" : ""}${isCurrent ? " is-current" : ""}${isItemFlagged ? " is-flagged" : ""}`}
                            key={item.q.id}
                            type="button"
                            disabled={perMode}
                            aria-current={isCurrent ? "true" : undefined}
                            aria-label={`Soal ${item.n}${isAnswered ? ", sudah dijawab" : ""}${isItemFlagged ? ", ditandai" : ""}`}
                            onClick={() => onGoTo(item.i)}
                          >
                            {item.n}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn btn--primary btn--block" id="finish-btn" type="button" onClick={sectionMode ? onSectionFinish : onFinish}>
                {sectionMode && finishLabel !== "Selesaikan dan kirim" ? <Arrow /> : <Check />} {sectionMode ? finishLabel : "Selesaikan dan kirim"}
              </button>
              <p className="micro" id="finish-note">{finishNote}</p>
            </div>
          </aside>
        </div>

        <div className="kbd-hint">
          <span className="kbd-hint__group"><kbd>A</kbd><kbd>B</kbd><kbd>C</kbd><kbd>D</kbd><span>untuk memilih</span></span>
          <span className="kbd-hint__group"><kbd>←</kbd><kbd>→</kbd><span>untuk berpindah soal</span></span>
          <span className="kbd-hint__group kbd-hint__enter"><kbd>Enter</kbd><span>lanjut</span></span>
        </div>
      </div>
    </section>
  );
}

export function SpeakingScreen({ stage, mockup, speaking, recording, speakError, showSkip, checkUrl, recUrl, speakBusy, prepLeft, canRecord, sendLabel, checkStartHidden, noteOverride, videoPlaying, speakingLeft, checkStartRef, answerStartRef, onStartRecording, onStop, onRetryCheck, onCheckOk, onRetake, onSend, onSkip, onPlayVideo, onVideoEnded, onVideoError, videoRef, waveContainerRef, onOpenPrivacy, titleRef }) {
  const isMockup = Boolean(mockup?.started);
  const part = mockup?.plan?.parts[mockup.pi];
  const question = part?.questions[mockup.qi];
  const prompt = isMockup ? question?.text || "" : speaking?.prompt || "";
  const stepMeta = isMockup ? `Part ${part?.part || 1} · Pertanyaan ${(mockup?.qi || 0) + 1} dari ${part?.questions.length || 1}` : "Langkah 2 dari 2";
  const checkLead = isMockup
    ? "Rekam sebentar saja, lalu dengarkan hasilnya. Kalau suara kamu terdengar jelas, kamu siap menjawab pertanyaan dari examiner."
    : "Rekam sebentar saja, lalu dengarkan hasilnya. Kalau suara kamu terdengar jelas, kamu siap menjawab pertanyaan speaking.";
  const answerNote = noteOverride || (recUrl
    ? "Dengarkan jawaban kamu. Kalau ada yang kurang jelas, rekam ulang. Kalau sudah pas, kirim rekamannya."
    : isMockup
      ? part?.part === 2
        ? "Tonton examiner, gunakan 60 detik untuk menyiapkan jawaban, lalu rekam."
        : "Tonton pertanyaan dari examiner, lalu rekam jawabanmu. Kamu bisa memutar ulang pertanyaannya sebelum mulai."
      : `Jawab dalam bahasa Inggris selama ${speaking?.minSeconds || 15} sampai ${speaking?.seconds || 45} detik, dalam satu tarikan tanpa membaca teks. Tekan Mulai jawab saat kamu siap.`);

  const speakingTimer = speakingLeft !== null ? (
    <span className={`timer${speakingLeft <= 60 ? " is-warning" : ""}`} role="timer" aria-live="off">
      <Clock /><span>{formatTime(speakingLeft)}</span><span className="timer__label">tersisa</span>
    </span>
  ) : null;

  const feedback = (
    <>
      <div className="rec-card" id="speak-meter" hidden={!recording}>
        <span className="rec-dot" aria-hidden="true" />
        <p className="rec-label">Merekam suara kamu</p>
        <div className="rec-wave" id="rec-wave" ref={waveContainerRef} aria-hidden="true" />
        <p className="rec-timer" id="speak-timer" role="timer" aria-live="off">{formatTime(recording?.elapsed || 0)}</p>
      </div>
      {speakError ? <p className="banner banner--warning speak-error" id="speak-error" role="alert">{speakError}</p> : null}
      {showSkip ? <button className="btn btn--secondary" id="speak-skip" type="button" onClick={onSkip} disabled={speakBusy}>Lanjut tanpa rekaman</button> : null}
    </>
  );

  return (
    <section className="screen" id="screen-speaking" aria-labelledby="speaking-title">
      <div className="wrap wrap--details speak-wrap">
        <div className="speaking-grid">
          {stage === "check" ? (
            <div className="question-card" id="speak-check-card">
              <div className="question-card__top">
                <span className="badge">Bagian speaking</span>
                <div className="speak-top__meta">
                  <span className="question-card__meta">Langkah 1 dari 2</span>
                  {speakingTimer}
                </div>
              </div>
              <div className="question-card__body">
                <p className="eyebrow">Sebelum mulai</p>
                <h1 className="speaking-title" id="speaking-title" tabIndex={-1} ref={titleRef}>Cek dulu suara kamu</h1>
                <p className="speaking-lead" id="speak-check-lead">{checkLead}</p>
                <ol className="speak-steps">
                  <li>Tekan <strong>Rekam percobaan</strong> dan izinkan mikrofonnya.</li>
                  <li>Bicara apa saja selama 5 sampai 10 detik, misalnya kenalan singkat kamu.</li>
                  <li>Dengarkan rekamannya. Jelas? Lanjut. Kurang jelas? Cek ulang.</li>
                </ol>
                {feedback}
                <div className="speak-actions">
                  {!checkStartHidden ? (
                    <button className="btn btn--primary btn--lg" id="speak-check-start" ref={checkStartRef} type="button" onClick={() => onStartRecording("check")} disabled={Boolean(recording) || speakBusy}><Mic /> Rekam percobaan</button>
                  ) : null}
                  {recording ? (
                    <button className="btn btn--navy btn--lg" id="speak-check-stop" type="button" onClick={onStop} disabled={recording.elapsed < CHECK_SECONDS.min}><Stop /> Selesai</button>
                  ) : null}
                </div>
                {checkUrl ? (
                  <div className="speak-review" id="speak-check-review">
                    <audio id="speak-check-audio" controls preload="metadata" src={checkUrl} />
                    <div className="speak-review__actions">
                      <button className="btn btn--secondary" id="speak-check-retry" type="button" onClick={onRetryCheck}>Cek ulang</button>
                      <button className="btn btn--primary" id="speak-check-ok" type="button" onClick={onCheckOk}>Suaraku jelas, lanjut <Arrow /></button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="question-card" id="speak-answer-card">
              <div className="question-card__top">
                <span className="badge">{isMockup ? "IELTS Mockup Speaking" : "Bagian speaking"}</span>
                <div className="speak-top__meta">
                  <span className="question-card__meta" id="speaking-step">{stepMeta}</span>
                  {speakingTimer}
                </div>
              </div>
              <div className="question-card__body">
                <p className="eyebrow">Pertanyaan speaking</p>
                {isMockup ? (
                  <div className="speak-video" id="speak-video-wrap">
                    <video key={`${mockup?.pi}-${mockup?.qi}`} id="speak-video" ref={videoRef} playsInline preload="metadata" src={question?.video} onEnded={onVideoEnded} onError={onVideoError} />
                    <button className="btn btn--secondary btn--sm" id="speak-video-play" type="button" onClick={onPlayVideo} disabled={videoPlaying}>Putar pertanyaan</button>
                  </div>
                ) : null}
                <div className="prompt-canvas"><p className="question__prompt" id="speaking-prompt">{prompt}</p></div>
                {isMockup && part?.cue ? (
                  <div className="speak-cue" id="speaking-cue">
                    {part.cue.map((line, i) => <p className={i === 0 ? "speak-cue__title" : "speak-cue__line"} key={line}>{line}</p>)}
                  </div>
                ) : null}
                <p className="speaking-lead" id="speak-note">{answerNote}</p>
                {prepLeft !== null ? <p className="micro" id="speak-prep">Waktu persiapan: {prepLeft} detik</p> : null}
                {feedback}
                <div className="speak-actions">
                  {canRecord && !recording && !recUrl ? (
                    <button className="btn btn--primary btn--lg" id="speak-start" ref={answerStartRef} type="button" onClick={() => onStartRecording("answer")} disabled={speakBusy}><Mic /> Mulai jawab</button>
                  ) : null}
                  {recording ? (
                    <button className="btn btn--navy btn--lg" id="speak-stop" type="button" onClick={onStop} disabled={recording.elapsed < (speaking?.min || 1)}><Stop /> Selesai menjawab</button>
                  ) : null}
                </div>
                {recUrl ? (
                  <div className="speak-review" id="speak-review">
                    <audio id="speak-audio" controls preload="metadata" src={recUrl} />
                    <div className="speak-review__actions">
                      <button className="btn btn--secondary" id="speak-retake" type="button" onClick={onRetake} disabled={speakBusy}>Rekam ulang</button>
                      <button className="btn btn--primary" id="speak-send" type="button" onClick={onSend} disabled={speakBusy}><span id="speak-send-label">{sendLabel}</span> <Arrow /></button>
                    </div>
                  </div>
                ) : null}
                <p className="micro speak-privacy">Rekaman dinilai otomatis dan dihapus 30 hari setelah tes. Detailnya ada di <button className="link-inline" type="button" onClick={onOpenPrivacy}>Kebijakan Privasi</button>.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function DetailsScreen({ values, errors, busy, speakingOn, total, onChange, onSubmit, onOpenPrivacy, titleRef }) {
  const lead = speakingOn
    ? "Jawaban dan rekaman kamu sudah tersimpan dengan aman. Lengkapi data di bawah ini, lalu kami siapkan hasil lengkap tes kamu dan mengirimkannya ke email dan WhatsApp kamu."
    : "Jawaban kamu sudah tersimpan dengan aman. Lengkapi data di bawah ini, lalu kami akan menampilkan level kamu dan mengirimkan hasilnya ke email dan WhatsApp kamu.";
  return (
    <section className="screen" id="screen-details" aria-labelledby="details-title">
      <div className="wrap wrap--details">
        <ol className="stepper stepper--light" aria-label="Tahapan tes penempatan">
          <li className="stepper__step is-done"><span className="stepper__bar" /><span className="stepper__index">01</span><span className="stepper__title">Mengerjakan tes</span><span className="stepper__meta">Selesai</span></li>
          <li className="stepper__step is-active"><span className="stepper__bar" /><span className="stepper__index">02</span><span className="stepper__title">Melengkapi data</span><span className="stepper__meta">Sekarang</span></li>
          <li className="stepper__step"><span className="stepper__bar" /><span className="stepper__index">03</span><span className="stepper__title">Melihat hasil</span><span className="stepper__meta">Level dan rekomendasi</span></li>
        </ol>

        <div className="details-grid">
          <div className="details__copy">
            <p className="eyebrow">Langkah 2 dari 3</p>
            <h1 className="details__title" id="details-title" tabIndex={-1} ref={titleRef}>Tinggal satu langkah lagi sebelum hasilnya muncul.</h1>
            <p className="details__lead" id="details-lead">{lead}</p>
            <ul className="benefit-list">
              <li className="benefit"><span className="benefit__icon" aria-hidden="true"><Check /></span><span id="details-benefit-score">{speakingOn ? <><strong>Level, skor, dan lima nilai speaking</strong> dari tes yang sudah kamu kerjakan</> : <><strong>Level dan skor</strong> dari {total} soal yang sudah kamu kerjakan</>}</span></li>
              <li className="benefit"><span className="benefit__icon" aria-hidden="true"><Check /></span><span><strong>Rekomendasi program</strong> yang sesuai dengan level kamu</span></li>
              <li className="benefit"><span className="benefit__icon" aria-hidden="true"><Check /></span><span><strong>Salinan hasil</strong> yang dikirim ke email dan WhatsApp kamu</span></li>
            </ul>
          </div>

          <form className="panel form" id="contact-form" noValidate onSubmit={onSubmit}>
            <div className="field">
              <label className="label" htmlFor="name">Nama lengkap</label>
              <input className="input" id="name" name="name" type="text" autoComplete="name" maxLength={80} placeholder="Contoh: Siti Rahma" aria-describedby="err-name" aria-invalid={errors.name ? "true" : undefined} required value={values.name} onChange={(event) => onChange("name", event.target.value)} />
              <p className="field__error" id="err-name">{errors.name || ""}</p>
            </div>
            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" autoComplete="email" maxLength={160} placeholder="nama@email.com" aria-describedby="err-email" aria-invalid={errors.email ? "true" : undefined} required value={values.email} onChange={(event) => onChange("email", event.target.value)} />
              <p className="field__error" id="err-email">{errors.email || ""}</p>
            </div>
            <div className="field">
              <label className="label" htmlFor="whatsapp">Nomor WhatsApp</label>
              <input className="input" id="whatsapp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="08123456789" aria-describedby="err-wa" aria-invalid={errors.whatsapp ? "true" : undefined} required value={values.whatsapp} onChange={(event) => onChange("whatsapp", event.target.value)} />
              <p className="field__error" id="err-wa">{errors.whatsapp || ""}</p>
            </div>
            <fieldset className="field">
              <legend className="label">Di cabang mana kamu ingin belajar?</legend>
              <div className="radio-row">
                {BRANCHES.map(([key, label]) => (
                  <label key={key} className={`radio${values.branch === key ? " is-on" : ""}`}>
                    <input type="radio" name="branch" value={key} checked={values.branch === key} onChange={() => onChange("branch", key)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <p className="field__error" id="err-branch">{errors.branch || ""}</p>
            </fieldset>
            <button className="btn btn--primary btn--lg btn--block" id="contact-btn" type="submit" disabled={busy}>
              {busy ? "Menyimpan..." : speakingOn ? "Kirim dan siapkan hasil" : "Lihat hasil saya"}<Arrow />
            </button>
            <p className="micro">Data ini kami pakai untuk mengirim hasil dan menindaklanjuti konsultasi. Baca <button className="link-inline" type="button" onClick={onOpenPrivacy}>Kebijakan Privasi</button> untuk detailnya.</p>
          </form>
        </div>
      </div>
    </section>
  );
}

export function Dialog({ id, open, onClose, preventCancel = false, labelledBy, bodyClass = "dialog__body", initialFocusRef, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      const body = dialog.firstElementChild;
      if (body) body.scrollTop = 0;
      if (initialFocusRef?.current) initialFocusRef.current.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, bodyClass, initialFocusRef]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    const cancel = (event) => { if (preventCancel) event.preventDefault(); };
    const close = () => onClose?.();
    dialog.addEventListener("cancel", cancel);
    dialog.addEventListener("close", close);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.removeEventListener("close", close);
    };
  }, [preventCancel, onClose]);
  return <dialog className="dialog" id={id} ref={ref} aria-labelledby={labelledBy}><div className={bodyClass}>{children}</div></dialog>;
}

/* The failed-attempt flow is two steps: the choice, then a confirmation that names the
   consequence, so nobody loses their answers by clicking something that looked harmless. */
function FailureConfirm({ step, onConfirm, onCancel }) {
  const retry = step === "retry";
  return (
    <>
      <p className="dialog__note">
        {retry
          ? "Sesi ini berakhir dan semua jawaban yang sudah kamu isi hilang. Kamu akan mulai tes baru dari soal pertama dengan waktu yang penuh."
          : "Sesi ini berakhir dan jawaban kamu tidak disimpan. Kamu akan keluar dari halaman tes, dan bisa memulai tes baru dari sana."}
      </p>
      <div className="dialog__actions dialog__actions--stack">
        <button className="btn btn--primary btn--block" type="button" onClick={onConfirm}>{retry ? "Ya, mulai tes baru" : "Ya, keluar dari halaman tes"}</button>
        <button className="btn btn--secondary btn--block" type="button" onClick={onCancel}>Batal</button>
      </div>
    </>
  );
}

export function Dialogs({ dialogs, strikes, maxStrikes, answered, total, duration, legal, onClose, onViolationClose, onRetry, onBack, onConfirmSubmit, onLegalConfirm, onLegalClose }) {
  const legalTitleRef = useRef(null);
  const doc = legal?.doc;
  const [failStep, setFailStep] = useState(null);
  const failConfirmed = (kind) => {
    const step = failStep;
    setFailStep(null);
    if (step === "retry") onRetry(kind);
    else onBack();
  };
  return (
    <>
      <Dialog id="violation-dialog" open={dialogs.violation} onClose={() => onClose("violation")} preventCancel labelledBy="violation-title">
        <span className="dialog__icon dialog__icon--danger" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 2 21h20L12 3Z" /><path d="M12 10v5M12 18h.01" /></svg>
        </span>
        <h2 className="dialog__title" id="violation-title">Fokus tes kamu terputus</h2>
        <p className="dialog__text">Kamu terdeteksi keluar dari layar penuh atau berpindah dari jendela tes, dan kejadian ini sudah kami catat. Ini adalah pelanggaran fokus yang ke-<strong id="violation-count">{strikes}</strong> dari {maxStrikes}.</p>
        <p className="dialog__note">Waktu tes tetap berjalan selama peringatan ini ditampilkan. Pada pelanggaran ke-{maxStrikes}, tesnya berhenti dulu dan kamu memilih lanjut atau keluar.</p>
        <button className="btn btn--primary btn--block" id="violation-close" type="button" onClick={onViolationClose}>Kembali ke layar penuh</button>
      </Dialog>

      <Dialog id="limit-dialog" open={dialogs.limit} onClose={() => { setFailStep(null); onClose("limit"); }} preventCancel labelledBy="limit-title">
        <span className="dialog__icon dialog__icon--warning" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 2 21h20L12 3Z" /><path d="M12 10v5M12 18h.01" /></svg>
        </span>
        <h2 className="dialog__title" id="limit-title">Batas pelanggaran tercapai</h2>
        <p className="dialog__text">Kamu sudah {maxStrikes} kali keluar dari layar tes, jadi tesnya berhenti dulu. Jawaban kamu masih tersimpan, tetapi waktu terus berjalan selama layar ini terbuka. Pilih lanjut untuk kembali mengerjakan, atau keluar kalau kamu ingin berhenti di sini.</p>
        {failStep ? (
          <FailureConfirm step={failStep} onConfirm={() => failConfirmed("limit")} onCancel={() => setFailStep(null)} />
        ) : (
          <div className="dialog__actions dialog__actions--stack">
            <button className="btn btn--primary btn--block" id="limit-continue" type="button" onClick={onViolationClose}>Lanjutkan tes</button>
            <button className="btn btn--secondary btn--block" id="limit-exit" type="button" onClick={() => setFailStep("exit")}>Keluar dari halaman tes</button>
          </div>
        )}
      </Dialog>

      <Dialog id="submit-dialog" open={dialogs.submit} onClose={() => onClose("submit")} labelledBy="submit-title">
        <h2 className="dialog__title" id="submit-title">Kirim jawaban sekarang?</h2>
        <p className="dialog__text">Kamu sudah menjawab <strong id="submit-answered">{answered}</strong> dari <span id="submit-total">{total}</span> soal. Setelah dikirim, jawaban tidak bisa diubah lagi.</p>
        <div className="dialog__actions">
          <button className="btn btn--secondary" id="submit-cancel" type="button" onClick={() => onClose("submit")}>Periksa lagi</button>
          <button className="btn btn--primary" id="submit-confirm" type="button" onClick={onConfirmSubmit}>Kirim sekarang</button>
        </div>
      </Dialog>

      <Dialog id="timeup-dialog" open={dialogs.timeup} onClose={() => { setFailStep(null); onClose("timeup"); }} preventCancel labelledBy="timeup-title">
        <span className="dialog__icon dialog__icon--warning" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></svg>
        </span>
        <h2 className="dialog__title" id="timeup-title">Waktu pengerjaan habis</h2>
        <p className="dialog__text">Waktu {duration} sudah habis, jadi percobaan ini gagal dan jawaban kamu tidak dikirim. Kalau ingin mendapatkan hasil, kamu perlu mengerjakan tes dari awal lagi dengan waktu yang baru.</p>
        {failStep ? (
          <FailureConfirm step={failStep} onConfirm={() => failConfirmed("timeup")} onCancel={() => setFailStep(null)} />
        ) : (
          <div className="dialog__actions dialog__actions--stack">
            <button className="btn btn--primary btn--block" id="timeup-retry" type="button" onClick={() => setFailStep("retry")}>Mulai tes baru</button>
            <button className="btn btn--secondary btn--block" id="timeup-back" type="button" onClick={() => setFailStep("exit")}>Keluar dari halaman tes</button>
          </div>
        )}
      </Dialog>

      <Dialog id="legal-dialog" open={Boolean(legal)} onClose={onLegalClose} preventCancel={Boolean(legal?.box)} labelledBy="legal-title" bodyClass="dialog__body dialog__body--scroll" initialFocusRef={legalTitleRef}>
        <h2 className="dialog__title" id="legal-title" tabIndex={-1} ref={legalTitleRef}>{doc?.title || "Kebijakan Privasi"}</h2>
        <div className="disclosure__body" id="legal-dialog-body">
          {doc ? (
            <>
              <p className="micro disclosure__updated">Berlaku sejak {doc.updated}.</p>
              {doc.sections.map((section) => (
                <div key={section.heading}>
                  <h4>{section.heading}</h4>
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              ))}
            </>
          ) : null}
        </div>
        {legal?.box ? <p className="dialog__note" id="legal-note">Dengan menekan Setuju, kamu menyatakan sudah membaca dan menyetujui dokumen ini.</p> : null}
        <button className={`btn ${legal?.box ? "btn--primary" : "btn--secondary"} btn--block`} id="legal-action" type="button" onClick={onLegalConfirm}>{legal?.box ? "Setuju" : "Tutup"}</button>
      </Dialog>
    </>
  );
}
