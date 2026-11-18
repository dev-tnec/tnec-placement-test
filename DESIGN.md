# TNEC Placement Test Design System

This file is the design source of truth for the placement test app. It inherits the TNEC tokens from `../design.md` and narrows them to one job: a focused, timed test that a first-time visitor can finish in five minutes without instructions. Do not add a color, font size, radius, or shadow that is not in this file.

## 1. Product character

The app is a test, not a marketing page. It should feel calm, precise, and a little serious. Deep navy carries the structure and the action that moves the test forward, white carries the reading surface, red marks urgent state and errors, and yellow marks attention without alarm. Buttons are never red; the user rejected red buttons on 16 November 2026.

The visual direction is editorial and Swiss: a strong grid, oversized type, thin rules, numbered elements, and generous whitespace. It is not playful, not glassy, and not a generic SaaS card stack. The reference for density and components is `assets/code.html`; the reference for voice and color is the TNEC brand.

The intro is the one screen where the brand can be loud. The test, details, and result screens stay quiet and functional.

## 2. Component sourcing

Never build a component, animation, or visualizer from scratch when a proven open-source one exists. The rule covers waves, carousels, date pickers, charts, command palettes, toasts, and every other common block. The approved sources are shadcn/ui patterns for the React dashboard and the ElevenLabs UI components for audio and voice interfaces; other established libraries are allowed the same way when they are the standard for the job.

Because the CSP blocks third-party scripts, an open-source component arrives by being copied into the React source. The dashboard may copy a shadcn-style component into `apps/admin/client/src`, and the student runner imports its components from `apps/web/student/src`. A component that cannot be consumed directly is ported one to one, keeping its drawing code, its defaults, its license, and a source link in the file header. The speaking wave is the ElevenLabs UI LiveWaveform, ported into `apps/web/student/src/live-waveform.js` with its MIT notice. Never replace a sourced component with a hand-made approximation.

## 3. Color

All values come from `../design.md`.

| Token | Hex | Use in this app |
|---|---|---|
| `--navy-900` | `#0A1B38` | Hero band, primary text, primary buttons, selected option border, answered navigator cells, result card, stepper active bar |
| `--navy-800` | `#10264A` | Hover on navy buttons |
| `--navy-700` | `#16325C` | Preview card back sheet, icons on pale surfaces |
| `--red-500` | `#E3201F` | Current level dot, timer under one minute, level pill in the result email |
| `--red-600` | `#C41615` | Field error text and invalid input border |
| `--red-50` | `#FDECEC` | Violation icon background, and the priority skill icon on the result report |
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
6. Buttons are navy. The one exception is the call to action inside the navy profile box of the result report, which is yellow so it stays visible on navy.

## 4. Typography

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

## 5. Spacing

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

## 6. Radius and elevation

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

## 7. Layout

| Property | Value |
|---|---|
| Page gutter | `clamp(20px, 3vw, 48px)` |
| Wide wrap | 1180px |
| Narrow wrap (intro) | 900px |
| Details wrap | 1000px |
| Result report wrap | 1180px |
| Hero grid | `minmax(0, 1.08fr) minmax(320px, .92fr)`, 56px gap |
| Test grid | `minmax(0, 1fr) 340px`, 24px gap |
| Details grid | `minmax(0, .88fr) minmax(0, 1.12fr)`, 56px gap |
| Result grid | `minmax(0, 1.05fr) minmax(0, .95fr)`, 16px gap |
| Tablet breakpoint | 1024px |
| Mobile breakpoint | 767px |

The intro uses the narrow wrap for the stepper and panels, while the hero uses the wide wrap. The stepper is pulled up 44px into the hero so it straddles the navy edge. The intro body needs `position: relative; z-index: 1` for the overlap to paint above the hero.

At 1024px the hero becomes one column and the preview moves below the copy, left aligned. The test grid, details grid, and result grid all become one column. At 767px the test status bar stays on one row, the stepper becomes three compact columns without meta text, and the how cards stack.

### Vertical rhythm

