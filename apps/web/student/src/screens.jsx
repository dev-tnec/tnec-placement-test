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

/* The expired/used/invalid invitation page, converted 1:1 from
   docs/assets/tnec_expired_invitation_page.html. The server's error code picks the state; the
   reference is the token fragment the student actually holds so the team can find the row. */
const ERROR_STATES = {
  invite_used: {
    httpTag: "HTTP 410 • INVITE_REDEEMED",
    badge: "Sudah Digunakan",
    title: "Kode akses undangan ini sudah pernah digunakan.",
    lead: "Setiap kode undangan hanya berlaku untuk satu kali pengerjaan sesi ujian. Jika sesi kamu terputus karena kendala teknis, hubungi admin Titik Nol untuk verifikasi ulang.",
    status: "TERPAKAI (1/1)",
    diag: "ALREADY_USED",
    waText: "Halo Admin TNEC, kode undangan ujian saya tercatat sudah terpakai (Ref: %REF%). Mohon bantuan pengecekan sesi saya.",
  },
  invite_expired: {
    httpTag: "HTTP 410 • INVITE_EXPIRED",
    badge: "Masa Berlaku Habis",
    title: "Tautan atau kode akses ujian ini sudah kedaluwarsa.",
    lead: "Demi keamanan evaluasi dan keakuratan jadwal sesi, tautan undangan hanya berlaku dalam batas waktu tertentu yang tertera pada pesan WhatsApp kamu.",
    status: "KEDALUWARSA",
    diag: "EXPIRED",
    waText: "Halo Admin TNEC, tautan undangan ujian saya sudah kedaluwarsa (Ref: %REF%). Mohon bantuannya untuk pembaruan kode akses.",
  },
  invite_locked: {
    httpTag: "HTTP 423 • INVITE_LOCKED",
    badge: "Terkunci Salah Kode",
    title: "Kode akses salah tiga kali, jadi undangan ini terkunci.",
    lead: "Demi keamanan sesi ujian, undangan yang salah memasukkan kode tiga kali otomatis terkunci. Hubungi admin Titik Nol untuk mendapatkan undangan baru.",
    status: "TERKUNCI",
    diag: "LOCKED",
    waText: "Halo Admin TNEC, undangan ujian saya terkunci karena salah kode tiga kali (Ref: %REF%). Mohon dibuatkan undangan baru.",
  },
  invite_not_open_yet: {
    httpTag: "HTTP 423 • INVITE_NOT_OPEN",
    badge: "Belum Dibuka",
    title: "Tautan undangan ini belum bisa dibuka.",
    lead: "Sesi ujian kamu sudah dijadwalkan, dan tautan ini baru aktif pada waktu yang tertera pada pesan WhatsApp kamu. Buka kembali tautan ini nanti.",
    status: "BELUM DIBUKA",
    diag: "NOT_OPEN_YET",
    waText: "Halo Admin TNEC, tautan undangan ujian saya belum bisa dibuka (Ref: %REF%). Mohon konfirmasi jadwal sesi saya.",
  },
  invalid: {
    httpTag: "HTTP 404 • INVITE_NOT_FOUND",
    badge: "Tautan Tidak Ditemukan",
    title: "Tautan undangan ujian tidak valid atau sudah ditarik.",
    lead: "Pastikan kamu membuka tautan secara utuh langsung dari pesan resmi WhatsApp Titik Nol English Course tanpa ada karakter yang terpotong.",
    status: "TIDAK VALID",
    diag: "NOT_FOUND",
    waText: "Halo Admin TNEC, tautan undangan ujian saya tidak valid/404 (Ref: %REF%). Mohon bantuannya untuk mengirimkan tautan yang benar.",
  },
};

