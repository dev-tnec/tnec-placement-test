# Security audit report

Run 1 for dev-tnec/tnec-placement-test, 18 November 2026.

## Run summary

| Item | Value |
|---|---|
| Profile | standard |
| Scope | apps/web, apps/admin, packages/core, db, scripts, tools, tests at commit 9a934ef |
| Source ref | 9a934ef, clean worktree; the owner's untracked files excluded from scope |
| Execution policy | sandboxed-source-and-local-only; no deployed endpoint, shared service, production data, or paid quota was contacted |
| Prior runs | none; this is the first run for this repository |
| Budget | none set; all mandatory critic and verifier calls ran |
| Coverage | 2 hunter waves plus a final-clean critic; 50 ledger units: 34 covered, 16 candidate, 0 blocked, 0 deferred |
| Native validators | The skill's validate-findings.cjs and validate-coverage-ledger.cjs require Linux-only file flags and refuse to run on this Windows host, so validation ran through docs/audit/validate-portable.mjs, a structural and semantic port written for this run that enforces the same contracts: required fields, state-table invariants, canonical ID encoding, fingerprint pattern, verdict-branch field rules, and trace kinds. Validator success proves format and ledger consistency only. |
| Local execution | No target code was executed. The Windows host cannot enforce the OS sandbox the skill requires (no loopback-only network namespace, no kernel read-only root, no hard CPU or memory caps), so every candidate that needed runtime proof carries that exact blocker in a needs_validation record or in the observed_result field. |

## Security posture

The codebase is in good shape for its size and age. The strongest controls held under adversarial reading: SQL is parameterized end to end with interpolation restricted to fixed fragments; all server-rendered HTML escapes every interpolation; the session and invite tokens are hashed at rest behind PBKDF2 with a timing-safe compare; the static file server survived every traversal encoding thrown at it; the strict CSPs on both apps have no escape and the committed bundles contain no eval, no inline styles, and no remote loads; and the answer key never leaks through any public response. The full-stack origin check plus SameSite=Strict held against every browser request class the hunters could construct.

The confirmed findings cluster in three places: unbounded work reachable by an anonymous or attempt-holding principal (the mockup speaking re-queue that drains paid Speechace quota, the violation log append, the contact-step re-arm loop), concurrency assumptions that Render's deploy model breaks (the login lockout race, the invite queue drain race, the speaking lease owner gap, the setup and quota races), and the consequences of the repository being public (the paid mockup answer key, the unignored session export). Three deployment facts could not be decided from source and are parked as needs_validation records with one-minute owner checks: Render's forwarded-header handling, the TRUST_PROXY value behind the Secure cookie flag, and whether the service ports are reachable only through the edge.

## Confirmed findings

| Severity | Title | Boundary | Observed result |
|---|---|---|---|
| medium | Mockup speaking re-upload resets tries and re-queues Speechace without bound | public attempt UUID to paid Speechace quota | Any participant re-arms a fresh 3-call budget per upload, unbounded across uploads |
| medium | Concurrent logins defeat the 5-failure account lockout | unauthenticated to admin lockout | Parallel wrong passwords advance the counter by about one per wave; the lock never engages |
| medium | Invite queue has no cross-process claim guard; deploys during a drain double-send invites | admin queue to paid email and WhatsApp quota | Two Render instances deliver the same row on both channels during the documented 60 second deploy overlap |
| medium | The paid IELTS mockup answer key is committed in the public repository | public repo to paid asset | Every accepted answer for all 80 questions is readable on GitHub |
| low | Replayed contact step re-arms failed delivery channels and swaps the destination | attempt UUID to outbound school channels | Each replay sends the result to a newly chosen address while the send keeps failing |
| low | Login timing distinguishes existing admin emails | unauthenticated to account existence | Known emails pay a 600k-iteration KDF before the same 401 |
| low | Uncapped violation logging appends to an unbounded TEXT column | attempt UUID to shared database | Unlimited appends with whole-row rewrites until the sweep |
| low | resend-email ignores the delivery lease and the void flag | admin route to delivery state machine | A voided result can be emailed; a racing manual send doubles the email |
| low | Test sends consume the shared email quota but are not counted | admin route to shared quota | The drain believes it has headroom and pushes past the Cloudflare limit |
| low | Duplicate student emails via check-then-act assertUnique | operator writes to student identity | Duplicate emails let the contact step link an attempt to the wrong student row |
| low | Session quota check-then-insert race can overshoot quota | operator writes to session quota | Two concurrent imports both pass the check |
| low | Two concurrent first-admin setups both succeed | bootstrap window to one-admin invariant | Both requesters receive admin sessions |
| low | Speaking workers' final writes lack lease ownership | worker race to paid Speechace quota | A stalled worker past its lease causes a double call for one recording |
| low | The session export sits untracked and un-gitignored at the repo root | local machine to public repo | One git add -A publishes identifiers and internal history; no credential values were found |

