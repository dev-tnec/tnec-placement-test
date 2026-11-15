// Result email. Inline styles only, because email clients drop external CSS.
// Palette mirrors the TNEC tokens in DESIGN.md.

import { CAMPUS_ADDRESS, WHATSAPP } from "./legal.js";

const NAVY = "#0A1B38";
const NAVY_700 = "#16325C";
const RED = "#E3201F";
const YELLOW = "#F7B500";
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

export function buildResultEmail({ name, email, score, total, level }) {
  const safeName = escapeHtml(name);
  const waLink = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
    `Halo Admin Titik Nol, saya ${name}. Saya baru selesai mengerjakan tes penempatan dengan hasil ${level.label} (${score} dari ${total}) dan ingin berkonsultasi tentang program yang sesuai.`,
  )}`;

  const subject = `Hasil Tes Penempatan Kamu: ${level.label} (${score}/${total})`;

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
      <h1 style="margin:8px 0 0;font-size:26px;line-height:1.2;color:#FFFFFF;font-weight:800;">Hasil Tes Penempatan</h1>
    </div>
    <div style="background:#FFFFFF;border:1px solid ${BORDER};border-top:0;border-radius:0 0 16px 16px;padding:32px;">
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Halo ${safeName},</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${GRAY};">
        Terima kasih sudah mengerjakan tes penempatan. Berikut hasil yang kami hitung dari jawaban kamu.
      </p>

      <div style="background:${SURFACE};border:1px solid ${BORDER};border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${GRAY};font-weight:700;">Level kamu</div>
        <div style="margin:8px 0 4px;font-size:30px;line-height:1.2;font-weight:800;color:${NAVY};">${escapeHtml(level.label)}</div>
        <div style="display:inline-block;background:${RED};color:#FFFFFF;border-radius:999px;padding:6px 16px;font-size:14px;font-weight:700;margin-top:8px;">
          Skor ${score} dari ${total}
        </div>
      </div>

      <p style="margin:0 0 20px;font-size:16px;line-height:1.65;">${escapeHtml(level.description)}</p>

      <div style="border-left:4px solid ${YELLOW};padding:4px 0 4px 16px;margin:0 0 28px;">
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
    "Terima kasih sudah mengerjakan tes penempatan Titik Nol English Course.",
    "",
    `Level kamu: ${level.label}`,
    `Skor: ${score} dari ${total}`,
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
