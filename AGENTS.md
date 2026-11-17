# AGENTS.md: titiknolenglish-placement-test

This file is the working memory for this folder. Read it before changing the app. The design rules live in `DESIGN.md`, and the brand tokens come from `../design.md`.

## Rules

These come from the owner and outrank convenience.

1. Read `DESIGN.md` before any interface change, and use its tokens, sizes, spacing, radii, shadows, and component patterns. Do not invent a hex, size, radius, shadow, or animation that is not there. When something is missing from the design system, add it to `DESIGN.md` first, then use it.
2. Do not build a component, animation, or visualizer from scratch when a proven open-source one exists. Use the real thing: shadcn/ui patterns for the React dashboard, ElevenLabs UI components, and similar established libraries. When the stack cannot consume it directly (plain HTML and JS, strict CSP, no CDN), vendor the files or port the component faithfully, keep its license and source link in the file header, and never approximate it by hand. The speaking wave is the ElevenLabs UI LiveWaveform ported into `apps/web/public/assets/live-waveform.js` with its MIT notice. Do not replace it with a home-made equalizer or dots.
3. Be proactive. When the owner reports one instance of a problem, find and fix the whole class of the problem across every screen, state, and viewport before replying, and say what was audited. One cramped row means checking every row with the same content; one side stripe means scanning every notice; one unaligned control means measuring every similar row.
4. Verify what the user sees, not what the DOM claims. Measure rendered geometry (bounding rects, computed styles, canvas pixels) instead of trusting attributes, hidden flags, or booleans.
5. Treat design defects as defects, not taste. A feedback widget floating away from the control that triggered it, an unaligned row, cramped spacing, a card inside a card, or a colored stripe on one side of an element are bugs. When the intended look is unclear, copy the established reference component instead of inventing a new one.
6. Both apps declare the global `[hidden] { display: none !important; }` rule. A component class that sets `display` otherwise beats the hidden attribute and leaves widgets that should be hidden on screen.

## What this folder is

The online placement test, pre-test, and post-test for Titik Nol English Course, plus the internal dashboard for the admin and education team. It is not an Elementor page and it is not part of the WordPress install. It is a Node.js monorepo with two apps that share one PostgreSQL database on Neon.

The source material is in this folder: `placement-test-questions.md`, `placement-test-questions.txt`, `placement-test.xlsx`, and the UI reference `assets/code.html`. The original question set and the level thresholds come from JotForm form 252018413812044.

## Current status

On 16 November 2026 the owner asked to run everything on Node.js instead of Cloudflare Workers, with one app for students and a separate app for the team. Cloudflare D1 from outside a Worker only works through the Cloudflare REST API, which shares a rate limit of 1,200 requests per 5 minutes with the whole Cloudflare login, so the database moved to Neon PostgreSQL on the owner's instruction.

| Item | State |
|---|---|
| Neon project | `tnec-placement-test` (`odd-moon-74051631`), region `aws-ap-southeast-1` (Singapore), Postgres 17, database `tnec`, role `tnec_app` |
| Branch `main` | Production. Schema and seeds applied |
| Branch `dev` | For local testing. The headless browser tests write their data here, never to `main` |
| Result email | Cloudflare Email Sending API with the account token "TNEC placement test - result email", which can only send email |
| Old Cloudflare Worker | Deleted on 16 November 2026. The old D1 database `tnec-placement-test` is kept untouched and is no longer used |
| Hosting | Render, workspace IndexNow, region Singapore, Starter plan. `tnec-placement-test` (`srv-dbt6h3tg1s2s738toue0`) serves https://tnec-placement-test.onrender.com and `tnec-placement-admin` (`srv-dbt6h3tg1s2s738touf0`) serves https://tnec-placement-admin.onrender.com/admin. Both deploy from the public repository URL, so a push does not deploy by itself; deploy both after each push. The settings are in each service's Environment page; the README lists which keys each service has |

The full flow passes in a headless browser against the `dev` branch: first admin setup on the login page, login and logout, catalog, student records, notes, WhatsApp through a local AttCos stub (including the 24 hour window error), invite links, the placement test with contact and result, the pre-test score screen, per question timing with auto advance and auto submit, a student name containing HTML staying plain text, and the dashboard layout at 1024, 900, and 390 pixels. The certificate flow passes there too: types and their validation, the MoM number example, two certificates issued at the same moment, a refused number rolling back, editing, cancelling and restoring, and the printable pages in A4 portrait and landscape.

## Stack

