// The mockup invite queue worker (docs/prd-ielts-mockup-bulk.md). After the team presses
// "Kirim semua", every queued invite is delivered on both channels, one row at a time: the email
// through Cloudflare with the shared daily quota, the WhatsApp through AttCos without a limit.
// The plain invite token lives on the queue row only until both channels have delivered, so the
// worker can build the personal link without ever storing the token permanently.

import { nowSeconds } from "@tnec/core/http";
import { sendWhatsApp } from "@tnec/core/whatsapp";
import { buildInviteEmail } from "@tnec/core/email";
import { addActivity } from "@tnec/core/store";
import { buildInviteWhatsApp, scheduleLine, formatWib, EMAIL_DAILY_LIMIT } from "@tnec/core/mockup-bulk";

const SWEEP_MS = 20_000;
const ROW_PAUSE_MS = 1_200;
const MAX_ATTEMPTS = 3;
// A claim lease: Render keeps the old instance alive about 60 seconds after a deploy switches
// traffic, so two processes can drain at once. The lease makes the boot requeue resurrect only
// rows whose claim has gone stale, never a row a live process is sending (audit finding
// wave2/invite-queue-drain-race).
const CLAIM_LEASE_SECONDS = 300;

let timer = null;
let draining = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A crash or a deploy kill can leave a row marked sending. The claim lease bounds how long a
 *  stale sending state survives: only rows whose lease has lapsed are requeued, so a live
 *  process mid-send on another instance is never resurrected underneath. */
export async function resetStaleInviteSends(env) {
  const cutoff = nowSeconds() - CLAIM_LEASE_SECONDS;
  await env.DB.batch([
    env.DB.prepare("UPDATE mockup_invite_queue SET email_status = 'pending' WHERE email_status = 'sending' AND (lease_until IS NULL OR lease_until < ?)").bind(cutoff),
    env.DB.prepare("UPDATE mockup_invite_queue SET wa_status = 'pending' WHERE wa_status = 'sending' AND (lease_until IS NULL OR lease_until < ?)").bind(cutoff),
  ]).catch(() => {});
}

/** Every Cloudflare mail in the last 24 hours: the invite emails and the result emails share
 *  one quota. The email_test rows are the test sends, so they spend the same allowance the
 *  queue reads (audit finding admin-data/testsend-quota-unaccounted). */
