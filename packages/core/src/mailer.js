// Result email transport. Sends through the Cloudflare Email Sending API with an API token,
// because the sending domain is already verified there. Returns null when it is not configured,
// and the app then records the email as skipped instead of failing the request.

const API = "https://api.cloudflare.com/client/v4";

export function parseAddress(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(.*)<([^>]+)>$/);
  if (!m) return { address: s };
  const name = m[1].trim().replace(/^"|"$/g, "");
  return name ? { address: m[2].trim(), name } : { address: m[2].trim() };
}

export function createMailer(env, fetchImpl = fetch) {
  const token = env.CLOUDFLARE_EMAIL_TOKEN;
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) return null;
  return {
    async send({ from, to, subject, html, text, attachments }) {
      const response = await fetchImpl(`${API}/accounts/${account}/email/sending/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: parseAddress(from), to, subject, html, text,
          // Attachments are base64 in the JSON body, as the Email Sending API expects.
          ...(attachments?.length ? { attachments: attachments.map((a) => ({ content: a.content, filename: a.filename, type: a.type || "application/pdf", disposition: "attachment" })) } : {}),
        }),
        signal: AbortSignal.timeout(20_000),
      });
      let data = null;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok || data?.success === false) {
        const reason = data?.errors?.map((e) => e.message).join("; ") || `HTTP ${response.status}`;
        throw new Error(`Email API: ${reason}`);
      }
      return data?.result ?? null;
    },
  };
}
