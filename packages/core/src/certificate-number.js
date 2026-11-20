// The certificate number rules, shared by the admin app and the web app's auto-issuing worker so
// both hand out numbers from the same formats. Kept pure: no Node builtins, checked by tests/smoke.mjs.

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const TOKEN = /\{([A-Za-z_]+)(?::(\d+))?\}/g;

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
