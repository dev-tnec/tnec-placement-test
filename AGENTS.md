# AGENTS.md: titiknolenglish-placement-test

This file is the working memory for this folder. Read it before changing the app. The design rules live in `DESIGN.md`, and the brand tokens come from `../design.md`.

## Rules

These come from the owner and outrank convenience.

1. Read `DESIGN.md` before any interface change, and use its tokens, sizes, spacing, radii, shadows, and component patterns. Do not invent a hex, size, radius, shadow, or animation that is not there. When something is missing from the design system, add it to `DESIGN.md` first, then use it.
2. Do not build a component, animation, or visualizer from scratch when a proven open-source one exists. Use the real thing: shadcn/ui patterns for the React dashboard, ElevenLabs UI components, and similar established libraries. When the stack cannot consume it directly (strict CSP, no CDN), port the component faithfully, keep its license and source link in the file header, and never approximate it by hand. The speaking wave is the ElevenLabs UI LiveWaveform ported into `apps/web/student/src/live-waveform.js` with its MIT notice. Do not replace it with a home-made equalizer or dots.
3. Be proactive. When the owner reports one instance of a problem, find and fix the whole class of the problem across every screen, state, and viewport before replying, and say what was audited. One cramped row means checking every row with the same content; one side stripe means scanning every notice; one unaligned control means measuring every similar row.
4. Verify what the user sees, not what the DOM claims. Measure rendered geometry (bounding rects, computed styles, canvas pixels) instead of trusting attributes, hidden flags, or booleans.
5. Treat design defects as defects, not taste. A feedback widget floating away from the control that triggered it, an unaligned row, cramped spacing, a card inside a card, or a colored stripe on one side of an element are bugs. When the intended look is unclear, copy the established reference component instead of inventing a new one.
6. Both apps declare the global `[hidden] { display: none !important; }` rule. A component class that sets `display` otherwise beats the hidden attribute and leaves widgets that should be hidden on screen.
7. When the owner names one screen, check every screen that shows the same data before replying. The owner should never have to point out the second place.
8. Search the 21st MCP (`mcp.21st` in the OpenCode config) before building a UI component. Port the real component with its license and source link instead of approximating it by hand. The listening player is the 21st.dev Voice Note by ebnsina, ported in `apps/web/student/src/voice-note.jsx`.

## Owner complaints and the standing fixes

The owner keeps having to repeat these. Check every row before touching the app.

| Complaint | What it means | Where it is handled |
|---|---|---|
| The listening audio only covered Q1-10 | One file for Part 1 to Part 4, played once, and it keeps playing while the student jumps between parts | `apps/web/student/src/App.jsx` audio section, `.audio-card` in `src/app.css` |
| One total timer for the mockup | Listening, Reading, Writing, and Speaking each have their own timer, and a section locks when its time ends | `time_mode='sections'`, `sectionPlan` in `apps/web/src/api.js`, `db/migrations/0013_section_times.sql` |
| Speaking missing from the dashboard | Speaking is visible in Soal & Jawaban, Bagian, Pengaturan, and Submission, not only in the code | `apps/admin/client/src/views/Test.jsx` (`SpeakingBank`, `SectionsTab`, `SettingsTab`, `MockupSpeakingPanel`) |
| The Kunci text was cut | The badge fits the word Kunci and the accepted answers wrap instead of ellipsis | `.opt__key--word` and `.opt__text` in `apps/admin/client/src/admin.css` |
| All questions in one navigator | The student navigator shows only the current section, grouped by part or passage | `navGroups` in `apps/web/student/src/screens.jsx` |
| The speaking notice touched the text above | 24px above the mic-failure notice and 16px to the button | `.speak-error` in `src/app.css` |
| The question card was in the sidebar | The audio card and question card share the main column, and the navigator is the right sidebar | `.test-main` and `.test-grid` in `src/app.css` |
| No view of the audio after it started | The Voice Note player from 21st.dev shows play or pause, a progress slider, and the time | `src/voice-note.jsx`, `.voice-note` in `src/app.css` |
| Listening showed 40 flat questions | Part 1 to Part 4 headings in the navigator, and the count reads 40 soal, 4 bagian | `navGroups` in `screens.jsx` |
| HTML files and Vite | The app is React only, bundled by Node with esbuild, and the servers generate the document shells. No HTML file in the app source or build. Certificates may stay HTML | `scripts/build-react.mjs`, `apps/web/server.js`, `apps/admin/src/api.js` |
| Speaking missing from the Bagian tab | The three speaking parts are sections of Paket Demo A and appear in the main Bagian table with the other nine, counted in the Paket tab | `0014_speaking_sections.sql`, `SectionsTab` in `Test.jsx` |
| The submission summary left two empty blocks | The summary grid picks a column count that divides the cells, so no row ends with an empty block | `statsClass` in `Test.jsx`, `.stats--2/3/4/5` in `admin.css` |
| Bulk mockup import | One paid wave is one session with a CSV import that creates students, registrations, invites, and a two-channel send queue, and participants are students, not leads | `docs/prd-ielts-mockup-bulk.md`, `0015_mockup_sessions.sql`, `views/MockupSesi.jsx`, `invite-queue.js` |

## What this folder is

