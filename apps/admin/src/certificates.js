// Certificates for students: types with their own number format, issuing with a number that is
// never handed out twice, and the printable page built from the HTML templates in
// apps/admin/certificates. The number format rules are mirrored in assets/admin.js for the live
// preview in the dashboard; the number the server assigns is the one that counts.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError, json, readJson, nowSeconds, text } from "@tnec/core/http";
import { addActivity, newId } from "@tnec/core/store";
import { escapeHtml, buildCertificateEmail } from "@tnec/core/email";
import { randomToken } from "@tnec/core/crypto";
import { sendWhatsApp, whatsappConfigured } from "@tnec/core/whatsapp";
import { renderCertificatePdf } from "@tnec/core/certificate-pdf";

export const CERT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../certificates");

const WIB_OFFSET = 7 * 3600;
const MAX_NUMBER = 999999;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TOKEN = /\{([A-Za-z_]+)(?::(\d+))?\}/g;
const TOKENS = ["nomor", "kode", "bulan", "bulan_romawi", "tahun"];
export const RESETS = { tahun: "Setiap tahun", bulan: "Setiap bulan", tidak: "Tidak pernah" };

/* ===================== Templates ===================== */
// One HTML file per template in apps/admin/certificates. Every {{key}} in a file is a built-in
// value or one of that template's fields, and tests/smoke.mjs keeps the two lists in sync.
// A new certificate design is a new HTML file plus an entry here.
export const BUILT_IN_FIELDS = ["nomor", "nama", "tanggal", "penanda_tangan", "jabatan"];
export const TEMPLATES = {
  completion: {
    name: "Certificate of Completion",
    file: "certificate-of-completion.html",
    paper: "A4 potret",
    signer: { name: "Yosua Ignatius Manullang", role: "Chief Education Officer" },
    fields: [
      { key: "program", label: "Program dan level", sample: "General English, Level Intermediate", max: 80, wide: true },
      { key: "nilai_akhir", label: "Nilai akhir", sample: "87 / 100, Grade A", max: 40, wide: true },
      { key: "listening_nilai", label: "Nilai Listening", sample: "88", max: 10 },
      { key: "listening_grade", label: "Grade Listening", sample: "A", max: 4 },
      { key: "speaking_nilai", label: "Nilai Speaking", sample: "85", max: 10 },
      { key: "speaking_grade", label: "Grade Speaking", sample: "A", max: 4 },
      { key: "reading_nilai", label: "Nilai Reading", sample: "90", max: 10 },
      { key: "reading_grade", label: "Grade Reading", sample: "A", max: 4 },
      { key: "writing_nilai", label: "Nilai Writing", sample: "84", max: 10 },
      { key: "writing_grade", label: "Grade Writing", sample: "B", max: 4 },
      { key: "mulai", label: "Mulai belajar", type: "date", sample: "2026-08-12" },
      { key: "selesai", label: "Selesai belajar", type: "date", sample: "2026-11-15" },
    ],
  },
  toefl: {
    name: "TOEFL Prediction",
    file: "toefl-prediction.html",
    paper: "A4 lanskap",
    signer: { name: "Ufan Abdurrahman, S.Pd", role: "Kepala Akademik" },
    fields: [
      { key: "listening", label: "Listening Comprehension", sample: "52", max: 10 },
      { key: "structure", label: "Structure Comprehension", sample: "48", max: 10 },
      { key: "reading", label: "Reading Comprehension", sample: "55", max: 10 },
      { key: "skor_akhir", label: "Average Score", sample: "517", max: 10 },
    ],
  },
  ielts: {
    name: "IELTS Prediction",
    file: "ielts-prediction.html",
    paper: "A4 lanskap",
    signer: { name: "Yosua Ignatius Manullang", role: "Chief Education Officer" },
    fields: [
      { key: "writing", label: "Writing", sample: "6.5", max: 10 },
      { key: "speaking", label: "Speaking", sample: "7.0", max: 10 },
      { key: "skor_akhir", label: "IELTS Prediction Score", sample: "6.5", max: 10 },
    ],
  },
};

/* ===================== Dates ===================== */
export const isIsoDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))
  && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
