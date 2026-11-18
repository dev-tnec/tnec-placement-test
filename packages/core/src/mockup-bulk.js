// Pure rules for the bulk mockup import (docs/prd-ielts-mockup-bulk.md): the CSV parser, the
// test window per student, the invite message copy, and the shared email quota. The admin API
// and the invite queue worker both build on these, and tests/smoke.mjs checks them without a
// database.

import { normalizeWhatsapp, isEmail } from "./http.js";

/** The Cloudflare email account sends about 200 mails a day, shared with the result emails. */
export const EMAIL_DAILY_LIMIT = 200;

/** Same alphabet as the single invite dialog: no ambiguous letters, easy to read on a phone. */
export const MOCKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** One random 6 character invite code. Uniqueness is the caller's job: the DB check plus a
 *  per-import Set, because both need the database or the batch context this pure module lacks. */
export function mockupCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) code += MOCKUP_CODE_ALPHABET[Math.floor(Math.random() * MOCKUP_CODE_ALPHABET.length)];
  return code;
}

/** One package from a session's set, so students in one wave can sit different packages.
 *  The invite keeps the picked id, and grading follows the invite. Null when the set is empty;
 *  the callers refuse the import before that can happen. */
export function pickPackage(packageIds) {
  if (!packageIds?.length) return null;
  return packageIds[Math.floor(Math.random() * packageIds.length)];
}

export const MAX_IMPORT_ROWS = 500;

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const pad = (n) => String(n).padStart(2, "0");

