# AGENTS.md: titiknolenglish-placement-test

This file is the working memory for this folder. Read it before changing the app. The design rules live in `DESIGN.md`, and the brand tokens come from `../design.md`.

## What this folder is

A standalone online placement test for Titik Nol English Course, plus the internal dashboard for the admin and education team. It is not an Elementor page and it is not part of the WordPress install. The app is one Cloudflare Worker that serves the static test, the protected dashboard at `/admin`, and the JSON APIs. Data lives in Cloudflare D1, result emails go through Cloudflare Email Sending, and WhatsApp messages go through AttCos.

The source material is in this folder: `placement-test-questions.md`, `placement-test-questions.txt`, `placement-test.xlsx`, and the UI reference `assets/code.html`. The original question set and the level thresholds come from JotForm form 252018413812044. The reference mock is a starting point for layout, not a pixel contract.

## Current status

The placement test was built and tested locally on 14 November 2026 but has not been deployed. On 16 November 2026 the Worker did not exist on the Cloudflare account yet, and the remote D1 held only the original `attempts` and `answers` tables with no rows. On the same day the real dashboard was built from the approved prototype and wired to D1: questions, test settings, and level thresholds moved from code into D1, pre-test and post-test were added, and the dashboard can send WhatsApp messages through AttCos. The full flow passes locally in a headless browser: dashboard login, catalog, student records, notes, WhatsApp through a local AttCos stub (including the 24 hour window error), invite links, the placement test with contact and result, the pre-test score screen, and per question timing with auto advance and auto submit.

Production still needs these steps, in this order, and each one needs the owner's approval: apply the migrations to the remote D1, create the first dashboard account, deploy, and set the `ATTCOS_API_KEY` secret. See Deploy notes.

The production email sender is `placement@index-now.dev` because `index-now.dev` is already an onboarded Email Sending domain on the Cloudflare account. Switch to a `titiknolenglish.com` sender once that domain is onboarded for Email Sending.

## Stack and infrastructure

| Item | Value |
|---|---|
| Runtime | Cloudflare Workers with static assets |
| Database | Cloudflare D1, `tnec-placement-test`, `11da0168-b41d-4fad-a581-efe06ff6f474`, APAC. Schema history in `migrations/` |
| Cloudflare account | `3bf7833afb71015dd06ad9e52411ff78` (Devaldo@index-now.dev) |
| Worker name | `tnec-placement-test` |
| Email | Cloudflare Email Sending, binding `SEND_EMAIL`, 200 messages per day |
| WhatsApp | AttCos (CSQ API), `POST {ATTCOS_API_BASE}/messages`, secret `ATTCOS_API_KEY`, vars `ATTCOS_API_BASE` and `ATTCOS_CHANNEL_ID` |
| Front end | Plain HTML, CSS, and JavaScript. No framework, no build step |
| Local dev | `wrangler dev` on port 8787 with a local D1 copy |

There is no npm runtime dependency. `wrangler` is the only dev dependency.

## Repository layout