export async function emailsSentRecently(env) {
  const since = nowSeconds() - 24 * 3600;
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM attempts WHERE email_sent_at > ?) + (SELECT COUNT(*) FROM mockup_invite_queue WHERE email_sent_at > ?)
       + (SELECT COUNT(*) FROM wa_messages WHERE status = 'email_test' AND created_at > ?) AS sent`,
  ).bind(since, since, since).first();
  return row?.sent ?? 0;
}

/** Marks the next row with work left as sending through one atomic claim, and returns its queue
 *  id. The claim UPDATE carries the eligibility guard in its WHERE clause and sets the lease in
 *  the same statement, so two processes can never both claim the same row (the delivery lease
 *  pattern); a no-row result means another process owns the head, and the drain moves on. */
async function claimNext(env) {
  const row = await env.DB.prepare(
    `UPDATE mockup_invite_queue SET
        email_status = CASE WHEN email_status IN ('pending', 'kuota') THEN 'sending' ELSE email_status END,
        wa_status = CASE WHEN wa_status = 'pending' THEN 'sending' ELSE wa_status END,
        lease_until = ?
      WHERE id = (
        SELECT q.id
        FROM mockup_invite_queue q
        JOIN invites i ON i.id = q.invite_id
        JOIN students s ON s.id = i.student_id
        JOIN mockup_sessions ms ON ms.id = i.session_id
        WHERE ms.queue_paused = 0 AND ms.status != 'cancelled'
          AND (q.wa_status = 'pending' OR (q.email_status IN ('pending', 'kuota') AND s.email IS NOT NULL AND s.email != ''))
        ORDER BY q.created_at, q.id
        LIMIT 1
      )
      AND (wa_status = 'pending' OR email_status IN ('pending', 'kuota'))
      RETURNING id`,
  ).bind(nowSeconds() + CLAIM_LEASE_SECONDS).first();
  return row?.id ?? null;
}

/** The full row after claiming, with everything the messages need. */
function fetchRow(env, queueId) {
  return env.DB.prepare(
    `SELECT q.id AS queue_id, q.email_status, q.email_attempts, q.wa_status, q.wa_attempts, q.plain_token,
            i.id AS invite_id, i.code, i.opens_at, i.expires_at,
            s.id AS student_id, s.name, s.whatsapp, s.email,
            ms.name AS session_name, ms.window_mode
     FROM mockup_invite_queue q
     JOIN invites i ON i.id = q.invite_id
     JOIN students s ON s.id = i.student_id
     JOIN mockup_sessions ms ON ms.id = i.session_id
     WHERE q.id = ?`,
  ).bind(queueId).first();
}

function messageParts(env, row) {
  const link = `${env.PUBLIC_WEB_URL}/?undangan=${row.plain_token}`;
  return {
    link,
    firstName: String(row.name).split(/\s+/)[0],
    schedule: scheduleLine({ windowMode: row.window_mode, opensAt: row.opens_at, expiresAt: row.expires_at }),
    deadline: `paling telat ${formatWib(row.expires_at)}`,
  };
}

async function sendEmailChannel(env, row) {
  const used = await emailsSentRecently(env);
  if (used >= EMAIL_DAILY_LIMIT) {
    await env.DB.prepare("UPDATE mockup_invite_queue SET email_status = 'kuota', email_error = ? WHERE id = ? AND email_status = 'sending' AND lease_until >= ?")
      .bind(`Jatah email 24 jam terakhir habis (${used} dari ${EMAIL_DAILY_LIMIT}), jadi email menunggu dan WhatsApp tetap jalan.`, row.queue_id, nowSeconds()).run();
    return;
  }
  const { link, schedule } = messageParts(env, row);
  const mail = buildInviteEmail({ name: row.name, sessionName: row.session_name, schedule, link, code: row.code, deadline: messageParts(env, row).deadline });
  try {
    if (!env.SEND_EMAIL) throw new Error("Email belum diatur di server. Isi CLOUDFLARE_EMAIL_TOKEN di pengaturan server.");
    await env.SEND_EMAIL.send({ from: env.RESULT_FROM_EMAIL, to: row.email, subject: mail.subject, html: mail.html, text: mail.text });
    await env.DB.prepare("UPDATE mockup_invite_queue SET email_status = 'sent', email_sent_at = ?, email_error = NULL WHERE id = ? AND email_status = 'sending' AND lease_until >= ?")
      .bind(nowSeconds(), row.queue_id, nowSeconds()).run();
  } catch (error) {
    const attempts = row.email_attempts + 1;
    await env.DB.prepare("UPDATE mockup_invite_queue SET email_status = ?, email_attempts = ?, email_error = ? WHERE id = ? AND email_status = 'sending' AND lease_until >= ?")
      .bind(attempts >= MAX_ATTEMPTS ? "failed" : "pending", attempts, String(error.message || error).slice(0, 300), row.queue_id, nowSeconds()).run();
  }
}

async function sendWhatsAppChannel(env, row) {
  const { link, firstName, schedule, deadline } = messageParts(env, row);
  const text = buildInviteWhatsApp({ firstName, sessionName: row.session_name, schedule, link, code: row.code, deadline });
  const result = await sendWhatsApp(env, { to: row.whatsapp, text, source: "IELTS Mockup" });
  const now = nowSeconds();
  const attempts = row.wa_attempts + 1;
  const status = result.ok ? "sent" : attempts >= MAX_ATTEMPTS ? "failed" : "pending";
  await env.DB.batch([
    env.DB.prepare("UPDATE mockup_invite_queue SET wa_status = ?, wa_attempts = ?, wa_error = ?, wa_sent_at = ? WHERE id = ? AND wa_status = 'sending' AND lease_until >= ?")
      .bind(status, attempts, result.ok ? null : String(result.error || "").slice(0, 300), result.ok ? now : null, row.queue_id, now),
    env.DB.prepare("INSERT INTO wa_messages (student_id, to_number, text, status, provider_message_id, error, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(row.student_id, row.whatsapp, text, result.status, result.messageId || null, result.error || null, now, "Sistem"),
    addActivity(env, row.student_id, "wa",
      result.ok ? `Undangan IELTS Mockup ${row.session_name} terkirim lewat WhatsApp.` : `Undangan IELTS Mockup ${row.session_name} gagal terkirim. ${result.error}`,
      "Sistem", { inviteId: row.invite_id }, now),
  ]);
}

// The in-flight drain, so SIGTERM can await it before the process exits: a mid-row exit
// leaves a row at sending whose provider send may already have been accepted, and the next
// boot's requeue would send it again (audit finding wave2/invite-queue-drain-race).
let drainingPromise = null;

/** Sends until nothing is left, one row at a time, with a small pause between rows. */
export async function drainInviteQueue(env) {
  if (draining) return drainingPromise;
  draining = true;
  drainingPromise = (async () => {
    try {
      for (;;) {
        const queueId = await claimNext(env);
        if (!queueId) return;
        const row = await fetchRow(env, queueId);
        if (!row) continue;
        if (row.email_status === "sending") await sendEmailChannel(env, row);
        if (row.wa_status === "sending") await sendWhatsAppChannel(env, row);
        // The token is only needed to build the personal link. Once both channels are done it is erased.
        const after = await env.DB.prepare("SELECT email_status, wa_status FROM mockup_invite_queue WHERE id = ?").bind(queueId).first();
        if (after && ["sent", "dilewati"].includes(after.email_status) && after.wa_status === "sent") {
          await env.DB.prepare("UPDATE mockup_invite_queue SET plain_token = NULL WHERE id = ?").bind(queueId).run();
        }
        await sleep(ROW_PAUSE_MS);
      }
    } finally {
      draining = false;
    }
  })();
  return drainingPromise;
}

export function startInviteQueueWorker(env) {
  resetStaleInviteSends(env).then(() => drainInviteQueue(env)).catch((e) => console.error("invite queue:", e));
  if (timer) clearInterval(timer);
  timer = setInterval(() => { drainInviteQueue(env).catch((e) => console.error("invite queue:", e)); }, SWEEP_MS);
}

export async function stopInviteQueueWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  // Let the in-flight drain finish its current row before the caller closes the database.
  if (drainingPromise) await drainingPromise.catch(() => {});
}