| Block | Padding |
|---|---|
| Test screen wrapper | `24px` top, `48px` bottom |
| Speaking screen wrapper | `clamp(48px, 9vh, 96px)` top, `48px` bottom |
| Question card body | `24px`, `16px` under 767px |
| Stepper | `18px 22px` |
| Dialog body | `20px 24px` |
| Notice | `12px 16px` |
| Recording indicator row | `32px` above, `16px` below |

A screen that starts with a bare card must never touch the viewport top. The speaking screen uses the clamp above so the card has air on short and tall viewports alike.

## 8. Screen compositions

### Intro

A navy hero with two columns. The left column carries the eyebrow, the display headline, the lead, and three numeric facts separated by thin vertical rules. The right column carries a decorative product preview: a white question card rotated minus two degrees over a navy back sheet rotated plus three degrees. The preview is `aria-hidden` and shows a sample question that does not appear in the real test, a timer, three options with one selected, and a 12 dot progress strip.

Below the hero, a white stepper card straddles the navy edge. It has three columns, each with a 4px top bar, an index, a title, and a meta line. The active step uses a navy bar, a done step uses a yellow bar, and an upcoming step uses a gray bar.

Then a section header with an eyebrow and a section title, followed by three how-cards. Each card has a large ghost number in the top right, a title, and one short paragraph. Cards lift 3px on hover.

Then the consent panel. Its header stacks an eyebrow, a title, and a lead. Two numbered columns follow: "Cara tes berjalan" with four rules and "Data dan hasil" with four data points. Three custom checkboxes come next. Clicking the terms or privacy row opens that document in the legal dialog with a primary Setuju action at the bottom, and Setuju closes the dialog and checks the box. The honesty row toggles directly. The action row pairs the primary button with a short microcopy.

### Test

A slim sticky status bar with progress on the left and the timer on the right. There is no site header. The body is a two-column grid: the main column holds the audio card and the question card, and a 340px right sidebar holds the navigator. At 1024px and below the grid becomes one column and the navigator sits below the question card. The question card has four bands: a meta bar with the question badge and flag button, the passage (only for reading questions), the prompt inside a bordered canvas, and the navigation row.

The prompt canvas is a white rounded rectangle with a 1px border, a small uppercase instruction label in the top left, and the prompt at 23px. It gives the question a stage and keeps short questions from looking empty.

The navigator is a 5 by 5 grid of 25 cells. Answered cells are solid navy, the current cell has a navy outline, flagged cells have a yellow dot in the top right. The finish button is navy and full width. When a test uses time per question, the back button and the flag button are hidden, navigator cells cannot be clicked, the timer label reads "untuk soal ini", and the next question opens by itself when the time runs out.

When a test uses time per section, the navigator shows only the questions of the current section and the timer label names that section, for example Listening. Inside that section the cells are grouped under a small uppercase heading per part or passage, so Listening reads as Part 1 to Part 4 and Reading as Passage 1 to Passage 3. The back button is disabled on the first question of the section, and the finish button reads "Lanjut ke Reading", "Lanjut ke Writing", or "Lanjut ke Speaking". The section locks when its time ends or when the student presses that button, and the next section opens on its first question with a fresh timer.

A keyboard hint sits below the grid on desktop only. It is removed on mobile because there is no keyboard.

### Audio card

The Listening audio sits in a white card above the question: 24px padding, a 1px gray border, a 16px radius, and the card shadow. A 12px gap separates the uppercase label, the note at 14px with 1.6 line height, and the Voice Note player. The player is the 21st.dev Voice Note component by ebnsina (MIT), ported with the app's navy tokens: a light pill, a 56px navy circle with play or pause, a 6px range track with a 20px navy thumb, and a 20px tabular time. The slider is read-only for the listening audio, so the audio still plays once and cannot be scrubbed. The native player stays hidden. The card disappears outside Listening.

### Details

A 1000px column with the stepper at the top, step 2 active. Below it a two-column layout: the left column carries the step eyebrow, a large headline, a short lead, and three benefit rows with small yellow check circles. The right column carries the white form panel with four fields and the navy primary button.

