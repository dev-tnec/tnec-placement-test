# AGENTS.md: titiknolenglish-placement-test

This file is the working memory for this folder. Read it before changing the app. The design rules live in `DESIGN.md`, and the brand tokens come from `../design.md`.

## What this folder is

A standalone online placement test for Titik Nol English Course. It is not an Elementor page and it is not part of the WordPress install. The app is a Cloudflare Worker that serves a static front end, stores attempts in Cloudflare D1, and emails the result through Cloudflare Email Sending.

The source material is in this folder: `placement-test-questions.md`, `placement-test-questions.txt`, `placement-test.xlsx`, and the UI reference `assets/code.html`. The question set and the level thresholds come from JotForm form 252018413812044. The reference mock is a starting point for layout, not a pixel contract.

## Current status

Built and working locally on 14 November 2026. The D1 database exists and the schema is applied. The full flow passes in a headless browser: consent, test, submit, contact details, result, and email handoff. The Worker is ready to deploy with `wrangler deploy`.

The production email sender is `placement@index-now.dev` because `index-now.dev` is already an onboarded Email Sending domain on the Cloudflare account. Switch to a `titiknolenglish.com` sender once that domain is onboarded for Email Sending.

## Stack and infrastructure

| Item | Value |
|---|---|
| Runtime | Cloudflare Workers with static assets |
| Database | Cloudflare D1, `tnec-placement-test`, `11da0168-b41d-4fad-a581-efe06ff6f474`, APAC |
| Cloudflare account | `3bf7833afb71015dd06ad9e52411ff78` (Devaldo@index-now.dev) |
| Worker name | `tnec-placement-test` |
| Email | Cloudflare Email Sending, binding `SEND_EMAIL`, 200 messages per day |
| Front end | Plain HTML, CSS, and one ES module. No framework, no build step. |
| Local dev | `wrangler dev` on port 8787 with a local D1 copy |

There is no npm runtime dependency. `wrangler` is the only dev dependency.

## Repository layout

| Path | Purpose |
|---|---|
| `src/index.js` | Worker entry, API routes, grading, email send |
| `src/questions.js` | 25 questions and the answer key. Server only. |
| `src/levels.js` | Six levels and the score thresholds |
| `src/legal.js` | Consent version, terms, privacy policy, public config |
| `src/email.js` | Result email HTML and text, inline styles |
| `public/index.html` | All four screens and dialogs |
| `public/assets/app.css` | Tokens and components |
| `public/assets/app.js` | Client state machine and anti-cheat |
| `public/assets/logo-titik-nol.png` | Black brand lockup for the footer. Do not recolor. |
| `public/assets/logo-titik-nol-white.png` | White brand lockup for the hero. Do not recolor. |
| `public/_headers` | CSP and security headers for static assets |
| `schema.sql` | D1 schema |
| `tests/smoke.mjs` | Question, level, and email escaping checks |
| `assets/code.html` | Original UI reference. Do not edit. |
| `placement-test-questions.*` | Source question data. Do not edit. |

## Flow