| Item | Value |
|---|---|
| Runtime | Node.js 21.7 or newer. Plain `node:http`, no framework |
| Database | Neon PostgreSQL through `pg`, the only runtime dependency |
| Email | Cloudflare Email Sending REST API, `packages/core/src/mailer.js` |
| WhatsApp | AttCos (CSQ API), `POST {ATTCOS_API_BASE}/messages`, on a WhatsApp account linked through Baileys |
| Front end | Test site: plain HTML, CSS, and JavaScript, no build step. Dashboard: React, built with Vite from `apps/admin/client` into `apps/admin/public/admin`, and the build output is committed so the server only serves files |
| Monorepo | npm workspaces: `apps/*` and `packages/*` |

## Repository layout

| Path | Purpose |
|---|---|
| `apps/web/server.js` | Test site server: static pages and the public API |
| `apps/web/src/api.js` | Public API: config, invites, attempts, violations, submit, contact. Reads test settings and levels on every request, so dashboard changes apply to the next test right away |
| `apps/web/public/` | `index.html`, `assets/app.css`, `assets/app.js`, logos, favicon |
| `apps/admin/server.js` | Dashboard server and the first admin setup notice |
| `apps/admin/src/api.js` | Dashboard pages, sessions, first admin setup, and every `/api/admin` route |
| `apps/admin/src/certificates.js` | Certificate types, number formats and counters, issuing, and the printable certificate page. See Certificates below |
| `apps/admin/certificates/` | The certificate HTML templates with their CSS and drawings |
| `apps/admin/client/` | The React dashboard client served at `/admin/`: `src/` (store, lib, ui atoms, dialogs, menus, views), the Vite config, `public/assets/` for the certificate print bar files, and `build.mjs` |
| `apps/admin/public/admin/` | The committed Vite build output of the React client, including `assets/certificate-page.css` and `certificate-page.js` for the bar above a printable certificate. `npm start` rebuilds it before serving, and `tests/smoke.mjs` checks that the entry bundle exists and uses no inline script, so a source change cannot ship without a rebuild |
| `packages/core/src/db.js` | Postgres pool with a small `prepare(sql).bind(...).first()/all()/run()` and `batch()` API. `?` placeholders become `$1..$n`; `batch()` is one transaction; read-only batches run in parallel; `transaction(work)` runs steps that need an earlier result, such as taking a certificate number, in one transaction |
| `packages/core/src/env.js` | Loads `.env` (or `ENV_FILE`) and builds the shared `env` object |
| `packages/core/src/node-server.js` | Node HTTP adapter for fetch-style handlers, static files, security headers |
| `packages/core/src/migrate.js` | Applies pending `db/migrations` files in one transaction with an advisory lock |
| `packages/core/src/delivery.js` | Sends the placement result email and WhatsApp in the background after the contact step. See Result delivery below |
| `packages/core/src/store.js`, `http.js`, `crypto.js`, `whatsapp.js`, `email.js`, `legal.js`, `levels.js`, `questions.js` | Shared logic. `questions.js` is the original 25 questions and only documents the seed |
| `db/migrations/0001_init.sql` | Full schema plus seeds: 3 tests, 6 levels, 25 placement questions, 12 draft questions each for pre-test and post-test |
| `db/migrations/0002_result_whatsapp.sql` | Adds `wa_sent_at` and `wa_status` to `attempts` for the automatic result WhatsApp |
| `db/migrations/0003_result_delivery.sql` | Adds `delivery_lease_until` to `attempts` for the background result delivery |
| `db/migrations/0004_certificates.sql` | Adds `certificate_types`, `certificate_counters`, and `certificates`, and seeds the Certificate of Completion, TOEFL Prediction, and IELTS Prediction types |
| `db/migrations/0005_speaking.sql` | Adds the speaking settings on `tests` and the `speaking_submissions` queue |
| `db/migrations/0006_program_link.sql` | Adds `program_url` and `program_image` on `levels`, seeds the real product pages, and adds `result_token` on `attempts` for the private result link |
| `packages/core/src/speaking.js` | The scoring worker: claims a recording with a lease, calls Speechace, stores the five scores, retries, purges old audio, and sweeps expired attempts |
| `packages/core/src/speaking-result.js` | Pure scoring rules: reading a Speechace response, failure classification, retry math, and the speaking facts the email, WhatsApp, and dashboard read |
| `tools/speechace/` | A local mic test page with a key proxy, and `preview-result.mjs` which prints the exact WhatsApp and email copy |
| `start.cmd` | Double-click launcher for Windows: installs on first run, then runs `scripts/start.mjs` |
| `scripts/start.mjs` | `npm start`: migrate, then run both apps in one process |
| `scripts/migrate.mjs`, `scripts/create-admin.mjs` | `npm run db:migrate`, `npm run admin:create` |
| `tests/smoke.mjs` | `npm test`, no database needed |
| `.env.example` | Every setting. `.env` holds the real values and is never committed |
| `dashboard-prototype.html` | Approved single file prototype of the dashboard. Not served |
| `assets/code.html`, `placement-test-questions.*` | Source material. Do not edit |