export const todayIso = (sec = nowSeconds()) => new Date((sec + WIB_OFFSET) * 1000).toISOString().slice(0, 10);
const isoFromSeconds = (sec) => new Date((sec + WIB_OFFSET) * 1000).toISOString().slice(0, 10);
const secondsFromIso = (iso) => Math.floor(Date.parse(`${iso}T08:00:00+07:00`) / 1000);
export function englishDate(iso) {
  if (!isIsoDate(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${EN_MONTHS[m - 1]} ${y}`;
}

/* ===================== Numbers ===================== */
/** The counter a certificate dated `iso` draws from: one per year, one per month, or one for all time. */
export function periodKey(reset, iso) {
  if (reset === "bulan") return iso.slice(0, 7);
  if (reset === "tidak") return "semua";
  return iso.slice(0, 4);
}

/** Fills a number format such as {nomor}/MoM/MKT/TNEC/{bulan_romawi}/{tahun}. */
export function formatCertificateNumber(format, { seq, code, iso }) {
  const month = Number(iso.slice(5, 7));
  return String(format).replace(TOKEN, (all, rawName, width) => {
    const name = rawName.toLowerCase();
    const digits = Math.min(Number(width) || 0, 8);
    if (name === "nomor") return String(seq).padStart(digits, "0");
    if (name === "kode") return code;
    if (name === "bulan") return String(month).padStart(digits, "0");
    if (name === "bulan_romawi") return ROMAN[month - 1];
    if (name === "tahun") return iso.slice(0, 4);
    return all;
  });
}

/** A format with its code filled in. Two types with the same pattern would hand out the same numbers. */
export function numberPattern(format, code) {
  return String(format).replace(TOKEN, (all, rawName, width) => {
    const name = rawName.toLowerCase();
    if (name === "kode") return code;
    return `{${name}${width === undefined ? "" : `:${Number(width)}`}}`;
  });
}

/** Explains why a number format cannot be used with a reset rule, or returns null when it can. */
export function numberFormatProblem(format, reset) {
  const f = String(format ?? "");
  if (!f.trim()) return "Format nomor wajib diisi.";
  if (f.length > 120) return "Format nomor maksimal 120 karakter.";
  const names = new Set();
  for (const [all, rawName, width] of f.matchAll(TOKEN)) {
    const name = rawName.toLowerCase();
    if (!TOKENS.includes(name)) return `${all} tidak dikenal. Pakai {nomor}, {kode}, {bulan}, {bulan_romawi}, atau {tahun}.`;
    if (width !== undefined) {
      if (name !== "nomor" && name !== "bulan") return "Jumlah digit hanya bisa dipakai di {nomor} dan {bulan}, misalnya {nomor:3}.";
      if (Number(width) < 1 || Number(width) > 8) return "Jumlah digit harus antara 1 dan 8, misalnya {nomor:3}.";
    }
    names.add(name);
  }
  if (!names.has("nomor")) return "Format perlu memuat {nomor} supaya setiap sertifikat punya nomor sendiri.";
  if (reset === "tahun" && !names.has("tahun")) return "Nomor kembali ke 1 setiap tahun, jadi format perlu memuat {tahun} supaya nomornya tidak kembar dengan tahun lalu.";
  if (reset === "bulan" && (!names.has("tahun") || !(names.has("bulan") || names.has("bulan_romawi")))) {
    return "Nomor kembali ke 1 setiap bulan, jadi format perlu memuat {tahun} serta {bulan} atau {bulan_romawi}.";
  }
  return null;
}

/* ===================== Data for the dashboard ===================== */
const parseDetails = (raw) => { try { return JSON.parse(raw || "{}"); } catch { return {}; } };

export async function certificateData(env) {
  const [types, counters, issued] = (await env.DB.batch([
    env.DB.prepare("SELECT * FROM certificate_types ORDER BY created_at, name"),
    env.DB.prepare("SELECT * FROM certificate_counters"),
    // The PDF bytes never travel with the bootstrap; only the fact that they exist.
    env.DB.prepare(`SELECT id, type_id, template, number, seq, period, student_id, recipient_name, issued_at, details,
            created_at, created_by, revoked_at, revoked_by, revoke_reason,
            (pdf IS NOT NULL) AS has_pdf, pdf_name, pdf_bytes, pdf_uploaded_at, pdf_uploaded_by,
            email_sent_at, email_sent_by, wa_sent_at, wa_sent_by
       FROM certificates ORDER BY issued_at DESC, created_at DESC LIMIT 5000`),
  ])).map((r) => r.results);
  return {
    templates: Object.entries(TEMPLATES).map(([key, t]) => ({ key, name: t.name, paper: t.paper, signer: t.signer, fields: t.fields })),
    types: types.map((t) => ({
      id: t.id, name: t.name, code: t.code, template: t.template, format: t.number_format, reset: t.reset_period,
      signerName: t.signer_name, signerRole: t.signer_role, status: t.status,
      counters: Object.fromEntries(counters.filter((c) => c.type_id === t.id).map((c) => [c.period, c.last_number])),
    })),
    issued: issued.map((c) => ({
      id: c.id, typeId: c.type_id, template: c.template, number: c.number, seq: c.seq, period: c.period, studentId: c.student_id, recipient: c.recipient_name,
      issuedAt: c.issued_at * 1000, issuedOn: isoFromSeconds(c.issued_at), details: parseDetails(c.details),
      createdAt: c.created_at * 1000, createdBy: c.created_by || "",
      revokedAt: c.revoked_at ? c.revoked_at * 1000 : null, revokedBy: c.revoked_by || "", revokeReason: c.revoke_reason || "",
      pdf: c.has_pdf ? { name: c.pdf_name || "sertifikat.pdf", bytes: c.pdf_bytes || 0, uploadedAt: c.pdf_uploaded_at ? c.pdf_uploaded_at * 1000 : null, uploadedBy: c.pdf_uploaded_by || "" } : null,
      emailSentAt: c.email_sent_at ? c.email_sent_at * 1000 : null, emailSentBy: c.email_sent_by || "",
      waSentAt: c.wa_sent_at ? c.wa_sent_at * 1000 : null, waSentBy: c.wa_sent_by || "",
    })),
  };
}

/* ===================== Certificate types ===================== */
export async function saveCertificateType(request, env, user, url, id) {
  const body = await readJson(request);
  const name = text(body.name, 80);
  const code = text(body.code, 20);
  const template = String(body.template || "");
  const format = String(body.format ?? "").trim();
  const reset = String(body.reset || "");
  const signerName = text(body.signerName, 80);
  const signerRole = text(body.signerRole, 80);
  const status = body.status === "nonaktif" ? "nonaktif" : "aktif";
  const hasLast = body.lastNumber !== undefined && body.lastNumber !== null && body.lastNumber !== "";
  const lastNumber = hasLast ? Number(body.lastNumber) : null;
  if (name.length < 2) throw new HttpError(400, "Nama sertifikat minimal 2 karakter.", { field: "name" });
  if (!code || /\s/.test(code)) throw new HttpError(400, "Kode wajib diisi tanpa spasi, misalnya COMP.", { field: "code" });
  if (!TEMPLATES[template]) throw new HttpError(400, "Pilih template sertifikat.", { field: "template" });
  if (!RESETS[reset]) throw new HttpError(400, "Pilih kapan nomor kembali ke 1.", { field: "reset" });
  const problem = numberFormatProblem(format, reset);
  if (problem) throw new HttpError(400, problem, { field: "format" });
  if (!signerName) throw new HttpError(400, "Nama penanda tangan wajib diisi.", { field: "signer" });
  if (!signerRole) throw new HttpError(400, "Jabatan penanda tangan wajib diisi.", { field: "role" });
  if (hasLast && (!Number.isInteger(lastNumber) || lastNumber < 0 || lastNumber > MAX_NUMBER)) {
    throw new HttpError(400, "Nomor terakhir harus angka bulat dari 0 sampai 999999.", { field: "last" });
  }

  const now = nowSeconds();
  const typeId = id || newId("ctp");
  const period = periodKey(reset, todayIso(now));
  await env.DB.transaction(async (tx) => {
    const others = (await tx.prepare("SELECT name, code, number_format FROM certificate_types WHERE id != ?").bind(typeId).all()).results;
    if (others.some((o) => o.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, "Jenis sertifikat dengan nama ini sudah ada.", { field: "name" });
    const clash = others.find((o) => numberPattern(o.number_format, o.code) === numberPattern(format, code));
    if (clash) throw new HttpError(409, `Kode dan format nomor ini sama dengan ${clash.name}, jadi nomornya bisa kembar. Pakai kode lain atau ubah formatnya.`, { field: "code" });
    if (id) {
      const updated = await tx.prepare(`UPDATE certificate_types SET name = ?, code = ?, template = ?, number_format = ?, reset_period = ?,
          signer_name = ?, signer_role = ?, status = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
        .bind(name, code, template, format, reset, signerName, signerRole, status, now, user.name, id).run();
      if (!updated.meta.changes) throw new HttpError(404, "Jenis sertifikat tidak ditemukan.");
    } else {
      await tx.prepare(`INSERT INTO certificate_types (id, name, code, template, number_format, reset_period, signer_name, signer_role, status, created_at, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(typeId, name, code, template, format, reset, signerName, signerRole, status, now, now, user.name).run();
    }
    if (hasLast) {
      // Lock this period's counter first, so nobody takes a number while it changes.
      await tx.prepare("INSERT INTO certificate_counters (type_id, period, last_number) VALUES (?, ?, 0) ON CONFLICT (type_id, period) DO NOTHING").bind(typeId, period).run();
      const counter = await tx.prepare("SELECT last_number FROM certificate_counters WHERE type_id = ? AND period = ? FOR UPDATE").bind(typeId, period).first();
      if (counter.last_number !== lastNumber) {
        const top = await tx.prepare("SELECT COALESCE(MAX(seq), 0) AS n FROM certificates WHERE type_id = ? AND period = ?").bind(typeId, period).first();
        if (lastNumber < top.n) throw new HttpError(409, `Nomor terakhir tidak bisa di bawah ${top.n}, karena nomor itu sudah terbit di periode ini.`, { field: "last" });
        await tx.prepare("UPDATE certificate_counters SET last_number = ? WHERE type_id = ? AND period = ?").bind(lastNumber, typeId, period).run();
      }
    }
  }).catch((error) => {
    // Two people saving the same new name at once: the unique index stops the second one.
    if (error.code === "23505") throw new HttpError(409, "Jenis sertifikat dengan nama ini sudah ada.", { field: "name" });
    throw error;
  });
  return json({ ok: true, id: typeId });
}

const TYPE_IN_USE = "Jenis ini sudah dipakai untuk menerbitkan sertifikat, jadi tidak bisa dihapus. Nonaktifkan saja supaya tidak muncul lagi.";

export async function deleteCertificateType(request, env, user, url, id) {
  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM certificates WHERE type_id = ?").bind(id).first();
  if (used.n) throw new HttpError(409, TYPE_IN_USE);
  const removed = await env.DB.prepare("DELETE FROM certificate_types WHERE id = ?").bind(id).run().catch((error) => {
    // A certificate issued between the check and the delete keeps the type through its foreign key.
    if (error.code === "23503") throw new HttpError(409, TYPE_IN_USE);
    throw error;
  });
  if (!removed.meta.changes) throw new HttpError(404, "Jenis sertifikat tidak ditemukan.");
  return json({ ok: true });
}

/* ===================== Issued certificates ===================== */
function readDetails(template, raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const f of template.fields) {
    const value = text(src[f.key], f.max || 80);
    if (!value) throw new HttpError(400, `${f.label} wajib diisi.`, { field: f.key });
    if (f.type === "date" && !isIsoDate(value)) throw new HttpError(400, `${f.label} perlu tanggal yang benar.`, { field: f.key });
    out[f.key] = value;
  }
  if (out.mulai && out.selesai && out.selesai < out.mulai) throw new HttpError(400, "Selesai belajar tidak boleh lebih awal dari mulai belajar.", { field: "selesai" });
  return out;
}

async function getCertificateRow(env, id) {
  const c = await env.DB.prepare("SELECT * FROM certificates WHERE id = ?").bind(id).first();
  if (!c) throw new HttpError(404, "Sertifikat tidak ditemukan.");
  return c;
}

export async function issueCertificate(request, env, user) {
  const body = await readJson(request);
  const type = await env.DB.prepare("SELECT * FROM certificate_types WHERE id = ?").bind(String(body.typeId || "")).first();
  if (!type) throw new HttpError(400, "Pilih jenis sertifikat.", { field: "type" });
  if (type.status !== "aktif") throw new HttpError(409, `${type.name} sedang nonaktif. Aktifkan dulu di Pengaturan sertifikat.`, { field: "type" });
  const template = TEMPLATES[type.template];
  if (!template) throw new HttpError(409, `Template untuk ${type.name} tidak ditemukan. Pilih template lain di Pengaturan sertifikat.`, { field: "type" });
  const student = await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(String(body.studentId || "")).first();
  if (!student) throw new HttpError(400, "Pilih siswa penerima sertifikat.", { field: "student" });
  const recipient = text(body.recipient, 80);
  if (recipient.length < 2) throw new HttpError(400, "Nama di sertifikat minimal 2 karakter.", { field: "recipient" });
  const iso = String(body.issuedOn || "");
  if (!isIsoDate(iso)) throw new HttpError(400, "Pilih tanggal terbit.", { field: "date" });
  // The signer is saved with the certificate, so a reprint shows who signed it then.
  const details = { ...readDetails(template, body.details), penanda_tangan: type.signer_name, jabatan: type.signer_role };
  const period = periodKey(type.reset_period, iso);
  const now = nowSeconds();
  const id = newId("crt");

  // Taking the number and saving the certificate happen together. If saving fails, the number
  // is given back, so the sequence never skips.
  const number = await env.DB.transaction(async (tx) => {
    const counter = await tx.prepare(`INSERT INTO certificate_counters (type_id, period, last_number) VALUES (?, ?, 1)
        ON CONFLICT (type_id, period) DO UPDATE SET last_number = certificate_counters.last_number + 1
        RETURNING last_number`).bind(type.id, period).first();
    const seq = counter.last_number;
    const num = formatCertificateNumber(type.number_format, { seq, code: type.code, iso });
    try {
      await tx.prepare(`INSERT INTO certificates (id, type_id, template, number, seq, period, student_id, recipient_name, issued_at, details, created_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, type.id, type.template, num, seq, period, student.id, recipient, secondsFromIso(iso), JSON.stringify(details), now, user.name).run();
    } catch (error) {
      if (error.code === "23505") {
        throw new HttpError(409, `Nomor ${num} sudah dipakai sertifikat lain. Ubah format nomor ${type.name} di Pengaturan sertifikat supaya setiap jenis dan periode punya nomor sendiri.`, { field: "type" });
      }
      throw error;
    }
    await addActivity({ DB: tx }, student.id, "sertifikat", `Menerbitkan ${type.name} nomor ${num}.`, user.name, { certificateId: id }, now).run();
    return num;
  });
  return json({ ok: true, id, number });
}

