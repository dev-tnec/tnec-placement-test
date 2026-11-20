// Result email. Inline styles only, because email clients drop external CSS.
// Palette mirrors the TNEC tokens in DESIGN.md.

import { CAMPUS_ADDRESS, WHATSAPP } from "./legal.js";
import { aspectLine, formatBand } from "./speaking-result.js";

const NAVY = "#0A1B38";
const NAVY_700 = "#16325C";
const RED = "#E3201F";
const YELLOW = "#F7B500";
const YELLOW_LIGHT = "#FFF6DC";
const GRAY = "#5C6B7F";
const BORDER = "#E6E2D9";
const SURFACE = "#F7F8FA";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const TRANSCRIPT_MAX = 600;
const eyebrow = (text) => `<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${GRAY};font-weight:700;">${text}</div>`;
const shorten = (value, max) => (value.length > max ? `${value.slice(0, max - 3).trimEnd()}...` : value);

/** The sentence that explains a lowered overall score, or the relevance note. */
function speakingNote(sp) {
  if (sp.tooShort) return "Jawaban kamu kurang dari 20 kata, jadi nilai keseluruhannya belum stabil. Tim kami akan memeriksanya.";
  if (sp.offTopic) return "Relevansi: belum sesuai pertanyaan, jadi nilai keseluruhannya diturunkan.";
  if (sp.relevance === "TRUE") return "Relevansi: sesuai pertanyaan.";
  return "";
}