## Running

1. Double-click `start.cmd` on Windows, or run `npm install` once and then `npm start`. PowerShell on this machine blocks `npm.ps1`, so from PowerShell use `node scripts/start.mjs` or `npm.cmd start`.
2. Starting builds the React dashboard client, applies pending migrations, then serves the test on `WEB_PORT` (4000) and the dashboard on `ADMIN_PORT` (4001) at `/admin/`.
3. With no admin in the database, the login page at `/admin/login` turns into "Buat akun admin pertama". Requests from localhost need no code; any other request needs the setup code that the admin app prints when it starts. On Render the code comes from `ADMIN_SETUP_CODE`, so it stays the same across restarts. After the first account exists, setup is closed and more accounts come from `npm run admin:create`.
4. A host that sets `PORT`, such as Render, gives that port to an app started on its own with `npm run start:web` or `npm run start:admin`.

To run against the `dev` branch, point `ENV_FILE` at a second env file with the `dev` connection string. Never run tests against `main`.

## Flow

1. The intro screen loads `/api/config`. Counts, durations, and the violation limit in the copy are filled from it. If the test is closed or has no active question, a notice shows and the start button stays disabled.
2. The start button stays disabled until all three consent boxes are checked. Clicking the terms or privacy row opens that document in a modal, and "Setuju" checks the box. The honesty row toggles directly.
3. On start, the browser requests fullscreen, then `POST /api/attempts` creates a row and returns the active questions without the answer key, plus the time mode and the violation limit. The question order is stored on the attempt.
4. In total mode the test runs for the configured duration. In per question mode every question has its own seconds, the next question opens when the time runs out, there is no going back, and the answers are sent automatically after the last question.
5. Submitting sends only the answers. The server grades them against the questions stored on the attempt and stores the key used with each answer. The manual send only works after every question is answered: the finish button and the submit dialog stay closed until the count of answers reaches the total, and `submitAnswers` re-checks it, so an incomplete test cannot be sent by hand. The per-question auto send after the last question is the one exception, because its blanks come from question timeouts and those questions cannot be reopened. For the placement test the response never includes the score.
6. Placement with speaking on: after the multiple choice part the student checks the microphone first with a 3 to 10 second test recording that is never uploaded, listens to it, and either retries or continues. While any recording runs, one aligned row appears inside the active card directly above the buttons: a pulsing red dot, the words "Merekam suara kamu", a live red sound wave filling the middle, and a timer, all on the same center line; the mic-failure notice and the "Lanjut tanpa rekaman" button appear in the same spot, never as a box on top of the page. A permission failure keeps the record button available so the student can retry after fixing the address bar setting. Then the student records the answer, between the configured minimum and maximum seconds, can listen and re-record, and sends it once. A student whose microphone fails can skip the part and the result goes out without speaking.
7. Placement only: the details screen collects name, email, and WhatsApp. `POST /api/attempts/:id/contact` links or creates the student, logs the activity, creates the private result link, marks the result email and the result WhatsApp as pending, and returns the result right away when there is no recording waiting. The server sends both channels in the background (see Result delivery), so the result page never waits for Cloudflare or AttCos. Nobody presses anything for either one. A repeated contact step does not send a channel again once it has delivered for that attempt.
8. With a recording waiting, the contact step returns `result: null` and the page shows the waiting screen, which polls the result link every six seconds and shows the full result as soon as the recording is scored. The same link, `/?hasil=<token>`, goes out in the email and the WhatsApp message and opens the same result page without a session, including the speaking block and the program cards.
9. Pre-test and post-test: the student opens `/?undangan=<token>` from a dashboard message. There is no contact step, and the score out of 100 shows right away, with pass or not for the post-test. A link works until it is used for a submission or expires after 14 days.
10. A failed attempt is never submitted. When the total timer reaches zero, or when the violation limit is reached, the test stops and a dialog offers a retry or a return to the start. Neither failure leaves a row: the last strike deletes the attempt right away, and an attempt that ran out of time is deleted by the next sweep, which runs when a new test starts and in the six-hourly safety scan. Answers and recordings go with the row.