export async function updateCertificate(request, env, user, url, id) {
  const body = await readJson(request);
  const c = await getCertificateRow(env, id);
  if (c.revoked_at) throw new HttpError(409, "Sertifikat yang dibatalkan tidak bisa diubah. Pulihkan dulu kalau masih dipakai.");
  const template = TEMPLATES[c.template];
  if (!template) throw new HttpError(409, "Template sertifikat ini sudah tidak ada, jadi datanya tidak bisa diubah.");
  const recipient = text(body.recipient, 80);
  if (recipient.length < 2) throw new HttpError(400, "Nama di sertifikat minimal 2 karakter.", { field: "recipient" });
  const old = parseDetails(c.details);
  const details = { ...readDetails(template, body.details), penanda_tangan: old.penanda_tangan ?? "", jabatan: old.jabatan ?? "" };
  const now = nowSeconds();
  const statements = [
    // The stored PDF shows the old name or scores, so the next send renders it again.
    env.DB.prepare("UPDATE certificates SET recipient_name = ?, details = ?, pdf = NULL, pdf_name = NULL, pdf_bytes = NULL, updated_at = ?, updated_by = ? WHERE id = ?")
      .bind(recipient, JSON.stringify(details), now, user.name, id),
  ];
  if (c.student_id) statements.push(addActivity(env, c.student_id, "sertifikat", `Mengubah data sertifikat nomor ${c.number}.`, user.name, { certificateId: id }, now));
  await env.DB.batch(statements);
  return json({ ok: true, number: c.number });
}

