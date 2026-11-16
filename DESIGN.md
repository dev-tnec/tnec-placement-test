# TNEC Placement Test Design System

This file is the design source of truth for the placement test app. It inherits the TNEC tokens from `../design.md` and narrows them to one job: a focused, timed test that a first-time visitor can finish in five minutes without instructions. Do not add a color, font size, radius, or shadow that is not in this file.

## 1. Product character

The app is a test, not a marketing page. It should feel calm, precise, and a little serious. Deep navy carries the structure and the action that moves the test forward, white carries the reading surface, red marks urgent state and errors, and yellow marks attention without alarm. Buttons are never red; the user rejected red buttons on 16 November 2026.

The visual direction is editorial and Swiss: a strong grid, oversized type, thin rules, numbered elements, and generous whitespace. It is not playful, not glassy, and not a generic SaaS card stack. The reference for density and components is `assets/code.html`; the reference for voice and color is the TNEC brand.

The intro is the one screen where the brand can be loud. The test, details, and result screens stay quiet and functional.

## 2. Color

All values come from `../design.md`.

| Token | Hex | Use in this app |
|---|---|---|
| `--navy-900` | `#0A1B38` | Hero band, primary text, primary buttons, selected option border, answered navigator cells, result card, stepper active bar |
| `--navy-800` | `#10264A` | Hover on navy buttons |
| `--navy-700` | `#16325C` | Preview card back sheet, icons on pale surfaces |
| `--red-500` | `#E3201F` | Current level dot, timer under one minute, level pill in the result email |
| `--red-600` | `#C41615` | Field error text and invalid input border |
| `--red-50` | `#FDECEC` | Violation icon background only |
| `--yellow-400` | `#F7B500` | One hero word, flagged marker, done step bar, reached level dot, score number |
| `--yellow-50` | `#FFF6DC` | Flagged button, benefit icon background |
| `--white` | `#FFFFFF` | Cards, text on navy |
| `--gray-50` | `#F4F3F0` | Page background |
| `--gray-200` | `#E6E2D9` | Card borders, dividers, input borders |
| `--gray-300` | `#EDEAE3` | Disabled fills, upcoming step bars, preview dots |
| `--surface-50` | `#F7F8FA` | Passage block, email note, question footer |
| `--text-primary` | `#0A1B38` | Body copy |
| `--text-secondary` | `#5C6B7F` | Supporting copy, legends, microcopy |
| `--text-on-dark` | `#FFFFFF` | Text on navy |
| `--text-on-dark-muted` | `#C3CFE0` | Hero lead, result summary |
| `--text-placeholder` | `#9AA6B6` | Input placeholders, prompt corner label |

Rules:

1. Red is urgent state and errors only. It is never a button fill and never a decorative fill. Buttons use navy.
2. Yellow is one emphasis word per view, plus the flag marker, the done step bar, and the score. Do not add a second yellow headline.
3. Navy on white or white on navy carries all body copy. Never red or yellow body text.
4. Pale tints (`--yellow-50`, `--surface-50`, `--red-50`) are for notes, passages, and icon backgrounds. Never use them as a card fill.
5. Navy tints are expressed as `rgba(10, 27, 56, .02)` to `.08`. They are the same token with alpha, not a new color.

## 3. Typography