## Public API (web app)

| Method | Path | Returns |
|---|---|---|
| GET | `/api/config` | Consent version, open, time mode, duration, total, violation limit, WhatsApp, speaking settings, terms, privacy |
| GET | `/api/invites/:token` | Same as config for the invited test, plus `invite: { test, testName, firstName }`. 404 or 410 when unusable |
| POST | `/api/attempts` | `{ attemptId, secondsLeft, total, timeMode, maxViolations, questions }`. 423 when closed |
| POST | `/api/attempts/:id/violation` | `{ ok, counted }`, plus `ended: true` when the limit deleted the attempt |
| POST | `/api/attempts/:id/submit` | `{ ok, total, timedOut }`, plus `result` for invite attempts |
| POST | `/api/attempts/:id/speaking` | Raw audio body, up to 3 MB, `x-duration` header. `{ ok, status }`. Placement only, within 2 hours of submitting |
| POST | `/api/attempts/:id/speaking-skip` | `{ ok }`. Records that the student could not record |
| POST | `/api/attempts/:id/contact` | `{ delivery: { email, whatsapp }, resultToken, programs, result }`. With a recording waiting it returns `result: null` and `speaking: { status }` instead. Placement only |
| GET | `/api/results/:token` | `{ ready, name, result: { score, total, level, speaking }, programs }` behind the private link. `ready: false` while the recording is still being scored |

Every response is `no-store`. JSON bodies are capped at 16 KB and the speaking upload at 3 MB. The consent version in the request must match `CONSENT_VERSION` in `packages/core/src/legal.js`; the current version is `2026-11-18`, which adds the rule that the answers can only be sent after every question is answered.

## Dashboard (admin app)

| Sidebar menu | Content |
|---|---|
| Ringkasan | Periode-scoped overview: metric strip (pendaftaran, siswa aktif, kursi kelas, lead menunggu), follow-up queue for status Baru (leads only, cold leads excluded), the registration list and the class roster of the selected periode |
| Database Siswa | Only students with at least one non-cancelled registration. Chips filter Aktif, Selesai, Tidak lanjut. CRM search, filters, bulk actions, CSV export, a full record page per student, the Daftarkan siswa dialog that registers a person into a program (search an existing lead or student first, then identity fields, program, durasi, periode, kelas), and a recent registrations panel below the table |
| Sertifikat | Sertifikat terbit lists every issued certificate with search, a type filter, and status chips. Pengaturan lists the certificate types with their template, number format, reset rule, last number, and signer. Each student page also has a Sertifikat panel |
| Placement Test | Soal & Jawaban, Submission, Lead (placement contacts without a registration), and Pengaturan |
| Pre-test, Post-test | Soal & Jawaban, Submission, and Pengaturan |
| Program & Kelas | Program catalog with durations and prices, intake periods, classes, and tutors |

The sidebar stays on the left at every width and collapses to an icon rail; the choice is saved in localStorage under `tnec-nav-collapsed`. The team does not use a PIC. Each enrolled student has a class shown as Tutor / Kelas, for example Aldo / C1. A class is one program, one period, and one tutor, and the tutor must be ticked on that program. Notes and activity on the student page sit in a folded section that is closed by default.

The user rejected five earlier versions. Rejected patterns: a generic stat card template, a menu at the top, a sidebar that turned into a top bar on narrow windows, colored stripes on one side of an element, the Placement Test split into three sidebar menus, a missing student database, a detail panel to the right of a table, and red buttons.

The client loads everything from `GET /api/admin/bootstrap`, then loads a student's activities and a submission's answers when those pages open. Every change goes through the API, then the client reloads. Test links point at `PUBLIC_WEB_URL`.

Admin routes, all under `/api/admin`, need a session except `login` and `setup`, and reject writes whose `Origin` is not the admin app's own origin: `bootstrap`, `logout`, `students` (create, bulk, get, patch, delete, notes, whatsapp, invite), `pendaftaran` (create, update), `tests/:key` (settings, questions, reorder, duplicate, toggle, apply-seconds), `levels`, `attempts/:id` (detail, void, restore, resend-email, delete, bulk-delete), `speaking/:id` (audio, grade, retry, skip, reviewed), the catalog (`programs`, `periods`, `classes`, `tutors`), and certificates (`certificate-types` create, update, delete; `certificates` issue, update, revoke, restore). The printable page `/admin/certificates/<id>` needs a session too; only the template CSS and SVG files next to it are served without one.

