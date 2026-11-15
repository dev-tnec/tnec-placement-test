# TNEC Placement Test

Online placement test for Titik Nol English Course. 25 questions, 5 minutes, six levels, server side grading, and a result email. Built as a Cloudflare Worker with a D1 database.

The product and design decisions are documented in `AGENTS.md` and `DESIGN.md`. Read those before changing anything.

## Local setup

1. Run `npm install`.
2. Run `npx wrangler d1 execute tnec-placement-test --local --file=./schema.sql` once to create the local tables.
3. Run `npm run dev` and open `http://127.0.0.1:8787`.
4. Run `npm test` for the smoke checks.

## Deploy

1. Authenticate wrangler with `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN` in the shell.
2. Run `npm run db:apply` to apply the schema to the remote D1.
3. Run `npm run deploy`.
4. Open the deployed URL, finish one test with your own email, and confirm the result email arrives.

The Worker name is `tnec-placement-test`. The D1 database and the Cloudflare account are pinned in `wrangler.toml`.

## Configuration

| Setting | Where | Default |
|---|---|---|
| Test duration | `src/legal.js` | 300 seconds |
| Consent version | `src/legal.js` | `2026-11-14` |
| WhatsApp number | `src/legal.js` | `6282333143544` |
| Sender address | `wrangler.toml` | `placement@index-now.dev` |
| Levels and thresholds | `src/levels.js` | Six levels, 0 to 25 |
| Questions and answer key | `src/questions.js` | 25 questions |

Bump `CONSENT_VERSION` whenever the terms or privacy text changes, so each stored consent points to the exact version the user saw.

## Structure

`src/` holds the Worker and the server only data (questions, levels, legal copy, email template). `public/` holds the static app. `schema.sql` is the D1 schema. `tests/smoke.mjs` checks the question set, the level boundaries, and the answer key never reaching the client payload.