1. The intro screen loads the legal text from `/api/config` and keeps the start button disabled until all three consent boxes are checked. Clicking the terms or privacy row opens that document in a modal. The modal action reads "Setuju", closes the modal, and checks the box. The honesty row toggles directly.
2. On start, the browser requests fullscreen, then `POST /api/attempts` creates a row and returns the 25 questions without the answer key.
3. The test runs for 5 minutes. Answers stay in memory. The timer is computed from the server `secondsLeft`, not the device clock. If the timer reaches zero, the attempt fails without submitting and the user can start a fresh attempt.
4. Submitting sends only the answers. The Worker grades them, writes the `answers` rows, and stores the score. The response only confirms the submission and never includes the score.
5. The details screen collects name, email, and WhatsApp. `POST /api/attempts/:id/contact` stores them, sends the result email, and returns the result payload.
6. The result screen renders after the contact call, using the level, score, six row level ladder, recommendation, WhatsApp CTA, and email delivery note.
7. A failed attempt is never submitted. When the timer reaches zero, or when the third focus violation is recorded, the test stops and a dialog says the attempt failed. The user can retry, which creates a new row and resets the timer, or return to the start.

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/config` | none | Consent version, duration, total, WhatsApp, terms, privacy |
| POST | `/api/attempts` | `{ consent: { accepted, version } }` | `{ attemptId, secondsLeft, total, questions }` |
| POST | `/api/attempts/:id/violation` | `{ type }` | `{ ok, counted }` |
| POST | `/api/attempts/:id/submit` | `{ answers: { "1": "A", ... } }` | `{ ok, total, timedOut }` |
| POST | `/api/attempts/:id/contact` | `{ name, email, whatsapp }` | `{ emailSent, result }` |

The API is same origin only. Every response is `no-store`. Body size is capped at 16 KB. Attempt IDs must be UUID v4 strings. The submit endpoint is idempotent: a second submit returns the stored confirmation and does not regrade. The submit response never contains the score or level, so the result is only revealed after the contact step.

The consent version in the request must match `CONSENT_VERSION` in `src/legal.js`. When the legal text changes, bump that constant. Old rows keep the version the user actually saw.

## Data model

| Table | Key fields | Purpose |
|---|---|---|
| `attempts` | `id`, `started_at`, `expires_at`, `submitted_at`, `status`, `score`, `level_key`, `timed_out`, `name`, `email`, `whatsapp`, `consent_version`, `consent_at`, `violations`, `violation_log`, `duration_seconds`, `email_sent_at`, `email_status`, `user_agent`, `country` | One row per attempt, including the consent record and the lead details |
| `answers` | `attempt_id`, `question_id`, `choice`, `is_correct` | One row per answered question |

Questions are not stored in D1. They live in `src/questions.js` so the answer key never enters the database or the client. Editing a question is a code change and a deploy.

The `violation_log` column is a semicolon separated list of `unix:type` entries. `violations` is the total count of all logged events. The client's three strike counter only counts focus loss, not blocked copy or developer shortcuts.

No full IP address is stored. `country` comes from `request.cf.country`. `user_agent` is truncated to 300 characters. This is deliberate data minimization.

## Level thresholds

| Score | Level key | Label |
|---|---|---|
| 0 to 5 | `starter` | Starter |
| 6 to 10 | `basic` | Basic |
| 11 to 15 | `intermediate` | Intermediate |
| 16 to 19 | `advanced` | Advanced |
| 20 to 23 | `toefl-prep` | TOEFL/IELTS Preparation |
| 24 to 25 | `toefl-scoring` | TOEFL/IELTS Scoring |

These match the JotForm conditions. Do not change a boundary without updating `tests/smoke.mjs` and this table.

## Anti-cheat

What the app does:

1. Requests fullscreen when the test starts. If the browser refuses, the test continues and a warning banner says fullscreen is unavailable.
2. Counts leaving fullscreen, hiding the tab, and blurring the window as focus violations. The first two show a blocking modal with the count. The third stops the test without submitting and tells the user the attempt failed.
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

The legal copy follows the data privacy compliance skill installed at `.opencode/skills/data-privacy-compliance/SKILL.md`. The app collects the minimum needed for grading, placement, and follow-up: name, email, WhatsApp, answers, score, timings, violation count, user agent, and country.

Consent is recorded per attempt with the text version and timestamp. The three checkboxes are terms, privacy, and honesty. The server only checks that consent was accepted with the current version; the three items are represented by that version. Clicking the terms or privacy row opens the document in a modal, and the "Setuju" action is the only way to close it and check the box. If the wording or the data use changes, bump `CONSENT_VERSION`.

Retention is stated as 24 months in the privacy policy. There is no automated deletion job yet. If the policy is enforced, add a scheduled Worker that deletes attempts older than 24 months and their answers.

The app sets no analytics, advertising, or third-party cookies. Do not add Google Fonts, a pixel, or an embedded widget without updating the privacy policy and the CSP.

## Email

`src/email.js` builds a 600px HTML email with inline styles and a plain text fallback. The subject is `Hasil Tes Penempatan Kamu: <Level> (<score>/<total>)`. The CTA opens WhatsApp with a prefilled message.

The sender is `RESULT_FROM_EMAIL`, a Worker variable. The default is `Titik Nol English Course <placement@index-now.dev>`. The `SEND_EMAIL` binding sends through Cloudflare Email Sending. If the binding is missing or the send throws, the attempt is still saved with `email_status` set to `skipped` or `failed`, and the result screen tells the user the email was not sent.

One email per attempt. A second contact POST updates the contact fields but does not resend. To resend, clear `email_sent_at` for that row.

## Design

Read `DESIGN.md` before touching CSS. The short version: navy structure, white reading surface, red primary action, one yellow emphasis. No gradients, no third-party fonts, no inline scripts or styles because the CSP forbids them. Every new visual state needs a token or an existing component class.

## Commands

1. `npm install` installs wrangler.
2. `npm test` runs the smoke checks.
3. `npm run dev` starts the local Worker on `http://127.0.0.1:8787` with a local D1.
4. `npx wrangler d1 execute tnec-placement-test --local --file=./schema.sql` applies the schema to the local D1.
5. `npm run db:apply` applies the schema to the remote D1.
6. `npm run deploy` deploys the Worker.