The online placement test, pre-test, and post-test for Titik Nol English Course, plus the internal dashboard for the admin and education team. It is not part of the WordPress install. It is a Node.js monorepo with two apps that share one PostgreSQL database on Neon.

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
| AI writing scoring | Google AI Studio (Gemini) native `generateContent` REST API through `packages/core/src/writing.js`, `GEMINI_API_KEY`; production model `gemini-3.8-flash`, code fallback `gemini-2.5-flash`; `GEMINI_MOCK=1` for local tests |
| Speaking scoring | Speechace REST API through `packages/core/src/speaking.js` and `speaking-mockup-worker.js`, `SPEECHACE_KEY`; `SPEECHACE_MOCK=1` for local tests |
| Speaking videos | 18 examiner clips in `apps/web/public/video/speaking`, taken from the IELTS Online Tests material. Confirm the rights before charging for the mockup |
| WhatsApp | AttCos (CSQ API), `POST {ATTCOS_API_BASE}/messages`, on a WhatsApp account linked through Baileys |
| Front end | Student test runner: React, bundled with Node and esbuild from `apps/web/student` into `apps/web/public`. Result report: React, bundled with Node and esbuild from `apps/web/result` into `apps/web/public/hasil`. Dashboard: React, bundled with Node and esbuild from `apps/admin/client` into `apps/admin/public/admin`. The document shells are generated by the Node servers from the build manifests, so the app source and build carry no HTML files. All build outputs are committed so the servers only serve files |
| Monorepo | npm workspaces: `apps/*` and `packages/*` |

## Repository layout