| Path | Purpose |
|---|---|
| `src/index.js` | Worker entry, public API, grading, contact step, invites |
| `src/admin.js` | Dashboard pages, sessions, and the `/api/admin` routes |
| `src/store.js` | Shared D1 helpers: tests, questions, levels, attempt status, activities, student upsert |
| `src/whatsapp.js` | AttCos client with Indonesian error messages per status |
| `src/crypto.js` | PBKDF2 password hashing, random tokens, SHA-256. Shared by the Worker, the admin script, and the tests |
| `src/http.js` | JSON responses, body limits, input helpers, WhatsApp number normalizer |
| `src/questions.js` | The original 25 questions. Seed source for the migration only. The live questions are in D1 |
| `src/levels.js` | Level copy (summary and description) and the original thresholds. Live thresholds are in D1 |
| `src/legal.js` | Consent version, terms, privacy policy, public WhatsApp number |
| `src/email.js` | Result email HTML and text, inline styles |
| `public/index.html` | All test screens and dialogs, including the pre-test and post-test score screen |
| `public/assets/app.css` | Test tokens and components |
| `public/assets/app.js` | Test client: invite mode, total or per question timing, anti-cheat |
| `public/admin/index.html` | Dashboard shell, icons, and dialogs |
| `public/admin/login.html` | Dashboard login page |
| `public/admin/assets/admin.css` | Dashboard styles, from the approved prototype with navy buttons |
| `public/admin/assets/admin.js` | Dashboard client, views from the prototype, data from the admin API |
| `public/admin/assets/login.js` | Login form |
| `public/assets/logo-titik-nol.png` | Black brand lockup for the footer and the login page. Do not recolor. |
| `public/assets/logo-titik-nol-white.png` | White brand lockup for the hero and the sidebar. Do not recolor. |
| `public/_headers` | CSP and security headers for static assets |
| `migrations/0001_initial.sql` | The original `attempts` and `answers` tables, written with IF NOT EXISTS so it is safe on the existing database |
| `migrations/0002_dashboard.sql` | Dashboard tables, new attempt columns, seed tests, levels, and questions. Generated once by `scripts/seed-sql.mjs` |
| `scripts/seed-sql.mjs` | Generator for `0002_dashboard.sql`. Do not rerun after 0002 is applied anywhere; new seed data needs a new migration |
| `scripts/create-admin.mjs` | Prints or writes the SQL for a dashboard account |
| `schema.sql` | The original schema, kept as a reference. Migrations supersede it |
| `tests/smoke.mjs` | Questions, levels, seed migration, email escaping, passwords, legal tokens, attempt status, AttCos client |
| `dashboard-prototype.html` | Approved single file prototype. Not deployed |
| `assets/code.html` | Original UI reference. Do not edit. |
| `placement-test-questions.*` | Source question data. Do not edit. |

## Flow

1. The intro screen loads `/api/config`. Counts, durations, and the violation limit in the copy are filled from it. If the test is closed or has no active question, a notice shows and the start button stays disabled.
2. The start button stays disabled until all three consent boxes are checked. Clicking the terms or privacy row opens that document in a modal. The modal action reads "Setuju", closes the modal, and checks the box. The honesty row toggles directly.
3. On start, the browser requests fullscreen, then `POST /api/attempts` creates a row and returns the active questions without the answer key, plus the time mode and the violation limit. The question order is stored on the attempt.
4. In total mode the test runs for the configured duration. In per question mode every question has its own seconds, the next question opens when the time runs out, there is no going back, and the answers are sent automatically after the last question. Answers stay in memory. The timer is computed from the server values, not the device clock.
5. Submitting sends only the answers. The Worker grades them against the questions stored on the attempt, writes the `answers` rows with the key used, and stores the score. For the placement test the response never includes the score.
6. Placement only: the details screen collects name, email, and WhatsApp. `POST /api/attempts/:id/contact` stores them, links or creates the student record, logs the activity, sends the result email, and returns the result. The result screen shows the level, score, ladder, recommendation, WhatsApp CTA, and email note.
7. Pre-test and post-test: the student opens `/?undangan=<token>` from a dashboard message. The page greets them by first name and skips the contact step. The submit response returns the score out of 100, and for the post-test whether it reached the pass score. The link works until it is used for a submission or until it expires after 14 days.
8. A failed attempt is never submitted. When the total timer reaches zero, or when the violation limit is reached, the test stops and a dialog says the attempt failed. The user can retry, which creates a new row and resets the timer, or return to the start.

## Public API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/config` | none | Consent version, open, time mode, duration, total, violation limit, WhatsApp, terms, privacy |
| GET | `/api/invites/:token` | none | Same as config for the invited test, plus `invite: { test, testName, firstName }`. 404 or 410 when unusable |
| POST | `/api/attempts` | `{ consent: { accepted, version }, invite? }` | `{ attemptId, secondsLeft, total, timeMode, maxViolations, questions }`. 423 when closed |
| POST | `/api/attempts/:id/violation` | `{ type }` | `{ ok, counted }` |
| POST | `/api/attempts/:id/submit` | `{ answers: { "1": "A", ... } }` | `{ ok, total, timedOut }`, plus `result` for invite attempts |
| POST | `/api/attempts/:id/contact` | `{ name, email, whatsapp }` | `{ emailSent, result }`. Placement only |