The local D1 is a separate copy. Rows created in `wrangler dev` do not appear in production, and the other way around. Use `wrangler d1 execute tnec-placement-test --remote --command "SELECT ..."` to inspect production.

## Deploy notes

The Worker uses static assets with `run_worker_first = ["/api/*"]`, so only API calls invoke the Worker. The `_headers` file sets the CSP for static files, and the Worker sets its own headers for JSON.

`wrangler deploy` needs Cloudflare authentication. The account is already in `wrangler.toml`, so only a login or `CLOUDFLARE_API_TOKEN` is needed. Do not commit a token.

After a deploy, verify in this order:

1. `GET /api/config` returns the legal text.
2. The intro renders and the start button unlocks after three checks.
3. A full attempt reaches the result screen.
4. The email arrives at the address entered. Check the spam folder on the first send.
5. `SELECT id, score, level_key, email_status FROM attempts ORDER BY started_at DESC LIMIT 5` shows the row.

## Git and push rules

1. This folder is its own repository. The repository root is this directory, not the `tnec` parent. Never commit the parent, `credentials/`, `cpanel-titiknolenglishcom/`, or `tnec-cpanel/`.
2. The remote is the private repository `dev-tnec/tnec-placement-test` under the `dev-tnec` GitHub account.
3. Commits are authored as Aldo `<354270602+dev-tnec@users.noreply.github.com>` only. No AI attribution, no Co-Authored-By trailers, no "Generated with" footers.
4. Use conventional subjects (`feat:`, `fix:`, `docs:`, `chore:`), imperative and one line. Review `git status` and `git diff --staged` before every push.
5. Never commit `.dev.vars`, `.wrangler/`, `node_modules/`, or any secret.

## Known limits and next steps

1. No admin screen. Results are read with SQL or exported from D1. A simple protected results page is the obvious next feature.
2. No resume after a refresh. A refresh during the test loses the in-memory answers and leaves an `in_progress` row. A failed attempt from a timeout or three violations also stays `in_progress`, because the schema only allows `in_progress` and `submitted`. The attempt is not resumed because the client does not persist the attempt ID.
3. No rate limit on attempt creation and no bot check. Add Cloudflare Turnstile or a Worker rate limit if spam appears.
4. The email sender is on `index-now.dev`, not `titiknolenglish.com`. Onboard the brand domain before public launch if the sender address matters.
5. No automated retention job. The policy says 24 months; add a cron Worker when the data volume justifies it.
6. The WhatsApp number is `6282333143544`, taken from the placement test CTA on the TOEFL online page. Confirm it is the correct admissions number before launch.
7. The intro and result screens were checked at 1440 and 390. The test screen was checked at 1440. Recheck 900 and 390 after any layout change.