| Path | Purpose |
|---|---|
| `apps/web/server.js` | Test site server: static pages and the public API |
| `apps/web/src/api.js` | Public API: config, invites, attempts, violations, submit, contact. Reads test settings and levels on every request, so dashboard changes apply to the next test right away |
| `apps/web/public/` | The committed Node esbuild output of the student test runner: `runner-manifest.json`, `assets/app-*.js`, `assets/app-*.css`, logos, and `favicon.png`. No HTML file |
| `apps/web/student/` | The React test runner source: `src/main.jsx`, `src/App.jsx`, `src/screens.jsx`, `src/lib.js`, `src/live-waveform.js`, `src/app.css`, and `build.mjs` |
| `apps/web/result/` | The React result report source: `src/App.jsx`, `src/report.js`, `src/hasil.css`, and `build.mjs` |
| `apps/web/public/hasil/` | The committed Node esbuild output of the result report, served at `/hasil`, with `report-manifest.json` and no HTML file |
| `apps/admin/server.js` | Dashboard server and the first admin setup notice |
| `apps/admin/src/api.js` | Dashboard pages, sessions, first admin setup, and every `/api/admin` route |
| `apps/admin/src/certificates.js` | Certificate types, number formats and counters, issuing, and the printable certificate page. See Certificates below |
| `apps/admin/src/invite-queue.js` | The mockup invite queue worker: after "Kirim semua" it sends every queued invite on both channels, one row at a time, with the Cloudflare email quota and the AttCos WhatsApp channel. The plain invite token lives on the queue row until both channels have delivered |
| `apps/admin/certificates/` | The certificate HTML templates with their CSS and drawings |
| `apps/admin/client/` | The React dashboard client served at `/admin/`: `src/` (store, lib, ui atoms, dialogs, menus, views including `views/MockupSesi.jsx`, icon sprite), `public/assets/` for the certificate print bar files, and `build.mjs` |
| `apps/admin/public/admin/` | The committed Node esbuild output of the React client, with `admin-manifest.json` and `assets/certificate-page.css` and `certificate-page.js` for the bar above a printable certificate. No HTML file |
| `packages/core/src/db.js` | Postgres pool with a small `prepare(sql).bind(...).first()/all()/run()` and `batch()` API. `?` placeholders become `$1..$n`; `batch()` is one transaction; read-only batches run in parallel; `transaction(work)` runs steps that need an earlier result, such as taking a certificate number, in one transaction |
| `packages/core/src/env.js` | Loads `.env` (or `ENV_FILE`) and builds the shared `env` object |
| `packages/core/src/node-server.js` | Node HTTP adapter for fetch-style handlers, static files, security headers |
| `packages/core/src/migrate.js` | Applies pending `db/migrations` files in one transaction with an advisory lock |
| `packages/core/src/delivery.js` | Sends the placement result email and WhatsApp in the background after the contact step. See Result delivery below |
| `db/migrations/0007_pendaftaran_and_mockup.sql` | Pendaftaran and the identity fields, the fourth test row `ielts-mockup`, and the invite code columns |
| `db/migrations/0008_ielts_mockup.sql` | The IELTS mockup bank: question type, part, accepted answers, audio and band columns, the band scale table, and the December Test 1 questions and audio. Generated by `scripts/extract-ielts.mjs` |
| `db/migrations/0009_question_sections.sql` | The question sections for the IELTS mockup: `question_sections`, `questions.section_id`, `attempt_audio_plays`, the seven December sections (four listening parts with the audio on Part 1, three reading passages), and the reading passage typo correction |
| `db/migrations/0010_question_packages.sql` | The question packages for the IELTS mockup: `question_packages`, `package_id` on questions, sections, invites, and attempts, and the December bank moved into Paket Demo A |
| `db/migrations/0011_writing.sql` | The two Writing tasks in Paket Demo A, the `longtext` type with `min_words`, the section `image_url`, `attempts.writing_status` and `writing_error`, the answer constraint, and the 155 minute duration |
| `db/migrations/0012_mockup_speaking.sql` | The `speaking_answers` queue, `attempts.speaking_status` and `speaking_error`, and the mockup speaking switch |
| `db/migrations/0013_section_times.sql` | The four section durations on `tests`, `time_mode = 'sections'` with its widened check constraint, and the 10020 second mockup total |
| `db/migrations/0014_speaking_sections.sql` | The three Speaking sections of Paket Demo A, so the interview parts sit in the package beside Listening, Reading, and Writing |
| `db/migrations/0015_mockup_sessions.sql` | The bulk mockup: `mockup_sessions`, `invites.session_id`, the `mockup_invite_queue` with per-channel statuses, and the seeded "IELTS Mockup" program with its "1 hari" duration |
| `scripts/extract-ielts.mjs` | One-shot extractor that reads the December package from `../ielts-mockup` and rewrites `db/migrations/0008_ielts_mockup.sql` plus copies the listening audio |
| `packages/core/src/bands.js` | The IELTS scoring rules: text answer normalization, the raw to band lookup, and the overall band rounding |
| `packages/core/src/writing.js` | The Gemini writing scorer: the four criteria, the Task 2 weighting, the JSON response schema, and the local mock (`GEMINI_MOCK=1`) |
| `packages/core/src/speaking-mockup.js`, `speaking-mockup-worker.js` | The 18-question mockup speaking plan, the four-criteria mapping, and the Speechace queue that adds the Speaking skill to the attempt |
| `apps/web/public/video/speaking/` | The 18 examiner clips used by the mockup speaking interview, from the IELTS Online Tests material |
| `docs/ielts-mockup-speaking.md` | The examiner video list the mockup speaking plan is built from |
| `packages/core/src/store.js`, `http.js`, `crypto.js`, `whatsapp.js`, `email.js`, `legal.js`, `levels.js`, `questions.js` | Shared logic. `questions.js` is the original 25 questions and only documents the seed |
| `db/migrations/0001_init.sql` | Full schema plus seeds: 3 tests, 6 levels, 25 placement questions, 12 draft questions each for pre-test and post-test |
| `db/migrations/0002_result_whatsapp.sql` | Adds `wa_sent_at` and `wa_status` to `attempts` for the automatic result WhatsApp |
| `db/migrations/0003_result_delivery.sql` | Adds `delivery_lease_until` to `attempts` for the background result delivery |
| `db/migrations/0004_certificates.sql` | Adds `certificate_types`, `certificate_counters`, and `certificates`, and seeds the Certificate of Completion, TOEFL Prediction, and IELTS Prediction types |
| `db/migrations/0005_speaking.sql` | Adds the speaking settings on `tests` and the `speaking_submissions` queue |
| `db/migrations/0006_program_link.sql` | Adds `program_url` and `program_image` on `levels`, seeds the real product pages, and adds `result_token` on `attempts` for the private result link |
| `packages/core/src/speaking.js` | The scoring worker: claims a recording with a lease, calls Speechace, stores the five scores, retries, purges old audio, and sweeps expired attempts |
| `packages/core/src/mockup-bulk.js` | Pure rules for the bulk mockup: the CSV parser with quotes and duplicate checks, the per-student test window, the Jakarta time formatter, and the invite message copy. Checked by `tests/smoke.mjs` |
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
4. In total mode the test runs for the configured duration. In per question mode every question has its own seconds, the next question opens when the time runs out, there is no going back, and the answers are sent automatically after the last question. In section mode, used only by the IELTS mockup, each skill has its own timer and the student works one section at a time.
5. Submitting sends only the answers. The server grades them against the questions stored on the attempt and stores the key used with each answer. The manual send only works after every question is answered: the finish button and the submit dialog stay closed until the count of answers reaches the total, and `submitAnswers` re-checks it, so an incomplete test cannot be sent by hand. The per-question auto send after the last question is one exception, because its blanks come from question timeouts and those questions cannot be reopened. The section auto send at the end of Writing is the other, because a locked section cannot be reopened either. For the placement test the response never includes the score.
6. Placement with speaking on: after the multiple choice part the student checks the microphone first with a 3 to 10 second test recording that is never uploaded, listens to it, and either retries or continues. While any recording runs, one aligned row appears inside the active card directly above the buttons: a pulsing red dot, the words "Merekam suara kamu", a live red sound wave filling the middle, and a timer, all on the same center line; the mic-failure notice and the "Lanjut tanpa rekaman" button appear in the same spot, never as a box on top of the page. A permission failure keeps the record button available so the student can retry after fixing the address bar setting. Then the student records the answer, between the configured minimum and maximum seconds, can listen and re-record, and sends it once. A student whose microphone fails can skip the part and the result goes out without speaking.
7. Placement only: the details screen collects name, email, and WhatsApp. `POST /api/attempts/:id/contact` links or creates the student, logs the activity, creates the private result link, marks the result email and the result WhatsApp as pending, and returns the result right away when there is no recording waiting. The browser then opens the React report at `/hasil?token=<resultToken>`. The server sends both channels in the background (see Result delivery), so the result page never waits for Cloudflare or AttCos. Nobody presses anything for either one. A repeated contact step does not send a channel again once it has delivered for that attempt.
8. With a recording waiting, the contact step returns `result: null`, and the report shows its waiting state, which polls the result link every six seconds and shows the full result as soon as the recording is scored. The same link, `/hasil?token=<token>`, goes out in the email and the WhatsApp message and opens the same report without a session, including the speaking block and the program cards. Old `/?hasil=<token>` links redirect to it.
9. Pre-test and post-test: the student opens `/?undangan=<token>` from a dashboard message. There is no contact step. After submit the browser opens `/hasil?attempt=<id>`, which shows the score out of 100 and pass or not for the post-test. A link works until it is used for a submission or expires after 14 days.
10. IELTS Mockup: the student opens `/?undangan=<token>` from a dashboard message and must also type the 6 character code from the same message; three wrong codes lock the invite until the team makes a new one. The test runs on `time_mode = 'sections'`, the only test that does: Listening 32 minutes (30 minutes of audio plus 2 minutes to check), Reading 60, Writing 60, and the speaking interview 15, all editable in Pengaturan and summed into `total_seconds` (10020 by default). A section locks when its timer ends or when the student presses the section finish button, the next section opens on its first question with a fresh timer, and a finished section cannot be reopened. Free navigation stays inside the current section, which in Listening means Part 1 to Part 4 while the single audio plays. The test never opens publicly. The bank is split into question packages (the Paket tab): a package owns its questions and sections, and the current December bank is Paket Demo A. When the team sends an invite it picks a package or lets the server pick a random active package with questions; the invite stores the package, the attempt stores it too, and grading loads that package's questions. Inside a package the bank is split into question sections (the Bagian tab): a section owns a question range plus its reading passage or listening instructions and an optional audio address, and each question stores its `section_id`. Paket Demo A also carries three Speaking sections (Part 1, Part 2, Part 3) that label the interview; their 18 questions and videos come from the fixed plan, so they have no question range. The student screen shows the passage of the question's section on every question of that section. The listening audio is one file for Part 1 to Part 4, stored on the first Listening section; the runner finds it by skill, so the card stays mounted and the sound keeps playing while the student moves between all 40 listening questions. It plays once per attempt, marked by `POST /api/attempts/:id/audio-played` with `{ sectionId }` and refused on a second call. Because the passage and audio belong to the section, a later shuffle can move questions without separating them. Questions can be `choice` with two to six options or `text` graded loosely against the accepted list. At the end of Writing the test moves into the speaking block, and the answers are sent once that block ends; a section timer running out does the same. The result screen shows the raw score and band per skill and the overall band, the mean of the skill bands rounded to the nearest half, with the sentence that the band is an estimate and not an official IELTS score. The bands are stored on the attempt at submit time. The mockup also has two Writing tasks (Task 1 with the Dalton map image, Task 2) as `longtext` questions in their own sections. On submit the essays are scored by Google AI Studio (Gemini) with the four IELTS criteria; the writing band weights Task 2 twice, the overall band becomes the mean of Listening, Reading, and Writing, and a failed AI call leaves `writing_status` failed so the team can re-score from the submission page. The mockup also runs the speaking interview from the examiner videos listed in `docs/ielts-mockup-speaking.md`: Part 1 has 11 questions, Part 2 has a cue card with 60 seconds of preparation, and Part 3 has 6 questions, so 18 recordings per attempt. Each answer is stored in `speaking_answers` and scored by Speechace in the background; when all are graded the Speaking skill joins the bands and the overall becomes the mean of four skills, and the result screen waits on `GET /api/attempts/:id/result`. A student whose microphone fails can skip the speaking, and the result then has three skills. See `docs/prd-ielts-mockup.md`. Paid waves come in bulk through the Sesi tab: one session per wave carries the window mode, the mockup program and period, the package, and the quota, a CSV import (template, preview, confirm) creates or reuses students, registers them in Database Siswa, and creates one invite per student with its own `opens_at` and `expires_at`, and after the team presses "Kirim semua" the queue worker in `apps/admin/src/invite-queue.js` delivers every invite on email and WhatsApp, one row at a time, with the Cloudflare quota pausing only the email channel. See `docs/prd-ielts-mockup-bulk.md`.
11. A failed attempt is never submitted, except the IELTS mockup, whose section timers send whatever is answered at the end of Writing and still produce a band. When the timer of any other test reaches zero, or when the violation limit is reached, that test stops and a dialog offers a retry or a return to the start. Neither failure leaves a row: the last strike deletes the attempt right away, and an attempt that ran out of time is deleted by the next sweep, which runs when a new test starts and in the six-hourly safety scan. Answers and recordings go with the row.

