// The auto-issued IELTS Mockup certificate, per docs/prd-sertifikat-otomatis-mockup.md. When an
// attempt reaches its final state (submitted, writing graded, speaking final) this module issues the
// IELTS Prediction certificate with the attempt bands on its fields, composes the PDF, and records the
// certificate against the attempt so the completion notification can attach it. Idempotent: the
// unique certificates_attempt_key index makes a second run a silent skip.

import { nowSeconds } from "./http.js";
import { randomToken } from "./crypto.js";
import { formatCertificateNumber, periodKey } from "./certificate-number.js";
import { renderCertificatePdf } from "./certificate-pdf.js";

const WIB_OFFSET = 7 * 3600;

/** True when the attempt is done and can carry a certificate: submitted, writing settled, and
 *  speaking either final or not part of this test. A failed speaking holds the certificate. */
function attemptFinal(attempt, speaking) {
  if (attempt.status !== "submitted") return false;
  if (attempt.writing_status === "failed" || attempt.writing_status === "pending") return false;
  if (speaking === null) return true;
  return speaking === "graded" || speaking === "skipped";
}

/**
 * Issues the mockup certificate for one attempt when it is ready.
 * Returns { issued: true, number } on success, { issued: false, skipped: true, reason } when
 * conditions are not met, and throws only on unexpected database or render errors.
 */
export async function autoIssueMockupCertificate(env, attemptId, actorName = "Sistem") {
  const attempt = await env.DB.prepare(
    "SELECT id, test_key, status, student_id, bands, writing_status, speaking_status FROM attempts WHERE id = ?",
  ).bind(attemptId).first();
  if (!attempt || attempt.test_key !== "ielts-mockup") return { issued: false, skipped: true, reason: "bukan-mockup" };
  if (!attempt.student_id) return { issued: false, skipped: true, reason: "tanpa-siswa" };
  const existing = await env.DB.prepare("SELECT number FROM certificates WHERE attempt_id = ?").bind(attemptId).first();
  if (existing) return { issued: false, skipped: true, reason: "sudah-terbit", number: existing.number };
  if (!attemptFinal(attempt, attempt.speaking_status || null)) return { issued: false, skipped: true, reason: "belum-final" };

  const type = await env.DB.prepare("SELECT * FROM certificate_types WHERE template = 'ielts' AND status = 'aktif' ORDER BY id LIMIT 1").first();
  if (!type) return { issued: false, skipped: true, reason: "tipe-nonaktif" };

  const student = await env.DB.prepare("SELECT name FROM students WHERE id = ?").bind(attempt.student_id).first();
  if (!student) return { issued: false, skipped: true, reason: "tanpa-siswa" };

  const bands = attempt.bands ? JSON.parse(attempt.bands) : null;
  const band = (skill) => {
    const found = bands?.skills?.find((s) => s.skill === skill)?.band;
    return found === null || found === undefined ? "" : String(found);
  };
  const now = nowSeconds();
  const iso = new Date((now + WIB_OFFSET) * 1000).toISOString().slice(0, 10);
  const period = periodKey(type.reset_period, iso);
  const details = {
    writing: band("Writing"),
    speaking: band("Speaking"),
    skor_akhir: bands?.overall !== null && bands?.overall !== undefined ? String(bands.overall) : "",
    penanda_tangan: type.signer_name,
    jabatan: type.signer_role,
  };

  const id = `${type.id}-auto-${attemptId}`;
  // Taking the number and saving the certificate happen together. If saving fails, the number
  // is given back, so the sequence never skips. The unique attempt index is the idempotency guard.
  const number = await env.DB.transaction(async (tx) => {
    const already = await tx.prepare("SELECT number FROM certificates WHERE attempt_id = ?").bind(attemptId).first();
    if (already) return null;
    const counter = await tx.prepare(`INSERT INTO certificate_counters (type_id, period, last_number) VALUES (?, ?, 1)
        ON CONFLICT (type_id, period) DO UPDATE SET last_number = certificate_counters.last_number + 1
        RETURNING last_number`).bind(type.id, period).first();
    const num = formatCertificateNumber(type.number_format, { seq: counter.last_number, code: type.code, iso });
    await tx.prepare(`INSERT INTO certificates (id, type_id, template, number, seq, period, student_id, recipient_name, issued_at, details, attempt_id, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, type.id, type.template, num, counter.last_number, period, attempt.student_id, student.name,
        Math.floor(Date.parse(`${iso}T08:00:00+07:00`) / 1000), JSON.stringify(details), attemptId, now, actorName).run();
    return num;
  });
  if (number === null) return { issued: false, skipped: true, reason: "sudah-terbit" };

  // The PDF composes right away so the completion notification can attach it. A render failure
  // leaves the certificate issued and the notification still carries the number.
  let pdf = null;
  try {
    const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const [y, m, d] = iso.split("-").map(Number);
    const tanggal = `${d} ${EN_MONTHS[m - 1]} ${y}`;
    pdf = Buffer.from(await renderCertificatePdf(type.template, {
      nomor: number, nama: student.name,
      tanggal, writing: details.writing, speaking: details.speaking, skor_akhir: details.skor_akhir,
      penanda_tangan: type.signer_name, jabatan: type.signer_role,
    }));
    const token = randomToken(24);
    await env.DB.prepare("UPDATE certificates SET pdf = ?, pdf_name = ?, pdf_bytes = ?, pdf_token = ?, pdf_uploaded_at = ?, pdf_uploaded_by = ? WHERE id = ?")
      .bind(pdf, `${number.replace(/[^\w-]+/g, "-")}.pdf`, pdf.length, token, now, actorName, id).run();
  } catch (error) {
    console.error("auto certificate pdf failed", error);
  }
  return { issued: true, number, pdf };
}
