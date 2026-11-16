# AGENTS.md: titiknolenglish-placement-test

This file is the working memory for this folder. Read it before changing the app. The design rules live in `DESIGN.md`, and the brand tokens come from `../design.md`.

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

The full flow passes in a headless browser against the `dev` branch: first admin setup on the login page, login and logout, catalog, student records, notes, WhatsApp through a local AttCos stub (including the 24 hour window error), invite links, the placement test with contact and result, the pre-test score screen, per question timing with auto advance and auto submit, a student name containing HTML staying plain text, and the dashboard layout at 1024, 900, and 390 pixels.

## Stack

| Item | Value |
|---|---|
| Runtime | Node.js 21.7 or newer. Plain `node:http`, no framework |
| Database | Neon PostgreSQL through `pg`, the only runtime dependency |
| Email | Cloudflare Email Sending REST API, `packages/core/src/mailer.js` |
| WhatsApp | AttCos (CSQ API), `POST {ATTCOS_API_BASE}/messages` |
| Front end | Plain HTML, CSS, and JavaScript. No build step |
| Monorepo | npm workspaces: `apps/*` and `packages/*` |

## Repository layout

| Path | Purpose |
|---|---|
| `apps/web/server.js` | Test site server: static pages and the public API |
| `apps/web/src/api.js` | Public API: config, invites, attempts, violations, submit, contact. Reads test settings and levels on every request, so dashboard changes apply to the next test right away |
| `apps/web/public/` | `index.html`, `assets/app.css`, `assets/app.js`, logos, favicon |
| `apps/admin/server.js` | Dashboard server and the first admin setup notice |
| `apps/admin/src/api.js` | Dashboard pages, sessions, first admin setup, and every `/api/admin` route |
| `apps/admin/public/admin/` | Dashboard `index.html`, `login.html`, and `assets/` (admin.css, admin.js, login.js) |
| `packages/core/src/db.js` | Postgres pool with a small `prepare(sql).bind(...).first()/all()/run()` and `batch()` API. `?` placeholders become `$1..$n`; `batch()` is one transaction; read-only batches run in parallel |
| `packages/core/src/env.js` | Loads `.env` (or `ENV_FILE`) and builds the shared `env` object |
| `packages/core/src/node-server.js` | Node HTTP adapter for fetch-style handlers, static files, security headers |
| `packages/core/src/migrate.js` | Applies pending `db/migrations` files in one transaction with an advisory lock |
| `packages/core/src/store.js`, `http.js`, `crypto.js`, `whatsapp.js`, `email.js`, `legal.js`, `levels.js`, `questions.js` | Shared logic. `questions.js` is the original 25 questions and only documents the seed |
| `db/migrations/0001_init.sql` | Full schema plus seeds: 3 tests, 6 levels, 25 placement questions, 12 draft questions each for pre-test and post-test |
| `start.cmd` | Double-click launcher for Windows: installs on first run, then runs `scripts/start.mjs` |
| `scripts/start.mjs` | `npm start`: migrate, then run both apps in one process |
| `scripts/migrate.mjs`, `scripts/create-admin.mjs` | `npm run db:migrate`, `npm run admin:create` |
| `tests/smoke.mjs` | `npm test`, no database needed |
| `.env.example` | Every setting. `.env` holds the real values and is never committed |
| `dashboard-prototype.html` | Approved single file prototype of the dashboard. Not served |
| `assets/code.html`, `placement-test-questions.*` | Source material. Do not edit |

## Running

1. Double-click `start.cmd` on Windows, or run `npm install` once and then `npm start`. PowerShell on this machine blocks `npm.ps1`, so from PowerShell use `node scripts/start.mjs` or `npm.cmd start`.
2. Starting applies pending migrations, then serves the test on `WEB_PORT` (4000) and the dashboard on `ADMIN_PORT` (4001).
3. With no admin in the database, the login page at `/admin/login` turns into "Buat akun admin pertama". Requests from localhost need no code; any other request needs the setup code that `npm start` prints. After the first account exists, setup is closed and more accounts come from `npm run admin:create`.

To run against the `dev` branch, point `ENV_FILE` at a second env file with the `dev` connection string. Never run tests against `main`.

## Flow

