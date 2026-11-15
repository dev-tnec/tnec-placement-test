# TNEC Placement Test and Internal Dashboard

Online placement test for Titik Nol English Course, plus the internal dashboard for the admin and education team. The public test grades on the server and emails the result. The dashboard at `/admin` is a CRM, an education dashboard, and the database in one place: student records, classes, the question banks for the placement test, pre-test, and post-test, submissions, and WhatsApp messages through AttCos. Everything runs on one Cloudflare Worker with a D1 database.

The product and design decisions are documented in `AGENTS.md` and `DESIGN.md`. Read those before changing anything.

## Local setup

1. Run `npm install`.
2. Run `npm run db:migrate:local` to create the local tables and the seed questions.
3. Create a local dashboard account. Set `ADMIN_PASSWORD` in the shell, run `npm run admin:sql -- --email you@example.com --name "Your Name" --out admin.sql`, then run `npx wrangler d1 execute tnec-placement-test --local --file=admin.sql` and delete `admin.sql`.
4. Run `npm run dev`, then open `http://localhost:8787` for the test and `http://localhost:8787/admin` for the dashboard. Use `localhost`, not `127.0.0.1`, because the session cookie is marked Secure.
5. Run `npm test` for the smoke checks.

WhatsApp sending stays off locally until a key is provided. To try it against a stub, pass `--var ATTCOS_API_KEY:anything --var ATTCOS_API_BASE:http://127.0.0.1:PORT/api/v1` to `wrangler dev`.

## Deploy

Run these in order. Steps 2 to 5 change production, so run them only when you mean to.

1. Authenticate wrangler with `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN` in the shell.
2. Run `npm run db:migrate` to apply `migrations/` to the remote D1. The first run applies `0001_initial.sql`, which matches the existing tables, and `0002_dashboard.sql`, which adds the dashboard tables and the seed questions.
3. Create the first dashboard account with the same `admin:sql` command as above, then run it with `--remote` instead of `--local`.
4. Run `npm run deploy`. The first deploy creates the Worker at `https://tnec-placement-test.devaldo.workers.dev`.
5. Run `npx wrangler secret put ATTCOS_API_KEY` and paste the AttCos API key when prompted. Until it is set, the dashboard shows that WhatsApp sending is off.
6. Sign in at `/admin`, add the programs, periods, tutors, and classes, then review the pre-test and post-test drafts before opening those tests.

The Worker name is `tnec-placement-test`. The D1 database and the Cloudflare account are pinned in `wrangler.toml`.

## Configuration

| Setting | Where | Default |
|---|---|---|
| Questions, answer keys, and skills | Dashboard, Soal & Jawaban | 25 placement questions, 12 draft questions each for pre-test and post-test |
| Time mode and duration | Dashboard, Pengaturan of each test | Placement 5 minutes total, pre-test and post-test 10 minutes |
| Focus violation limit | Dashboard, Pengaturan of each test | 3 |
| Post-test pass score | Dashboard, Post-test Pengaturan | 70 out of 100 |
| Level thresholds | Dashboard, Placement Test Pengaturan | Six levels, 0 to 25 |
| Programs, periods, classes, tutors | Dashboard, Program & Kelas | Empty until the team adds them |
| Consent version and legal text | `src/legal.js` | `2026-11-16` |
| Public WhatsApp number | `src/legal.js` | `6282333143544` |
| Sender address | `wrangler.toml` | `placement@index-now.dev` |
| AttCos base URL and channel | `wrangler.toml` vars | `https://csq-api.onrender.com/api/v1`, channel `6a94705f-8df3-47e7-9262-639637209fc5` |
| AttCos API key | Worker secret `ATTCOS_API_KEY` | Not set |

Bump `CONSENT_VERSION` whenever the terms or privacy text changes, so each stored consent points to the exact version the user saw.

## Structure

`src/` holds the Worker: `index.js` for the public API, `admin.js` for the dashboard API and pages, `store.js` for shared D1 helpers, `whatsapp.js` for AttCos, and the legal copy and email template. `public/` holds the static test app, and `public/admin/` holds the dashboard and its login page. `migrations/` is the D1 schema history; `schema.sql` is kept only as a reference for the original tables. `scripts/create-admin.mjs` prints the SQL for a dashboard account. `tests/smoke.mjs` checks the questions, levels, seed migration, password hashing, attempt status, and the AttCos client.