## Public API (web app)

| Method | Path | Returns |
|---|---|---|
| GET | `/api/config` | Consent version, open, time mode, duration, total, violation limit, WhatsApp, speaking settings, `sectionPlan` for the IELTS mockup, terms, privacy |
| GET | `/api/invites/:token` | Same as config for the invited test, plus `invite: { test, testName, firstName, needsCode, packageName }`. The counts come from the package stored on the invite. 404, 410, or 423 when unusable |
| POST | `/api/attempts` | `{ attemptId, secondsLeft, total, timeMode, maxViolations, sectionPlan, sections, questions }`. Sections carry their passage, audio, and image; longtext questions carry `minWords`; `sectionPlan` lists the four IELTS mockup sections with their seconds. 423 when closed |
| POST | `/api/attempts/:id/violation` | `{ ok, counted }`, plus `ended: true` when the limit deleted the attempt |
| POST | `/api/attempts/:id/audio-played` | Body `{ sectionId }`. `{ ok: true }`, once per section per attempt. 409 on a second call, 404 for a section without audio. IELTS mockup only |
| POST | `/api/attempts/:id/speaking-answer` | Raw audio up to 3 MB with `x-duration`, query `part` and `prompt`. Stores one mockup speaking answer and queues Speechace. 409 when that answer is already graded. IELTS mockup only |
| GET | `/api/attempts/:id/result` | `{ ready, result }` for a submitted invited attempt (pre-test, post-test, IELTS mockup). `ready: false` while the mockup speaking answers are still pending. The attempt UUID is the secret |
| POST | `/api/attempts/:id/submit` | `{ ok, total, timedOut }`, plus `result` for invite attempts. For the IELTS mockup the result carries `overall`, `skills` with raw, total, and band per skill, the Writing tasks and criteria, `writingStatus`, `speakingStatus`, and the disclaimer sentence. Two essays raise the body cap to 64 KB |
| POST | `/api/attempts/:id/speaking` | Raw audio body, up to 3 MB, `x-duration` header. `{ ok, status }`. Placement only, within 2 hours of submitting |
| POST | `/api/attempts/:id/speaking-skip` | `{ ok }`. Records that the student could not record. Placement, or the mockup before any answer |
| POST | `/api/attempts/:id/contact` | `{ delivery: { email, whatsapp }, resultToken, programs, result }`. With a recording waiting it returns `result: null` and `speaking: { status }` instead. Placement only |
| GET | `/api/results/:token` | `{ ready, name, result: { score, total, level, speaking, date, code, whatsapp, levels, next }, programs }` behind the private link. `ready: false` while the recording is still being scored |