1. The intro screen loads `/api/config`. Counts, durations, and the violation limit in the copy are filled from it. If the test is closed or has no active question, a notice shows and the start button stays disabled.
2. The start button stays disabled until all three consent boxes are checked. Clicking the terms or privacy row opens that document in a modal, and "Setuju" checks the box. The honesty row toggles directly.
3. On start, the browser requests fullscreen, then `POST /api/attempts` creates a row and returns the active questions without the answer key, plus the time mode and the violation limit. The question order is stored on the attempt.
4. In total mode the test runs for the configured duration. In per question mode every question has its own seconds, the next question opens when the time runs out, there is no going back, and the answers are sent automatically after the last question.
5. Submitting sends only the answers. The server grades them against the questions stored on the attempt and stores the key used with each answer. For the placement test the response never includes the score.
6. Placement only: the details screen collects name, email, and WhatsApp. `POST /api/attempts/:id/contact` links or creates the student, logs the activity, sends the result email, and returns the result.
7. Pre-test and post-test: the student opens `/?undangan=<token>` from a dashboard message. There is no contact step, and the score out of 100 shows right away, with pass or not for the post-test. A link works until it is used for a submission or expires after 14 days.
8. A failed attempt is never submitted. When the total timer reaches zero, or when the violation limit is reached, the test stops and a dialog offers a retry or a return to the start.

## Public API (web app)

| Method | Path | Returns |
|---|---|---|
| GET | `/api/config` | Consent version, open, time mode, duration, total, violation limit, WhatsApp, terms, privacy |
| GET | `/api/invites/:token` | Same as config for the invited test, plus `invite: { test, testName, firstName }`. 404 or 410 when unusable |
| POST | `/api/attempts` | `{ attemptId, secondsLeft, total, timeMode, maxViolations, questions }`. 423 when closed |
| POST | `/api/attempts/:id/violation` | `{ ok, counted }` |
| POST | `/api/attempts/:id/submit` | `{ ok, total, timedOut }`, plus `result` for invite attempts |
| POST | `/api/attempts/:id/contact` | `{ emailSent, result }`. Placement only |

Every response is `no-store`. Bodies are capped at 16 KB. The consent version in the request must match `CONSENT_VERSION` in `packages/core/src/legal.js`; the current version is `2026-11-16b`.

## Dashboard (admin app)

| Sidebar menu | Content |
|---|---|
| Ringkasan | Metric strip, follow-up queue for status Baru, placement level spread, hardest placement questions |
| Database Siswa | CRM table with status chips, search, filters for periode, program, tutor, and level, bulk actions, CSV export, and a full record page per student |
| Placement Test, Pre-test, Post-test | Soal & Jawaban, Submission, and Pengaturan for each test |
| Program & Kelas | Program catalog with durations and prices, intake periods, classes, and tutors |

The sidebar stays on the left at every width and collapses to an icon rail; the choice is saved in localStorage under `tnec-nav-collapsed`. The team does not use a PIC. Each enrolled student has a class shown as Tutor / Kelas, for example Aldo / C1. A class is one program, one period, and one tutor, and the tutor must be ticked on that program. Notes and activity on the student page sit in a folded section that is closed by default.

The user rejected five earlier versions. Rejected patterns: a generic stat card template, a menu at the top, a sidebar that turned into a top bar on narrow windows, colored stripes on one side of an element, the Placement Test split into three sidebar menus, a missing student database, a detail panel to the right of a table, and red buttons.

The client loads everything from `GET /api/admin/bootstrap`, then loads a student's activities and a submission's answers when those pages open. Every change goes through the API, then the client reloads. Test links point at `PUBLIC_WEB_URL`.

Admin routes, all under `/api/admin`, need a session except `login` and `setup`, and reject writes whose `Origin` is not the admin app's own origin: `bootstrap`, `logout`, `students` (create, bulk, get, patch, delete, notes, whatsapp, invite), `tests/:key` (settings, questions, reorder, duplicate, toggle, apply-seconds), `levels`, `attempts/:id` (detail, void, restore, resend-email, delete, bulk-delete), and the catalog (`programs`, `periods`, `classes`, `tutors`).

## Accounts and sessions

Passwords use PBKDF2 SHA-256 at 600,000 iterations; each account stores its own count. Five wrong passwords lock the account for 15 minutes. A login creates a random token in an HttpOnly, SameSite=Strict cookie named `tnec_admin` for 12 hours; only its SHA-256 hash is stored. The cookie is marked Secure on HTTPS and on localhost; serve the admin app over HTTPS in production. Session lookups are cached in memory for 60 seconds. The role is `admin` or `pendidikan`; both see the whole dashboard today.

## WhatsApp through AttCos

Messages go out only when someone presses Kirim. The server calls AttCos with the key from `.env`, waits up to 25 seconds because AttCos on Render can be waking up, logs every attempt in `wa_messages` and in the student's activity, and returns AttCos errors in Indonesian. WhatsApp only delivers free text within 24 hours of the student messaging the business number; AttCos answers 422 otherwise, and the dialog offers "Buka di WhatsApp" for first contact. The AttCos key in `.env` was pasted in chat on 16 November 2026, so it should be rotated.

