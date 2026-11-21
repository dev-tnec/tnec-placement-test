// WhatsApp sending through AttCos (CSQ API).
// POST {ATTCOS_API_BASE}/messages with a tenant API key. The key lives in the server's environment,
// never in the code or the repository. The TNEC channel is a WhatsApp account linked through
// Baileys, so a message can go to any number at any time. The 422 text below only applies if the
// channel ever moves to Meta's Cloud API.

import { aspectLine, formatBand } from "./speaking-result.js";

const DEFAULT_BASE = "https://csq-api.onrender.com/api/v1";
const TIMEOUT_MS = 25000;

// Messages for each provider response, written for the admin who pressed Kirim.
const ERROR_TEXT = {
  400: "AttCos menolak isi pesan. Periksa nomor tujuan dan teks pesannya.",
  401: "Kunci API AttCos tidak diterima. Periksa ATTCOS_API_KEY di pengaturan server.",
  403: "Channel WhatsApp ini bukan milik akun AttCos yang dipakai.",
  409: "Belum ada channel WhatsApp yang tersambung di AttCos.",
  422: "Jendela 24 jam WhatsApp untuk nomor ini sudah tertutup, jadi pesan biasa tidak bisa dikirim lewat AttCos. Minta siswa mengirim pesan dulu ke nomor Titik Nol, atau kirim dari aplikasi lewat tombol Buka di WhatsApp.",
  429: "Terlalu banyak pesan dalam satu menit. Tunggu sebentar lalu coba lagi.",
  502: "WhatsApp gagal mengirim pesan dari sisi penyedia. Coba lagi beberapa saat lagi.",
};

export function whatsappConfigured(env) {
  return Boolean(env.ATTCOS_API_KEY && (env.ATTCOS_CHANNEL_ID || channelCache.has("pare")));
}

// AttCos stores `source` on the contact as where the lead came from and shows it on the pipeline
// card. Only the automatic placement result sends it; dashboard messages leave it out.
export const PLACEMENT_LEAD_SOURCE = "Placement Test";

/* The per-branch channel ids, read from whatsapp_channels with a short in-memory cache so a send
   does not open a query per message. The cache is invalidated by the dashboard on every save. */
const channelCache = new Map();
const CHANNEL_CACHE_MS = 30_000;
let channelCacheAt = 0;

async function loadChannels(env) {
  if (channelCache.size && Date.now() - channelCacheAt < CHANNEL_CACHE_MS) return channelCache;
  try {
    const { results } = await env.DB.prepare("SELECT branch, channel_id FROM whatsapp_channels").all();
    const map = new Map(results.map((r) => [r.branch, r.channel_id || ""]));
    channelCache.clear();
    for (const [k, v] of map) channelCache.set(k, v);
    channelCacheAt = Date.now();
  } catch { /* table not migrated yet: fall back to the env channel below */ }
  return channelCache;
}

/** The dashboard calls this after a channel edit so the next send picks the new value at once. */
export function resetChannelCache() {
  channelCache.clear();
  channelCacheAt = 0;
}

async function channelIdFor(env, branch) {
  const channels = await loadChannels(env);
  const pick = (key) => channels.get(key) || "";
  // Pare and Online share one WhatsApp number. Jogja and Medan have their own number and never
  // fall back to Pare, so an empty row stops the send instead of sending from the wrong branch.
  if (branch === "jogja") return pick("jogja");
  if (branch === "medan") return pick("medan");
  return pick("pare") || env.ATTCOS_CHANNEL_ID;
}

export async function sendWhatsApp(env, { to, text, source, media, branch, timeoutMs = TIMEOUT_MS }) {
  if (!env.ATTCOS_API_KEY) {
    return { ok: false, status: "skipped", error: "Integrasi WhatsApp belum diatur. Isi ATTCOS_API_KEY di pengaturan server." };
  }
  const channelId = branch ? await channelIdFor(env, branch) : (await channelIdFor(env, "pare"));
  if (!channelId) {
    const label = branch === "jogja" ? "Jogja" : branch === "medan" ? "Medan" : "Pare";
    return { ok: false, status: "failed", error: `Saluran WhatsApp cabang ${label} belum diisi. Isi dulu di Pengaturan, Saluran WhatsApp.` };
  }
  const base = (env.ATTCOS_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.ATTCOS_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: String(to).replace(/^\+/, ""),
        channelId,
        text,
        ...(media ? { media: { url: media.url, kind: media.kind || "document", filename: media.filename || null } } : {}),
        ...(source ? { source: String(source).slice(0, 80) } : {}),
      }),
      signal: controller.signal,
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (response.ok && body?.success) {
      return { ok: true, status: "sent", messageId: body.data?.messageId || null, conversationId: body.data?.conversationId || null };
    }
    const code = body?.error?.code ? ` (${body.error.code})` : "";
    const message = ERROR_TEXT[response.status] || body?.error?.message || `AttCos membalas dengan status ${response.status}.`;
    return { ok: false, status: "failed", httpStatus: response.status, error: `${message}${code}` };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { ok: false, status: "failed", error: `AttCos belum merespons dalam ${Math.round(timeoutMs / 1000)} detik. Coba kirim lagi sebentar lagi.` };
    }
    return { ok: false, status: "failed", error: `Tidak bisa menghubungi AttCos: ${String(error).slice(0, 160)}` };
  } finally {
    clearTimeout(timer);
  }
}

