# Resolution

All 14 confirmed findings of run 1 were fixed and deployed on 18 November 2026 at commit `6b505b1` (deploys dep-dbur8iec6qcc73b60e9g web, dep-dbur8ilg1s2s73cn3ch0 admin, both live). The three needs_validation records are owner checks that no code change can close; the three rejected claims needed no change. The hardening notes below the fix list are not yet applied.

| Fingerprint | Severity | Fix at 6b505b1 |
|---|---|---|
| webapi/mockup-speaking-requeue-unbounded | medium | The mockup speaking upsert now re-arms only rows still pending with tries=0 and an expired lease, and x-duration is clamped 1 to 120 like the placement route (apps/web/src/api.js) |
| admin-auth/lockout-parallel-bypass | medium | The failed-login counter increments atomically in SQL with RETURNING, so concurrency can no longer collapse failures (apps/admin/src/api.js) |
| wave2/invite-queue-drain-race | medium | claimNext is one atomic UPDATE ... RETURNING with a 300s lease column (migration 0021), the boot requeue resurrects only lapsed leases, all channel writes are lease-guarded, and SIGTERM awaits the in-flight drain (apps/admin/src/invite-queue.js, apps/admin/server.js) |
| baseline/mockup-answer-key-public | medium | Open business decision for the owner: accept the paid bank being public, or move the bank out of the repository (no code change; the git history keeps the current key either way) |
| webapi/contact-rearm-failed-channel | low | A failed channel can be re-armed exactly once per attempt through new email_rearms and wa_rearms counters in SQL (migration 0020) |
| admin-auth/login-user-enumeration-timing | low | The unknown-email path now runs verifyPassword against a fixed dummy hash, so both 401 branches cost one full KDF (packages/core/src/crypto.js, apps/admin/src/api.js) |
| webapi/violation-log-unbounded-append | low | The log keeps its last 50 entries through a bounded RIGHT() append, so the column and the row rewrites are capped (apps/web/src/api.js) |
| wave2/resend-email-second-writer | low | resend-email refuses voided attempts, live delivery leases, and pending channels; the sent write is lease-guarded (apps/admin/src/api.js) |
| admin-data/testsend-quota-unaccounted | low | Test sends refuse at the shared quota and are counted in emailsSentRecently as email_test rows (apps/admin/src/api.js, apps/admin/src/invite-queue.js) |
| admin-data/duplicate-email-race | low | students.email gained the unique partial index the whatsapp column already had, with zero duplicates confirmed first, and the constraint violation maps to the existing 409 (migration 0022, apps/admin/src/api.js) |
| admin-data/session-quota-race | low | The import confirm locks the session row with FOR UPDATE and counts inside one transaction (apps/admin/src/api.js, packages/core/src/db.js) |
| admin-auth/setup-race-double-admin | low | Setup serializes on pg_advisory_xact_lock before the NOT EXISTS insert (apps/admin/src/api.js) |
| core/speaking-lease-owner-guard | low | Both workers carry their claim's lease_until into every final UPDATE, mirroring checkLater (packages/core/src/speaking.js, speaking-mockup-worker.js) |
| baseline/session-export-untracked-in-public-repo | low | *-setup.json and the preview artifact are gitignored (.gitignore) |

Also applied from the wave-2 hardening notes: the regrade routes require submitted-and-not-voided, and the public mockup result read refuses voided attempts.

## Still open

1. The three needs_validation records in NEEDS-VALIDATION.md: two curl checks against the live service, one Render env check, one dashboard port check. About five minutes, no code.
2. The answer-key decision above.
3. The remaining hardening notes in REPORT.md (HSTS, IP throttle, forwarded-header allowlist, static asset caching, readJson byte-awareness, attempt-creation rate limit, contact-channel verification, plain_token erase extension, revoked cert-file refusal, and similar): all optional, none is a confirmed vulnerability.