## Pendaftaran and the lead model

A registration is one row in `pendaftaran`: a student, a program, a period, an optional duration and class, a status (`aktif`, `selesai`, `batal`), and who registered it. One student can have many rows, one per program and period, and the student row's program columns always mirror the newest non-cancelled registration. The profile's Perjalanan belajar lists every registration oldest to newest, editable through a dialog; cancelling the last non-cancelled row returns the person to the lead side and resets the stage.

Database Siswa only lists students with at least one non-cancelled registration. Everyone else is a lead: a placement test contact that never joined a program. Leads live in the Placement Test Lead tab, carry the follow-up stages Baru, Dihubungi, Konsultasi, Lepas, go cold (Dingin) after 90 days without activity, and leave the Ringkasan queue when cold. Registering a lead moves it into Database Siswa and sets the stage to Terdaftar. The old stage chips are gone from the student list; the student form no longer sets program or stage Terdaftar directly, because a registration is the only way in.

The student row also carries the identity fields collected at registration: tempat lahir, tanggal lahir (ISO date), kota (the old city column, now labelled Kota/Kabupaten), provinsi, kode pos, jenjang pendidikan, and tahu TN dari mana. They are filled in the Pendaftaran form and editable on the profile. "Daftar TN berapa kali" counts the non-cancelled registrations.

## Speaking, scored by Speechace

Speaking is part of the placement test only, switched on in Placement Test, Pengaturan. The flow, the scoring queue, and the manual fallback live in `docs/prd-speaking-section.md`; the parts the code settled on:

1. The student checks the microphone with a 3 to 10 second recording that is never uploaded, then answers the one configured question within the configured seconds. One upload per attempt, within 2 hours of submitting.
2. `packages/core/src/speaking.js` claims each recording with a 120 second lease and calls Speechace `score/speech` with `include_ielts_feedback=1`, `relevance_context`, and `enforce_dialect=1`. Server errors and timeouts retry after 60 and 300 seconds; after the third try, or right away on a refused key, an empty quota, no speech, or another language, the row waits for the team.
3. The five scores (pronunciation, fluency, grammar, vocabulary, coherence) are stored as Speechace sends them, on CEFR, IELTS, and 0 to 100. No conversion of our own. A `response_too_short` warning still sends the result but flags the row for review.
4. The result email, the WhatsApp message, and the result page all wait until the recording is `graded`, `manual`, or `skipped`. The dashboard's Submission page plays the audio, shows the transcript and scores, and can re-run Speechace, grade by hand, skip with a reason, or mark a warning as checked.
5. The Ringkasan view shows an alert when recordings wait for the team or when Speechace failed more than five times in the last hour.
6. Recordings are deleted 30 days after the test; scores and transcripts stay. Without `SPEECHACE_KEY` on the server, every recording goes straight to the manual queue.

## Accounts and sessions

Passwords use PBKDF2 SHA-256 at 600,000 iterations; each account stores its own count. Five wrong passwords lock the account for 15 minutes. A login creates a random token in an HttpOnly, SameSite=Strict cookie named `tnec_admin` for 12 hours; only its SHA-256 hash is stored. The cookie is marked Secure on HTTPS and on localhost; serve the admin app over HTTPS in production. Session lookups are cached in memory for 60 seconds. The role is `admin` or `pendidikan`; both see the whole dashboard today.

## WhatsApp through AttCos

The TNEC channel in AttCos is a WhatsApp account linked through Baileys, not Meta's Cloud API. A message can go to any number at any time, with no 24 hour window and no template rule, so do not design around Cloud API limits.

Two things send messages. The test app sends the placement result by itself in the background after the contact step, next to the email, and gives AttCos at most 20 seconds. That message carries `source: "Placement Test"`, which AttCos stores on the contact as the lead source and shows on its pipeline card (an optional string of 1 to 80 characters in the AttCos API). The dashboard sends when someone presses Kirim, waits at most 25 seconds, and sends no source. Every send is logged in `wa_messages` and in the student's activity (automatic sends show as Sistem), and AttCos errors come back in Indonesian. The 422 message and the "Buka di WhatsApp" fallback only matter if the channel ever moves to the Cloud API. The AttCos key was pasted in chat on 16 November 2026, so it should be rotated.

## Result delivery

