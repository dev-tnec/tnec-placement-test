# TNEC Placement Test and Internal Dashboard

Online placement test, pre-test, and post-test for Titik Nol English Course, plus the internal dashboard for the admin and education team. It is a Node.js monorepo with two apps that share one PostgreSQL database on Neon.

| Part | Folder | Default address |
|---|---|---|
| Test site for students | `apps/web` | `http://localhost:4000` |
| Dashboard for the team | `apps/admin` | `http://localhost:4001/admin` |
| Shared server code | `packages/core` | |
| Database schema and seeds | `db/migrations` | |

The product and design decisions are documented in `AGENTS.md` and `DESIGN.md`. Read those before changing anything.

## Run it

On Windows, double-click `start.cmd`. It installs what it needs the first time, then runs both apps until you close the window.

From a terminal, the same thing is `npm install` once, then `npm start`. If PowerShell refuses `npm` because scripts are disabled, use `node scripts/start.mjs` instead. The settings live in `.env` at the repository root, and `.env.example` lists every key.

Starting updates the database schema when needed, then runs both apps. The first time the dashboard opens with an empty database, the login page offers to create the first admin account. From the same computer no code is needed; from another computer, enter the setup code that `npm start` prints.

## Configuration

| Setting | Where |
|---|---|
| Database | `DATABASE_URL` in `.env`, the Neon connection string |
| Ports and public addresses | `WEB_PORT`, `ADMIN_PORT`, `PUBLIC_WEB_URL`, `ADMIN_URL` in `.env`. Test links sent from the dashboard use `PUBLIC_WEB_URL` |
| Result email | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_TOKEN`, `RESULT_FROM_EMAIL` in `.env`. Leave the token empty to skip emails |
| WhatsApp through AttCos | `ATTCOS_API_KEY`, `ATTCOS_CHANNEL_ID`, `ATTCOS_API_BASE` in `.env` |
| Questions, timing, violation limit, pass score, levels | Dashboard, each test's Pengaturan and Soal & Jawaban |
| Programs, periods, classes, tutors | Dashboard, Program & Kelas |
| Consent version and legal text | `packages/core/src/legal.js` |

Bump `CONSENT_VERSION` whenever the terms or privacy text changes, so each stored consent points to the exact version the user saw.

## Other commands

| Command | What it does |
|---|---|
| `npm run start:web` | Runs only the test site |
| `npm run start:admin` | Runs only the dashboard |
| `npm run db:migrate` | Applies pending files in `db/migrations` without starting the apps |
| `npm run admin:create -- --email someone@example.com --name Name` | Adds a dashboard account or resets its password; it asks for the password |
| `npm test` | Smoke checks, no database needed |

## Hosting

Any Node.js host works, including a VPS, Render, or the Node.js app feature in cPanel. Run `npm install`, set the same keys as `.env` in the host's environment, and start with `npm start`, or start each app on its own with `npm run start:web` and `npm run start:admin`. Behind a reverse proxy, set `TRUST_PROXY=1` and serve the dashboard over HTTPS so the login cookie stays secure.