/** The speaking card, the transcript, and the notes. Empty when the result has no speaking part. */
function speakingHtml(sp) {
  if (!sp) return "";
  const hasPoints = sp.aspects.some((a) => a.score !== null);
  const cell = "padding:10px 0;border-top:1px solid " + BORDER + ";font-size:14px;color:" + NAVY + ";";
  const rows = sp.aspects.map((a) => `<tr>
          <td style="${cell}">${escapeHtml(a.label)}</td>
          <td style="${cell}font-weight:700;text-align:right;">${escapeHtml(a.cefr || "-")}</td>
          ${hasPoints ? `<td style="${cell}text-align:right;width:76px;">${a.score === null ? "-" : Math.round(a.score)}</td>` : ""}
        </tr>`).join("");
  const note = speakingNote(sp);
  const transcript = sp.transcript ? shorten(sp.transcript, TRANSCRIPT_MAX) : "";
  return `
      <div style="border:1px solid ${BORDER};border-radius:12px;padding:24px;margin:0 0 24px;">
        ${eyebrow("Speaking")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;">
          <tr>
            <td style="vertical-align:bottom;">
              <div style="font-size:30px;line-height:1.2;font-weight:800;color:${NAVY};">CEFR ${escapeHtml(sp.cefr)}</div>
              <div style="font-size:13px;color:${GRAY};margin-top:2px;">${sp.source === "manual" ? "Dinilai oleh tim Titik Nol" : "Dinilai otomatis"}</div>
            </td>
            ${sp.ielts === null ? "" : `<td style="vertical-align:bottom;text-align:right;">
              <div style="font-size:24px;line-height:1.2;font-weight:800;color:${NAVY};">${formatBand(sp.ielts)}</div>
              <div style="font-size:12px;color:${GRAY};">IELTS</div>
            </td>`}
          </tr>
        </table>
        ${sp.aspects.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-collapse:collapse;">
          <tr>
            <td style="padding:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${GRAY};font-weight:700;">Aspek</td>
            <td style="padding:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${GRAY};font-weight:700;text-align:right;">CEFR</td>
            ${hasPoints ? `<td style="padding:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${GRAY};font-weight:700;text-align:right;">Skor</td>` : ""}
          </tr>
          ${rows}
        </table>` : ""}
        ${hasPoints ? `<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:${GRAY};">Skor aspek memakai skala 0 sampai 100.</p>` : ""}
        ${note ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:${NAVY};">${escapeHtml(note)}</p>` : ""}
      </div>
      ${transcript ? `<div style="margin:0 0 24px;">
        ${eyebrow("Transkrip jawaban kamu")}
        <div style="margin-top:8px;background:${SURFACE};border-radius:12px;padding:16px 18px;font-size:14px;line-height:1.65;color:${NAVY};">${escapeHtml(transcript)}</div>
      </div>` : ""}
      ${sp.notes.length ? `<div style="margin:0 0 24px;">
        ${eyebrow(sp.source === "manual" ? "Catatan dari tim Titik Nol" : "Catatan penilaian speaking")}
        ${sp.notes.map((n) => `<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:${NAVY};">${escapeHtml(n)}</p>`).join("")}
      </div>` : ""}`;
}

function speakingText(sp) {
  if (!sp) return [];
  const lines = [
    "",
    `Speaking: CEFR ${sp.cefr}${sp.ielts === null ? "" : `, IELTS ${formatBand(sp.ielts)}`} (${sp.source === "manual" ? "dinilai oleh tim Titik Nol" : "dinilai otomatis"})`,
    ...sp.aspects.map(aspectLine),
  ];
  const note = speakingNote(sp);
  if (note) lines.push(note);
  if (sp.transcript) lines.push("", `Transkrip jawaban kamu: ${shorten(sp.transcript, TRANSCRIPT_MAX)}`);
  if (sp.notes.length) lines.push("", sp.source === "manual" ? "Catatan dari tim Titik Nol:" : "Catatan penilaian speaking:", ...sp.notes);
  return lines;
}

/** The panel with the private link to the full result page. Empty when the link is missing. */
function resultLinkHtml(url) {
  if (!url) return "";
  return `<div style="margin:0 0 24px;border:1px solid ${BORDER};border-radius:12px;padding:20px 24px;text-align:center;">
    <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${GRAY};font-weight:700;">Halaman hasil lengkap</div>
    <p style="margin:8px 0 14px;font-size:14px;line-height:1.6;color:${NAVY};">Simpan tautan ini, karena kamu bisa membukanya kapan saja untuk melihat hasil dan rekomendasi program kamu.</p>
    <a href="${escapeHtml(url)}" style="display:block;background:${NAVY_700};color:#FFFFFF;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:14px 24px;border-radius:999px;">Buka hasil lengkap di web</a>
    <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${GRAY};word-break:break-all;">${escapeHtml(url)}</p>
  </div>`;
}

export function buildResultEmail({ name, email, score, total, level, speaking = null, resultUrl = null }) {
  const safeName = escapeHtml(name);
  const waLink = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
    `Halo Admin Titik Nol, saya ${name}. Saya baru selesai mengerjakan Placement Test dengan hasil ${level.label} (${score} dari ${total}) dan ingin berkonsultasi tentang program yang sesuai.`,
  )}`;

  const subject = `Hasil Placement Test Kamu: ${level.label} (${score}/${total})${speaking ? `, Speaking ${speaking.cefr}` : ""}`;

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${NAVY};">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:${NAVY};border-radius:16px 16px 0 0;padding:28px 32px;">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${YELLOW};font-weight:700;">Titik Nol English Course</div>
      <h1 style="margin:8px 0 0;font-size:26px;line-height:1.2;color:#FFFFFF;font-weight:800;">Hasil Placement Test</h1>
    </div>
    <div style="background:#FFFFFF;border:1px solid ${BORDER};border-top:0;border-radius:0 0 16px 16px;padding:32px;">
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Halo ${safeName},</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${GRAY};">
        Terima kasih sudah mengerjakan Placement Test. Berikut hasil yang kami hitung dari jawaban kamu.
      </p>

      <div style="background:${SURFACE};border:1px solid ${BORDER};border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${GRAY};font-weight:700;">Level kamu</div>
        <div style="margin:8px 0 4px;font-size:30px;line-height:1.2;font-weight:800;color:${NAVY};">${escapeHtml(level.label)}</div>
        <div style="display:inline-block;background:${RED};color:#FFFFFF;border-radius:999px;padding:6px 16px;font-size:14px;font-weight:700;margin-top:8px;">
          Skor ${score} dari ${total}
        </div>
      </div>

      ${speakingHtml(speaking)}
      ${resultLinkHtml(resultUrl)}
      <p style="margin:0 0 20px;font-size:16px;line-height:1.65;">${escapeHtml(level.description)}</p>

      <div style="background:${YELLOW_LIGHT};border:1px solid ${BORDER};border-radius:12px;padding:16px 20px;margin:0 0 28px;">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${GRAY};font-weight:700;">Rekomendasi</div>
        <div style="font-size:18px;font-weight:700;color:${NAVY};margin-top:4px;">${escapeHtml(level.program)}</div>
      </div>

      <a href="${waLink}" style="display:block;background:${NAVY};color:#FFFFFF;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 24px;border-radius:999px;">
        Konsultasi Program via WhatsApp
      </a>

      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${GRAY};">
        Hasil ini dipakai untuk penempatan kelas dan bukan sertifikat resmi.
        Kalau ada yang ingin kamu tanyakan, balas email ini atau hubungi WhatsApp +62 823-3314-3544.
      </p>
    </div>
    <div style="padding:20px 8px;text-align:center;font-size:12px;line-height:1.6;color:${GRAY};">
      Titik Nol English Course<br>
      ${escapeHtml(CAMPUS_ADDRESS)}<br>
      <span style="color:${NAVY_700};">titiknolenglish.com</span>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `Halo ${name},`,
    "",
    "Terima kasih sudah mengerjakan Placement Test Titik Nol English Course.",
    "",
    `Level kamu: ${level.label}`,
    `Skor: ${score} dari ${total}`,
    ...speakingText(speaking),
    ...(resultUrl ? ["", `Hasil lengkap kamu: ${resultUrl}`] : []),
    "",
    level.description,
    "",
    `Rekomendasi: ${level.program}`,
    "",
    `Konsultasi via WhatsApp: https://wa.me/${WHATSAPP}`,
    "",
    "Hasil ini dipakai untuk penempatan kelas dan bukan sertifikat resmi.",
    "",
    "Titik Nol English Course",
    CAMPUS_ADDRESS,
    "titiknolenglish.com",
  ].join("\n");

  return { subject, html, text };
}