The API is same origin only. Every response is `no-store`. Public bodies are capped at 16 KB. Attempt IDs must be UUID v4 strings. The submit endpoint is idempotent: a second submit returns the stored confirmation and does not regrade. Submit is refused once the violation limit is reached or 15 seconds after the attempt expired.

The consent version in the request must match `CONSENT_VERSION` in `src/legal.js`. When the legal text changes, bump that constant. Old rows keep the version the user actually saw. The current version is `2026-11-16`, which added the WhatsApp and AttCos disclosure and the per question rule.

## Dashboard

The dashboard lives at `/admin`. The approved prototype `dashboard-prototype.html` defines the views; `public/admin/assets/admin.js` keeps those views and replaces the in-memory data with the admin API.

| Sidebar menu | Content |
|---|---|
| Ringkasan | Metric strip, follow-up queue for status Baru, placement level spread, hardest placement questions |
| Database Siswa | CRM table with status chips, search, filters for periode, program, tutor, and level, bulk actions, CSV export, and a full record page per student |
| Placement Test | For prospective students. Gives a level and a program recommendation. Sections: Soal & Jawaban, Submission, Pengaturan with time mode, violation limit, open or closed, and level thresholds |
| Pre-test | For enrolled students before class starts. The score is the starting grade. Same three sections |
| Post-test | For enrolled students at the end of the program. A pass score decides whether the student moves to the next level. Same three sections |
| Program & Kelas | Program catalog with durations and prices, intake periods, classes, and tutors |

The sidebar collapses to an icon rail with the toggle next to the logo, and the choice is saved in localStorage under `tnec-nav-collapsed`. The team does not use a PIC. Each enrolled student has a class, shown as Tutor / Kelas, for example Aldo / C1. A class is one program, one period, and one tutor, and the tutor must be ticked on that program. Notes and activity on the student page sit in a folded section that is closed by default.

The user rejected five earlier versions. The patterns they rejected were a generic stat card template, a menu at the top of the page, a sidebar that turned into a top bar on narrow windows, colored stripes on one side of an element, the Placement Test split into three sidebar menus, a missing student database, a detail panel to the right of a table, and red buttons. Keep the sidebar on the left at every width, open records as full pages and editors as centered dialogs, use a dot plus a text label for status, and keep buttons navy.

The client loads everything once from `GET /api/admin/bootstrap`, then loads a student's activities and a submission's answers when those pages open. Every change goes through the API, then the client reloads the data so the screen always matches D1. Test links come from `POST /api/admin/students/:id/invite` and open in the WhatsApp dialog.

## Admin API

All routes are under `/api/admin`, need a session, and reject writes whose `Origin` is not the Worker's own origin.

| Area | Routes |
|---|---|
| Session | `POST login`, `POST logout`, `GET bootstrap` |
| Students | `POST students`, `POST students/bulk` (delete, stage, period), `GET`, `PATCH`, `DELETE students/:id`, `POST students/:id/notes`, `POST students/:id/whatsapp`, `POST students/:id/invite` |
| Tests | `PUT tests/:key`, `POST tests/:key/questions`, `PUT` and `DELETE tests/:key/questions/:id`, `POST tests/:key/questions/:id/up`, `down`, `duplicate`, or `toggle`, `POST tests/:key/apply-seconds`, `PUT levels` |
| Submissions | `GET attempts/:id`, `POST attempts/:id/void`, `restore`, or `resend-email`, `DELETE attempts/:id`, `POST attempts/bulk-delete` |
| Catalog | `POST`, `PUT`, `DELETE` for `programs`, `periods`, and `classes`, plus `POST tutors` and `DELETE tutors/:id` |