The fourth field is the branch choice: a legend asking where the student wants to learn, and a two by one grid of radio cards for Pare, Jogja, Medan, and Online. A radio card is a white label row with a 1px gray border, an 8px radius, 12px 14px padding, a native radio input with a navy accent color, and a 14px/600 label. The selected card gets the navy border and the standard 3px navy focus ring. On screens under 480px the grid becomes one column. The field carries the same red 12px error line as the other fields, and the form refuses to submit until one branch is picked.

The details screen never shows the score. The score is withheld until the contact form is saved, so the result is only revealed after the user gives their name, email, WhatsApp, and branch choice.

### Link error

A used, expired, or locked invitation link opens a full-page error instead of the intro, in the manner of a 404 page. The narrow wrap centers one white card on the gray page: the HTTP status as a 64px/800 navy number, the title "Tautan tidak bisa dibuka" at heading size, the server's message in secondary text, and one navy primary button back to the start page. There is no hero, no consent panel, and no start button behind it. The heading takes focus on mount.

### Result

The result is a React report at `/hasil`, one page for all four tests: the placement test, pre-test, post-test, and IELTS mockup. The placement test opens it with `?token=`, the invited tests with `?attempt=`. It is a 1180px wrap.

A white sticky header carries the official Titik Nol lockup and two actions: Rekomendasi Belajar and Unduh PDF / Cetak. The print action calls `window.print()`.

The navy hero carries the test eyebrow, the public code, the student name, one lead sentence, and four meta boxes (package or program, date, status, profile). Its right side is the score card: a gold arc dial, the score, the band or level label, the scale, and the one-line caption. For the IELTS mockup the dial is the overall band out of 9.0; for the placement test it is the multiple choice score; for the pre-test and post-test it is the score out of 100.

Below the hero, the skill cards use one grid. The IELTS mockup has four cards (Listening, Reading, Writing, Speaking), the placement test has two (Pilihan Ganda and Speaking), and the pre-test and post-test have two (Nilai and Soal Benar). A card carries an icon, a status badge, the value, the raw count, one diagnosis line, and a progress bar. The tones are navy for Kompeten, yellow for Sedang, red for Prioritas, and gray for a part that was skipped or not taken. There is no green: navy is the positive tone in this system.

The gap analysis compares each score with its target: Band 6.5 per skill for the mockup, the next level threshold for the placement test, and the pass score for the post-test. The target is a 3px line inside the track, outlined in white so it stays visible on a navy fill. The profile box next to it is navy, with the level or band profile, three stat rows, and the WhatsApp call to action. When a test has no gap row, the profile box spans the full width and the call to action sits on the right.

The detail panel lists the Writing tasks and the Speaking interview with their four criteria and the AI comments. The placement test uses the same panel for the five speaking aspects. The action plan follows with two numbered steps and the yellow note that carries the disclaimer. The placement test adds the program cards below the plan.

Every section avoids a page break when printed, the header actions are hidden, and `print-color-adjust: exact` keeps the navy and gold on paper. The print layout returns the hero to two columns and puts the skill cards and criteria in two columns.

## 9. Components

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

A white pill with a 1px border, a clock icon, tabular numerals, and the label "tersisa". Under 60 seconds it switches to a red border and red text and pulses the shadow. The pulse stops under `prefers-reduced-motion`. In the IELTS mockup the label names the section instead, for example Listening, and the same pill sits in the speaking card top bar next to the step meta.

### Level ladder

Six rows inside the navy result card. Each row is a 7px dot, a 12px label, and an optional "Kamu di sini" pill. Rows are separated by a 1px white line at 8 percent. Done dots are yellow, the current dot is red with a soft ring, upcoming dots are white at 22 percent.

### Dialogs

Native `<dialog>` with a 16px radius, 24px padding, and a navy backdrop at 72 percent with a 2px blur. The violation, end, and time-up dialogs cannot be dismissed with Escape. The submit dialog can. The legal dialog can be dismissed with Escape only when it is opened from the details screen. When it is opened from a consent row, the Setuju action is the only way out.

### Form fields