/** The invite email for the bulk mockup sessions, in the same shell as the result email. */
export function buildInviteEmail({ name, sessionName, schedule, link, code, deadline }) {
  const safeName = escapeHtml(name);
  const subject = `Undangan IELTS Mockup: ${sessionName}`;

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${NAVY};">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:${NAVY};border-radius:16px 16px 0 0;padding:28px 32px;">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${YELLOW};font-weight:700;">Titik Nol English Course</div>
      <h1 style="margin:8px 0 0;font-size:26px;line-height:1.2;color:#FFFFFF;font-weight:800;">Undangan IELTS Mockup</h1>
    </div>
    <div style="background:#FFFFFF;border:1px solid ${BORDER};border-top:0;border-radius:0 0 16px 16px;padding:32px;">
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Halo ${safeName},</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${GRAY};">
        Berikut tautan dan kode tes kamu untuk IELTS Mockup ${escapeHtml(sessionName)}. Tautan dan kode ini hanya untuk kamu.
      </p>

      <div style="background:${SURFACE};border:1px solid ${BORDER};border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${GRAY};font-weight:700;">Jadwal kamu</div>
        <div style="margin:8px 0;font-size:17px;line-height:1.5;font-weight:700;color:${NAVY};">${escapeHtml(schedule)}</div>
        <div style="font-size:13px;line-height:1.5;color:${GRAY};">Tes hanya bisa dibuka ${escapeHtml(deadline)}.</div>
      </div>

      <div style="margin:0 0 24px;border:1px solid ${BORDER};border-radius:12px;padding:20px 24px;text-align:center;">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${GRAY};font-weight:700;">Kode tes kamu</div>
        <div style="margin:8px 0;font-size:28px;letter-spacing:.18em;font-weight:800;color:${NAVY};">${escapeHtml(code)}</div>
      </div>

      <a href="${escapeHtml(link)}" style="display:block;background:${NAVY};color:#FFFFFF;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 24px;border-radius:999px;">Buka tautan tes</a>
      <p style="margin:12px 0 24px;font-size:12px;line-height:1.5;color:${GRAY};word-break:break-all;">${escapeHtml(link)}</p>

      <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:${GRAY};">
        Siapkan headset atau speaker, pastikan koneksi internet stabil, dan kerjakan tes di tempat yang tenang.
        Kalau ada yang ingin kamu tanyakan, balas email ini atau hubungi WhatsApp +62 823-3314-3544.
      </p>
    </div>
    <div style="padding:20px 8px;text-align:center;font-size:12px;line-height:1.6;color:${GRAY};">
      Titik Nol English Course<br>
      ${escapeHtml(CAMPUS_ADDRESS)}<br>
      <span style="color:${NAVY_700};">titiknolenglish.com</span>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `Halo ${name},`,
    "",
    `Berikut tautan dan kode tes kamu untuk IELTS Mockup ${sessionName}.`,
    "",
    `Jadwal kamu: ${schedule}`,
    `Tautan tes: ${link}`,
    `Kode tes: ${code}`,
    "",
    `Tautan dan kode ini hanya untuk kamu. Tes hanya bisa dibuka ${deadline}.`,
    "Siapkan headset atau speaker, pastikan koneksi stabil, dan kerjakan di tempat yang tenang.",
    "",
    "Titik Nol English Course",
    CAMPUS_ADDRESS,
    "titiknolenglish.com",
  ].join("\n");

  return { subject, html, text };
}