## Admin accounts and sessions

Accounts live in `admin_users` with a PBKDF2 SHA-256 hash at 100,000 iterations, which is the Workers limit. The role is `admin` or `pendidikan`; both see the whole dashboard today. Five wrong passwords lock the account for 15 minutes. A login creates a random token in an HttpOnly, Secure, SameSite=Strict cookie named `tnec_admin` that lasts 12 hours; only its SHA-256 hash is stored in `admin_sessions`. The dashboard pages send their own CSP with no inline scripts or styles, `frame-ancestors 'none'`, and `noindex`.

Create or reset an account with `scripts/create-admin.mjs`, which reads the password from `ADMIN_PASSWORD` or a prompt. Use `--out admin.sql` instead of shell redirection, because Windows PowerShell 5 writes redirected output as UTF-16. Run the file with `wrangler d1 execute`, then delete it. Cloudflare Access in front of `/admin` is a possible second layer if the team wants single sign on.

## WhatsApp through AttCos

Messages are sent only when an admin presses Kirim in the WhatsApp dialog. Nothing is sent automatically after a test. The Worker calls `POST {ATTCOS_API_BASE}/messages` with `{ to, channelId, text }` and the bearer key, waits up to 25 seconds because the AttCos server on Render can be waking up, logs every attempt in `wa_messages` and in the student's activity, and returns AttCos errors in Indonesian.

The WhatsApp Cloud API only delivers free text inside the 24 hour customer service window. For a new lead who never messaged the business number, AttCos answers 422 and the dialog says so. AttCos has no template endpoint yet, so the dialog also offers "Buka di WhatsApp", a `wa.me` link with the same text, for first contact. The API key is a Worker secret and never appears in the code, the repository, the client, or the logs. The rate limit is 60 messages per minute per key.

## Data model

| Table | Key fields | Purpose |
|---|---|---|
| `attempts` | `id`, `test_key`, `student_id`, `question_ids`, `time_mode`, `limit_seconds`, `max_violations`, `pass_score`, `passed`, `invite_id`, `started_at`, `expires_at`, `submitted_at`, `status`, `score`, `level_key`, contact fields, consent fields, `violation_log`, `email_status`, `voided_at`, `voided_by`, `void_reason`, `user_agent`, `country` | One row per attempt for all three tests |
| `answers` | `attempt_id`, `question_id`, `choice`, `is_correct`, `answer_key` | One row per question, including unanswered ones. The key used at grading time is stored so old results stay accurate after an edit |
| `tests` | `key`, `time_mode`, `total_seconds`, `per_default`, `is_open`, `max_violations`, `pass_score` | Settings for placement, pre, and post |
| `questions` | `id`, `test_key`, `position`, `skill`, `prompt`, `passage`, four options, `answer`, `seconds`, `status` | Question banks. Status `aktif` or `draf` |
| `levels` | `key`, `label`, `min_score`, `max_score`, `program`, `position` | Placement thresholds |
| `students` | `id`, `name`, `email`, `whatsapp`, `city`, `source`, `stage`, `program_id`, `duration_id`, `period_id`, `class_id` | The student database and CRM |
| `activities` | `student_id`, `at`, `type`, `text`, `by_name`, `meta` | Notes, status changes, class moves, tests, emails, WhatsApp |
| `programs`, `program_durations`, `program_tutors`, `tutors`, `periods`, `classes` | | The catalog the team manages in Program & Kelas |
| `invites` | `token_hash`, `student_id`, `test_key`, `expires_at`, `used_at` | Personal pre-test and post-test links. Only the token hash is stored |
| `wa_messages` | `student_id`, `to_number`, `text`, `status`, `provider_message_id`, `error` | Every WhatsApp send attempt |
| `admin_users`, `admin_sessions` | | Dashboard accounts and sessions |