A 48px input with a 1px gray border, 8px radius, 14px text, and a `--navy-700` focus border with a 3px navy ring at 14 percent. The label is 13px/600. The error line is 12px red and sits below the field. Invalid inputs keep the red border after submission.

### Rich passage text

Passages carry a markdown-lite format that both apps render through the same parser in `packages/core/src/rich.js`: paragraphs separated by a blank line, bullet lines starting with "- ", numbered lines starting with "1. ", quote lines starting with "> ", pipe-table lines with an optional `| --- |` separator row under the header, `![alt](/path.png)` images hosted on the test site, and the inline tags `<b>`, `<i>`, and `<u>`. Anything the parser does not know stays literal text, so existing passages never change on their own. An image address that is not a site path stays literal, because the CSP blocks foreign images anyway. The renderer builds React elements, never innerHTML.

In the editor, a formatting bar sits flush on top of the passage textarea: a gray-50 strip with a gray border that shares the textarea's top corners, holding icon buttons for bold, italic, underline, bullet list, numbered list, quote, insert table, and insert image, separated by 1px gray dividers. The buttons edit the textarea's selection in place, so the form stays uncontrolled, and a block insert opens a blank line first so it never merges into the line above. The bar rides on the passage fields of the question editor and the section dialog, and the "Pratinjau Soal" action opens the question as the student sees it: the badge, the passage with its rich text, the prompt, and the answer form, with the answer key deliberately unmarked.

In the student runner the passage block keeps its surface fill and label, and its paragraphs, lists, quotes, tables, and images render through the same parser. Lists restore the browser's disc and decimal markers with a 22px indent. A quote is one even card, the same shape as a notice: the surface fill over its whole area with a uniform border, never a colored stripe down one side. A table is a collapsed grid with gray borders, a surface header row, and 8px 12px cell padding. The app's global list and table resets do not apply inside a rich passage.

### Notices

A notice is one even card: the pale yellow `--yellow-50` fill covers the whole block, the border is a uniform 1px `--gray-200`, the radius is 8px, and the text is navy at 13px. It is never a colored stripe down one side. The same pattern serves the closed-test or unusable-link notice in the hero, the fullscreen warning above the question card, and the speaking problem notice inside the card. A speaking notice sits in the same in-card position as the recording indicator, directly above the buttons, and the "Lanjut tanpa rekaman" action appears under it. Do not reuse the notice as a general info box.

### Recording indicator and wave

The speaking feedback is one aligned row inside the active card, directly above the buttons: a 10px pulsing `--red-500` dot, the label "Merekam suara kamu" at 13px/700 in `--red-600`, the live waveform filling the middle, and the timer at 22px/800 with tabular numerals. The row is 24px tall, sits 32px below the content above it and 16px above the button row, and all four pieces share one center line. The dot pulses once per second. Under 480px the label is hidden so the dot, wave, and timer keep one full row. The mic-failure notice and the skip action use the same position, and the record button stays available so the student can retry after allowing the microphone.

The wave is the ElevenLabs UI LiveWaveform component, ported one to one into `apps/web/student/src/live-waveform.js` with its MIT notice. Its settings are fixed: canvas, static mode with the mirrored spectrum, barWidth 3, barGap 1, barRadius 1.5, minimum bar height 4, the 5% to 40% frequency slice, sensitivity 1, smoothing 0.8, fftSize 256, 30ms updates, a 24px edge fade, and `--red-500` bars. Do not replace it with a hand-made equalizer or a row of dots.

### The placement speaking questions

The placement speaking is a bank, not one prompt from the settings. The team manages the questions in the Speaking tab with the same table, up and down ordering, and editor page pattern as the question bank, and Pengaturan keeps only the on/off switch, the question count, the randomize switch, the minimum and maximum durations, and the dialect. The step meta in the speaking card reads "Pertanyaan 1 dari 2" when the pick carries more than one question, and each question gets its own recording between the configured minimum and maximum: a recording under the minimum is refused in the runner and by the server with no slack, the take is cleared, and the student records again.

## 10. States