Every response is `no-store`. JSON bodies are capped at 16 KB, the mockup submit at 64 KB for the essays, and the speaking upload at 3 MB. The consent version in the request must match `CONSENT_VERSION` in `packages/core/src/legal.js`; the current version is `2026-11-20`, which adds the writing AI and the mockup speaking interview to the data use.

## Dashboard (admin app)

| Sidebar menu | Content |
|---|---|
| Ringkasan | Periode-scoped overview: metric strip (pendaftaran, siswa aktif, kursi kelas, lead menunggu), follow-up queue for status Baru (leads only, cold leads excluded), the registration list and the class roster of the selected periode |
| Database Siswa | Only students with at least one non-cancelled registration. Chips filter Aktif, Selesai, Tidak lanjut. CRM search, filters, bulk actions, CSV export, a full record page per student, the Daftarkan siswa dialog that registers a person into a program (search an existing lead or student first, then identity fields, program, durasi, periode, kelas), and a recent registrations panel below the table |
| Sertifikat | Sertifikat terbit lists every issued certificate with search, a type filter, and status chips. Pengaturan lists the certificate types with their template, number format, reset rule, last number, and signer. Each student page also has a Sertifikat panel |
| Placement Test | Soal & Jawaban, Submission, Lead (placement contacts without a registration), and Pengaturan |
| Pre-test, Post-test | Soal & Jawaban, Submission, and Pengaturan |
| IELTS Mockup | Soal & Jawaban, Submission, Bagian, Paket, Sesi, and Pengaturan. Soal & Jawaban has a Speaking chip that lists the 18 interview questions by part with their examiner video and timing; they come from the fixed plan in `packages/core/src/speaking-mockup.js` and are read-only there. Paket lists the question packages with their active question count and section count; the package dialog sets the name and the active switch. A package selector in Soal & Jawaban and Bagian scopes the bank, the sections, the new-question target, and the position numbers. Sending the mockup invite asks for a package or Acak (a random active package with questions), and the WhatsApp dialog shows the chosen package. Bagian lists the question sections with their derived question range, skill, audio file, image, and passage length; the section dialog sets the title, skill, part, question range, passage, audio address, and image address, and moving the range reassigns the questions. The question editor supports the text answer type with its accepted list, the essay type with its word minimum, the part number, up to six options, and the section picker. The submission list and detail show the raw score and band per skill, the Writing band, the Speaking band, the overall band, the package, and when the audio was played; the Writing panel shows both essays, the four AI criteria, and a Nilai ulang writing button; the Speaking panel lists every recording with its transcript, the five Speechace scores, an audio player, and a Nilai ulang yang gagal button. Sesi lists the mockup sessions, one per paid wave: the session dialog sets the name, the window mode (terjadwal with per-student date and time plus a 2 hour entry grace, or fleksibel with an admin-set date range), the mockup program, the period, the package, and the quota. The session page imports a CSV roster (template download, preview with per-row errors and old-versus-new student matching, then one confirm that creates students, registrations, invites, and queue rows), and the roster shows each invite's code, window, email status, WhatsApp status, and test status with per-channel retry and a move-to-session action. Pengaturan holds the four section durations (Listening, Reading, Writing, Speaking, 1 to 180 minutes each, summed into the total shown under the fields), the auto submit switch, the open switch, and the violation limit; the audio is no longer set there |
| Program & Kelas | Program catalog with durations and prices, intake periods, classes, and tutors |

