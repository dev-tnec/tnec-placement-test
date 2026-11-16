// WhatsApp sending through AttCos (CSQ API).
// POST {ATTCOS_API_BASE}/messages with a tenant API key. The key lives in the server's .env,
// never part of the code or the repository.

const DEFAULT_BASE = "https://csq-api.onrender.com/api/v1";
const TIMEOUT_MS = 25000;

// Messages for each provider response, written for the admin who pressed Kirim.
const ERROR_TEXT = {
  400: "AttCos menolak isi pesan. Periksa nomor tujuan dan teks pesannya.",
  401: "Kunci API AttCos tidak diterima. Periksa ATTCOS_API_KEY di file .env server.",
  403: "Channel WhatsApp ini bukan milik akun AttCos yang dipakai.",
  409: "Belum ada channel WhatsApp yang tersambung di AttCos.",
  422: "Jendela 24 jam WhatsApp untuk nomor ini sudah tertutup, jadi pesan biasa tidak bisa dikirim lewat AttCos. Minta siswa mengirim pesan dulu ke nomor Titik Nol, atau kirim dari aplikasi lewat tombol Buka di WhatsApp.",
  429: "Terlalu banyak pesan dalam satu menit. Tunggu sebentar lalu coba lagi.",
  502: "WhatsApp gagal mengirim pesan dari sisi penyedia. Coba lagi beberapa saat lagi.",
};

export function whatsappConfigured(env) {
  return Boolean(env.ATTCOS_API_KEY && env.ATTCOS_CHANNEL_ID);
}

export async function sendWhatsApp(env, { to, text }) {
  if (!whatsappConfigured(env)) {
    return { ok: false, status: "skipped", error: "Integrasi WhatsApp belum diatur. Isi ATTCOS_API_KEY dan ATTCOS_CHANNEL_ID di file .env server." };
  }
  const base = (env.ATTCOS_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.ATTCOS_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ to: String(to).replace(/^\+/, ""), channelId: env.ATTCOS_CHANNEL_ID, text }),
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
      return { ok: false, status: "failed", error: "AttCos belum merespons dalam 25 detik. Server AttCos mungkin sedang bangun dari mode tidur, jadi coba kirim lagi sebentar lagi." };
    }
    return { ok: false, status: "failed", error: `Tidak bisa menghubungi AttCos: ${String(error).slice(0, 160)}` };
  } finally {
    clearTimeout(timer);
  }
}