export async function certificateAction(request, env, user, url, id, action) {
  const body = await readJson(request);
  const c = await getCertificateRow(env, id);
  const now = nowSeconds();
  const statements = [];
  if (action === "revoke") {
    if (c.revoked_at) return json({ ok: true });
    const reason = text(body.reason, 200) || null;
    statements.push(env.DB.prepare("UPDATE certificates SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE id = ?").bind(now, user.name, reason, id));
    if (c.student_id) statements.push(addActivity(env, c.student_id, "sertifikat", `Membatalkan sertifikat nomor ${c.number}.${reason ? ` Alasan: ${reason}` : ""}`, user.name, { certificateId: id }, now));
  } else {
    if (!c.revoked_at) return json({ ok: true });
    statements.push(env.DB.prepare("UPDATE certificates SET revoked_at = NULL, revoked_by = NULL, revoke_reason = NULL WHERE id = ?").bind(id));
    if (c.student_id) statements.push(addActivity(env, c.student_id, "sertifikat", `Memulihkan sertifikat nomor ${c.number}.`, user.name, { certificateId: id }, now));
  }
  await env.DB.batch(statements);
  return json({ ok: true });
}

/* ===================== Sending the certificate to the student ===================== */
// The PDF is composed by @react-pdf/renderer inside this Node process, per
// docs/prd-certificate-pdf-react.md, at the moment the team presses send. No browser, no
// external service. The upload stays as an override for a hand-made file. The WhatsApp send
// needs a URL AttCos can fetch, so the row carries a random token and the admin app serves
// the file at /cert-file/<token>.