Font stack: `"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.

Inter is not loaded from a CDN. The app uses the locally installed Inter when present and falls back to Segoe UI or Roboto. This keeps the page fast and avoids a third-party font request that would need a privacy disclosure.

| Role | Size | Weight | Line height | Tracking |
|---|---|---|---|---|
| Hero title | `clamp(36px, 4.4vw, 58px)` | 800 | 1.02 | -0.035em |
| Screen title (details) | `clamp(34px, 4vw, 48px)` | 800 | 1.05 | -0.03em |
| Result level | `clamp(32px, 3.6vw, 44px)` | 800 | 1.02 | -0.03em |
| Section title | `clamp(26px, 3.2vw, 36px)` | 800 | 1.12 | -0.025em |
| Panel title | `clamp(24px, 2.8vw, 30px)` | 800 | 1.15 | -0.02em |
| Question prompt | `clamp(19px, 2.2vw, 23px)` | 600 | 1.55 | -0.015em |
| Card title | 17px | 700 | 1.30 | -0.01em |
| Body | 16px | 400 | 1.60 | 0 |
| Option and card body | 15px | 400 | 1.45 to 1.65 | 0 |
| Small | 13px | 400 | 1.55 | 0 |
| Eyebrow and badge | 11px | 700 | 1.40 | 0.12em, uppercase |

The hero title caps at 58px rather than the 64px root display token. The narrower cap keeps the two-column hero and the preview card on one screen at 1440.

## 4. Spacing

Base unit 4px. Use the token scale.

| Token | Value | Use |
|---|---|---|
| `--space-1` | 4px | Icon gaps, tiny offsets |
| `--space-2` | 8px | Chips, navigator gaps |
| `--space-3` | 12px | Header gaps, benefit gaps |
| `--space-4` | 16px | Card internal gaps, grid gaps |
| `--space-6` | 24px | Card padding, section gaps |
| `--space-8` | 32px | Panel padding on desktop, hero facts offset |
| `--space-12` | 48px | Page bottom padding |
| `--space-16` | 64px | Hero top padding |

Half steps (6px, 10px, 14px, 20px, 26px) are allowed inside a component when the token scale is too loose, for example the option row gap and the prompt canvas padding.

## 5. Radius and elevation

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 8px | Inputs, keycaps, benefit icons, preview options |
| `--radius-md` | 12px | Options, checkbox rows, legal dialog body, timer |
| `--radius-lg` | 16px | Panels, question card, dialogs, result card |
| `--radius-xl` | 20px | Preview card and its back sheet |
| `--radius-pill` | 999px | Buttons, badges, progress bar, chips |

| Shadow | Use |
|---|---|
| `--shadow-card` | Panels, question card, navigator, stepper, keyboard hint |
| `--shadow-card-hover` | How-card hover |
| `--shadow-cta` | Primary navy button only, a navy shadow at 22 percent |
| `--shadow-float` | Dialog |
| `0 24px 60px rgba(0,0,0,.32)` | Preview card on the navy hero |

No other shadow. Never use black for a card shadow.

## 6. Layout

| Property | Value |
|---|---|
| Page gutter | `clamp(20px, 3vw, 48px)` |
| Wide wrap | 1180px |
| Narrow wrap (intro) | 900px |
| Details and result wrap | 1000px |
| Hero grid | `minmax(0, 1.08fr) minmax(320px, .92fr)`, 56px gap |
| Test grid | `minmax(0, 1fr) 340px`, 24px gap |
| Details grid | `minmax(0, .88fr) minmax(0, 1.12fr)`, 56px gap |
| Result grid | `minmax(0, 1.05fr) minmax(0, .95fr)`, 16px gap |
| Tablet breakpoint | 1024px |
| Mobile breakpoint | 767px |

The intro uses the narrow wrap for the stepper and panels, while the hero uses the wide wrap. The stepper is pulled up 44px into the hero so it straddles the navy edge. The intro body needs `position: relative; z-index: 1` for the overlap to paint above the hero.

At 1024px the hero becomes one column and the preview moves below the copy, left aligned. The test grid, details grid, and result grid all become one column. At 767px the test status bar stays on one row, the stepper becomes three compact columns without meta text, and the how cards stack.

## 7. Screen compositions

### Intro

A navy hero with two columns. The left column carries the eyebrow, the display headline, the lead, and three numeric facts separated by thin vertical rules. The right column carries a decorative product preview: a white question card rotated minus two degrees over a navy back sheet rotated plus three degrees. The preview is `aria-hidden` and shows a sample question that does not appear in the real test, a timer, three options with one selected, and a 12 dot progress strip.

Below the hero, a white stepper card straddles the navy edge. It has three columns, each with a 4px top bar, an index, a title, and a meta line. The active step uses a navy bar, a done step uses a yellow bar, and an upcoming step uses a gray bar.

Then a section header with an eyebrow and a section title, followed by three how-cards. Each card has a large ghost number in the top right, a title, and one short paragraph. Cards lift 3px on hover.

Then the consent panel. Its header stacks an eyebrow, a title, and a lead. Two numbered columns follow: "Cara tes berjalan" with four rules and "Data dan hasil" with four data points. Three custom checkboxes come next. Clicking the terms or privacy row opens that document in the legal dialog with a primary Setuju action at the bottom, and Setuju closes the dialog and checks the box. The honesty row toggles directly. The action row pairs the primary button with a short microcopy.

### Test

A slim sticky status bar with progress on the left and the timer on the right. There is no site header. The body is the question card plus the navigator. The question card has four bands: a meta bar with the question badge and flag button, the passage (only for reading questions), the prompt inside a bordered canvas, and the navigation row.

The prompt canvas is a white rounded rectangle with a 1px border, a small uppercase instruction label in the top left, and the prompt at 23px. It gives the question a stage and keeps short questions from looking empty.

The navigator is a 5 by 5 grid of 25 cells. Answered cells are solid navy, the current cell has a navy outline, flagged cells have a yellow dot in the top right. The finish button is navy and full width. When a test uses time per question, the back button and the flag button are hidden, navigator cells cannot be clicked, the timer label reads "untuk soal ini", and the next question opens by itself when the time runs out.

A keyboard hint sits below the grid on desktop only. It is removed on mobile because there is no keyboard.

### Details

A 1000px column with the stepper at the top, step 2 active. Below it a two-column layout: the left column carries the step eyebrow, a large headline, a short lead, and three benefit rows with small yellow check circles. The right column carries the white form panel with three fields and the navy primary button.

The details screen never shows the score. The score is withheld until the contact form is saved, so the result is only revealed after the user gives their name, email, and WhatsApp.

### Result

A 1000px column with the stepper at the top, step 3 active. Below it a two-column layout: a navy result card and a white recommendation panel.

The result card carries the result eyebrow, a large ghost level index in the top right, the level name, one sentence summary, the score in yellow, and a six row level ladder. The ladder shows every level with a dot, a label, and a "Kamu di sini" pill on the current level. Done levels use a yellow dot, the current level uses a red dot with a soft ring, and upcoming levels use a muted dot.

The recommendation panel carries the program name, the level description, the WhatsApp CTA, the retry button, the delivery note for the email and the WhatsApp message, and the indikatif disclaimer.

## 8. Components

### Buttons

| Variant | Fill | Text | Border | Use |
|---|---|---|---|---|
| Primary | `--navy-900`, hover `--navy-700` | white | same | Start, submit, finish, WhatsApp |
| Secondary | transparent | navy | 1.5px navy | Previous, retry, dialog cancel |
| Navy | `--navy-900` | white | same | Next question |
| Ghost | white | navy | `--gray-200` | Flag question |
| Link | none | `--text-secondary` | none | Skip question |
| Flagged | `--yellow-50` | navy | `--yellow-400` | Flag question when active |

All buttons are pills. Label is 14px/600, large buttons 15px/600. Primary uses `--shadow-cta`. Hover darkens the fill. Active moves down 1px. Disabled is neutral gray with secondary text, not a faded navy.

### Stepper

A white card with a 1px border, 16px radius, `--shadow-card`, and 18px 22px padding. Three equal columns, 16px gap. Each step has a 4px full width bar at the top, an 11px index, a 13px title, and an 11px meta line. The index and title sit on one row; the meta sits under the title.

### Product preview

A 370px card on the hero. The back sheet is `--navy-700`, rotated 3deg, inset 14px. The front card is white, rotated -2deg, with 20px padding and a deep shadow. It holds a question badge, a timer pill, a prompt, three option rows, a 12 dot strip, and a percentage. It is decorative only.

### How-card

A white card with a 1px border, 16px radius, 24px padding, and a 64px ghost number at 6 percent navy in the top right. The title is 17px/700, the body is 14px/1.6 secondary. Hover lifts 3px with `--shadow-card-hover`.

### Option row

A label with a 34px keycap, the option text, and a 20px selection mark. Border is 1px `--gray-200`, radius 12px, padding 13px 16px. Hover raises the border to navy at 35 percent. Selected swaps the keycap to navy, bolds the text, adds an inset navy ring, and fills the mark with a white check.

The native radio input is visually hidden. Focus is shown with a 3px navy ring on the whole row through `:focus-within`, so keyboard users always see where they are.

### Checkbox

A label row with a 22px custom box. The native input is visually hidden. The box has a 1.5px border at 28 percent navy and a 6px radius. Checked fills the box navy and draws a white check. Focus uses a 3px navy ring on the box. The row border turns navy and the background picks up a 2 percent navy tint when checked. The terms and privacy rows are consent gates: clicking the row opens the legal dialog, and the Setuju action at the bottom of the document checks the box. The honesty row toggles on click.

### Navigator cell

38px tall, 10px radius, 12px/600. Default is white with a gray border. Answered is navy. Current adds a 2px navy outline with 2px offset, so the state color stays visible underneath. Flagged adds a 6px yellow dot.

### Timer

A white pill with a 1px border, a clock icon, tabular numerals, and the label "tersisa". Under 60 seconds it switches to a red border and red text and pulses the shadow. The pulse stops under `prefers-reduced-motion`.

### Level ladder

Six rows inside the navy result card. Each row is a 7px dot, a 12px label, and an optional "Kamu di sini" pill. Rows are separated by a 1px white line at 8 percent. Done dots are yellow, the current dot is red with a soft ring, upcoming dots are white at 22 percent.

### Dialogs

Native `<dialog>` with a 16px radius, 24px padding, and a navy backdrop at 72 percent with a 2px blur. The violation, end, and time-up dialogs cannot be dismissed with Escape. The submit dialog can. The legal dialog can be dismissed with Escape only when it is opened from the details screen. When it is opened from a consent row, the Setuju action is the only way out.

### Form fields

A 48px input with a 1px gray border, 8px radius, 14px text, and a `--navy-700` focus border with a 3px navy ring at 14 percent. The label is 13px/600. The error line is 12px red and sits below the field. Invalid inputs keep the red border after submission.

### Notices

A pale yellow block with a 3px yellow left edge, a navy icon, and 13px text. It is used once, for the fullscreen warning on the intro page. Do not reuse it as a general info box.

## 9. States

| State | Treatment |
|---|---|
| Hover | Border darkens or fill darkens by one step. Never move the layout. |
| Focus | 3px navy ring at 45 percent on buttons and rows, navy border on inputs. Red is kept for errors, so focus never looks like an error. |
| Selected | Navy border, navy keycap, bold text, check mark. |
| Disabled | Neutral gray fill, secondary text, `not-allowed` cursor. |
| Warning | Timer turns red, warning banner turns yellow, flag turns yellow. |
| Error | Red border and 12px red message below the field. |
| Loading | Button label changes to a verb in progress ("Menyiapkan tes...", "Menyimpan...") and the button disables. No spinner. |

## 10. Anti-cheat UI

The test runs in fullscreen. In Chrome, Edge, and Opera the Esc key is locked while it runs, so a quick press does nothing and leaving fullscreen takes holding Esc for 2 seconds; the browser shows its own hint for that, so the page adds no copy. Three focus events are treated as violations: leaving fullscreen, hiding the tab, and blurring the window while the tab is visible. A fourth category (blocked copy, cut, paste, context menu, and developer shortcuts) is logged to the server but does not count toward the three strikes.

On the first and second strike, a modal blocks the test with the count and one action: return to fullscreen. The timer keeps running behind it, and the copy says so. On the third strike, the test stops without submitting. A dialog says the attempt failed and offers to retry or return to the start.

When the timer reaches zero, the test also stops without submitting. The same failed-attempt dialog pattern applies, with a retry and a return to start action.

The copy must stay factual. Do not claim the test cannot be cheated. The honest claim is that focus loss is recorded and repeated violations end the test. A second device is outside what a browser can detect.

## 11. Motion

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 180ms | Hover, focus, selection |
| `--duration-base` | 300ms | Reserved for larger state changes |
| `--ease-standard` | `cubic-bezier(.2,.6,.2,1)` | All transitions |

Only color, border, background, shadow, and transform on button press animate. The how-cards lift 3px on hover. No entrance animations, no parallax, no auto-advancing carousels. The timer pulse is the only looping animation. Under `prefers-reduced-motion: reduce`, all durations collapse to 0.01ms, the pulse stops, and the card hover transform is removed.

## 12. Accessibility

Every screen has one `h1` or an equivalent labelled heading. The test section is labelled by the question prompt. Option rows are real radio inputs inside a fieldset with a screen reader legend. The timer is `role="timer"` with `aria-live="off"`, and a separate polite live region announces the question number and the one minute warning. Dialogs are native and trap focus. The progress bar is a native `<progress>` element. The skip link is the first focusable element. Color is never the only signal: answered cells also differ by fill and the current cell by an outline, flagged cells also carry an `aria-label`, and the ladder marks the current level with a text pill.

The decorative preview card is hidden from assistive technology. The hero logo carries the brand alt text. The footer logo has an empty alt because the footer text already names the brand.

## 13. Content rules

The interface language is Indonesian. Test questions stay in English because they measure English. Write complete sentences with the connectors a native speaker would use, so the copy reads as Indonesian rather than a word by word translation of English. Do not clip a sentence into fragments separated by periods, and do not drop the subject or the verb to make a line shorter.

Do not use an em dash. Use a period, comma, colon, or parentheses. Do not use bullet characters in prose. Numbered steps are allowed where order matters, such as the three steps on the intro page.

Use "kamu" consistently. Avoid "Anda", "kita", and gendered terms. Write plain, everyday Indonesian. Avoid formal connectors and stiff phrasing such as "merupakan", "dilakukan", "terindikasi", and "bersangkutan". Write numbers as digits for scores and time. Use "5 menit", not "lima menit".

The result copy must never promise a certification. Every result surface carries the line "Hasil ini dipakai untuk penempatan kelas dan bukan sertifikat resmi."

The details screen must not reveal the score or level. Its job is to collect the three contact fields. The result is returned only after the contact call succeeds.

## 14. Email template

The result email is a 600px single column with inline styles only, because email clients drop external CSS. The header is navy with the brand eyebrow in yellow, the body is white with a 16px radius, the level sits in a pale surface block with a red score pill, the recommendation uses a yellow left edge, and the CTA is a navy pill to WhatsApp. The footer carries the campus address and the domain.

The email uses the same hex values as this file. It cannot use CSS variables, so the values are repeated in `src/email.js`. That is the only allowed duplication.

## 15. Implementation

The test site is plain HTML, one CSS file, and one ES module, served by a small Node.js server. There is no framework and no build step. Tailwind is not used, even though the reference mock uses it, because the production page needs a strict content security policy and a small payload.

The CSS lives in `apps/web/public/assets/app.css`. Tokens are declared once at the top. Component classes are prefixed by block name (`option`, `nav-btn`, `dialog`, `stepper`, `ladder`) rather than utility names. State classes use `is-` (`is-selected`, `is-current`, `is-answered`, `is-flagged`, `is-warning`, `is-active`, `is-done`).

The brand logo is `apps/web/public/assets/logo-titik-nol.png` (black lockup, 502 by 85 pixels) and `apps/web/public/assets/logo-titik-nol-white.png` (white lockup, 501 by 84 pixels), copied from the TNEC asset folder. The white lockup renders at 140px in the hero, the black lockup at 110px in the footer. Do not redraw or recolor either file.

The content security policy is set by the server in `packages/core/src/node-server.js`: `default-src 'self'`, no inline scripts, no inline styles, no third-party fonts, no external images. Any new dependency must fit that policy or the policy must be changed deliberately.

Counts, durations, and the violation limit in the copy are not hardcoded. Elements with `data-fill` (`total`, `duration`, `strikes`, `time-num`, `time-unit`) are filled from `/api/config`, so the page always matches the dashboard settings.

## 16. Pre-test and post-test screens

A pre-test or post-test opens from a personal link, `/?undangan=<token>`, that the team sends from the dashboard. The intro keeps the same layout, greets the student by first name, hides the contact step and the six level fact, and rewrites the data rules for an enrolled student. There is no details screen. After submit, the score screen reuses the result card and panel: the card shows "Nilai kamu" with the number out of 100 and the correct answers, and the panel says what happens next. A used, expired, or closed link shows a yellow notice in the hero, with a 1px border and no colored edge, and the start button stays disabled.

## 17. Dashboard

The internal dashboard at `/admin` follows the approved `dashboard-prototype.html`. Its CSS is `apps/admin/public/admin/assets/admin.css`, and the dashboard copies of the logos live in `apps/admin/public/assets/`. It uses the same tokens with the same color rule: primary and destructive buttons are navy, red is only for status dots, error text, and low accuracy bars, and focus rings are navy. Status is a dot plus a text label. There are no colored edge stripes.

A page header is the title and its actions, with no description under the title. The owner rejected explanatory lines there on 16 November 2026. The only extra item allowed is a test page's Ditutup status when that test is closed. Record pages keep their single line of facts, such as a student's email and WhatsApp number or a submission's start time and device.

## 18. Do not

1. Do not add a gradient, glassmorphism, or a shadow outside the listed set.
2. Do not use red for buttons, decoration, headings, or backgrounds behind long text.
3. Do not use more than two accent colors in one section.
4. Do not center a full-width grid or card row. Only the intro and result panels are centered because they are the whole screen content.
5. Do not add a second font family.
6. Do not add a cookie banner. The app sets no analytics or advertising cookies, so a banner would be noise. If analytics is added later, this rule changes.
7. Do not use an em dash in UI copy.
8. Do not show the score or level on the details screen.