## Data model

Times are Unix seconds in BIGINT columns, flags are 0 or 1 in INTEGER columns, and ids are text except `questions`, `activities`, and `wa_messages`, which use identity columns.

| Table | Purpose |
|---|---|
| `attempts`, `answers` | One row per attempt for all three tests; one row per question with the key used at grading time |
| `tests`, `questions`, `levels` | Settings, question banks (status `aktif` or `draf`), placement thresholds |
| `students`, `activities` | The student database and its history |
| `programs`, `program_durations`, `program_tutors`, `tutors`, `periods`, `classes` | The catalog |
| `invites` | Personal pre-test and post-test links; only the token hash is stored |
| `wa_messages` | Every WhatsApp send attempt |
| `admin_users`, `admin_sessions` | Dashboard accounts and sessions |
| `schema_migrations` | Which migration files have run |

No full IP address is stored. `country` comes from the `CF-IPCountry` header when the app sits behind Cloudflare, otherwise it stays empty. `user_agent` is truncated to 300 characters. Deleting a student removes their activities, messages, invites, and pre-test and post-test attempts; their placement attempts stay for the statistics without contact details.

To change the schema, add a new file such as `db/migrations/0002_something.sql`. Never edit a file that has already run on `main`.

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

1. Requests fullscreen when the test starts. If the browser refuses, the test continues with a warning banner.
2. Counts leaving fullscreen, hiding the tab, and blurring the window as focus violations. At the limit, 3 by default and set per test, the test stops without submitting.
3. Logs blocked copy, cut, paste, context menu, drag, F12, and developer shortcuts without counting them as strikes.
4. Keeps the timer running while the violation modal is open, and grades on the server.

What it cannot do, and must not claim: stop a second device, a camera, or a helper in the room; pause when someone leaves fullscreen briefly; detect virtual machines or remote control tools. There is no per-IP rate limit on attempt creation. Do not write "tidak bisa dicurangi" or any absolute claim.

## Privacy and consent

The legal copy follows `.opencode/skills/data-privacy-compliance/SKILL.md`. The privacy policy names Neon (database, Singapore), Cloudflare (result email), AttCos, and Meta's WhatsApp Business Platform as processors. Consent is recorded per attempt with the text version and timestamp; bump `CONSENT_VERSION` when the wording or the data use changes. Retention is stated as 24 months and there is no deletion job yet. The public test sets no cookies; the dashboard sets one session cookie for staff.

## Email

`packages/core/src/email.js` builds a 600px HTML email with inline styles and a plain text fallback, with a navy WhatsApp CTA. `mailer.js` sends it through the Cloudflare Email Sending API from `RESULT_FROM_EMAIL` (`placement@index-now.dev`, an onboarded sending domain). Without `CLOUDFLARE_EMAIL_TOKEN` the email is skipped and the result screen says so. The dashboard can resend from the submission page.

## Design

Read `DESIGN.md` before touching CSS. Navy structure, navy buttons, white reading surface, red only for errors and urgent state, one yellow emphasis. No gradients, no third-party fonts, and no inline scripts or styles, because both apps send a strict CSP.

## Git and push rules

1. This folder is its own repository. Never commit the parent `tnec` folder, `credentials/`, `cpanel-titiknolenglishcom/`, or `tnec-cpanel/`.
2. The remote is the private repository `dev-tnec/tnec-placement-test`.
3. Commits are authored as Aldo `<354270602+dev-tnec@users.noreply.github.com>` only. No AI attribution, no Co-Authored-By trailers.
4. Use conventional subjects (`feat:`, `fix:`, `docs:`, `chore:`), imperative and one line. Review `git status` and `git diff --staged` before every push.
5. Never commit `.env`, `node_modules/`, the session export `tikno-english-placement-test-setup.json`, or any secret. Pushing from this machine works with the GitHub CLI login: `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main`.

## Known limits and next steps

1. Placement attempts are linked to a student only after the contact step; an attempt that stops before contact stays in Submission as Tanpa kontak.
2. No resume after a refresh during a test.
3. No rate limit on attempt creation and no bot check.
4. The email sender is on `index-now.dev`, not `titiknolenglish.com`.
5. No automated retention job for the 24 month policy.
6. The public WhatsApp number `6282333143544` comes from the TOEFL online page; confirm it.
7. WhatsApp templates are not supported by AttCos yet, so first contact goes through the `wa.me` fallback.
8. Both dashboard roles see everything.
9. The apps run on the owner's computer for now. For a public launch they need a Node.js host with HTTPS, and `PUBLIC_WEB_URL` and `ADMIN_URL` set to the real addresses.