const PDF_MAX_BYTES = 5 * 1024 * 1024;

/** Composes the certificate PDF with @react-pdf/renderer, stores it on the row, and returns the
 *  row with the bytes. A failed render is a clear 5xx, and the team can still upload a PDF by
 *  hand. */
async function generateCertificatePdf(env, c, user) {
  const template = TEMPLATES[c.template];
  if (!template) throw new HttpError(409, "Template sertifikat ini tidak ditemukan, jadi PDF-nya tidak bisa dibuat.");
  let pdf;
  try {
    pdf = Buffer.from(await renderCertificatePdf(c.template, certificateValues(c, template, parseDetails(c.details))));
  } catch (error) {
    throw new HttpError(500, `PDF sertifikat gagal dibuat: ${String(error.message || error).slice(0, 160)}. Unggah PDF-nya dari halaman cetak kalau masih perlu dikirim.`);
  }
  if (pdf.length < 4 || pdf.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw new HttpError(502, "Penyusun PDF mengirim berkas yang bukan PDF. Coba lagi.");
  }
  if (pdf.length > PDF_MAX_BYTES) throw new HttpError(502, "PDF hasil render lebih dari 5 MB, jadi tidak disimpan. Periksa template sertifikatnya.");
  const name = `${c.number.replace(/[^\w-]+/g, "-")}.pdf`;
  // The token is minted once and kept, so earlier links stay valid when the file is replaced.
  const token = c.pdf_token || randomToken(24);
  await env.DB.prepare("UPDATE certificates SET pdf = ?, pdf_name = ?, pdf_bytes = ?, pdf_token = ?, pdf_uploaded_at = ?, pdf_uploaded_by = ? WHERE id = ?")
    .bind(pdf, name, pdf.length, token, nowSeconds(), user?.name || "Sistem", c.id).run();
  return { ...c, pdf, pdf_name: name, pdf_bytes: pdf.length, pdf_token: token };
}