The sidebar stays on the left at every width and collapses to an icon rail; the choice is saved in localStorage under `tnec-nav-collapsed`. The team does not use a PIC. Each enrolled student has a class shown as Tutor / Kelas, for example Aldo / C1. A class is one program, one period, and one tutor, and the tutor must be ticked on that program. Notes and activity on the student page sit in a folded section that is closed by default.

The user rejected five earlier versions. Rejected patterns: a generic stat card template, a menu at the top, a sidebar that turned into a top bar on narrow windows, colored stripes on one side of an element, the Placement Test split into three sidebar menus, a missing student database, a detail panel to the right of a table, and red buttons.

The client loads everything from `GET /api/admin/bootstrap`, then loads a student's activities and a submission's answers when those pages open. The bootstrap is cached in the tab's sessionStorage for the 12 hour session, so a reload paints the dashboard immediately and refreshes it in the background; the cache is cleared on login, logout, and a 401, and its key is bumped when the bootstrap shape changes. Every change goes through the API, then the client reloads. Test links point at `PUBLIC_WEB_URL`.

Admin routes, all under `/api/admin`, need a session except `login` and `setup`, and reject writes whose `Origin` is not the admin app's own origin: `bootstrap`, `logout`, `students` (create, bulk, get, patch, delete, notes, whatsapp, invite), `pendaftaran` (create, update), `mockup/sessions` (create, update, import preview, import confirm, send, pause, test-send, roster) and `mockup/invites/:id` (retry one channel, move to another session), `tests/:key` (settings, questions, reorder, duplicate, toggle, apply-seconds), `levels`, `attempts/:id` (detail, void, restore, resend-email, delete, bulk-delete, writing-grade, speaking-retry), `speaking-answers/:id/audio`, `speaking/:id` (audio, grade, retry, skip, reviewed), the catalog (`programs`, `periods`, `classes`, `tutors`), and certificates (`certificate-types` create, update, delete; `certificates` issue, update, revoke, restore). The test key in the routes is one of `placement`, `pre`, `post`, or `ielts-mockup`. The printable page `/admin/certificates/<id>` needs a session too; only the template CSS and SVG files next to it are served without one.

## Pendaftaran and the lead model

A registration is one row in `pendaftaran`: a student, a program, a period, an optional duration and class, a status (`aktif`, `selesai`, `batal`), and who registered it. One student can have many rows, one per program and period, and the student row's program columns always mirror the newest non-cancelled registration. The profile's Perjalanan belajar lists every registration oldest to newest, editable through a dialog; cancelling the last non-cancelled row returns the person to the lead side and resets the stage.

Database Siswa only lists students with at least one non-cancelled registration. Everyone else is a lead: a placement test contact that never joined a program. Leads live in the Placement Test Lead tab, carry the follow-up stages Baru, Dihubungi, Konsultasi, Lepas, go cold (Dingin) after 90 days without activity, and leave the Ringkasan queue when cold. Registering a lead moves it into Database Siswa and sets the stage to Terdaftar. The old stage chips are gone from the student list; the student form no longer sets program or stage Terdaftar directly, because a registration is the only way in.

The student row also carries the identity fields collected at registration: tempat lahir, tanggal lahir (ISO date), kota (the old city column, now labelled Kota/Kabupaten), provinsi, kode pos, jenjang pendidikan, and tahu TN dari mana. They are filled in the Pendaftaran form and editable on the profile. "Daftar TN berapa kali" counts the non-cancelled registrations.

## Speaking, scored by Speechace

Speaking is part of the placement test and the IELTS mockup. The placement has one question; the mockup has 18 video questions in three parts (11 in Part 1, the Part 2 cue card with 60 seconds of preparation, and 6 in Part 3), and each answer is a separate recording. The flow, the scoring queue, and the manual fallback for the placement live in `docs/prd-speaking-section.md`; the mockup queue is in `speaking_answers` and `speaking-mockup-worker.js`. The parts the code settled on:

1. The student checks the microphone with a 3 to 10 second recording that is never uploaded. The placement then answers the one configured question within the configured seconds, with one upload within 2 hours of submitting. The mockup answers 18 questions, one upload each, before the submit, and can skip after a microphone failure.
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
| `tests`, `questions`, `levels` | Settings, question banks (status `aktif` or `draf`), placement thresholds with `program_url` and `program_image` for the result page cards. `questions.package_id` and `questions.section_id` point at the mockup package and section; `questions.min_words` holds the essay minimum |
| `question_packages` | The mockup question sets. A package owns its questions and sections; invites and attempts store the package so grading follows the set the student got |
| `question_sections`, `attempt_audio_plays` | A mockup section owns a question range plus its passage, optional audio, and optional image; `attempt_audio_plays` records the one audio play per section per attempt. `attempts.writing_status` and `writing_error` hold the AI writing state, `attempts.speaking_status` and `speaking_error` hold the mockup speaking state, and the bands live inside `attempts.bands` |
| `speaking_answers` | One row per mockup speaking question: the audio, its queue status, the five Speechace aspect scores, the transcript, and the error. The audio is purged after 30 days while the scores and transcript stay |
| `speaking_submissions` | One recording per placement attempt: the audio as `bytea`, its work queue status, the five scores, the transcript, and the Speechace response |
| `students`, `activities` | The student database and its history. The identity fields live here, filled at registration |
| `pendaftaran` | One row per program joined, per period: student, program, duration, period, class, status, note, who registered, when. Cancelling keeps the row |
| `programs`, `program_durations`, `program_tutors`, `tutors`, `periods`, `classes` | The catalog |
| `invites` | Personal pre-test, post-test, and mockup links; only the token hash is stored. The bulk mockup adds `session_id`, `opens_at` (the student's own window start), and a unique index on `(session_id, student_id)` |
| `mockup_sessions` | One paid mockup wave: name, window mode (`terjadwal` with per-student date and time plus an entry grace, or `fleksibel` with an admin-set date range), the mockup program and period for the registration, the package, the quota, the queue pause flag, and the status |
| `mockup_invite_queue` | One row per session invite with a separate status per channel: email (`pending`, `sending`, `sent`, `failed`, `dilewati`, `kuota`) and WhatsApp (`pending`, `sending`, `sent`, `failed`), the attempts and error per channel, and the plain invite token, which is erased once both channels have delivered |
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

The legal copy follows `.opencode/skills/data-privacy-compliance/SKILL.md`. The privacy policy names Neon (database, Singapore), Cloudflare (result email), and AttCos (WhatsApp, delivered through Meta's WhatsApp service) as processors, and describes the speaking scorer generically as a third-party language assessment partner processing in Singapore, on the owner's instruction that students and competitors must not learn which vendor is used. The speaking vendor is Speechace; that name lives in this file, in the dashboard, and in code, and never in student-facing copy: screens, email, WhatsApp, legal text, or public API payloads (`speakingFacts` emits `source: "auto"`). The writing scorer is Google AI Studio (Gemini); that name also lives in this file, the dashboard, and code, and never in student copy. The policy describes the writing scorer generically as an AI language assessment partner processing outside Indonesia, receiving only the essay, the task text, and a random id, never the student's name or contact, and the essays keep the 24 month retention. The policy also states that recordings are deleted after 30 days while the transcript and scores keep the 24 month retention, and that the speaking scorer receives only the recording, the question, and a random id. Consent is recorded per attempt with the text version and timestamp; `CONSENT_VERSION` is `2026-11-20` for the writing AI and the mockup speaking interview. The mockup speaking uses the same recordings, the same scorer, and the same 30 day audio purge as the placement speaking, and its result is only shown on screen, never emailed. Retention is stated as 24 months and there is no deletion job yet. The public test sets no cookies; the dashboard sets one session cookie for staff.

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

The runner stylesheet is `apps/web/student/src/app.css`, imported by `src/main.jsx`. esbuild bundles and hashes it, and the Node server writes the link into the generated document shell, so no stylesheet link is ever added to an HTML file by hand.

## React standard

The three React apps (the student runner, the result report, the dashboard) follow one standard, checked against the Vercel React best practices skill. New React work must keep it.

1. Function components only, on React 19 with the automatic JSX runtime. No class components, no `React.createRef`, no string refs, no default exports of non-component modules where a named export is the pattern.
2. Shared components live in one place per app and are searched before a new one is written. The dashboard keeps every atom in `src/ui.jsx` (Icon, Status, Chip, Empty, PageHead, Pager, Notice, the cell components) and every dialog in `src/dialogs.jsx`; the student runner keeps the screens in `src/screens.jsx` with icons hoisted to module level; the result report is one page in `src/App.jsx`. Before writing a new component, grep the existing atoms and the 21st MCP for an established one; only build new when nothing fits.
3. Shared logic used by two or more apps goes in `packages/core/src` as a pure module with no Node builtins, so both the server and the browser bundles can import it (`mockup-bulk.js` is the pattern), and `tests/smoke.mjs` covers it. Logic used by one app stays in that app.
4. Never define a component inside a component. Components, icon SVGs, and message builders are hoisted to module level; inline arrow functions inside JSX are for event handlers only.
5. State: the dashboard is one external store subscribed through `useSyncExternalStore` (`useVersion`), every write goes through the API and then `reload()`, and no view keeps a private copy of bootstrap data. The runner uses local state; refs mirror state for the timer and event callbacks, and the mirror assignment happens in `useEffect`, never during render, because writing refs during render tears under concurrent rendering.
6. Every effect that starts something returns a cleanup: intervals, timeouts, listeners, media tracks, object URLs, and the LiveWaveform destroy. The result report's polling effect is the reference (`stopped` flag plus `clearTimeout`).
7. Derive state during render (`useMemo` or a plain expression), not by copying state into other state inside an effect. Effects are for subscribing to the outside world, not for re-rendering.
8. Every `.map` render carries a stable `key`. Conditional rendering uses a ternary or an explicit boolean; never `number && jsx`, which renders the number.
9. Imports are direct from the file, never through a barrel file, so esbuild tree-shakes and the committed bundle stays small. No runtime CSS-in-JS; styles are the committed `.css` files per app, because both CSPs block inline styles.
10. Forms in the dashboard are uncontrolled by design: values are read from the DOM at submit, validated with `makeFieldFail()` from `src/dom.js` (one shared helper, not a per-dialog copy) and `busy()` for the submit button. The student test inputs are controlled.
11. The Vercel React best practices skill (`react-best-practices`) and the 21st component MCP are installed; consult them before new React work, the same way DESIGN.md governs CSS.

## Git and push rules

1. This folder is its own repository. Never commit the parent `tnec` folder, `credentials/`, `cpanel-titiknolenglishcom/`, or `tnec-cpanel/`.
2. The remote is `dev-tnec/tnec-placement-test`. The owner made it public on 16 November 2026 so Render can deploy it, so anyone can read every commit. A pushed secret counts as leaked and must be rotated.
3. Commits are authored as Aldo `<354270602+dev-tnec@users.noreply.github.com>` only. No AI attribution, no Co-Authored-By trailers.
4. Use conventional subjects (`feat:`, `fix:`, `docs:`, `chore:`), imperative and one line. Review `git status` and `git diff --staged` before every push.
5. Never commit `.env`, `node_modules/`, the session export `tikno-english-placement-test-setup.json`, or any secret. Pushing from this machine works with the GitHub CLI login: `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main`.
6. After a push, deploy the Render services the change touches with `npm run render -- deploy both` (or `web` or `admin`). The helper uses the Render API key from the OpenCode config. Then run `npm run render -- status both` and check that each one reaches `live`. Deploy both for `packages`, `db`, or the root package files.

## Render access

The Render MCP is configured in the OpenCode config at `C:\Users\Sales\.config\opencode\opencode.json` under `mcp.servers.render`, with a Render API key in `mcp.servers.render.headers.Authorization`. The MCP tools may not appear in a session's tool search. That does not mean the account is unavailable. Use `scripts/render.mjs` or the Render REST API with that key. Never commit the key or paste it into a repository file.

The project uses two web services in the IndexNow workspace, Singapore, Starter plan, branch `main`. The `tnec-ielts-mockup` service is in the same workspace but is not part of this repository; do not deploy or change it.

| Service | ID | Address | Start command |
|---|---|---|---|
| `tnec-placement-test` | `srv-dbt6h3tg1s2s738toue0` | https://tnec-placement-test.onrender.com | `npm run start:web` |
| `tnec-placement-admin` | `srv-dbt6h3tg1s2s738touf0` | https://tnec-placement-admin.onrender.com/admin | `npm run start:admin` |

The helper reads the key from the OpenCode config, or from `RENDER_API_KEY` when that is set, and never prints it.

1. `npm run render -- status both` lists the latest deploys.
2. `npm run render -- deploy both` triggers both and waits until `live` or a failure. Use `web` or `admin` for one service.
3. `npm run render -- env list web` lists the variable names with masked values. Add `--show-values` only when you are alone on the screen.
4. `npm run render -- env set both GEMINI_API_KEY=...` adds or updates one variable. `npm run render -- env delete web KEY` removes one. Run `deploy both` after an environment change.

The REST calls behind the helper use `Authorization: Bearer <key>` against `https://api.render.com/v1`.

| Method | Path | Use |
|---|---|---|
| GET | `/services` | List services |
| POST | `/services/{id}/deploys` | Trigger a deploy, body `{"clearCache":"do_not_clear"}` |
| GET | `/services/{id}/deploys?limit=5` | Latest deploys and their status |
| GET | `/services/{id}/env-vars` | List environment variables |
| PUT | `/services/{id}/env-vars/{key}` | Add or update one, body `{"value":"..."}` |
| DELETE | `/services/{id}/env-vars/{key}` | Delete one |

On 17 November 2026 both placement services have `SPEECHACE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.8-flash`, `DATABASE_URL`, the Cloudflare email keys, and the AttCos keys. The local `.env` does not have the Gemini key; local tests use `GEMINI_MOCK=1` in `.env.dev`.

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
11. Writing is AI only, by the owner's decision, with no human review. A wrong AI band is corrected only by pressing Nilai ulang writing after fixing the key or the prompt. The Task 1 chart image is not sent to Gemini, so the model grades that task from the prompt text and the essay. The overall band uses the four skills when the speaking is graded; a skipped or failed speaking leaves it at three. The AI call runs inside the submit request, so a slow Gemini response delays the result screen; a failure stores `writing_status` failed and the team can re-score. The production services have `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-3.8-flash`; a missing key still fails with a clear message.
12. The mockup speaking is Speechace only, with no manual band entry yet. A failed answer can be re-queued from the submission page; if Speechace keeps failing, the result stays without Speaking. Each attempt sends up to 18 Speechace calls, so watch the quota. The 18 examiner videos come from IELTS Online Tests and their rights must be confirmed before charging. The headless test browser denies the microphone, so the recording path is covered by the placement speaking tests and the server tests, not by a full mockup recording run.
13. The student runner and the result report are two Node esbuild builds. A change under `apps/web/student` or `apps/web/result` needs `npm run build:web` before it is served or pushed, because Render serves the committed build and does not run a build command. `npm test` checks that both manifests and their bundles exist, and that the app source and build carry no HTML files.