| State | Treatment |
|---|---|
| Hover | Border darkens or fill darkens by one step. Never move the layout. |
| Focus | 3px navy ring at 45 percent on buttons and rows, navy border on inputs. Red is kept for errors, so focus never looks like an error. |
| Selected | Navy border, navy keycap, bold text, check mark. |
| Disabled | Neutral gray fill, secondary text, `not-allowed` cursor. |
| Warning | Timer turns red, warning banner turns yellow, flag turns yellow. |
| Error | Red border and 12px red message below the field. |
| Loading | Button label changes to a verb in progress ("Menyiapkan tes...", "Menyimpan...") and the button disables. No spinner. |

## 11. Anti-cheat UI

The test runs in fullscreen. In Chrome, Edge, and Opera the Esc key is locked while it runs, so a quick press does nothing and leaving fullscreen takes holding Esc for 2 seconds; the browser shows its own hint for that, so the page adds no copy. Three focus events are treated as violations: leaving fullscreen, hiding the tab, and blurring the window while the tab is visible. A fourth category (blocked copy, cut, paste, context menu, and developer shortcuts) is logged to the server but does not count toward the three strikes.

On the first and second strike, a modal blocks the test with the count and one action: return to fullscreen. The timer keeps running behind it, and the copy says so. On the third strike, the test pauses behind the limit dialog with exactly two choices: "Lanjutkan tes", the primary action, resumes the test with the answers kept, and "Keluar dari halaman tes" ends the session after a confirmation step that warns the answers are not saved. Nothing destructive runs from the first click, the browser's own leave-site nag never fires on the confirmed exit, and a student who keeps leaving the screen gets the choice again on every further violation.

When the timer reaches zero, the test stops without submitting. The time-up dialog offers "Mulai tes baru" and "Keluar dari halaman tes", each with a confirmation step, because starting over or leaving both end the session.

The copy must stay factual. Do not claim the test cannot be cheated. The honest claim is that focus loss is recorded and repeated violations end the test. A second device is outside what a browser can detect.

## 12. Motion

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 180ms | Hover, focus, selection |
| `--duration-base` | 300ms | Reserved for larger state changes |
| `--ease-standard` | `cubic-bezier(.2,.6,.2,1)` | All transitions |

Only color, border, background, shadow, and transform on button press animate. The how-cards lift 3px on hover. No entrance animations, no parallax, no auto-advancing carousels. The timer pulse, the recording dot pulse, and the live waveform are the only looping animations. Under `prefers-reduced-motion: reduce`, all durations collapse to 0.01ms, the pulse stops, and the card hover transform is removed.

## 13. Accessibility

Every screen has one `h1` or an equivalent labelled heading. The test section is labelled by the question prompt. Option rows are real radio inputs inside a fieldset with a screen reader legend. The timer is `role="timer"` with `aria-live="off"`, and a separate polite live region announces the question number and the one minute warning. Dialogs are native and trap focus. The progress bar is a native `<progress>` element. The skip link is the first focusable element. Color is never the only signal: answered cells also differ by fill and the current cell by an outline, flagged cells also carry an `aria-label`, and the ladder marks the current level with a text pill.

The decorative preview card is hidden from assistive technology. The hero logo carries the brand alt text. The footer logo has an empty alt because the footer text already names the brand.

## 14. Content rules

The interface language is Indonesian. Test questions stay in English because they measure English. Write complete sentences with the connectors a native speaker would use, so the copy reads as Indonesian rather than a word by word translation of English. Do not clip a sentence into fragments separated by periods, and do not drop the subject or the verb to make a line shorter.

Do not use an em dash. Use a period, comma, colon, or parentheses. Do not use bullet characters in prose. Numbered steps are allowed where order matters, such as the three steps on the intro page.

Use "kamu" consistently. Avoid "Anda", "kita", and gendered terms. Write plain, everyday Indonesian. Avoid formal connectors and stiff phrasing such as "merupakan", "dilakukan", "terindikasi", and "bersangkutan". Write numbers as digits for scores and time. Use "5 menit", not "lima menit".

