// Certificate number rules. This block mirrors apps/admin/src/certificates.js so the dialogs can
// show the next number while someone types. The server assigns the real number when a certificate
// is saved. tests/smoke.mjs reads the block between the two markers below and proves that both
// sides agree, so the markers must stay.
import { MONTHS_LONG } from "./lib.js";

/* ===================== certificate number rules (mirrors the server) ===================== */
export const CERT_RESETS = [["tahun", "Setiap tahun"], ["bulan", "Setiap bulan"], ["tidak", "Tidak pernah"]];
export const CERT_RESET_LABEL = Object.fromEntries(CERT_RESETS);
const CERT_TOKENS = ["nomor", "kode", "bulan", "bulan_romawi", "tahun"];
const CERT_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const certToken = () => /\{([A-Za-z_]+)(?::(\d+))?\}/g;
export function certPeriodKey(reset, iso) { return reset === "bulan" ? iso.slice(0, 7) : reset === "tidak" ? "semua" : iso.slice(0, 4); }
export function certPeriodLabel(reset, iso) {
  if (reset === "bulan") return `bulan ${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  return reset === "tidak" ? "seluruh waktu" : `tahun ${iso.slice(0, 4)}`;
}
export function formatCertNumber(format, seq, code, iso) {
  const month = Number(iso.slice(5, 7));
  return String(format).replace(certToken(), (all, raw, width) => {
    const name = raw.toLowerCase(), digits = Math.min(Number(width) || 0, 8);
    if (name === "nomor") return String(seq).padStart(digits, "0");
    if (name === "kode") return code;
    if (name === "bulan") return String(month).padStart(digits, "0");
    if (name === "bulan_romawi") return CERT_ROMAN[month - 1];
    if (name === "tahun") return iso.slice(0, 4);
    return all;
  });
}
export function certFormatProblem(format, reset) {
  const f = String(format || "");
  if (!f.trim()) return "Format nomor wajib diisi.";
  if (f.length > 120) return "Format nomor maksimal 120 karakter.";
  const names = new Set();
  for (const [all, raw, width] of f.matchAll(certToken())) {
    const name = raw.toLowerCase();
    if (!CERT_TOKENS.includes(name)) return `${all} tidak dikenal. Pakai {nomor}, {kode}, {bulan}, {bulan_romawi}, atau {tahun}.`;
    if (width !== undefined) {
      if (name !== "nomor" && name !== "bulan") return "Jumlah digit hanya bisa dipakai di {nomor} dan {bulan}, misalnya {nomor:3}.";
      if (Number(width) < 1 || Number(width) > 8) return "Jumlah digit harus antara 1 dan 8, misalnya {nomor:3}.";
    }
    names.add(name);
  }
  if (!names.has("nomor")) return "Format perlu memuat {nomor} supaya setiap sertifikat punya nomor sendiri.";
  if (reset === "tahun" && !names.has("tahun")) return "Nomor kembali ke 1 setiap tahun, jadi format perlu memuat {tahun} supaya nomornya tidak kembar dengan tahun lalu.";
  if (reset === "bulan" && (!names.has("tahun") || !(names.has("bulan") || names.has("bulan_romawi")))) return "Nomor kembali ke 1 setiap bulan, jadi format perlu memuat {tahun} serta {bulan} atau {bulan_romawi}.";
  return null;
}
/* ===================== end of the certificate number rules ===================== */