The owner asked on 16 November 2026 for the result page to open instantly, with the email and the WhatsApp sent in the background. `packages/core/src/delivery.js` does this with the attempt row as the outbox.

1. The contact step sets `email_status` and `wa_status` to `pending` (or `skipped` when that channel is not set up), answers the student, then starts the delivery without waiting for it.
2. The delivery claims the attempt by setting `delivery_lease_until` to 90 seconds ahead, but only while no other server holds a live lease. Two servers, such as the old and the new one during a deploy, therefore never send the same result.
3. It sends the email and the WhatsApp side by side, each limited to 20 seconds, then records `sent` or `failed: ...` with the time, logs the activity and `wa_messages`, and clears the lease.
4. When the test app starts, it sends every result still pending. A result held by a lease is checked again once the lease runs out, in case its server stopped mid-send.
5. On SIGTERM the test app stops taking requests, waits up to 20 seconds for running sends, then exits, inside the 30 seconds Render allows. Render also keeps the old instance running for 60 seconds after a deploy switches traffic.

A server that crashes in the middle of a send sends that result again after its lease runs out, so in that rare case one message can arrive twice. A failed send is not retried automatically. The dashboard shows a pending email as "Sedang dikirim" and can resend a failed email from the submission page.

## Data model

Times are Unix seconds in BIGINT columns, flags are 0 or 1 in INTEGER columns, and ids are text except `questions`, `activities`, and `wa_messages`, which use identity columns.

| Table | Purpose |
|---|---|
| `attempts`, `answers` | One row per attempt for all three tests; one row per question with the key used at grading time. `result_token` is the private result link |
| `tests`, `questions`, `levels` | Settings, question banks (status `aktif` or `draf`), placement thresholds with `program_url` and `program_image` for the result page cards |
| `speaking_submissions` | One recording per placement attempt: the audio as `bytea`, its work queue status, the five scores, the transcript, and the Speechace response |
| `students`, `activities` | The student database and its history. The identity fields live here, filled at registration |
| `pendaftaran` | One row per program joined, per period: student, program, duration, period, class, status, note, who registered, when. Cancelling keeps the row |
| `programs`, `program_durations`, `program_tutors`, `tutors`, `periods`, `classes` | The catalog |
| `invites` | Personal pre-test and post-test links; only the token hash is stored |
| `wa_messages` | Every WhatsApp send attempt |
| `certificate_types`, `certificate_counters` | Certificate types, and one number counter per type and period |
| `certificates` | Issued certificates with their number, template, printed name, and filled fields. A cancelled one keeps its row |
| `admin_users`, `admin_sessions` | Dashboard accounts and sessions |
| `schema_migrations` | Which migration files have run |

No full IP address is stored. `country` comes from the `CF-IPCountry` header when the app sits behind Cloudflare, otherwise it stays empty. `user_agent` is truncated to 300 characters. Deleting a student removes their activities, messages, invites, and pre-test and post-test attempts; their placement attempts stay for the statistics without contact details.

To change the schema, add a new file such as `db/migrations/0004_something.sql`. Never edit a file that has already run on `main`.

## Level thresholds

The seed thresholds match the JotForm conditions. The team can change them in the dashboard; the server checks that the levels start at 0, leave no gap, and end at the number of active placement questions.

| Score | Level key | Label |
|---|---|---|
| 0 to 5 | `starter` | Starter |
| 6 to 10 | `basic` | Basic |
| 11 to 15 | `intermediate` | Intermediate |
| 16 to 19 | `advanced` | Advanced |
| 20 to 23 | `toefl-prep` | TOEFL/IELTS Preparation |
| 24 to 25 | `toefl-scoring` | TOEFL/IELTS Scoring |

## Anti-cheat

What the app does:

1. Requests fullscreen when the test starts, with the navigation bar hidden where the browser allows it. If the browser refuses, the test continues with a warning banner.
2. Locks the Esc key during the test in Chrome, Edge, and Opera (Keyboard Lock API), asked for right before fullscreen and released when fullscreen ends. A quick press does nothing; leaving fullscreen takes holding Esc for 2 seconds, which the browser always allows and which still counts as a strike. Firefox and Safari have no Keyboard Lock, so Esc leaves fullscreen at once there.
3. Counts leaving fullscreen, hiding the tab, and blurring the window as focus violations. At the limit, 3 by default and set per test, the test stops without submitting, and the attempt row is deleted right away so no Pelanggaran submission is stored.
4. Logs blocked copy, cut, paste, context menu, drag, F12, and developer shortcuts without counting them as strikes.
5. Keeps the timer running while the violation modal is open, and grades on the server.