async function ensureCertificatePdf(env, c, user) {
  return c.pdf ? c : generateCertificatePdf(env, c, user);
}

export async function uploadCertificatePdf(request, env, user, url, id) {
  const c = await getCertificateRow(env, id);
  if (c.revoked_at) throw new HttpError(409, "Sertifikat yang dibatalkan tidak bisa dikirim. Pulihkan dulu kalau masih dipakai.");
  const pdf = Buffer.from(await request.bytes());
  if (pdf.length < 4 || pdf.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw new HttpError(400, "Berkas ini bukan PDF. Simpan halaman cetaknya sebagai PDF dulu, lalu unggah berkas itu.");
  }
  if (pdf.length > PDF_MAX_BYTES) throw new HttpError(413, "PDF sertifikat maksimal 5 MB.");
  const name = text(url.searchParams.get("name") || `${c.number.replace(/[^\w-]+/g, "-")}.pdf`, 120) || "sertifikat.pdf";
  const now = nowSeconds();
  // The token is minted once and kept, so earlier links stay valid when the file is replaced.
  const token = c.pdf_token || randomToken(24);
  await env.DB.prepare(`UPDATE certificates SET pdf = ?, pdf_name = ?, pdf_bytes = ?, pdf_token = ?, pdf_uploaded_at = ?, pdf_uploaded_by = ? WHERE id = ?`)
    .bind(pdf, name, pdf.length, token, now, user.name, id).run();
  return json({ ok: true, token, name, bytes: pdf.length });
}