export function ErrorScreen({ status, message, code, testName, token, whatsapp, onBack }) {
  const titleRef = useRef(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { titleRef.current?.focus(); }, []);
  // The exact server code wins; a bare 404 is the invalid state, anything unknown falls back
  // to invalid too because every other invite failure carries its code.
  const state = ERROR_STATES[code] || (status === 423 ? ERROR_STATES.invite_not_open_yet : ERROR_STATES.invalid);
  const ref = token ? `#${token.slice(0, 8).toUpperCase()}` : "#TIDAK-DIKETAHUI";
  const waHref = `https://wa.me/${whatsapp}?text=${encodeURIComponent(state.waText.replace("%REF%", ref))}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${ref} | ${state.diag}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked: the reference stays visible to read out */ }
  };
  return (
    <section className="screen" id="screen-error" aria-labelledby="error-title">
      <header className="hero-band">
        <div className="wrap">
          <div className="topbar">
            <img className="brand-logo" src="/assets/logo-titik-nol-white.png" alt="Titik Nol English Course" width="136" height="23" />
            <span className="status-tag">
              <span className="status-tag__dot" aria-hidden="true" />
              <span>{state.httpTag}</span>
            </span>
          </div>
        </div>
      </header>
      <main className="main-stage">
        <div className="wrap">
          <section className="status-card" aria-labelledby="error-title">
            <div className="status-card__top">
              <div className="alert-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                <span>{state.badge}</span>
              </div>
              <h1 className="status-card__title" id="error-title" tabIndex={-1} ref={titleRef}>{state.title}</h1>
              <p className="status-card__lead">{message || state.lead}</p>
              <div className="ticket-box" aria-label="Detail status tautan">
                <div className="ticket-item">
                  <span className="ticket-item__label">Jenis Asesmen</span>
                  <span className="ticket-item__val">{testName}</span>
                </div>
                <div className="ticket-item">
                  <span className="ticket-item__label">Status Akses</span>
                  <span className="ticket-item__val ticket-item__val--red">{state.status}</span>
                </div>
                <div className="ticket-item">
                  <span className="ticket-item__label">Kode Referensi</span>
                  <span className="ticket-item__val">{ref}</span>
                </div>
              </div>
            </div>
            <div className="status-card__body">
              <h2 className="next-heading">Langkah yang bisa kamu lakukan</h2>
              <ol className="steps-list">
                <li className="step-row">
                  <span className="step-row__num" aria-hidden="true">1</span>
                  <span>Periksa kembali pesan WhatsApp terbaru dari admin Titik Nol untuk memastikan tidak ada tautan undangan pengganti.</span>
                </li>
                <li className="step-row">
                  <span className="step-row__num" aria-hidden="true">2</span>
                  <span>Hubungi tim akademik TNEC dengan menyertakan kode referensi di bawah agar kami dapat menerbitkan kode akses baru.</span>
                </li>
                <li className="step-row">
                  <span className="step-row__num" aria-hidden="true">3</span>
                  <span>Jika kamu ingin mengukur level bahasa Inggris umum secara cepat, kamu tetap dapat mengikuti <strong>Placement Test</strong> gratis tanpa kode akses.</span>
                </li>
              </ol>
              <div className="actions">
                <a className="btn-error btn-error--primary" href={waHref} target="_blank" rel="noopener">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                  <span>Minta Kode Baru via WhatsApp</span>
                </a>
                <a className="btn-error btn-error--secondary" href="/" onClick={(event) => { event.preventDefault(); onBack(); }}>
                  <span>Ke Placement Test Publik</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </a>
              </div>
              <div className="copy-bar">
                <span>Info diagnostik untuk admin: <span className="copy-bar__code">{ref} | {state.diag}</span></span>
                <button type="button" className="copy-btn" onClick={copy}>{copied ? "Tersalin!" : "Salin kode"}</button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </section>
  );
}

/* One of the six segmented code boxes. Controlled: value comes from the parent's code string,
   so paste, backspace, and auto-advance all stay in one state. */
function OtpBox({ index, char, filled, hasError, autoFocus, onChange, onBackspace, onArrow, onPaste, inputRef }) {
  return (
    <input
      className={`otp-input${filled ? " is-filled" : ""}${hasError ? " is-error" : ""}`}
      id={`otp-${index}`}
      type="text"
      maxLength={1}
      autoComplete="off"
      spellCheck="false"
      inputMode="text"
      aria-label={`Karakter ${index + 1}`}
      value={char}
      ref={inputRef}
      onChange={(event) => {
        const clean = event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        onChange(index, clean.slice(-1));
      }}
      onKeyDown={(event) => {
        if (event.key === "Backspace" && !char) { event.preventDefault(); onBackspace(index); }
        else if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); onArrow(index - 1); }
        else if (event.key === "ArrowRight" && index < 5) { event.preventDefault(); onArrow(index + 1); }
      }}
      onPaste={(event) => {
        event.preventDefault();
        const pasted = event.clipboardData.getData("text").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
        if (pasted) onPaste(pasted);
      }}
    />
  );
}

/* The front page, converted 1:1 from docs/assets/tnec_online_assessment_front_page_revamp.html:
   a navy hero with real metrics, a briefing stack (IELTS module timeline, flow steps, rules
   pills plus a details drawer), and a sticky launch console with the segmented code input and
   the three consent checkboxes. The mode is the real context: no invite is the Placement
   variant, an ielts-mockup invite is the IELTS variant, other invites reuse the placement
   layout with their own copy. */
export function Intro({ config, invite, consent, onConsent, code, onCode, codeError, codeInputRef, busy, onStart, onOpenLegal, notice, loadFailed, onReload, titleRef }) {
  const total = config?.totalQuestions ?? 25;
  const seconds = config?.durationSeconds ?? 300;
  const minutes = Math.max(1, Math.round(seconds / 60));
  const strikes = config?.maxViolations ?? 3;
  const isInvite = Boolean(invite);
  const isIelts = invite?.test === "ielts-mockup";
  const plan = config?.sectionPlan || [];
  const sectionsMode = isIelts && plan.length > 0;
  const skillCounts = config?.skillCounts || {};
  const listeningMin = Math.round((plan.find((s) => s.skill === "Listening")?.seconds || 1920) / 60);
  const readingMin = Math.round((plan.find((s) => s.skill === "Reading")?.seconds || 3600) / 60);
  const writingMin = Math.round((plan.find((s) => s.skill === "Writing")?.seconds || 3600) / 60);
  const speakingMin = Math.round((plan.find((s) => s.skill === "Speaking")?.seconds || 900) / 60);
  const needsCode = Boolean(invite?.needsCode);
  const allConsent = consent.terms && consent.privacy && consent.honesty;
  // The App keeps the code as one string; interior holes are spaces so a cleared middle box
  // never shifts the later characters left. Completeness ignores the spaces.
  const otpSlots = useMemo(() => {
    const padded = (code || "").padEnd(6, " ").slice(0, 6);
    return Array.from({ length: 6 }, (_, i) => (padded[i] === " " ? "" : padded[i]));
  }, [code]);
  const codeLength = code.replace(/\s/g, "").length;
  const codeOk = !needsCode || codeLength >= 6;
  const canStart = Boolean(config?.open) && allConsent && codeOk && !busy;
  const disabled = loadFailed === "network" ? false : loadFailed ? true : !canStart;
  const otpRefs = useRef([]);
  const otpRefCb = (index) => (element) => { otpRefs.current[index] = element; };
  // The App passes one ref for the single code input; point it at the first box.
  const codeRefCb = (element) => {
    otpRefs.current[0] = element;
    if (codeInputRef) codeInputRef.current = element;
  };
  const setOtp = (index, value) => {
    const slots = [...otpSlots];
    slots[index] = value;
    onCode(slots.map((slot) => slot || " ").join(""));
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };
  const onOtpBackspace = (index) => {
    const slots = [...otpSlots];
    slots[index - 1] = "";
    onCode(slots.map((slot) => slot || " ").join(""));
    otpRefs.current[index - 1]?.focus();
  };
  const onOtpPaste = (pasted) => {
    onCode(pasted);
    const focusIndex = Math.min(pasted.length, 5);
    otpRefs.current[focusIndex]?.focus();
  };

  const badge = isInvite ? "Undangan Khusus" : "Placement Test";
  const sessionLabel = isIelts
    ? `${invite.packageName || "Paket"} • Kandidat: ${invite.firstName}`
    : isInvite
      ? `${invite.testName} • Kandidat: ${invite.firstName}`
      : "Placement Test • Publik";
  const eyebrow = isIelts ? "Simulasi IELTS Resmi TNEC" : isInvite ? invite.testName : "Placement Test";

  const title = sectionsMode
    ? <>Halo {invite.firstName}, bersiap untuk IELTS Mockup dalam <span className="hero__accent">{minutes} menit</span>.</>
    : isInvite
      ? <>Halo {invite.firstName}, selesaikan {invite.testName.toLowerCase()} kamu dalam <span className="hero__accent">{minutes} menit</span>.</>
      : <>Kenali level bahasa Inggris kamu dalam <span className="hero__accent">{minutes} menit</span>.</>;

  const lead = sectionsMode
    ? "Simulasi penuh mencakup empat keterampilan utama IELTS. Kerjakan dalam satu sesi berurutan untuk mendapatkan estimasi band score yang akurat."
    : isInvite
      ? isPreLead(invite)
      : `Tes ${total} soal pilihan ganda untuk memetakan kemampuan bahasa Inggris kamu secara objektif. Skor, level, dan rekomendasi program langsung tampil setelah selesai.`;

  const metrics = sectionsMode
    ? [
        { val: String(plan.length || 4), lbl: "Bagian" },
        { val: String(total), lbl: skillCounts.Writing ? "Soal + Esai" : "Soal" },
        { val: String(minutes), lbl: "Menit Total" },
      ]
    : [
        { val: String(total), lbl: "Soal Pilihan" },
        { val: String(minutes), lbl: "Menit Durasi" },
        { val: "6", lbl: "Tingkat Level" },
      ];

  const flow = sectionsMode
    ? [
        { num: "1", title: "Verifikasi Kode & Aturan", desc: "Masukkan kode akses dari WhatsApp undangan dan centang persetujuan standar ujian." },
        { num: "2", title: "Kerjakan 4 Bagian Berurutan", desc: `Listening (${listeningMin}m), Reading (${readingMin}m), Writing (${writingMin}m), dan Speaking (${speakingMin}m) dalam mode layar penuh.` },
        { num: "3", title: "Terima Estimasi Band Score", desc: "Band Listening, Reading, dan Writing langsung tampil; Speaking menyusul setelah pemrosesan otomatis." },
      ]
    : isInvite
      ? [
          { num: "1", title: "Verifikasi & Setujui Aturan", desc: "Pahami aturan layar penuh dan kerjakan secara mandiri tanpa bantuan alat penerjemah." },
          { num: "2", title: `Selesaikan ${total} Soal (${minutes} Menit)`, desc: "Waktu berjalan terus tanpa jeda. Pastikan seluruh soal terisi sebelum waktu habis." },
          { num: "3", title: "Lihat Nilai Kamu", desc: "Setelah jawaban terkirim, nilai kamu langsung muncul dan tercatat di data kelas kamu." },
        ]
      : [
          { num: "1", title: "Setujui Ketentuan Tes", desc: "Pahami aturan layar penuh dan kerjakan secara mandiri tanpa bantuan alat penerjemah." },
          { num: "2", title: `Selesaikan ${total} Soal (${minutes} Menit)`, desc: "Waktu berjalan terus tanpa jeda. Pastikan seluruh soal terisi sebelum waktu habis." },
          { num: "3", title: "Lengkapi Data & Lihat Hasil", desc: "Isi nama, email, WhatsApp, dan cabang tujuan. Level dan rekomendasi program langsung muncul." },
        ];

  const privacyShort = sectionsMode
    ? "Esai dinilai AI dan rekaman speaking dinilai otomatis tanpa nama maupun kontak pribadi."
    : "Data kontak digunakan untuk pengiriman hasil tes serta konsultasi penempatan kelas.";

  const modules = sectionsMode
    ? [
        { top: "Bagian 01", count: `${skillCounts.Listening || 40} Soal`, name: "Listening", detail: "Audio diputar satu kali. Navigasi bebas Part 1-4.", time: `${listeningMin} Menit` },
        { top: "Bagian 02", count: `${skillCounts.Reading || 42} Soal`, name: "Reading", detail: "Tiga teks bacaan akademik dengan timer mandiri.", time: `${readingMin} Menit` },
        { top: "Bagian 03", count: `${skillCounts.Writing || 2} Esai`, name: "Writing", detail: "Task 1 & Task 2 dengan penilaian rubrik AI.", time: `${writingMin} Menit` },
        { top: "Bagian 04", count: "Video", name: "Speaking", detail: "Sesi tanya jawab dengan examiner virtual.", time: `${speakingMin} Menit` },
      ]
    : [];

  const consoleDesc = needsCode
    ? "Masukkan kode akses 6 karakter dari WhatsApp dan setujui pernyataan di bawah."
    : "Baca standar pengawasan di samping dan centang ketiga persetujuan untuk memulai.";
  const consoleMeta = sectionsMode
    ? `Sesi berjalan ${minutes} menit • Hanya 1 kali kesempatan kirim`
    : `Durasi ${minutes} menit tanpa jeda • ${isInvite ? "Nilai langsung muncul" : "Hasil dikirim ke Email & WhatsApp"}`;

  const rulesLeft = sectionsMode ? [
    `Tes terdiri dari ${total} soal dan esai (Listening ${listeningMin} menit, Reading ${readingMin} menit, Writing ${writingMin} menit, Speaking ${speakingMin} menit). Di Listening, kamu bebas berpindah soal Part 1-4 selama audio diputar.`,
    "Saat tes dimulai, layar otomatis masuk ke mode penuh. Kamu tidak diperkenankan mengecilkan layar atau berpindah tab.",
    `Pelanggaran layar penuh dicatat oleh sistem. Pada pelanggaran ke-${strikes} tes berhenti sejenak untuk konfirmasi; jawaban tersimpan jika memilih lanjut.`,
    "Kerjakan sendiri tanpa kamus, penerjemah, kecerdasan buatan, atau bantuan orang lain.",
  ] : [
    `Tes terdiri dari ${total} soal pilihan ganda dalam waktu ${minutes} menit tanpa jeda. Tombol kirim aktif setelah semua soal dijawab.`,
    "Layar otomatis masuk mode penuh saat tes dimulai. Dilarang mengecilkan layar atau membuka tab/aplikasi lain.",
    `Setiap perpindahan tab dicatat. Pada pelanggaran ke-${strikes} tes dijeda sementara; jawaban tersimpan jika memilih lanjut.`,
    "Kerjakan sendiri tanpa kamus, penerjemah, AI, atau bantuan orang lain agar hasil Placement Test akurat.",
  ];
  const rulesRight = sectionsMode ? [
    "Sistem menyimpan jawaban, skor, durasi pengerjaan, dan catatan pengawasan pada profil siswa Titik Nol kamu.",
    "Data digunakan untuk mengevaluasi perkembangan belajar bersama tutor dan tidak digunakan untuk keperluan komersial pihak ketiga.",
    "Penilaian esai Writing dan rekaman Speaking diproses secara anonim tanpa menyertakan identitas kontak.",
    "Ketika waktu bagian berakhir, bagian terkunci otomatis dan jawaban yang telah diisi tetap tersimpan.",
  ] : isInvite ? [
    "Kami menyimpan jawaban, nilai, waktu pengerjaan, dan catatan pelanggaran selama tes, lalu mencatatnya di data kamu sebagai siswa Titik Nol.",
    "Data itu kami pakai untuk menghitung nilai dan memantau perkembangan belajar kamu bersama tutor. Data tidak dijual dan tidak dipakai untuk iklan.",
    "Setelah jawaban terkirim, nilai kamu langsung muncul di layar. Kamu tidak perlu mengisi data kontak lagi.",
    "Kalau waktu habis sebelum kamu selesai, percobaan ini gagal dan jawaban kamu tidak dikirim. Selama tautan ini masih berlaku, kamu bisa mengulang tes dari awal.",
  ] : [
    "Kami menyimpan nama, email, nomor WhatsApp, pilihan cabang belajar, jawaban, skor, dan waktu pengerjaan.",
    "Data dipakai untuk menghitung skor, menentukan level, mengirim laporan hasil, serta tindak lanjut konsultasi belajar.",
    "Kalau waktu habis sebelum mengirim jawaban, percobaan dinyatakan tidak selesai dan dapat diulang dari awal.",
    "Hasil tes berfungsi sebagai acuan penempatan kelas TNEC dan bukan sertifikat resmi berstandar internasional.",
  ];

  let submitText;
  if (busy) submitText = "Menyiapkan tes...";
  else if (loadFailed === "network") submitText = "Muat ulang halaman";
  else if (canStart) submitText = "Mulai Tes Sekarang (Layar Penuh)";
  else if (needsCode && !codeOk && allConsent) submitText = "Lengkapi 6 Karakter Kode Akses";
  else if (!allConsent && codeOk) submitText = "Centang Semua Persetujuan";
  else submitText = needsCode ? "Masukkan Kode & Setujui Aturan" : "Setujui Aturan untuk Mulai";

  return (
    <section className="screen" id="screen-intro" aria-labelledby="intro-title">
      <header className="hero">
        <div className="wrap">
          <div className="topbar">
            <img className="brand-logo" src="/assets/logo-titik-nol-white.png" alt="Titik Nol English Course" width="136" height="23" />
            <span className="session-pill">
              <span className="session-pill__badge">{badge}</span>
              <span>{sessionLabel}</span>
            </span>
          </div>
          <div className="hero__main">
            <div>
              <p className="eyebrow eyebrow--hero" id="intro-eyebrow">{eyebrow}</p>
              <h1 className="hero__title" id="intro-title" tabIndex={-1} ref={titleRef}>{title}</h1>
              <p className="hero__lead">{lead}</p>
              {notice ? <p className="banner banner--warning hero__notice" id="intro-notice" role="status">{notice}</p> : null}
            </div>
            <div className="hero__metrics" aria-label="Ringkasan durasi dan soal">
              {metrics.map((metric, i) => (
                <div className="metric-item" key={i}>
                  <strong>{metric.val}</strong>
                  <span>{metric.lbl}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="workspace">
        <div className="wrap workspace__grid">
          <div className="briefing-stack">
            {sectionsMode ? (
              <section className="card" aria-labelledby="modules-heading">
                <div className="card__header">
                  <div>
                    <p className="eyebrow eyebrow--muted">Struktur Sesi</p>
                    <h2 className="card__title" id="modules-heading">Empat bagian berurutan tanpa jeda</h2>
                  </div>
                  <span className="card__subtitle">Total {minutes} menit</span>
                </div>
                <div className="modules-grid">
                  {modules.map((module, i) => (
                    <div className="module-box" key={i}>
                      <div className="module-box__top"><span>{module.top}</span><span>{module.count}</span></div>
                      <div className="module-box__name">{module.name}</div>
                      <div className="module-box__detail">{module.detail}</div>
                      <div className="module-box__time">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                        {module.time}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="module-note">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                  <span>Ketika waktu satu bagian berakhir, bagian tersebut otomatis terkunci dan sistem berlanjut ke bagian berikutnya.</span>
                </div>
              </section>
            ) : null}

            <section className="card" aria-labelledby="flow-heading">
              <div className="card__header">
                <div>
                  <p className="eyebrow eyebrow--muted">Alur Pengerjaan</p>
                  <h2 className="card__title" id="flow-heading">Tiga tahap menuju laporan hasil</h2>
                </div>
              </div>
              <div className="flow-list">
                {flow.map((step) => (
                  <div className="flow-step" key={step.num}>
                    <span className="flow-step__num" aria-hidden="true">{step.num}</span>
                    <h3 className="flow-step__title">{step.title}</h3>
                    <p className="flow-step__desc">{step.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="card" aria-labelledby="rules-heading">
              <div className="card__header">
                <div>
                  <p className="eyebrow eyebrow--muted">Standar Pengawasan</p>
                  <h2 className="card__title" id="rules-heading">Aturan teknis &amp; integritas asesmen</h2>
                </div>
              </div>
              <div className="rules-summary-grid">
                <div className="rule-pill">
                  <div className="rule-pill__icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
                  </div>
                  <div>
                    <div className="rule-pill__title">Mode Layar Penuh Wajib</div>
                    <div className="rule-pill__text">Sistem otomatis mengunci ke layar penuh. Berpindah tab atau aplikasi akan tercatat.</div>
                  </div>
                </div>
                <div className="rule-pill">
                  <div className="rule-pill__icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  </div>
                  <div>
                    <div className="rule-pill__title">Batas Toleransi {strikes} Pelanggaran</div>
                    <div className="rule-pill__text">Pada pelanggaran ke-{strikes} tes dijeda sementara. Jawaban tetap aman jika memilih lanjut.</div>
                  </div>
                </div>
                <div className="rule-pill">
                  <div className="rule-pill__icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  </div>
                  <div>
                    <div className="rule-pill__title">Tanpa Alat Bantu Eksternal</div>
                    <div className="rule-pill__text">Dilarang menggunakan kamus, penerjemah, AI, atau bantuan pihak lain selama sesi.</div>
                  </div>
                </div>
                <div className="rule-pill">
                  <div className="rule-pill__icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  </div>
                  <div>
                    <div className="rule-pill__title">Kerahasiaan &amp; Penilaian</div>
                    <div className="rule-pill__text">{privacyShort}</div>
                  </div>
                </div>
              </div>
              <details className="rules-details">
                <summary>
                  <span>Lihat rincian lengkap aturan pengerjaan &amp; pemrosesan data</span>
                  <svg className="rules-details__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                </summary>
                <div className="rules-details__body">
                  <div className="rules-col">
                    <h4>Cara tes berjalan</h4>
                    <ol>
                      {rulesLeft.map((rule, i) => <li key={i}>{rule}</li>)}
                    </ol>
                  </div>
                  <div className="rules-col">
                    <h4>Data &amp; evaluasi hasil</h4>
                    <ol>
                      {rulesRight.map((rule, i) => <li key={i}>{rule}</li>)}
                    </ol>
                  </div>
                </div>
              </details>
            </section>
          </div>

          <aside className="console" aria-labelledby="console-heading">
            <div className="console__head">
              <p className="eyebrow eyebrow--muted">Konfirmasi Mulai</p>
              <h2 className="console__title" id="console-heading">Siapkan sesi ujian kamu</h2>
              <p className="console__desc">{consoleDesc}</p>
            </div>
            <form id="consent-form" noValidate onSubmit={(event) => { event.preventDefault(); if (loadFailed === "network") onReload(); else onStart(); }}>
              {needsCode ? (
                <div className="code-box" id="code-field">
                  <div className="code-box__header">
                    <span className="code-box__label" id="otp-group-label">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      Kode Akses Undangan
                    </span>
                    <span className="code-box__hint">6 karakter (WhatsApp)</span>
                  </div>
                  <div className="otp-group" role="group" aria-labelledby="otp-group-label">
                    {otpSlots.map((char, i) => (
                      <OtpBox
                        key={i}
                        index={i}
                        char={char}
                        filled={Boolean(char)}
                        hasError={Boolean(codeError)}
                        onChange={setOtp}
                        onBackspace={onOtpBackspace}
                        onArrow={(target) => otpRefs.current[target]?.focus()}
                        onPaste={onOtpPaste}
                        inputRef={i === 0 ? codeRefCb : otpRefCb(i)}
                      />
                    ))}
                  </div>
                  <div className="code-box__status">
                    <span className={codeError ? "code-box__feedback code-box__error" : "code-box__feedback"} role={codeError ? "alert" : undefined}>
                      {codeError || (codeOk ? "Format kode lengkap (6 karakter)" : "Tempel atau ketik 6 karakter kode undangan")}
                    </span>
                    <span className="code-count">{codeLength}/6</span>
                  </div>
                </div>
              ) : null}

              <div className="consent-list">
                <label className="check-item">
                  <input type="checkbox" id="consent-terms" checked={consent.terms} readOnly onClick={(event) => { event.preventDefault(); onOpenLegal("terms", "terms"); }} />
                  <span className="check-item__box" aria-hidden="true" />
                  <span className="check-item__text">Saya sudah membaca dan menyetujui <a className="check-item__link" href="#syarat-dan-ketentuan" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenLegal("terms", "terms"); }}>Syarat dan Ketentuan</a> yang berlaku.</span>
                </label>
                <label className="check-item">
                  <input type="checkbox" id="consent-privacy" checked={consent.privacy} readOnly onClick={(event) => { event.preventDefault(); onOpenLegal("privacy", "privacy"); }} />
                  <span className="check-item__box" aria-hidden="true" />
                  <span className="check-item__text">Saya sudah membaca dan menyetujui <a className="check-item__link" href="#kebijakan-privasi" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenLegal("privacy", "privacy"); }}>Kebijakan Privasi</a>, termasuk pengumpulan data yang dijelaskan di atas.</span>
                </label>
                <label className="check-item">
                  <input type="checkbox" id="consent-honesty" checked={consent.honesty} onChange={(event) => onConsent({ ...consent, honesty: event.target.checked })} />
                  <span className="check-item__box" aria-hidden="true" />
                  <span className="check-item__text">Saya mengerjakan tes ini sendiri tanpa kamus, penerjemah, kecerdasan buatan, atau bantuan orang lain, dan saya memahami bahwa aktivitas di luar layar tes akan dicatat.</span>
                </label>
              </div>

              <div className="console__footer">
                <button type="submit" className="btn-start" id="start-btn" disabled={disabled}>
                  <span>{submitText}</span>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
                <p className="console__meta">{consoleMeta}</p>
              </div>
            </form>
          </aside>
        </div>
      </main>
    </section>
  );
}

/* Pre-test and post-test invites share the placement layout; only the lead sentence differs. */
function isPreLead(invite) {
  if (invite.test === "pre") return "Tes ini mengukur titik awal kemampuan kamu sebelum program dimulai, agar tutor bisa melihat perkembanganmu dari awal.";
  return "Tes ini menentukan apakah kamu sudah siap lanjut ke level berikutnya. Hasilnya tercatat di data kelas kamu.";
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
  const stepMeta = isMockup
    ? `Part ${part?.part || 1} · Pertanyaan ${(mockup?.qi || 0) + 1} dari ${part?.questions.length || 1}`
    : speaking?.total > 1 ? `Pertanyaan ${(speaking?.index ?? 0) + 1} dari ${speaking.total}`
      : "Langkah 2 dari 2";
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
        <ol className="stepper stepper--light" aria-label="Tahapan Placement Test">
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