The result copy must never promise a certification. Every result surface carries the line "Hasil ini dipakai untuk penempatan kelas dan bukan sertifikat resmi."

The details screen must not reveal the score or level. Its job is to collect the three contact fields. The result is returned only after the contact call succeeds.

## 15. Email template

The result email is a 600px single column with inline styles only, because email clients drop external CSS. The header is navy with the brand eyebrow in yellow, the body is white with a 16px radius, the level sits in a pale surface block with a red score pill, the recommendation sits in an even pale yellow block with a uniform border, and the CTA is a navy pill to WhatsApp. The footer carries the campus address and the domain.

The email uses the same hex values as this file. It cannot use CSS variables, so the values are repeated in `src/email.js`. That is the only allowed duplication.

## 16. Implementation

The test site is React, bundled with Node and esbuild from `apps/web/student` into `apps/web/public`, and served by a small Node.js server. The result report at `/hasil` is React too, built from `apps/web/result` into `apps/web/public/hasil`, and the dashboard is React, built from `apps/admin/client` into `apps/admin/public/admin`. The Node servers generate the document shells from the build manifests, so no HTML file is stored in the app source or build. All three build outputs are committed, so the servers only serve files. Tailwind is not used in any of them, even though the reference mock uses it, because the production page needs a strict content security policy and a small payload. The student runner keeps the approved `app.css`, and the report has its own `hasil.css` with the same tokens, not a utility framework.

The speaking wave lives in `apps/web/student/src/live-waveform.js`, the ElevenLabs UI LiveWaveform port with its MIT notice and source link at the top; keep both when touching it.

Both apps declare the same globals once: `[hidden] { display: none !important; }`, `box-sizing: border-box` on everything, the `.sr-only` helper, and the `.tnum` tabular numerals helper. Without the hidden rule, a component class that sets `display` beats the hidden attribute and leaves widgets that should be hidden on screen.

The CSS lives in `apps/web/student/src/app.css` and is imported by the React entry, so esbuild hashes it. Tokens are declared once at the top. Component classes are prefixed by block name (`option`, `nav-btn`, `dialog`, `stepper`, `ladder`) rather than utility names. State classes use `is-` (`is-selected`, `is-current`, `is-answered`, `is-flagged`, `is-warning`, `is-active`, `is-done`).

The brand logo is `apps/web/public/assets/logo-titik-nol.png` (black lockup, 502 by 85 pixels) and `apps/web/public/assets/logo-titik-nol-white.png` (white lockup, 501 by 84 pixels), copied from the TNEC asset folder. The white lockup renders at 140px in the hero, the black lockup at 110px in the footer and at 150px in the result header. Do not redraw or recolor either file.

The favicon is `apps/web/public/favicon.png` and `apps/admin/public/favicon.png`: the square emblem cropped from the official black TNP lockup and placed on a white square, 180 by 180 pixels. Do not redraw it as a text tile.

The content security policy is set by the server in `packages/core/src/node-server.js`: `default-src 'self'`, no inline scripts, no inline styles, no third-party fonts, no external images. Any new dependency must fit that policy or the policy must be changed deliberately.

Counts, durations, and the violation limit in the copy are not hardcoded. Elements with `data-fill` (`total`, `duration`, `strikes`, `time-num`, `time-unit`) are filled from `/api/config`, so the page always matches the dashboard settings.

## 17. Pre-test and post-test screens

A pre-test or post-test opens from a personal link, `/?undangan=<token>`, that the team sends from the dashboard. The intro keeps the same layout, greets the student by first name, hides the contact step and the six level fact, and rewrites the data rules for an enrolled student. There is no details screen. After submit the browser opens the result report at `/hasil?attempt=<id>`, where the score card shows the value out of 100 and the gap row compares it with the pass score on the post-test. A used, expired, locked, or unknown link shows the full-page link error screen. A test that is merely closed still shows the yellow notice in the hero, with a 1px border and no colored edge, and the start button stays disabled.

## 18. Dashboard