/** Serves the uploaded PDF behind the unguessable token, for AttCos to fetch. No session. */
export async function certificatePdfByToken(env, token) {
  const c = await env.DB.prepare("SELECT pdf, pdf_name FROM certificates WHERE pdf_token = ?").bind(String(token || "")).first();
  if (!c?.pdf) return null;
  return new Response(c.pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${(c.pdf_name || "sertifikat.pdf").replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function studentOfCertificate(env, c) {
  if (!c.student_id) throw new HttpError(409, "Sertifikat ini tidak terhubung ke siswa mana pun, jadi tidak ada tujuan pengiriman.");
  const s = await env.DB.prepare("SELECT id, name, email, whatsapp FROM students WHERE id = ?").bind(c.student_id).first();
  if (!s) throw new HttpError(409, "Data siswa penerima sudah dihapus, jadi sertifikat ini tidak bisa dikirim.");
  return s;
}

function requireSendable(c) {
  if (c.revoked_at) throw new HttpError(409, "Sertifikat yang dibatalkan tidak bisa dikirim. Pulihkan dulu kalau masih dipakai.");
}

export async function sendCertificateEmail(request, env, user, url, id) {
  const c = await getCertificateRow(env, id);
  requireSendable(c);
  const s = await studentOfCertificate(env, c);
  if (!s.email) throw new HttpError(409, "Siswa ini belum punya alamat email. Lengkapi dulu di profilnya.");
  if (!env.SEND_EMAIL) throw new HttpError(503, "Pengiriman email belum diatur di server ini.");
  const withPdf = await ensureCertificatePdf(env, c, user);
  const type = await env.DB.prepare("SELECT name FROM certificate_types WHERE id = ?").bind(c.type_id).first();
  const mail = buildCertificateEmail({ name: c.recipient_name, typeName: type?.name || "Sertifikat", number: c.number });
  try {
    await env.SEND_EMAIL.send({
      from: env.RESULT_FROM_EMAIL || "Titik Nol English Course <placement@index-now.dev>",
      to: s.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: [{ content: withPdf.pdf.toString("base64"), filename: withPdf.pdf_name || "sertifikat.pdf" }],
    });
  } catch (error) {
    throw new HttpError(502, `Email sertifikat gagal terkirim: ${String(error.message || error).slice(0, 160)}`);
  }
  const now = nowSeconds();
  const statements = [
    env.DB.prepare("UPDATE certificates SET email_sent_at = ?, email_sent_by = ? WHERE id = ?").bind(now, user.name, id),
    addActivity(env, s.id, "sertifikat", `Mengirim sertifikat nomor ${c.number} ke email ${s.email}.`, user.name, { certificateId: id }, now),
  ];
  await env.DB.batch(statements);
  return json({ ok: true, email: s.email });
}

export async function sendCertificateWhatsApp(request, env, user, url, id) {
  const c = await getCertificateRow(env, id);
  requireSendable(c);
  const s = await studentOfCertificate(env, c);
  if (!s.whatsapp) throw new HttpError(409, "Siswa ini belum punya nomor WhatsApp. Lengkapi dulu di profilnya.");
  if (!whatsappConfigured(env)) throw new HttpError(503, "Integrasi WhatsApp belum diatur di server ini.");
  const withPdf = await ensureCertificatePdf(env, c, user);
  // AttCos fetches the document from this public, unguessable link.
  const fileUrl = `${url.origin}/cert-file/${withPdf.pdf_token}`;
  const first = String(c.recipient_name || s.name).trim().split(/\s+/)[0];
  const message = `Halo ${first}, ini sertifikat kamu dari Titik Nol English Course. Filenya terlampir, silakan disimpan.`;
  const result = await sendWhatsApp(env, {
    to: s.whatsapp,
    text: message,
    media: { kind: "document", url: fileUrl, filename: withPdf.pdf_name || "sertifikat.pdf" },
  });
  const now = nowSeconds();
  const statements = [
    env.DB.prepare("INSERT INTO wa_messages (student_id, to_number, text, status, provider_message_id, error, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(s.id, s.whatsapp, message, result.status, result.messageId || null, result.error || null, now, user.name),
  ];
  if (result.ok) {
    statements.push(env.DB.prepare("UPDATE certificates SET wa_sent_at = ?, wa_sent_by = ? WHERE id = ?").bind(now, user.name, id));
    statements.push(addActivity(env, s.id, "sertifikat", `Mengirim sertifikat nomor ${c.number} lewat WhatsApp.`, user.name, { certificateId: id }, now));
  } else {
    statements.push(addActivity(env, s.id, "sertifikat", `Pengiriman WhatsApp sertifikat nomor ${c.number} gagal. ${result.error}`, user.name, { certificateId: id }, now));
  }
  await env.DB.batch(statements);
  if (!result.ok) throw new HttpError(result.status === "skipped" ? 503 : 502, result.error);
  return json({ ok: true });
}

/* ===================== Printable page ===================== */
const PAGE_HEAD = `<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/admin/assets/certificate-page.css?v=4">
<script src="/admin/assets/certificate-page.js?v=4" defer></script>`;

function fillTemplate(html, values) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(values[key] ?? ""));
}

function barHtml({ info, note, back, send = null }) {
  const sendHtml = send ? `
  <div class="cert-send" data-cert-id="${send.id}" data-pdf="${send.hasPdf ? "1" : "0"}">
    <span class="cert-send__state" id="cert-pdf-state">${send.hasPdf ? `PDF tersimpan: ${escapeHtml(send.pdfName)}` : "PDF dibuat otomatis saat dikirim."}</span>
    ${send.email ? `<button class="cert-send__btn" type="button" id="cert-send-email">${send.emailSentAt ? "Kirim ulang email" : "Kirim email"} ke ${escapeHtml(send.email)}</button>` : ""}
    ${send.whatsapp ? `<button class="cert-send__btn" type="button" id="cert-send-wa">Kirim WhatsApp ke ${escapeHtml(send.whatsapp)}</button>` : ""}
    <label class="cert-send__upload"><input type="file" id="cert-pdf-input" accept="application/pdf,.pdf" hidden /> ${send.hasPdf ? "Ganti PDF" : "Unggah PDF sendiri"}</label>
  </div>` : "";
  return `<div class="cert-bar" role="region" aria-label="Aksi sertifikat">
  <a class="cert-bar__back" href="${back}">Kembali ke dasbor</a>
  <p class="cert-bar__info">${info}</p>
  <button class="cert-bar__print" type="button" id="cert-print">Cetak atau simpan PDF</button>${sendHtml}
</div>
<p class="cert-note">${note}</p>`;
}

/** Builds the certificate page from its template. Every value is escaped before it goes in. */
export async function renderCertificateHtml({ templateKey, values, title, info, note, back, revoked = false, send = null }) {
  const template = TEMPLATES[templateKey];
  if (!template) return null;
  let html = fillTemplate(await readFile(resolve(CERT_DIR, template.file), "utf8"), values);
  // Replacement functions keep a "$" in a name or number from being read as a pattern.
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(title)}</title>`);
  html = html.replace("</head>", () => `${PAGE_HEAD}\n</head>`);
  html = html.replace(/<body[^>]*>/, () => `<body class="cert-view${revoked ? " is-revoked" : ""}">\n${barHtml({ info, note, back, send })}`);
  if (revoked) html = html.replace(/<div class="sheet[^"]*">/, (open) => `${open}\n  <div class="cert-void" aria-hidden="true">DIBATALKAN</div>`);
  return html;
}

function templateValues(template, source) {
  const values = {};
  for (const f of template.fields) values[f.key] = f.type === "date" ? englishDate(source[f.key] || "") : source[f.key] ?? "";
  return values;
}

/** The values a certificate's template needs, from the row and its stored details. */
function certificateValues(c, template, details) {
  return {
    ...templateValues(template, details),
    nomor: c.number, nama: c.recipient_name, tanggal: englishDate(isoFromSeconds(c.issued_at)),
    penanda_tangan: details.penanda_tangan ?? "", jabatan: details.jabatan ?? "",
  };
}

/** The page for an issued certificate (crt_...) or a sample of a certificate type (ctp_...). */
export async function certificatePage(env, id) {
  if (id.startsWith("ctp_")) {
    const type = await env.DB.prepare("SELECT * FROM certificate_types WHERE id = ?").bind(id).first();
    const template = type && TEMPLATES[type.template];
    if (!template) return null;
    const iso = todayIso();
    const counter = await env.DB.prepare("SELECT last_number FROM certificate_counters WHERE type_id = ? AND period = ?").bind(type.id, periodKey(type.reset_period, iso)).first();
    const number = formatCertificateNumber(type.number_format, { seq: (counter?.last_number || 0) + 1, code: type.code, iso });
    const sample = Object.fromEntries(template.fields.map((f) => [f.key, f.sample]));
    return renderCertificateHtml({
      templateKey: type.template,
      values: { ...templateValues(template, sample), nomor: number, nama: "Rani Puspita", tanggal: englishDate(iso), penanda_tangan: type.signer_name, jabatan: type.signer_role },
      title: `Contoh ${type.name}`,
      info: `Contoh ${escapeHtml(type.name)} dengan nomor berikutnya`,
      note: "Nama dan nilai di halaman ini hanya contoh. Nomornya adalah nomor yang akan dipakai sertifikat berikutnya.",
      back: "/admin/#/sertifikat/pengaturan",
    });
  }
  const c = await env.DB.prepare("SELECT c.*, t.name AS type_name FROM certificates c JOIN certificate_types t ON t.id = c.type_id WHERE c.id = ?").bind(id).first();
  const template = c && TEMPLATES[c.template];
  if (!template) return null;
  const details = parseDetails(c.details);
  const revoked = Boolean(c.revoked_at);
  // The send controls appear only on a real, valid certificate with a student to send to.
  const student = !revoked && c.student_id
    ? await env.DB.prepare("SELECT email, whatsapp FROM students WHERE id = ?").bind(c.student_id).first()
    : null;
  const send = student ? {
    id: c.id,
    hasPdf: Boolean(c.pdf),
    pdfName: c.pdf_name || "sertifikat.pdf",
    email: student.email || "",
    whatsapp: student.whatsapp ? `0${String(student.whatsapp).replace(/^62/, "")}` : "",
    emailSentAt: Boolean(c.email_sent_at),
  } : null;
  return renderCertificateHtml({
    templateKey: c.template,
    values: certificateValues(c, template, details),
    title: `${c.recipient_name}, ${c.type_name}`,
    info: `${escapeHtml(c.type_name)} nomor ${escapeHtml(c.number)} untuk ${escapeHtml(c.recipient_name)}`,
    note: revoked
      ? "Sertifikat ini sudah dibatalkan, jadi hasil cetaknya bertanda DIBATALKAN."
      : "Di jendela cetak, pilih ukuran A4, margin None, dan nyalakan Background graphics supaya warnanya ikut tercetak.",
    back: c.student_id ? `/admin/#/siswa/${encodeURIComponent(c.student_id)}` : "/admin/#/sertifikat",
    revoked,
    send,
  });
}