The answer key never leaves the Worker for the public test. The dashboard sees it because the team edits it. The `violation_log` column is a semicolon separated list of `unix:type` entries. The strike counter only counts focus loss, not blocked copy or developer shortcuts. A failed attempt stays `in_progress` in the table; the dashboard derives timeout or violation from the times and the log.

No full IP address is stored. `country` comes from `request.cf.country`. `user_agent` is truncated to 300 characters. This is deliberate data minimization.

Deleting a student removes their activities, messages, invites, and pre-test and post-test attempts. Their placement attempts stay for the statistics, without the name, email, or WhatsApp.

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

1. Requests fullscreen when the test starts. If the browser refuses, the test continues and a warning banner says fullscreen is unavailable.
2. Counts leaving fullscreen, hiding the tab, and blurring the window as focus violations. Below the limit a blocking modal shows the count. At the limit, which is 3 by default and set per test in the dashboard, the test stops without submitting and tells the user the attempt failed.
3. Logs blocked copy, cut, paste, context menu, drag, F12, and developer shortcuts to the server without counting them as strikes.
4. Blocks the context menu and copy events, and warns before leaving the page during the test.
5. Keeps the timer running while the violation modal is open.
6. Grades on the server. The answer key is never sent to the browser.

What it cannot do, and must not claim:

1. A browser cannot stop a second device, a phone camera, or a person sitting next to the test taker.
2. A determined user can leave fullscreen and return fast. The event is recorded, but the test does not pause.
3. The current build does not detect virtual machines, screen sharing, or remote control tools.
4. There is no per-IP rate limit on attempt creation. A script can create attempts. Cloudflare bot protection and Turnstile are the next step if abuse appears.

The consent text and the intro notice describe the recording honestly. Keep that tone. Do not write "tidak bisa dicurangi" or any absolute claim.

## Privacy and consent

The legal copy follows the data privacy compliance skill installed at `.opencode/skills/data-privacy-compliance/SKILL.md`. The app collects the minimum needed for grading, placement, enrollment, and follow-up. The privacy policy names Cloudflare, AttCos, and Meta's WhatsApp Business Platform as processors.

Consent is recorded per attempt with the text version and timestamp. The three checkboxes are terms, privacy, and honesty. The server only checks that consent was accepted with the current version; the three items are represented by that version. If the wording or the data use changes, bump `CONSENT_VERSION`.

Retention is stated as 24 months in the privacy policy. There is no automated deletion job yet. If the policy is enforced, add a scheduled Worker that deletes attempts older than 24 months and their answers.

The public test sets no cookies. The dashboard sets one session cookie for staff only. Do not add Google Fonts, a pixel, or an embedded widget without updating the privacy policy and the CSP.

## Email

`src/email.js` builds a 600px HTML email with inline styles and a plain text fallback. The subject is `Hasil Tes Penempatan Kamu: <Level> (<score>/<total>)`. The CTA is a navy pill that opens WhatsApp with a prefilled message.

The sender is `RESULT_FROM_EMAIL`, a Worker variable. The default is `Titik Nol English Course <placement@index-now.dev>`. If the binding is missing or the send throws, the attempt is still saved with `email_status` set to `skipped` or `failed`, and the result screen tells the user the email was not sent. The dashboard can resend the email from the submission page.

## Design

Read `DESIGN.md` before touching CSS. The short version: navy structure, navy buttons, white reading surface, red only for errors and urgent state, one yellow emphasis. No gradients, no third-party fonts, no inline scripts or styles because the CSP forbids them. Every new visual state needs a token or an existing component class.

## Commands

1. `npm install` installs wrangler.
2. `npm test` runs the smoke checks.
3. `npm run db:migrate:local` applies the migrations to the local D1.
4. `npm run dev` starts the local Worker on `http://localhost:8787`. Open the dashboard on `localhost`, not `127.0.0.1`, because the session cookie is Secure.
5. `npm run admin:sql -- --email someone@example.com --name Name --out admin.sql` writes the SQL for a dashboard account. Run it with `npx wrangler d1 execute tnec-placement-test --local --file=admin.sql` or `--remote`, then delete the file.
6. `npm run db:migrate` applies the migrations to the remote D1.
7. `npm run deploy` deploys the Worker.