The internal dashboard at `/admin` is React, bundled with Node and esbuild from `apps/admin/client`, and its CSS is `apps/admin/client/src/admin.css`; the build output is committed to `apps/admin/public/admin` so the server only serves files. The dashboard server generates the shell from `admin-manifest.json`, so there is no HTML file. It uses the same tokens with the same color rule: primary and destructive buttons are navy, red is only for status dots, error text, and low accuracy bars, and focus rings are navy. Status is a dot plus a text label. There are no colored edge stripes.

The IELTS Mockup Sesi tab follows the same panel and table pattern: the session list is one table, and a session row never navigates on click, because the Peserta button in the action cell opens the session page and the Ubah button opens the session dialog. The session page is a header with actions, one toolbar with the roster and email quota facts, and one roster table. The import dialog is the native dialog at the 760px width, and every block in it sits on the same 24px body inset: one row with the Unduh template action on the left and the CSV header note right aligned, the file field as a dashed drop area with the picker button styled inside it, the counts line with bold navy numbers, and the preview table in a bordered, rounded frame. The footer is the quiet Batal button with the primary Impor button, like every other dialog.

The Submission menu item is one page for every attempt across the four tests, in the same panel and table pattern: status chips, a search field, a test filter, and a branch filter in the toolbar, then one table whose first column names the test. A row opens the submission detail of its own test. The page carries row checkboxes with the bulk bar (Ekspor and Hapus on the selection, one CSV in one shape for any mix of tests), a header Ekspor CSV for the filtered rows, and the per-test Submission tab and Database Siswa carry the same branch filter.

A page header is the title and its actions, with no description under the title. The owner rejected explanatory lines there on 16 November 2026. The only extra item allowed is a test page's Ditutup status when that test is closed. Record pages keep their single line of facts, such as a student's email and WhatsApp number or a submission's start time and device.

The Sertifikat menu is one sidebar item with two tabs, Sertifikat terbit and Pengaturan, in the same segmented tabs as the tests. Certificate numbers wrap only after a slash, never inside a token such as `{bulan_romawi}`, and a number in a table row stays on one line. The register also carries a Terkirim column with the last email and WhatsApp send per certificate. The printable certificate keeps the design of its own template in `apps/admin/certificates`, including its fonts, frame, and gold accents, because it is a printed document rather than a dashboard screen. The dashboard only adds a navy bar above it with the back link, the print button, and the send row, and that bar is not printed. A cancelled certificate carries a translucent red DIBATALKAN mark, which does print.

The send row appears on the bar only for a valid certificate with a student: an Unggah PDF label-button, a state line, and the two send buttons, all in the bar's pill style. Uploading the PDF saved from the print dialog turns the state line white and reveals Kirim email and Kirim WhatsApp with the student's address and number; the file link token is minted once and kept across re-uploads. Both sends disable while running and rename to their success text, and the state line carries the outcome or the error in place, never as a floating box. The state line wraps inside its 340px column instead of truncating, so the no-PDF instruction is readable. The certificate row menu carries the same flow without a trip to the print page: while no PDF exists it offers Unggah PDF hasil cetak, and once the file is stored it shows the two sends plus Ganti PDF sertifikat, with a send item disabled only when the student lacks that address, and its label says which one is missing.

## 19. Do not

1. Do not add a gradient, glassmorphism, or a shadow outside the listed set.
2. Do not use red for buttons, decoration, headings, or backgrounds behind long text.
3. Do not use more than two accent colors in one section.
4. Do not center a full-width grid or card row. Only the intro and result panels are centered because they are the whole screen content.
5. Do not add a second font family.
6. Do not add a cookie banner. The app sets no analytics or advertising cookies, so a banner would be noise. If analytics is added later, this rule changes.
7. Do not use an em dash in UI copy.
8. Do not show the score or level on the details screen.
9. Do not hand-build a component or animation when an established open-source implementation exists.
10. Do not put a colored stripe on one side of any element. Notices are even cards.
11. Do not float a status or feedback widget away from the control that triggered it. Feedback appears inside the card, next to the action.
12. Do not let a screen that starts with a bare card touch the viewport top, and do not leave a control row without the documented vertical rhythm.