/** The certificate email: a short note with the PDF attached by the caller. */
export function buildCertificateEmail({ name, typeName, number }) {
  const safeName = escapeHtml(name);
  const subject = `${typeName} kamu dari Titik Nol English Course`;
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${NAVY};">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:${NAVY};border-radius:16px 16px 0 0;padding:28px 32px;">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${YELLOW};font-weight:700;">Titik Nol English Course</div>
      <h1 style="margin:8px 0 0;font-size:26px;line-height:1.2;color:#FFFFFF;font-weight:800;">${escapeHtml(typeName)}</h1>
    </div>
    <div style="background:#FFFFFF;border:1px solid ${BORDER};border-top:0;border-radius:0 0 16px 16px;padding:32px;">
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Halo ${safeName},</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${GRAY};">
        Selamat! Sertifikat ${escapeHtml(typeName)} kamu sudah terbit dengan nomor
        <strong style="color:${NAVY};">${escapeHtml(number)}</strong>.
        Filenya terlampir di email ini, silakan disimpan dan dicetak kalau diperlukan.
      </p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:${GRAY};">
        Kalau ada yang ingin kamu tanyakan, balas email ini atau hubungi WhatsApp +62 823-3314-3544.
      </p>
    </div>
    <div style="padding:20px 8px;text-align:center;font-size:12px;line-height:1.6;color:${GRAY};">
      Titik Nol English Course<br>
      ${escapeHtml(CAMPUS_ADDRESS)}<br>
      <span style="color:${NAVY_700};">titiknolenglish.com</span>
    </div>
  </div>
</body>
</html>`;
  const text = [
    `Halo ${name},`,
    "",
    `Selamat! Sertifikat ${typeName} kamu sudah terbit dengan nomor ${number}. Filenya terlampir di email ini.`,
    "",
    "Titik Nol English Course",
    CAMPUS_ADDRESS,
    "titiknolenglish.com",
  ].join("\n");
  return { subject, html, text };
}

/** The mockup completion email: the bands a student can already see on the result page, sent
 *  right after the whole mockup including the speaking is done. overall may be null while the
 *  speaking is still being scored; the email then says the band follows on the result page. */
export function buildMockupDoneEmail({ name, overall, skills, resultUrl, speakingPending, certificateNumber }) {
  const safeName = escapeHtml(name);
  const band = overall !== null && overall !== undefined ? String(overall) : "-";
  const subject = "IELTS Mockup kamu sudah selesai";
  const row = (label, value) => value === null || value === undefined
    ? `<tr><td style="padding:10px 12px;border-bottom:1px solid ${BORDER};font-size:14px;color:${GRAY};">${label}</td><td style="padding:10px 12px;border-bottom:1px solid ${BORDER};font-size:14px;font-weight:700;color:${NAVY};text-align:right;">-</td></tr>`
    : `<tr><td style="padding:10px 12px;border-bottom:1px solid ${BORDER};font-size:14px;color:${GRAY};">${label}</td><td style="padding:10px 12px;border-bottom:1px solid ${BORDER};font-size:14px;font-weight:700;color:${NAVY};text-align:right;">${escapeHtml(String(value))}</td></tr>`;
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${NAVY};">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:${NAVY};border-radius:16px 16px 0 0;padding:28px 32px;">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${YELLOW};font-weight:700;">Titik Nol English Course</div>
      <h1 style="margin:8px 0 0;font-size:26px;line-height:1.2;color:#FFFFFF;font-weight:800;">IELTS Mockup selesai</h1>
    </div>
    <div style="background:#FFFFFF;border:1px solid ${BORDER};border-top:0;border-radius:0 0 16px 16px;padding:32px;">
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Halo ${safeName},</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${GRAY};">
        Terima kasih sudah menyelesaikan IELTS Mockup dari awal sampai akhir. Berikut ringkasan hasil kamu.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
        ${row("Listening", skills?.find((s) => s.skill === "Listening")?.band)}
        ${row("Reading", skills?.find((s) => s.skill === "Reading")?.band)}
        ${row("Writing", skills?.find((s) => s.skill === "Writing")?.band)}
        ${row("Speaking", skills?.find((s) => s.skill === "Speaking")?.band)}
        <tr><td style="padding:12px;font-size:15px;font-weight:800;color:${NAVY};">Overall</td><td style="padding:12px;font-size:18px;font-weight:800;color:${NAVY};text-align:right;">${escapeHtml(band)}</td></tr>
      </table>
      ${speakingPending ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:${GRAY};">Band speaking kamu masih diproses dan akan muncul di halaman hasil dalam beberapa menit.</p>` : ""}
      ${certificateNumber ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:${NAVY};font-weight:600;">Sertifikat IELTS Prediction kamu sudah terbit dengan nomor ${escapeHtml(certificateNumber)} dan terlampir di email ini.</p>` : ""}
      <a href="${escapeHtml(resultUrl)}" style="display:block;background:${NAVY};color:#FFFFFF;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 24px;border-radius:999px;">Lihat hasil lengkap</a>
      <p style="margin:12px 0 20px;font-size:12px;line-height:1.5;color:${GRAY};word-break:break-all;">${escapeHtml(resultUrl)}</p>
      <p style="margin:0 0 0;font-size:14px;line-height:1.65;color:${GRAY};">
        Band ini estimasi dari simulasi internal, bukan skor resmi IELTS. Balas email ini atau
        hubungi WhatsApp +62 823-3314-3544 kalau ingin membahas hasil kamu.
      </p>
    </div>
    <div style="padding:20px 8px;text-align:center;font-size:12px;line-height:1.6;color:${GRAY};">
      Titik Nol English Course<br>
      ${escapeHtml(CAMPUS_ADDRESS)}<br>
      <span style="color:${NAVY_700};">titiknolenglish.com</span>
    </div>
  </div>
</body>
</html>`;
  const lines = [
    `Halo ${name},`,
    "",
    "Terima kasih sudah menyelesaikan IELTS Mockup dari awal sampai akhir. Berikut ringkasan hasil kamu.",
    "",
    `Listening: ${skills?.find((s) => s.skill === "Listening")?.band ?? "-"}`,
    `Reading: ${skills?.find((s) => s.skill === "Reading")?.band ?? "-"}`,
    `Writing: ${skills?.find((s) => s.skill === "Writing")?.band ?? "-"}`,
    `Speaking: ${skills?.find((s) => s.skill === "Speaking")?.band ?? "-"}`,
    `Overall: ${band}`,
    ...(certificateNumber ? ["", `Sertifikat IELTS Prediction kamu sudah terbit dengan nomor ${certificateNumber} dan terlampir di email ini.`] : []),
    "",
    `Hasil lengkap: ${resultUrl}`,
    "",
    "Band ini estimasi dari simulasi internal, bukan skor resmi IELTS.",
    "",
    "Titik Nol English Course",
    CAMPUS_ADDRESS,
    "titiknolenglish.com",
  ].join("\n");
  return { subject, html, text: lines };
}
