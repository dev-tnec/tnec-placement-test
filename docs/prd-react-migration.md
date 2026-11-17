# PRD 3: React migration of the dashboard front end

The owner decided on 17 November 2026 to rebuild the admin dashboard front end in React, before PRD 2 (IELTS Mockup) is built. The reason is maintainability and the owner's confidence in the code, not a user-facing need: the screens, copy, and behavior must stay exactly as they are. This project ships nothing else.

## Scope

| Part | Decision |
|---|---|
| Stays untouched | `apps/admin/src/api.js` except four static routes for the new folder, every `/api/admin` route, sessions, the database, `apps/web`, the student-facing test, the certificate print pages |
| Replaced | `apps/admin/public/admin/` (index.html, login.html, admin.js, admin.css as a React build) |
| New | `apps/admin/client/` with the React source, built by Vite into `apps/admin/public/admin-ui/` |
| Not in scope | IELTS Mockup features, design changes, new dashboard features, refactor of the API |

## Architecture

1. Toolchain: Vite with `@vitejs/plugin-react`, two HTML entries (`index.html` for the dashboard, `login.html`), React as the only front end library. No router library, no state library, no UI kit. The strict CSP allows only same origin scripts and styles, and the build output respects it: hashed file bundles, no inline script or style, the module preload polyfill off.
2. The CSS is the current `admin.css`, copied into the client source, so the screens look identical. JSX reuses the existing class names.
3. Data: the same `GET /api/admin/bootstrap` into a single store module with `useSyncExternalStore`, so every change reloads the data and re-renders, exactly like today's `loadData()` plus `render()`. View filter state stays in one `ui` object that survives navigation, as today. Forms inside dialogs stay uncontrolled and are read at submit time, which keeps the validation and error code close to the original.
4. Routing: the same hash routes (`#/ringkasan`, `#/siswa`, `#/siswa/:id`, `#/tes/:key/:tab`, `#/tes/:key/submission/:id`, `#/program/:tab`, `#/sertifikat/:tab`) and the same titles.
5. Native `<dialog>` elements stay. Toasts, the context menu, and the confirm dialog keep their promise based APIs, so the ported call sites do not change shape.
6. The certificate number rules (`formatCertNumber`, `certFormatProblem`, `certPeriodKey`) stay a pure block in `client/src/cert-number.js`, and `tests/smoke.mjs` reads that block to prove the dialog preview and the server agree.

## Serving and build

1. During the migration the build is served at `/admin-ui/` behind the same session cookie, while the old dashboard keeps running at `/admin/`. The production team is never on a half-finished app.
2. `serveAdminPage` gains four routes: `/admin-ui/` and `/admin-ui/index.html` with a session, `/admin-ui/login` without one, and `/admin-ui/assets/` without one. Everything else in `api.js` is untouched.
3. The build output is committed to the repository, so Render needs no new build command: `npm ci` and the existing start commands keep working, and a missing `devDependencies` install can never break the production boot. `scripts/start.mjs` builds the client before serving, so what runs locally is always built from the current source, which closes the stale-cache class of bug for good.
4. The final switch, done when every screen reaches parity and is verified on the dev branch, is one small commit: Vite `base` becomes `/admin/`, the output moves to `public/admin/`, the old files are deleted, and the `/admin-ui` routes are removed. The certificate print assets (`certificate-page.css`, `certificate-page.js`) move into the Vite static folder at that moment.

## Screens to recreate

Ringkasan (periode scoped), Database Siswa with the Daftarkan siswa dialog and the recent registrations panel, the student record page, Sertifikat terbit and Pengaturan with the issuing and type dialogs, Soal & Jawaban with the question editor, Submission with the bulk bar, the Lead tab, Pengaturan for all three tests including speaking and the level thresholds, the submission detail page with the speaking panel, Program & Kelas with all three tabs and their dialogs, and the login page with first admin setup.

## Test plan

1. `npm test` without a database: the smoke checks plus a new check that the committed build exists and its entry HTML references a bundle that exists.
2. `npm start` against `.env.dev`, then every screen in the headless browser: each list with its filters and pagination, each dialog with its validation and server errors, the speaking queue, the CSV exports, the certificate number preview, and the login flow including setup mode.
3. Only when the full list passes on dev does the switch to `/admin/` happen.

## Risks

1. Behavior drift in the port: JSX is rewritten by hand from template strings. Mitigation: the same helper functions, the same class names, and screen by screen verification against the dev branch.
2. The build output in git makes front end diffs noisier. Accepted, because it keeps Render free of a build step and keeps production boot immune to toolchain problems.
3. Vite and React are new devDependencies; the runtime server still depends only on `pg` transitively through `@tnec/core`.