### Findings worth the owner's immediate attention

The two quota-drain findings (mockup speaking re-queue, invite queue drain race) touch paid third-party spend and are the cheapest to fix: both fixes mirror gates that already exist in the same codebase (the placement upload gates and the delivery lease). The login lockout race is one SQL statement away from atomic, and the session export needs one line in .gitignore. The answer-key finding is a business decision, not a code change: either accept that the paid bank is public knowledge, or move the bank out of the repository, remembering the git history keeps the current key either way.

## Needs validation

| Title | Blocker | Owner check |
|---|---|---|
| First x-forwarded-host trusted for origin checks, the Secure flag, and the cert URL under TRUST_PROXY | Render's edge overwrite-vs-append behavior is not in source | curl the login endpoint with a spoofed X-Forwarded-Host and read the response; a 403 origin rejection means the edge overwrites and the trust is sound |
| The Secure cookie flag depends on the deployed TRUST_PROXY value | The Render env value and the live Set-Cookie line are not in source | npm run render -- env list both, or read the cookie flags in devtools after login |
| Both servers bind 0.0.0.0; a directly reachable port would fully expose the trusted headers | Render's port exposure is a platform property | Confirm in the Render dashboard that no direct TCP port is published |

## Rejected claims

Three hunter claims were refuted during validation and are retained so future runs do not repeat them: the setup-code guessing (roughly 40 bits of entropy in a minutes-long window), the plaintext invite token persistence (the only reader is a database reader who already holds equivalent secrets by design), and the protocol-relative asset URLs (the CSP is a static server-set control and only admins can write the fields). Their fingerprints and refutations are in findings.json.

## Hardening notes

The hunters and verifiers recorded hardening observations beyond the findings, retained on the ledger units: add HSTS in withHeaders; make the login counter atomic and add an IP throttle; run a dummy PBKDF2 for unknown emails; do not derive security decisions from forwarded headers when TRUST_PROXY is set, pin ADMIN_URL and PUBLIC_WEB_URL instead; cache hashed static assets far-future and add Range support to static serving and the mockup audio route; close the readJson chars-vs-bytes gap; rate-limit attempt creation; verify a channel before the contact step links a student by phone or email; add the missing unique index on students.email and map its violation to the existing 409; count test sends in the quota query; extend the plain_token erase rule and add a wa_messages retention purge; add submitted and not-voided gates to the speaking-retry and writing-grade routes and a voided check to the public result read; carry the lease into the speaking workers' final UPDATEs; refuse revoked certificates on the cert-file route; return the upload token nowhere it is not needed; align the mockup purged-audio message with the placement 410; reject // in the three asset validators; rotate the Speechace key on a schedule; silence-echo the create-admin password prompt; and the GEMINI_MOCK silent-satisfaction warning.

## Positive controls verified

Parameterized SQL throughout; escapeHtml on every server-rendered interpolation with replacement functions preventing dollar-pattern injection; PBKDF2 at 600k iterations with a timing-safe compare; hashed session and invite tokens; HttpOnly SameSite=Strict host-only cookies with a fresh token per login; origin check plus SameSite as a dual CSRF defense; body caps at both transport and parse layers; the traversal guard holding against every encoding variant; strict CSPs with no escape and clean committed bundles; the answer key confined to the server; CSV exports with formula neutralization; the certificate number register atomic under concurrency; 30-day audio purge with fresh audio untouched; the delivery lease preventing double-sends between deploy instances; outbound vendors receiving no student contact data beyond the channels that carry it, and Speechace seeing only a hash.

## Coverage statement

This was a standard-profile run with no prior coverage. No single pass is complete: the deterministic ledger covers 50 units across every entry surface, trust boundary, subsystem, and applicable attack class the reconnaissance mapped, and the final-clean critic accepted it, but that is a claim about this run's map, not about the codebase's future. The 16 candidate units each carry independently validated fingerprints, and every candidate went through a fresh verifier. The three needs_validation records are the only open loops, and each resolves with a one-minute owner observation.
