# Findings detail

Full source paths and target-neutral reproductions for every confirmed medium finding and the two low findings with monetary principals, per the report contract. The remaining low findings carry complete traces and reproductions in findings.json.

## admin-auth/lockout-parallel-bypass

Repository trace. The entrypoint is POST /api/admin/login (apps/admin/src/api.js:185), unauthenticated, body capped at 4 KB, with no IP throttle. Line 190 reads the user row. Lines 193-195 check locked_until against that stale copy. Lines 197-199 compute the failed counter in JavaScript from the pre-read row (failed = user.failed_logins + 1) and write it back as an absolute UPDATE, so N concurrent wrong-password requests all read the same counter and all write the same +1. Line 66 holds LOCK_AFTER=5, which is reached only after roughly 5 concurrent waves.

Attacker and resource. An unauthenticated internet user with a known admin email attacks the lockout control on the admin account. Each request still pays one PBKDF2 verify at 600,000 iterations (packages/core/src/crypto.js:6), so guessing throughput stays bounded by KDF cost across parallel connections; the race defeats the lock, not the password, which is why this matters against weak or leaked-password-list targets.

Bounded reproduction. Send five or more simultaneous wrong-password POSTs to /api/admin/login per wave against a disposable admin account on a local instance, then inspect failed_logins: it advances by about one per wave instead of one per request, and locked_until never sets until roughly 25 total guesses arrive in five waves. No runtime execution was performed in this audit run; the reproduction is derived from the source-visible read-modify-write.

Smallest source fix. Make the increment atomic in SQL: UPDATE admin_users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now + 900 END WHERE id = ? RETURNING failed_logins, locked_until, and gate the 401 on the returned values. A regression case in tests/smoke.mjs can assert the statement shape the same way the certificate number mirror is checked.

## webapi/mockup-speaking-requeue-unbounded

Repository trace. The entrypoint is POST /api/attempts/:id/speaking-answer (apps/web/src/api.js:696), gated only by status in_progress and a valid part/prompt pair, no session, no rate limit. Line 703 parses x-duration with Number() and never clamps or minimum-checks it. Lines 705-706 bound only the bytes (1 KB to 3 MB). Lines 711-716 hold the re-arm upsert: ON CONFLICT (attempt_id, part, prompt_no) DO UPDATE resets status='pending', tries=0, next_attempt_at=0, lease_until=0, error=NULL for any row in status pending or failed. Line 719 fires gradeMockupAnswer on every accepted upload. The sink is the worker's claim at packages/core/src/speaking-mockup-worker.js:78-86 with MAX_TRIES=3 (packages/core/src/speaking-result.js:20): each re-arm grants a fresh budget of three Speechace calls, unbounded across uploads.

Attacker and resource. A seated or leaked-invite participant holds the mockup attempt UUID and drains the school's Speechace quota: upload junk audio, let Speechace fail it, re-upload, repeat. The verifier refuted the originally claimed indefinite result stall (failed rows do not hold readiness; getAttemptResult waits only on pending or grading rows), so the durable harm is the unbounded paid spend plus queue flooding.

Bounded reproduction. On a local instance with a mockup attempt in progress, POST a 1024-byte audio/webm body with x-duration 0 to one question, wait for the failed status, and re-post the same request; each post re-arms the row (tries returns to 0) and each acceptance produces a new Speechace call. Source-only in this run: the reset clause, the missing duration gate, and the per-upload grading call are directly visible, and the placement route at api.js:662-682 demonstrates the contrasting correct gates.

Smallest source fix. Mirror the placement gates: change the conflict guard to WHERE speaking_answers.status='pending' AND speaking_answers.tries=0 AND (lease_until IS NULL OR lease_until < now), add the clamped duration and minimum check from uploadSpeaking, and add a per-attempt upload counter or cooldown.

## wave2/invite-queue-drain-race

Repository trace. The entrypoint is claimNext's SELECT at apps/admin/src/invite-queue.js:41. Lines 53-55 hold the two unconditional claim UPDATEs whose changed-row counts are never inspected. Line 25 is the boot requeue: resetStaleInviteSends flips every 'sending' row back to 'pending' with no lease, no age check, and no process ownership. Line 18 holds the per-process draining flag that cannot guard across processes. The stop path at apps/admin/server.js:62-71 clears the queue timer but never awaits the in-flight drainInviteQueue before DB.close() and process.exit(0). The sink is the both-channels send at invite-queue.js:132-135. AGENTS.md line 241 documents that Render keeps the old instance running about 60 seconds after a deploy switches traffic, which breaks the single-process assumption in the code's own comment at line 22.

Attacker and resource. No attacker is needed; the deploy schedule triggers it. The paying student receives the same paid invite twice on both channels, and the shared Cloudflare daily quota is charged twice for one row. Two concrete duplicate paths: the old instance mid-send when the new instance boots and requeues, and the old instance killed after the provider accepted the send but before the status write committed.

Bounded reproduction. Entirely source-grounded in this run; no deployed endpoint was contacted. The verification reads the claim sequence, the leaseless requeue, the per-process flag, the unawaited shutdown, and the documented platform overlap. A local reproduction would need two processes against one database with a wave mid-drain, which this Windows host's sandbox policy did not permit.

Smallest source fix. Follow the delivery lease pattern already in the codebase: an UPDATE ... WHERE id = ? AND status IN ('pending','kuota') RETURNING claim whose result is inspected, a lease column so resetStaleInviteSends resurrects only rows whose lease lapsed, and a stop path that awaits or aborts the in-flight drain with a partial-send marker.

## baseline/mockup-answer-key-public

Repository trace. db/migrations/0008_ielts_mockup.sql line 36 begins the INSERT INTO questions; rows 1001 onward carry the correct answer in the answer column and the full accepted-variant list in the accepted column (row 1001: answer 'radio program', accepted includes four variants; row 1002: 'LS14 2JW'). AGENTS.md line 367 records that the owner made the repository public on 16 November 2026 so Render can deploy from the URL.

Attacker and resource. A paying student, a competitor, or anyone with the repo URL reads the answer key before sitting the paid mockup. No student data, credentials, or system access is exposed; the impact is bounded by the business value of the bank.

Bounded reproduction. Open the public repository dev-tnec/tnec-placement-test on GitHub and read the migration. Verified in source during this run: the answer and accepted values are present in plaintext.

Smallest source fix. This is an owner decision, not a code change: accept the exposure as a documented trade-off, or move the bank out of the public repository by seeding the mockup questions at deploy time from a private source, keeping only schema in migrations. Any move must also handle the already-public git history, which keeps the current key forever.

## Monetary low findings

webapi/contact-rearm-failed-channel: the attempt holder loops the contact step with well-formed but bouncing addresses, each replay sending a school-branded result message to a newly chosen address and burning Cloudflare and AttCos quota; delivered channels stay closed and the CRM record stays fixed. Fix: bound re-arms per channel or rate-limit the route per attemptId.

admin-data/testsend-quota-unaccounted: each test send silently spends the shared 200/day Cloudflare quota, so the drain believes it has headroom and real invite emails start failing while the dashboard shows space; fix by counting test sends in emailsSentRecently or clamping the test send near the limit.

core/speaking-lease-owner-guard: a worker stalled past its 120s lease can have its row re-claimed, and its late final write still matches on status='grading', costing two Speechace calls for one recording with a last-writer-wins grade of the same audio; fix by carrying the claim's lease_until into both final UPDATEs, mirroring checkLater.