const WHATSAPP_MAX = 1000;
const TRANSCRIPT_IN_WHATSAPP = 300;
const NO_CERTIFICATE = "_Hasil ini dipakai untuk penempatan kelas dan bukan sertifikat resmi._";
const NOT_OFFICIAL_BAND = "_Band ini estimasi dari simulasi internal, bukan skor resmi IELTS._";

/** The mockup completion WhatsApp, sent right after the whole mockup is done. The certificate PDF
 *  travels as a document on the same send when it exists. */
export function buildMockupDoneWhatsApp({ name, overall, skills, resultUrl, speakingPending, certificateNumber }) {
  const first = String(name || "").trim().split(/\s+/)[0];
  const band = (key) => {
    const found = skills?.find((s) => s.skill === key)?.band;
    return found === null || found === undefined ? "-" : String(found);
  };
  const lines = [
    `Halo ${first}, IELTS Mockup kamu sudah selesai. Terima kasih!`,
    "",
    `Listening: ${band("Listening")}`,
    `Reading: ${band("Reading")}`,
    `Writing: ${band("Writing")}`,
    `Speaking: ${band("Speaking")}`,
    `Overall: ${overall ?? "-"}`,
    ...(speakingPending ? ["", "Band speaking masih diproses dan muncul di halaman hasil dalam beberapa menit."] : []),
    ...(certificateNumber ? ["", `Sertifikat IELTS Prediction kamu sudah terbit dengan nomor ${certificateNumber}, filenya terlampir di pesan ini.`] : []),
    ...(resultUrl ? ["", `Hasil lengkap: ${resultUrl}`] : []),
    "",
    "Balas pesan ini kalau ingin membahas hasil kamu.",
    "",
    NOT_OFFICIAL_BAND,
  ].join("\n");
  return lines.length <= WHATSAPP_MAX ? lines : lines.slice(0, WHATSAPP_MAX);
}

/**
 * The result with its speaking part, in the format of the PRD. It stays under 1,000 characters:
 * the transcript (only when it is shorter than 300 characters) and the notes go first.
 */
function buildSpeakingWhatsApp(first, { score, total, level, speaking: sp, resultUrl }) {
  const program = String(level.program || "").replace(/\.$/, "");
  const head = [
    `Halo ${first}, hasil Placement Test kamu sudah siap.`,
    "",
    `Level: ${level.label}`,
    `Skor tes: ${score} dari ${total}`,
    "",
    sp.source === "manual" ? "Speaking (dinilai tim Titik Nol):" : "Speaking:",
    `CEFR ${sp.cefr}${sp.ielts === null ? "" : `, IELTS ${formatBand(sp.ielts)}`}`,
    ...sp.aspects.map(aspectLine),
  ];
  const extra = [];
  if (sp.transcript && sp.transcript.length < TRANSCRIPT_IN_WHATSAPP) extra.push("", "Transkrip jawaban kamu:", `"${sp.transcript}"`);
  if (sp.notes.length) extra.push("", "Catatan:", ...sp.notes);
  const tail = [
    "",
    `Program yang kami sarankan: ${program}.`,
    ...(resultUrl ? ["", `Hasil lengkap: ${resultUrl}`] : []),
    "",
    "Balas pesan ini kalau ingin konsultasi.",
    "",
    NO_CERTIFICATE,
  ];
  const full = [...head, ...extra, ...tail].join("\n");
  return full.length <= WHATSAPP_MAX ? full : [...head, ...tail].join("\n").slice(0, WHATSAPP_MAX);
}

/** The placement result as a WhatsApp message, sent automatically after the contact step. */
export function buildResultWhatsApp({ name, score, total, level, speaking = null, resultUrl = null }) {
  const first = String(name || "").trim().split(/\s+/)[0];
  if (speaking) return buildSpeakingWhatsApp(first, { score, total, level, speaking, resultUrl });
  // Without a speaking part the message stays as it was, plus the result link.
  return [
    `Halo ${first}, terima kasih sudah mengerjakan Placement Test Titik Nol English Course.`,
    "",
    `Skor kamu ${score} dari ${total}, jadi level kamu *${level.label}*.`,
    `Program yang kami sarankan: *${level.program}*.`,
    ...(level.description ? ["", level.description] : []),
    ...(resultUrl ? ["", `Hasil lengkap: ${resultUrl}`] : []),
    "",
    "Kalau ingin konsultasi program atau menanyakan jadwal kelas, balas saja pesan ini.",
    "",
    "_Hasil ini dipakai untuk penempatan kelas dan bukan sertifikat resmi._",
  ].join("\n");
}