/** A Unix seconds timestamp as an Indonesian Jakarta time line, for notices and messages. */
export function formatWib(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const d = new Date((seconds + 7 * 3600) * 1000);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}.${pad(d.getUTCMinutes())} WIB`;
}

/** A Jakarta date and time from the CSV as Unix seconds. */
export function jakartaEpoch(date, time) {
  const at = Date.parse(`${date}T${time}:00+07:00`);
  return Number.isNaN(at) ? null : Math.floor(at / 1000);
}

/* ---------- CSV ---------- */

/** One CSV line into fields, honoring double quotes around fields that contain commas. */
function splitCsvLine(line) {
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      out.push(field);
      field = "";
    } else field += c;
  }
  out.push(field);
  return out;
}

const HEADER_ALIASES = {
  nama: "nama", name: "nama",
  whatsapp: "whatsapp", wa: "whatsapp", nomor_whatsapp: "whatsapp", "nomor whatsapp": "whatsapp", no_whatsapp: "whatsapp",
  email: "email", surel: "email",
  tanggal_tes: "tanggal_tes", "tanggal tes": "tanggal_tes", date: "tanggal_tes",
  jam_tes: "jam_tes", "jam tes": "jam_tes", jam: "jam_tes", time: "jam_tes",
};

/**
 * Parses the roster CSV. `scheduled` true means the session is terjadwal and every row must
 * carry its own tanggal_tes and jam_tes; false means the session is fleksibel and date columns
 * are refused. Returns { fatal, rows } where each row carries its own errors, so the preview
 * can show everything at once.
 */
export function parseRosterCsv(csv, { scheduled, now = Math.floor(Date.now() / 1000) }) {
  const textIn = String(csv || "");
  if (!textIn.trim()) return { fatal: "Berkas kosong. Unduh template, lalu isi datanya.", rows: [] };
  const lines = textIn.split(/\r\n|\n|\r/).filter((l) => l.trim().length);
  if (!lines.length) return { fatal: "Berkas kosong. Unduh template, lalu isi datanya.", rows: [] };
  if (lines.length - 1 > MAX_IMPORT_ROWS) return { fatal: `Berkas melebihi ${MAX_IMPORT_ROWS} baris. Bagi menjadi beberapa impor.`, rows: [] };

  const header = splitCsvLine(lines[0]).map((h) => HEADER_ALIASES[h.trim().toLowerCase()] || null);
  if (!header.includes("nama") || !header.includes("whatsapp")) {
    return { fatal: "Baris header belum benar. Header wajib memuat kolom nama dan whatsapp.", rows: [] };
  }
  if (scheduled && (!header.includes("tanggal_tes") || !header.includes("jam_tes"))) {
    return { fatal: "Sesi ini terjadwal, jadi berkas wajib memuat kolom tanggal_tes dan jam_tes.", rows: [] };
  }
  if (!scheduled && (header.includes("tanggal_tes") || header.includes("jam_tes"))) {
    return { fatal: "Sesi ini fleksibel, jadi berkas tidak memuat kolom tanggal_tes dan jam_tes.", rows: [] };
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const get = (name) => {
      const at = header.indexOf(name);
      return at >= 0 ? String(cells[at] ?? "").trim() : "";
    };
    const row = {
      line: i + 1,
      name: get("nama").replace(/\s+/g, " "),
      wa: normalizeWhatsapp(get("whatsapp")),
      waRaw: get("whatsapp"),
      email: get("email").toLowerCase(),
      date: get("tanggal_tes"),
      time: get("jam_tes"),
      scheduledAt: null,
      errors: [],
    };
    if (row.name.length < 2) row.errors.push("Nama minimal 2 karakter.");
    if (!get("whatsapp")) row.errors.push("Nomor WhatsApp wajib diisi.");
    else if (!row.wa) row.errors.push("Nomor WhatsApp terlihat belum lengkap.");
    if (row.email && !isEmail(row.email)) row.errors.push("Format email belum benar.");
    if (scheduled) {
      if (!row.date || !row.time) row.errors.push("Tanggal dan jam tes wajib diisi untuk sesi terjadwal.");
      else {
        row.scheduledAt = jakartaEpoch(row.date, row.time);
        if (row.scheduledAt === null) row.errors.push("Tanggal atau jam tes belum benar. Contohnya 2026-11-20 dan 09:00.");
        else if (row.scheduledAt <= now) row.errors.push("Jadwal tes sudah lewat. Isi tanggal dan jam di masa depan.");
      }
    }
    rows.push(row);
  }
  // Duplicates inside the file itself would create two students or two invites for one person.
  const seen = new Map();
  for (const row of rows) {
    if (!row.wa) continue;
    const firstLine = seen.get(row.wa);
    if (firstLine) row.errors.push(`Nomor WhatsApp sama dengan baris ${firstLine}.`);
    else seen.set(row.wa, row.line);
  }
  return { fatal: null, rows };
}

/**
 * The test window of one student. Terjadwal: the window opens at the student's own date and
 * time and closes after the entry grace, so a late student can still start within it.
 * Fleksibel: every student shares the admin-set range.
 */
export function inviteWindow(session, scheduledAt) {
  if (session.windowMode === "fleksibel") {
    if (!session.rangeStart || !session.rangeEnd) return { error: "Rentang tanggal sesi belum diatur." };
    if (session.rangeEnd <= session.rangeStart) return { error: "Akhir rentang sesi harus setelah awalnya." };
    return { opensAt: session.rangeStart, expiresAt: session.rangeEnd };
  }
  if (!scheduledAt) return { error: "Jadwal siswa belum ada." };
  return { opensAt: scheduledAt, expiresAt: scheduledAt + (session.entryGraceSeconds || 7200) };
}

/** One line describing when this student may start, for the roster and the messages. */
export function scheduleLine({ windowMode, opensAt, expiresAt }) {
  if (windowMode === "fleksibel") return `${formatWib(opensAt)} sampai ${formatWib(expiresAt)}`;
  return `${formatWib(opensAt)} sampai ${formatWib(expiresAt)}`;
}

/** The invite message for WhatsApp, under 1,000 characters like the other messages. */
export function buildInviteWhatsApp({ firstName, sessionName, schedule, link, code, deadline }) {
  const text = [
    `Halo ${firstName}, ini undangan IELTS Mockup ${sessionName} dari Titik Nol English Course.`,
    "",
    `Jadwal kamu: ${schedule}`,
    `Tautan tes: ${link}`,
    `Kode tes: ${code}`,
    "",
    `Tautan dan kode ini hanya untuk kamu. Tes hanya bisa dibuka ${deadline}.`,
    "Siapkan headset atau speaker, pastikan koneksi stabil, dan kerjakan di tempat yang tenang.",
  ].join("\n");
  return text.length <= 1000 ? text : text.slice(0, 997) + "...";
}