What it cannot do, and must not claim: stop a second device, a camera, or a helper in the room; block screenshots; switch Esc off completely; hide a phone's navigation bar for good or block the home and back gestures (iPhone Safari has no web fullscreen at all, so there only the strike rule applies); pause when someone leaves fullscreen briefly; detect virtual machines or remote control tools. There is no per-IP rate limit on attempt creation. Do not write "tidak bisa dicurangi" or any absolute claim.

## Privacy and consent

The legal copy follows `.opencode/skills/data-privacy-compliance/SKILL.md`. The privacy policy names Neon (database, Singapore), Cloudflare (result email), and AttCos (WhatsApp, delivered through Meta's WhatsApp service) as processors, and describes the speaking scorer generically as a third-party language assessment partner processing in Singapore, on the owner's instruction that students and competitors must not learn which vendor is used. The speaking vendor is Speechace; that name lives in this file, in the dashboard, and in code, and never in student-facing copy: screens, email, WhatsApp, legal text, or public API payloads (`speakingFacts` emits `source: "auto"`). The policy also states that recordings are deleted after 30 days while the transcript and scores keep the 24 month retention, and that the scorer receives only the recording, the question, and a random id, never the student's name or contact. Consent is recorded per attempt with the text version and timestamp; bump `CONSENT_VERSION` when the wording or the data use changes. Retention is stated as 24 months and there is no deletion job yet. The public test sets no cookies; the dashboard sets one session cookie for staff.

## Email

`packages/core/src/email.js` builds a 600px HTML email with inline styles and a plain text fallback, with a navy WhatsApp CTA. With a graded recording it also carries the speaking card, the transcript, up to three notes, and the panel with the private result link; without speaking it is the original email plus the result link. `mailer.js` sends it through the Cloudflare Email Sending API from `RESULT_FROM_EMAIL` (`placement@index-now.dev`, an onboarded sending domain). The placement result email goes out in the background after the contact step (see Result delivery). Without `CLOUDFLARE_EMAIL_TOKEN` the email is skipped and the result screen leaves it out of its note. The dashboard can resend from the submission page. `node tools/speechace/preview-result.mjs` prints the exact WhatsApp and email copy for both the Speechace and the manual case.

## Certificates

The owner asked on 16 November 2026 for student certificates where every certificate type has its own number format that the team manages, starting with Certificate of Completion, TOEFL Prediction, and IELTS Prediction. In the Sertifikat menu, Pengaturan holds the types. Each type picks one of the HTML templates and has a code, a number format, a reset rule, a last number, a signer, and a status.

A number format is plain text with these tokens. The month and year come from the issue date.

| Token | Becomes | Example for 15 November 2026 |
|---|---|---|
| `{nomor}` | The sequence number. Every format needs it | 146 |
| `{nomor:3}` | The sequence number with at least 3 digits, from 1 to 8 | 007 |
| `{kode}` | The code of the type | MoM |
| `{bulan}`, `{bulan:2}` | The month as a number | 11 |
| `{bulan_romawi}` | The month in Roman numerals | XI |
| `{tahun}` | The year | 2026 |

So `{nomor}/MoM/MKT/TNEC/{bulan_romawi}/{tahun}` gives 146/MoM/MKT/TNEC/XI/2026, the format of the MoM and MeMo letters. Any other text, such as MKT for the division or TNEC for the branch, is printed as typed.

The reset rule says when the sequence starts again at 1: every year (counter period `2026`), every month (`2026-11`), or never (`semua`). A yearly reset needs `{tahun}` in the format, and a monthly one needs `{tahun}` plus `{bulan}` or `{bulan_romawi}`, so a number cannot come back in a later period. The server also refuses a type whose format, with its code filled in, matches another type, because both would print the same numbers.

The number comes from `certificate_counters` through one `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` inside the transaction that saves the certificate. Two people issuing at the same moment get different numbers, and a save that fails gives its number back. A unique index on `certificates.number` is the last guard. Nomor terakhir in Pengaturan edits the counter of the current period. It can move forward to continue a register kept outside the dashboard, but never below a number already issued in that period. The dialogs show the expected number while someone types, using a copy of the format rules in `admin.js`; `tests/smoke.mjs` checks that the copy matches the server.

An issued certificate keeps its number, type, template, issue date, printed name, template fields, and the signer at the time of issue, so a reprint after a signer change still shows who signed it. Editing changes only the printed name and the fields. A certificate is cancelled with a reason instead of deleted, so every number stays accounted for; its print page carries a DIBATALKAN mark, and it can be restored. A type that has been used cannot be deleted, only set to nonaktif. Deleting a student keeps their certificates in the register without the link to the student.

Printing happens in the browser. Cetak opens `/admin/certificates/<id>`, and Cetak atau simpan PDF opens the print dialog, where the paper is A4, the margin None, and Background graphics on. There is no server-side PDF. Every value is HTML-escaped before it goes into the template, and the sample of a type opens at `/admin/certificates/<type id>` with made-up data and the next real number.

A new type that reuses an existing design needs no code, because the team adds it in Pengaturan. A new design is developer work:

1. Add the HTML file to `apps/admin/certificates` with `{{nomor}}`, `{{nama}}`, `{{tanggal}}`, `{{penanda_tangan}}`, `{{jabatan}}`, and one `{{key}}` per field. Keep the links to its CSS and SVG files relative, and add no inline script or style, because the page is served under the dashboard CSP.
2. Add an entry to `TEMPLATES` in `apps/admin/src/certificates.js` with the file, the paper, the default signer, and the fields (key, label, sample, maximum length, and `type: "date"` for a date).
3. Run `npm test`, which checks that the placeholders in the file and the fields in `TEMPLATES` match.
4. Push, deploy the admin service, and create the type in Sertifikat, Pengaturan.

## Design

Read `DESIGN.md` before touching CSS. Navy structure, navy buttons, white reading surface, red only for errors and urgent state, one yellow emphasis. A warning or notice is one even card, filled with the pale yellow over its whole area and a uniform border, never a colored stripe down one side. Feedback appears next to the control that triggered it, inside the card, never as a widget floating above the page. Never hand-build a component or animation when an established open-source one exists; see the Rules section. No gradients, no third-party fonts, and no inline scripts or styles, because both apps send a strict CSP. The CSP allows images from `https://titiknolenglish.com` only, for the program cards on the result page, and `blob:` media for the recording playback.

## Git and push rules

1. This folder is its own repository. Never commit the parent `tnec` folder, `credentials/`, `cpanel-titiknolenglishcom/`, or `tnec-cpanel/`.
2. The remote is `dev-tnec/tnec-placement-test`. The owner made it public on 16 November 2026 so Render can deploy it, so anyone can read every commit. A pushed secret counts as leaked and must be rotated.
3. Commits are authored as Aldo `<354270602+dev-tnec@users.noreply.github.com>` only. No AI attribution, no Co-Authored-By trailers.
4. Use conventional subjects (`feat:`, `fix:`, `docs:`, `chore:`), imperative and one line. Review `git status` and `git diff --staged` before every push.
5. Never commit `.env`, `node_modules/`, the session export `tikno-english-placement-test-setup.json`, or any secret. Pushing from this machine works with the GitHub CLI login: `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main`.
6. After a push, deploy the Render services the change touches, with the Render MCP `trigger_deploy` tool or Manual Deploy in the dashboard: `srv-dbt6h3tg1s2s738toue0` for `apps/web`, `srv-dbt6h3tg1s2s738touf0` for `apps/admin`, and both for `packages`, `db`, or the root package files. Then check that each one reaches `live`.

## Known limits and next steps

1. Placement attempts are linked to a student only after the contact step; an attempt that stops before contact stays in Submission as Tanpa kontak.
2. No resume after a refresh during a test.
3. No rate limit on attempt creation and no bot check.
4. The email sender is on `index-now.dev`, not `titiknolenglish.com`.
5. No automated retention job for the 24 month policy.
6. The public WhatsApp number `6282333143544` comes from the TOEFL online page; confirm it.
7. A failed result email or WhatsApp is not retried automatically. The student's activity shows the error; the team can resend the email from the submission page and send the WhatsApp by hand from the student page. A crash in the middle of a send can make one message arrive twice.
8. Both dashboard roles see everything.
9. The apps run on their onrender.com addresses. A custom domain on `titiknolenglish.com` is not set up yet; adding one means changing `PUBLIC_WEB_URL` and `ADMIN_URL` on Render too.
10. Certificates have no signature image, no QR code or public page to verify them, and no server-side PDF. The IELTS template still prints the title IELTS SIMULATION while the type is called IELTS Prediction; confirm which one is right. The completion template keeps an empty 3 x 4 photo box.