The local D1 is a separate copy. Rows created in `wrangler dev` do not appear in production, and the other way around. Use `wrangler d1 execute tnec-placement-test --remote --command "SELECT ..."` to inspect production.

## Deploy notes

The Worker uses static assets with `run_worker_first = ["/api/*", "/admin", "/admin/*"]`, so the APIs and every dashboard path invoke the Worker. The `_headers` file sets the CSP for static files, the Worker sets its own headers for JSON, and `src/admin.js` sets the dashboard CSP.

`wrangler deploy` needs Cloudflare authentication. The account is already in `wrangler.toml`, so only a login or `CLOUDFLARE_API_TOKEN` is needed. Do not commit a token.

First production rollout of the dashboard, each step with the owner's approval:

1. `npm run db:migrate`. The remote database was created from `schema.sql` and has no rows, so `0001_initial.sql` changes nothing and `0002_dashboard.sql` adds the new columns, tables, and seeds.
2. Create the first dashboard account with `scripts/create-admin.mjs` and `--remote`.
3. `npm run deploy`. The first deploy creates the Worker at `https://tnec-placement-test.devaldo.workers.dev`.
4. `npx wrangler secret put ATTCOS_API_KEY`. This comes after the first deploy because the secret belongs to an existing Worker. Until it is set, the dashboard shows that WhatsApp sending is off.
5. In the dashboard, add the real programs, periods, tutors, and classes, then review the pre-test and post-test drafts before opening those tests.

After a deploy, verify in this order:

1. `GET /api/config` returns the legal text and `open: true`.
2. The intro renders and the start button unlocks after three checks.
3. A full attempt reaches the result screen.
4. The email arrives at the address entered. Check the spam folder on the first send.
5. `/admin` redirects to the login page, the login works, and the new attempt shows in Placement Test, Submission, with the student in Database Siswa.
6. A WhatsApp message to a number that messaged the business number in the last 24 hours arrives.

## Git and push rules

1. This folder is its own repository. The repository root is this directory, not the `tnec` parent. Never commit the parent, `credentials/`, `cpanel-titiknolenglishcom/`, or `tnec-cpanel/`.
2. The remote is the private repository `dev-tnec/tnec-placement-test` under the `dev-tnec` GitHub account.
3. Commits are authored as Aldo `<354270602+dev-tnec@users.noreply.github.com>` only. No AI attribution, no Co-Authored-By trailers, no "Generated with" footers.
4. Use conventional subjects (`feat:`, `fix:`, `docs:`, `chore:`), imperative and one line. Review `git status` and `git diff --staged` before every push.
5. Never commit `.dev.vars`, `.wrangler/`, `node_modules/`, `dist/`, a generated `admin.sql`, the session export `tikno-english-placement-test-setup.json`, or any secret.

## Known limits and next steps

1. Placement attempts are linked to a student only after the contact step. An attempt that stops before contact stays in Submission as Tanpa kontak and never reaches Database Siswa.
2. No resume after a refresh. A refresh during the test loses the in-memory answers and leaves an `in_progress` row.
3. No rate limit on attempt creation and no bot check. Add Cloudflare Turnstile or a Worker rate limit if spam appears.
4. The email sender is on `index-now.dev`, not `titiknolenglish.com`. Onboard the brand domain before public launch if the sender address matters.
5. No automated retention job. The policy says 24 months; add a cron Worker when the data volume justifies it.
6. The public WhatsApp number is `6282333143544`, taken from the placement test CTA on the TOEFL online page. Confirm it is the correct admissions number.
7. WhatsApp templates are not supported by AttCos yet, so first contact goes through the `wa.me` fallback.
8. Both dashboard roles see everything. Restrict the `pendidikan` role if the team asks for it.
9. The dashboard was checked at 1440 in a headless browser. Recheck 1024, 900, and 390 after layout changes, and the test screens at 900 and 390.
