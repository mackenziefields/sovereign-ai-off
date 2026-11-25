# Changelog

Reconstructed from the repository history (`git log`). Dates are all 2026-11-24 for the build session unless noted. "Tested" is described in `TESTING.md`.

## Build 33 · Phase 5: Dashboard Learning Progress
- The Dashboard's "Module library" is replaced by "Learning progress": one row per course with a labelled module bar (complete / in progress / not started, by fill pattern and text, not colour alone), the current module with a link, assignment counts (complete, feedback ready, submitted, not started), and the course grade.
- The course capstone shows as its own box: not started, submitted, feedback ready, complete with score, or "not finished". The grade shows "provisional" until the capstone is graded and never counts it as zero; "Not graded yet" instead of 0.
- Each course row expands to the same module list the library had, so every module is still one click away.
- The top strip adds "Capstones finished" only when a course has a capstone.
- Display only: no saved-data changes, no Worker changes, no AI calls. New helper `S.progressOf(course)`; new `tests/progress.test.html` (24 tests).

## Build 32 · Phase 4B Step E: edge cases, stress and real-data tooling
- Security fix: a course title or code containing `</style>` could break out of the PDF footer's style block. Footer text is now a CSS-escaped string, and the theme attribute is restricted to letters.
- New edge-case and stress tests: hostile text everywhere, missing name/code/dates, a 400-character title, emoji and right-to-left text, courses with no modules, reports for work with no review, and a 30-project course.
- Confirmed in real exported PDFs: every Professional Portfolio contents link jumps to the right project page, in all four designs and both paper sizes.
- `test-data/limited-backup.html`: a local helper (not shipped) that turns a full backup into a one-course test backup, with the name replaced, so real coursework can be tried on a separate copy. `docs/PHASE4-REALDATA-TEST.md` is the step-by-step guide.

## Build 32 · Phase 4B Step C: files inside the publications
- New `js/publish-attach.js`. In the Portfolio export dialog, a "Files you submitted" section lists each selected piece's file with an unticked box. Nothing is shown unless the learner ticks that file, and the choice is for that export only (never saved).
- Images: embedded (scaled to fit within 1600 px). PDF: chosen pages (default first 10, at most 30 per file) drawn as page pictures with the PDF.js copy already in `js/vendor` (no second copy). Word (.docx): headings, paragraphs, lists and tables as text. Excel (.xlsx): cell values for the first sheets with a row cap (default 30), plus bar, line and pie charts redrawn from the numbers saved in the workbook.
- Honest labels throughout: what was embedded, what was left out (page ranges, row caps, images and headers in Word, formatting, unsupported chart types), that PDF pages are pictures (text not searchable), and that a file missing from this device, damaged or unsupported is "not embedded" with the reason. A size ceiling stops long PDF embeds and says where.
- Everything runs on this device. No upload, no conversion service, originals never changed, no new dependency.
- Not covered: the Feedback Report does not include files; Excel charts of other kinds (scatter, area and so on) are named, not drawn; Word images and text boxes are not included.

## Build 32 · Phase 4B Step D: typography and design polish
- Type floors enforced in `css/publish.css`: body 9.8pt or larger, captions and metadata 8.5pt, uppercase labels 7.5pt with tracking at most .12em, table text 9pt or larger, running footers 8pt or larger. Contrast checked for every accent and grey on its background (lowest 4.83:1, above the 4.5:1 floor).
- Each design has its own running footer: Modernist (title left, bold page number right), Editorial (italic, "— n —"), Intellectual (blue page number left, italic title right), Institution (title left, "◆ n ◆" right).
- Institution interior made more efficient: shorter framed openers, tighter section heads and pull quotes, so more content fits per page without losing the formal look.
- Fixed a Rubric-results heading stranded at a page foot, and a cut-off preview on narrow windows.

## Build 32 · Phase 4B Step B: two portfolio exports
- **Academic Record** and **Professional Portfolio** modes on one engine, with a Portfolio export dialog: choose type, choose and reorder completed projects, per-piece notes, optional introduction and closing, include or leave out grades (AI-generated, labelled), Letter or A4, design override for one export, live preview that shrinks to fit narrow windows.
- Professional Portfolio shows no grades, rubrics, first-review scores or history unless the learner opts in; even then the first-review score is never printed and nothing implies accreditation.
- Per-course export settings saved in the course (`pub`), included in backups, resettable. Typed text is saved only if "Remember my text" is ticked.
- Feedback Report ("Save report as PDF" on a final review): assessment history, strengths, findings grouped by kind with quote and location, rubric, next steps, AI disclaimer; the submission is included only if chosen.
- Not yet: attachments are shown as honest "Not embedded in this document" cards (images, Word, Excel and PDF pages arrive in Step C). Visual polish is Step D.

## Build 32 · Phase 4A: data integrity for publications
- **First-review summary kept (your Option B):** when a resubmission becomes the final grade, a small summary of the first review (time, score, rubric results, findings) is now saved with the assignment (`work.firstSummary`). The final review stays the grade. Nothing is made up for older records and no saved assessment is changed; the first review becoming the grade stores no summary.
- **Publication model (`js/publish-model.js`):** the only place published documents read grades and dates. Checks that rubric scores, the review score and maximum, the Grades-page score and the course grade agree, using the app's own rounding rules (one 0.1 step is allowed and noted; more is a substantive inconsistency). If a record is inconsistent the export is blocked with a diagnostic and nothing is changed. Timeline statements (such as "inside the 72-hour window") are printed only when the saved timestamps prove them; first review times that are not saved are labelled "derived" or omitted.
- **Tests:** `tests/publish-model.test.html`.
- Sample PDFs corrected (rubric now adds to 94, honest dates).

## Build 32 · Phase 4 design samples v2
- New sample PDFs in `docs/pdf-samples/v2/`: Portfolio (8-9 pages) and Feedback Report (6 pages) in all four themes. Fictional content; made by Edge print-to-PDF from `css/publish.css`.
- `css/publish.css` gained shared components (chapter openers, contents, inclusion statuses, work text, figures, file-reference cards, assessment history, findings by kind, steps, seal, notices) and a different interior per theme: Modernist (Swiss grid, big numerals), Editorial (centred heads, drop cap, pull quotes), Intellectual (marginal column, short accent rule), Institution (framed openers, roman numerals, seal).

## Build 32 · Phase 4-1: publication engine and the Syllabus PDF
- **New shared engine** (`js/publish.js`, `css/publish.css`): a document is built from saved data in its own publication layout (cover, numbered sections, running footer with page numbers) inside a preview dialog, then saved through the browser's own "Save as PDF". It is not a print of the app page. Nothing is uploaded and no saved data changes. A one-click download can be added later on the same HTML.
- **Dialog:** page size (US Letter default, A4 option, remembered), a live preview, three plain steps, then "Save as PDF" (waits for the fonts, then opens the print window).
- **Syllabus PDF:** cover; overview and outcomes; modules with objectives, learning materials (clickable links) and assignments; schedule; capstone (only when ready); grading policy including the 80/20 rule and the provisional label; credentials marked self-reported; final project; notes. Tables repeat their header row and never split a row; module headings stay with their content.
- **Theme:** the course's own design drives cover, headings, rules, table headers, callouts and footer in all four themes (Modernist, Editorial, Intellectual, Institution).
- "Course sheet" renamed **Syllabus**; a "Save as PDF" button on the Syllabus page.

## Unreleased · Phase 3-5: capstone on Grades and Portfolio (not committed)
- **Grades page (only for courses with a ready capstone):** the "Current Grade" is the combined grade, labelled **provisional** until the capstone is graded, plus a "How your course grade is calculated" table that separates the module average (80%), the capstone grade (20%) and the course grade, with a one-line explanation of the case you are in (combined, provisional, or capstone graded but no module scores yet). The capstone has its own group in the assignment table. The course header says "(provisional)" the same way.
- **Portfolio:** the finished capstone is a "Culminating project" card under "Course capstone" (work, score, feedback). A self-reported final project, if you wrote one, stays untouched under its own heading "Self-reported final project", so the two are never confused. Without a capstone the Portfolio is exactly as before.
- Courses without a capstone: Grades, header and Portfolio are unchanged (checked on all saved courses).

## Unreleased · Phase 3-3: the capstone screens (not committed)
- **Modules page:** a "Course capstone" section under the module grid (new file `js/capstone-ui.js`). No capstone yet: an explanation and **Create a capstone**, which writes a draft and shows a **preview** (instructions, deliverable, phases, weighted rubric, planned exhibits, recommended preparation, and how it changes the course grade). Nothing is saved until **Add this capstone**; **Write a different one** and **Discard** are there too. Existing courses never get one unless you choose.
- **Ready capstone:** title, status, points, "counts 20% of the course grade", current course grade (labelled provisional until graded), the modules/objectives/skills that prepare for it (recommendations, never locks), and Start/Open. **Incomplete** capstone (for example a failed build): a plain note, **Finish the capstone**, **Remove it**; it cannot be submitted to and does not affect the grade until finished. A capstone with submitted work cannot be removed.
- **Workbench reuse:** the capstone opens in the same Assignment Workbench, Review Studio and 72-hour process, with a "Course capstone" header, a breadcrumb back to Modules, "Recommended preparation" instead of module readings, and no Edit or "write with AI" buttons.

## Unreleased · Phase 3-2: capstone generation (Worker v18, not deployed, not committed)
- **Worker v18** adds `/capstone`: a cumulative, portfolio-worthy capstone page (overview, fictional framing, exhibit plan, 4-6 phases, deliverable, 5-7 weighted criteria summing to exactly 100 points) plus "recommended preparation" (module numbers with a reason, objectives, skills). The Worker rejects a capstone that is incomplete or does not name at least two contributing modules (one if the course has one), keeps module numbers in range, and labels AI-written material fictional in code. Exhibits reuse the existing `/exhibits`.
- **App:** `ai.draftCapstone` (unsaved draft, for the preview), `ai.adoptCapstone`, `ai.finishCapstone` (builds missing exhibits; also the recovery action) and `ai.createCapstone` (all at once). A capstone is "ready" only when its page, rubric and exhibits are complete; otherwise it is saved as **incomplete** with a plain note and nothing is shown as ready. Never replaces a capstone that has submitted work.
- **New AI courses** now build the capstone as the last step of course creation (shown as its own step). If it fails the course is marked partial and says so; a stub incomplete capstone is saved so it can be finished later. Older Workers (below v18) cannot make one and say so.
- No screens yet (3-3 and 3-4).

## Unreleased · Phase 3-1: capstone data model and 80/20 grade maths (no screens yet, not committed)
- New optional `course.capstone`: a module-shaped record kept outside `course.modules` with one assignment (kind demonstrate, `capstone: true`), status ready/incomplete, weight (default 20), and "recommended preparation" lists. Courses without it are saved byte-identically.
- `S.courseGrade(c)`: no capstone = the module average exactly as before; with one, 80% module average + 20% capstone; capstone ungraded = module average labelled provisional (never counted as zero); nothing is combined with a missing side. `S.grade` is untouched. Nothing displays this yet (3-5).
- `finalizeExpired` also covers a capstone's 72-hour window (`S.allWork`); `S.allAssignments` stays module-only.

## Unreleased · Phase 2D-4: Review Studio shows the row a review cited (not committed)
- When a review cites a row of your own data (`U1-2`), Review Studio shows that row's cells under the citation, with the cited column highlighted, **taken from the dataset version the review was given**, so replacing your data later does not change what an old review shows.
- If that version was deleted, or the review did not record a version, it says so plainly instead of showing a different row. A row that was not in the version shows "not available". Text is shown as text (a cell starting with `=` is never run).

## Unreleased · Phase 2D-3: sending your own data to a review, only when you say so (Worker v17, not committed)
- **Authorization box** above the usual "send it?" consent, on the Demonstrate submission form (first and final review) and in Office Hours. **Off by default and asked again for every review**; never remembered. When ticked it lists exactly what will be sent: the dataset name and date, each sheet with rows and columns, whether it is **sampled** ("the first N of M rows"), about how many characters, and a preview of the first rows. Unticked, nothing about your data is sent and the review does not refer to it.
- **Worker v17** accepts an optional `context.learnerData` (up to 10,000 characters; the app sends up to 8,000). The prompt labels it as the learner's own, unverifiable data and as data, never instructions. Findings may cite its rows (`ref` exhibit `U1`..`U5`); the Worker keeps a ref only if that exhibit, row and column were really sent, otherwise it drops it and says so. The app hides the option and explains if the connected Worker is older than v17, and refuses to send in code as well.
- **Recorded on the review:** `feedback.data` keeps which dataset version, which sheets, how many rows and characters were sent. Review Studio's "What the reviewer could see" says "Your own dataset was included", and a row citation reads "Your data, exhibit U1, row U1-2".
- Guards: if the dataset changes after you tick the box, sending is refused until you read the description again. `refLine`, the feedback normalizer and `S.exhibits.asText` were extended for `U` ids.
- **You need to redeploy the Worker (v17) before real use.** Not deployed, not real-tested.

## Unreleased · Phase 2D-2: "Your data" storage, versions and screens (not committed)
- New `js/mydata.js` (`S.myData`). A **Your data (optional)** section appears below the supplied exhibits on **Demonstrate** assignments' Materials tab (not on Apply, Learn or real-evidence assignments), and in **Office Hours** for Demonstrate assignments or whenever "work from my own material" is chosen. It is labelled "Added by you" and never replaces the supplied materials.
- **Versions:** every add or replacement is a new immutable version. Replacing never changes an earlier one. "Remove my data" stops using the data but keeps any version a review used (read-only, under "Versions kept"); other versions are deleted from the device. A used version can still be deleted after a clear warning.
- **Storage:** rows and the original file are in IndexedDB (not localStorage, not backups); the assignment keeps only small descriptive records (`myData`, or `office.data` inside the practice session). Office Hours data is stored in the session, never on the graded assignment, and is deleted with "Start over". "Use a copy of my assignment data" copies it into the session; the two never affect each other.
- Saved reviews can now carry `feedback.data { datasetId, versionId, ... }`, which the store keeps across reloads. Nothing writes it yet; that is step 2D-3.
- Not sent anywhere: nothing about your data reaches the AI service in this step, and the panel says so.

## Unreleased · Phase 2D-1: import engine for your own data (not wired into assignments yet, not committed)
- New `js/dataset-import.js` (`S.dataImport`): reads CSV, TSV and Excel (.xlsx) on this device into "Your data" table exhibits (`origin: 'user'`, ids `U1`, `U2`, row ids `U1-1`). Includes the sheet picker (nothing pre-selected in a multi-sheet workbook), header-row and column-type confirmation, and a plain-language "left out" report. It is not yet reachable from any assignment screen; that is step 2D-2.
- Safety: formulas are never run (the saved value is imported as text), macros, external links, charts, images and pivot tables are ignored and listed, password-protected and old .xls files are refused, and a crafted "zip bomb" is stopped before it can use up memory. Over-limit content is reported and left out, never cut short.
- Limits (configurable via `S.config.importLimits`): 5 MB, 5 sheets, 2,000 rows, 30 columns, 300 characters per cell.
- `js/files.js`: the Excel decompressor now reads in chunks and stops at a hard ceiling; it also exposes `unzip` and `colIndex` for the importer.

## Unreleased · Build 29
- **Older reviews in Review Studio** now show "Next steps (optional)" right after "What to change"; the original saved review stays below.

## Unreleased · Review Studio layout and materials presentation (Track A and B, not committed, not yet a build)
- **Review Studio, wider feedback panel:** the work and feedback columns start at about 55/45 and the divider between them can be dragged, or moved with the arrow keys (Home resets). The size is remembered in this browser (`sovereign.rvSplit`). Below 900px the Your work / Feedback tabs and the bottom stepper are unchanged and the divider is hidden.
- **Easier to scan:** larger claim text, calmer spacing, a visible "In your work" pill on every point that has a passage, a one-line key for blue (What's working) and yellow (What to change), and a hint that selecting a point jumps to and keeps its passage highlighted.
- **Older reviews (no saved quotes):** the Studio now tries to match any quotation marks inside a saved point against the work, on this device, with no AI and nothing saved. Matched points get blue or yellow highlights; unmatched or unquoted points say so plainly and no location is guessed. The original saved review is kept, readable under "The original review, as saved".
- **Materials no longer shown twice:** once an assignment has exhibits, Materials reads "The situation" (narrative), then the exhibits, and a paragraph that only repeats exhibit records is moved into a collapsed "Original supplied text (kept, not shown twice)". The stored text is never changed or deleted.
- **Approval gate for upgrades:** the exhibit preview lists any figure in the existing text that the draft exhibits do not contain, and an assignment with submitted work always asks for a ticked acknowledgment before the Approve button works. Nothing is saved until approval.
- **Worker prompt (needs your deploy to take effect):** when exhibits are planned, `materials` must be a short framing paragraph with no tables, records, figures or quoted document text; reading-based tasks plan no exhibits.
- **Table fix:** numeric column headers and values in exhibit tables are no longer enlarged and blue.

## Unreleased · Overlay navigation, G1 (build 27, not committed)
- **Sidebar floats instead of pushing.** On desktop the global menu is hidden by default behind a slim edge handle. Hovering the handle (after a short delay) or pressing Enter on it opens the full menu over the page; the page never resizes or reflows. It closes about half a second after the pointer leaves, on Escape (focus returns to the handle), or when Tab leaves it, and after you choose a link.
- **Pin menu open** (first control in the menu) restores the persistent sidebar. The choice is kept in this browser only (`sovereign.navPinned`).
- **Touch and phones:** unchanged Menu button and drawer; touch-only large screens (no hover) also keep the Menu button.
- **Assignment Workbench:** with the menu hidden the two panes use the full width (about 1330px of a 1440px window). With the menu pinned in a window under 1380px wide, it switches to the one-pane switcher instead of squeezing two cramped panes. Reading text keeps its readable line length. Course menus inside a course are untouched.
- **Workbench widening follow-up:** the assignment page may now grow to 120rem (was 90rem) with 2rem side margins (3rem on very wide screens); panes split 55% Reference / 45% Your Work with a 1.5rem gutter. Table cells keep identifiers and dates on one line, and tables have an **Expand table** button that opens the dataset in a large dialog (Escape or Close returns). Reading text keeps its 40rem measure.
- **Evidence workspace polish (2B, first pass):** exhibit tabs wrap (two per row on phones) instead of scrolling sideways; bar and share charts are now real text bars with readable 16px labels on any width (line charts scroll sideways on phones); phone tables keep the row id and first column pinned; fixed a page-wide sideways scroll on phones caused by the hidden chart data table.
- **Evidence-aware review (2C, Worker v16):** the reviewer receives the evidence packet as its own field (up to 14,000 characters, shared fairly between exhibits: small exhibits stay whole, large ones show their first rows with an explicit "N of M shown" note). Findings can carry a `ref` (exhibit, row or paragraph id, column). The Worker keeps a ref only if that id, exhibit and column exist in what was shown; otherwise the finding stays and its location is dropped with a note. Feedback and Review Studio show "Related exhibit location: Exhibit A, row A-12, Case no.". Examples may now only use names and figures from the work, materials or exhibits. An older Worker (below 16) still gets the packet squeezed into the 7,000-character materials field as before. Nothing else in 1A-1C changed.
- **Reviews now see exhibits** (Phase 2 bridge): the AI reviewer gets the evidence packet as plain text with row ids, within the Worker's current 7000-character limit and with a note when only part could be shown. Full cell-level review is still Phase 2C.

## Unreleased · Evidence packets, Phase 2A (build 26, Worker v15, not committed)
- **Exhibits:** an assignment can carry a packet of exhibits (`exhibits[]`): tables, documents (article, memo, policy, transcript, correspondence, report, case file), timelines and charts. Old assignments are unchanged; their text materials still show exactly as before.
- **Automatic generation:** the course builder decides which assignments need a packet (AI-built, not reading tasks, not real-evidence), takes the model's exhibit plan from `/details`, and builds the packet with the new `/exhibits` call right after each module's assignments. Progress shows "Exhibits for ..." and the course is marked partial, with a specific note, if any required packet is missing. "Build the exhibits with AI" is the fallback.
- **Charts** are recipes computed from table data at render time (count, sum, mean, median, percent, rate). Unreadable or unmatched values are excluded and listed; nothing is estimated. Each chart shows its formula, units, source rows and a data table.
- **Downloads:** every table has Download CSV (spreadsheet-safe) and Download exact original values. Stored data is never altered; the safe file only prefixes risky cells.
- **Upgrade with preview:** an existing text-only assignment can get a packet. The draft is shown first; nothing is saved until Approve. Instructions, steps, rubric, text, submissions, grades and feedback are not touched. Remove restores the previous state.
- **Prototype limits** (configurable): 6 exhibits, 12 columns, 80 rows, 200 rows per packet, 120 characters per cell, 40 events, 1,800 words and 60 blocks per document. Worker: `EXHIBIT_MAX_*`; app: `S.config.exhibitLimits`. Over-limit content is rejected, not cut.
- Needs Worker v15. Older Workers return no exhibits; the app says so.

## Unreleased · Review Studio (build 25, Phase 1C, not committed)
- **Visual refinement (proposal, awaiting approval):** editorial masthead instead of a toolbar, manuscript "paper" for typed work, numbered footnote markers on highlights, annotation rail with grouped, numbered comments, theme-aware display type (one implementation for all four course themes), and on phones a bottom dock showing the selected comment beside its highlighted passage. No scoring, evidence-verification or Office Hours logic changed.
- **Review Studio:** an "Open Review Studio" button on the Feedback tab (graded reviews, first reviews and Office Hours rounds) opens your submitted work beside its feedback. Desktop shows two panes; on a phone it is two tabs (Your work / Feedback) with a "Back to feedback" button.
- **Evidence-linked:** selecting a point (or its "Show in your work" button) scrolls to the passage and highlights it; selecting a highlight in typed text selects its point. Strengths are highlighted in restrained blue and suggested changes in yellow. A highlight appears **only when this app itself finds the passage** in the submission (letters and digits compared, so quote marks and line breaks don't matter); otherwise the point stays and says "Sovereign could not find this passage in your submission, so it is not highlighted." Missing-element points say there is nothing to highlight. Repeated phrases highlight the first match and say how many there are.
- **Structure:** an "Overall" note, a Previous/Next stepper ("Point 3 of 8"), then sections for what's working, verified errors, missing requirements, partly achieved, clarity, optional improvements, could not be verified, earlier points, rubric assessment and next steps. Each point is a short card that expands when selected.
- **Documents on this device:** typed work and text files are shown as text; PDFs are drawn locally with PDF.js and their text layer is searched to place highlights (page number shown); images are shown but cannot be searched; Excel files show their cell values as the reviewer received them. Nothing is uploaded to show or highlight anything.
- **Vendored PDF.js (pdfjs-dist 4.10.38, Apache-2.0):** `js/vendor/pdf.min.mjs` (353 KB) and `pdf.worker.min.mjs` (1.38 MB), unmodified, integrity-checked against npm's published SHA-512 (`js/vendor/README.md`). Loaded only when a PDF is opened, then cached by the service worker. It is not in the start-up cache list, so a PDF opened for the first time while offline shows the feedback without highlights and a link to open the PDF in the browser.
- **Older saved feedback** (before Phase 1A) opens in the studio with a note that it has no passage references, next to the work, in its original layout.
- **Accessibility:** native modal dialog (Escape closes, focus returns to the button that opened it), tabs and cards are real buttons with `aria-expanded`, selections are announced in a live region, visible focus rings, reduced-motion respected, highlight colours also differ in underline/outline (not colour alone).
- **Unchanged:** grades, final scoring, the 72-hour revision window, Office Hours histories and stored submissions. The studio only reads them (verified: saved data identical before and after).
- Cache `sovereign-v3-25`.

## Unreleased · Evidence-based reviews (build 24, Worker v14, not committed): Phase 1A
- **The reviewer now receives the assignment's real context:** steps, supplied materials, module key ideas and reading titles (titles only; the text of a reading is never sent and the reviewer is told not to say what a reading contains). Nothing extra is sent automatically.
- **Findings are typed and evidence-linked:** working well, verified error, missing required element, partly supported, clarity, optional, could not verify. Correct work comes first. Clarity and optional points never cost points.
- **Checked in code, not trusted:** for typed or text-file work a quoted passage must exist in the work, otherwise a claimed error becomes "could not verify"; a "missing" element that is in fact present becomes a clarity note; locations are shown only when verified; examples not drawn from the supplied materials are labelled as illustrations; a deduction is kept only when a verified error, missing or partial finding on that criterion backs it, otherwise full credit with a note.
- **Transparency about what could be read:** a "What the reviewer could see" panel (text, PDF, image, Excel) and a review-limitation banner. A criterion that could not be assessed is left out (not scored low), the score is labelled provisional, and the learner is told to resubmit in a supported format. If nothing could be assessed the Worker answers 422 and nothing is graded or saved.
- **Round 2:** uses the earlier findings; the first version is sent again only if the learner ticks "Also send my first version". The panel says whether versions were actually compared.
- **Office Hours has two modes:** practise this assignment (its real instructions, materials and criteria as a guide, ungraded) or explore with your own material. Older sessions open as "own material".
- **Nothing is lost:** older feedback, grades, submissions and Office Hours sessions are unchanged and display as before. An older Worker (below v14) still works; its reviews carry a banner saying they used the older method.
- **Post-evaluation fixes (still build 24, Worker v14 file changed, needs redeploy to the test Worker):** a real test found the same findings scored differently and a possible leniency. Now: score bands enforced in code (met = full, partly 40-80%, not-met 0-25%, so status and score always agree); prompt rules that an element with no attempt at all is "missing" (never partial or clarity) and that a stated length or required component the work lacks counts against its criterion; no "readings not read" note unless the work or assignment uses a reading; and when a deduction is overridden for lack of a verified finding, the learner now sees "Adjusted: ..." beside that criterion.
- Needs a v14 Worker deployed (test Worker first). Cache `sovereign-v3-24`. No paid test has been run for this build.

## Unreleased · Linked readings only (build 23, not committed)
- **Every reading taken from a syllabus must have an online link.** A reading the syllabus lists but that has no link is left out completely: not listed, not ticked, not added. The review panel says how many were left out. If none has a link, it says so and lists nothing. Adoption also refuses a reading without a link. This is enforced in the app, so it works with the Worker you already have deployed (v12 or v13). Readings you add yourself are unaffected.
- Course creation already searches for syllabi per module and saves them; that is unchanged.
- **Data & Backup shows "Readings without a link"** when earlier versions left citation-only syllabus readings in your courses: it lists them and has one button to remove them after a confirmation. Your own readings and "Source needed" placeholders are never included, and nothing is removed automatically. Also removed a line there that suggested clearing site data.

## Released (build 22) · Check content (build 22, Worker v13, not committed)
- **"Check content"** shows whether the page behind a reading's link actually holds that reading. Two buttons: on the review list of a syllabus read (before adopting) and next to "Find materials with AI" on a module's readings. Up to 5 readings per press, unchecked first.
- **Labels:** Content matched, About the work not the work (abstract, listing or review), Doesn't match (the reading is unticked in the review list; tick again to override), Couldn't check content (paywall, login, PDF, no readable text, or the code check and the AI disagreed; nothing is claimed). Stored on the reading, shown with the date.
- **How it works (Worker `/check-content`):** the Worker opens each public page itself (same address safety rules as the link check), strips it to text, and checks in code that the title's words and the author's surname appear. A light model then reads the first ~4,500 characters and says what kind of page it is. "Matched" needs both to agree. PDFs are not read. Only titles, authors and links are sent.
- **Real test (test Worker v13):** 5 of 5 correct on five real links (full text matched, repository record as about, bot wall as could not check, wrong page as mismatch, dead link as could not check); cost $0.006. See TESTING.md.
- Needs Worker v13 (the app shows the usual "update needed" message otherwise). The rest of the app still needs only v9. The "Update assignments to use these readings?" step is unchanged.

## Released (build 21) · Visual refresh and course Home (build 21, not committed)
- **Palette as tokens** (`css/refresh.css`, loaded last, and recoloured values in the other sheets): midnight navy `#101b32`, deep pine `#073e35`, electric indigo `#2643d8`, cool ivory `#f5f6f7`, steel `#6687a1`, oxblood `#681632`. Cream and burgundy are gone from the base; module colours updated (`S.COLORS`).
- **Course designs recoloured, not redesigned:** Modernist navy + indigo, Editorial oxblood, Intellectual indigo tint, Institution pine. Typography and composition are unchanged.
- **Shell:** navy sidebar and top bar, wider workspace (up to 90 rem), buttons in indigo with a darker hover, surfaces instead of rule lines, larger body text (17 px) and darker secondary text, white panes for the Workbench with the work pane marked.
- **Course Home** is a landing page: a "Your next assignments" panel (current and next, no duplicates, no invented dates, link to all assignments), progress, Announcements and Syllabus preview in a side column, Modules below. The Grades section and the full assignment list are removed from Home only; the Grades and Assignments pages are unchanged.
- **Reading Room:** resources in the main column, key ideas, syllabi and the self-check in a study column beside it on wide screens. Course menu becomes a vertical sticky menu on wide screens.
- **Workbench: Steps is its own tab**, order Brief, Materials, Steps, Rubric (seven-way switcher on phones). Overview, readings and "What to submit" stay in the Brief.
- **Feedback criterion names no longer cut off.** The Worker clamped a criterion name at 120 characters (`worker.js` review, and `store.js`), while assignment criteria run to 200, so a long criterion showed as a half sentence. The app now shows the full rubric wording when a saved name is a cut-off start of it, and keeps 200 characters going forward. Saved feedback is not rewritten. Worker `VERSION` 10 raises the clamp to 200 (needs redeploy; the app still only requires v9, so nothing breaks before you deploy).
- **Track B: syllabus sourcing, repaired and reviewed (build 21; Worker `VERSION` 11, needs a redeploy for these features).**
  - **Worker (`worker.js`):** a failed page fetch is no longer counted as an opened page. A syllabus that could not be opened returns stage `not-accessible` with the reason, and whatever the model found by searching alone is discarded. Every result carries a stage: `not-accessible`, `no-readings`, `readings-found`, `verified` (at least one link opened and its title matched), `manual-review`. Each reading carries its own status: link checked, link not confirmed, listed in the syllabus, check manually. A PDF the AI read itself yields citations marked "check manually" because their text cannot be confirmed in code. New: syllabus text can be sent instead of a link (`text`, up to 30,000 characters); the model is told it is data, and a citation is kept only if its words appear in that text. New `/revise` endpoint writes PROPOSED new wording for up to three assignments around newly added readings. It cannot change title, kind, points, criteria or format, never quotes or describes a reading beyond what is written about it, keeps AI scenarios labelled fictional and writes no scenario or sources for real-evidence assignments.
  - **App:** "Read this syllabus" (new `js/syllabus.js`) shows the stage and every candidate reading with its status; nothing is added until it is ticked (only readings listed in the text or with a checked link start ticked). "Paste a syllabus instead" asks for consent before sending, is not stored, and creates a syllabus entry with no link. After adding readings, an optional step lets you pick up to three assignments and ask for proposed revisions, shown before and after. Applying is per assignment; assignments with submitted work or marked complete start unticked. Only wording changes (overview, steps, and supplied material for Apply and Demonstrate). Points, criteria, submissions, scores and history are untouched, the earlier wording is kept (new optional field `revisions`, up to five) and "Restore the earlier wording" appears in the assignment Brief.
  - **Worker v12 (after the first real test):** a reading with a link whose title is not found in the syllabus text is labelled "Not found in the syllabus text" and starts unticked, and results carry a content-free `diag` (page opens, errors, text size) for auditing. Mock-tested only.
  - The app asks for Worker 11 only when you use these features (a message says to update); building courses still works on version 9 or later.
- Build 21, cache `sovereign-v3-21`. No data-format or AI change.

## Unreleased · Phase 2: Academic Experience (build 20, not committed)
- **Syllabus as a course sheet** (`js/academic.js`): description as a standfirst, a facts strip (length, modules, assignments, points, final deliverable), outcomes, a **Course map** (each module with its Learn / Apply / Demonstrate counts, points and due dates, linking into the studio rooms), **How you are assessed** (points by stage, the weighted-rubric, 72-hour and late-work rules), final project, syllabus notes. The AI usage block and Delete course are folded away at the bottom. "Edit course details" is unchanged.
- **Grades as a transcript:** Current Grade with letter, a bar per stage, a bar per module group, a status for every assignment (AI-graded, Feedback ready with the latest date its first review becomes the grade, Self-scored, Attached as evidence, Not graded), links to the workbench, and a notice listing assignments with feedback but no grade yet. Manual points and score entry is kept; AI-graded rows stay read-only. On phones the table becomes cards; on wide screens it stays a real table.
- **Portfolio as an exhibition:** themed cover, numbered plates with "What it shows", module, date, AI-reviewed label, grade, an excerpt and the full work and feedback on request; the **course capstone** (description, reflection, link) in its own section; a compact graded record; credentials as before. New **Print or save as PDF** button with a print layout.
- New `css/academic.css` (shared components, four design treatments, print rules). New helpers `S.fileLine` and `S.finalFeedbackOnly` exported from `views-work.js`. Build 20, cache `sovereign-v3-20`. No data-format, Worker or AI change.

## Released (build 19, `d858ce0`) · Phase 1A 
- **Module Studio.** A module is now four rooms at `#/course/<id>/modules/<moduleId>/<learn|apply|demonstrate|wrap>`: Reading Room (resource cards, key ideas, syllabi, self-check, study tasks), Case Lab (case-file cards with status), Portfolio Studio (project cards with deliverable, skills, Portfolio link), Wrap-up (reflection, custom sections, complete). Stage rail with counts, Next Up bar, keyboard arrows between stages. With no stage in the link, it opens where the work is.
- Assignments with no kind appear under Apply as "Practice". New optional **Stage** selector on manual assignments (AI-written assignments keep theirs). Nothing is reclassified or rewritten.
- Four design treatments of the module opening, rail, and cards in `css/studio.css`.
- Files: new `js/studio.js`, `css/studio.css`; edited `js/views-course.js` (old `pageModule` removed, helpers exported as `S.vc`, Stage selector), `js/app.js` (fifth route segment), `index.html`, `sw.js` (cache `sovereign-v3-18`), `js/store.js` (`BUILD` 18). No data-format or Worker change.

## Released (build 19, `d858ce0`) · Phase 1B 
- **Assignment Workbench.** One assignment is now a full-width two-pane workspace at `#/course/<id>/assignments/<assignmentId>[/<tab>]`. Left: Brief, Materials, Rubric. Right: Submission, Feedback, Office hours. On phones a six-way switcher shows one pane at a time. Tabs are links, so Back, Forward, deep links and reload work.
- Older or hand-made assignments show an honest "A short entry" notice listing only what is missing, with "Add details yourself" (opens the existing edit form). Nothing is invented. Assignments without points can be marked completed manually.
- Typed drafts are kept in this browser (`sovereign.drafts.v1`; text only, never consent or files, cleared on submit) so a reload or tab switch can't lose them.
- Submission logic is unchanged: the old single panel is split into `S.workParts` (submit and feedback) with the same review, 72-hour resubmit, finalize, attach, consent and Portfolio behaviour.
- Files: new `js/workbench.js`, `css/workbench.css`; edited `js/views-work.js`, `js/views-course.js` (old `pageAssignment` removed), `index.html`, `sw.js`. No data-format or Worker change.

## Released (build 19, `d858ce0`) · Phase 1C 
- **Navigation refinement** (`css/nav.css`, `S.icon` in `js/components.js`): small line icons, muted inactive text, soft filled active row, taller rows, in both the sidebar and the course menu.
- **Courses in the sidebar** with a small mark per design (square, ring, circle, diamond); the current course is marked and the sidebar takes its accent. The Dashboard link no longer stays highlighted inside a course.
- **Contextual controls:** Edit, move and Remove on resource, case and project cards appear on hover or keyboard focus; always visible on touch.
- Tablet switcher on the workbench; My Work cards no longer overflow phones by 4 px.
- Dropped from the file-type label: "get AI feedback". The upload label now lists the accepted types (TXT, MD, CSV, PDF, PNG, JPG, WEBP, GIF, XLSX).
- Files: new `css/nav.css`; edited `js/app.js`, `js/components.js`, `js/views-course.js`, `index.html`, `sw.js`.

## Released (build 19, `d858ce0`) · Phase 1 audit fixes 
- A course whose assignment pages failed to generate is now saved as "partial" with a note, a toast and a banner, instead of "complete" (`js/ai-client.js`, `js/views-ai.js`).
- AI-written materials carry a caption saying the people and sources in them are fictional; the incomplete notice for AI assignments says the full page didn't finish (`js/workbench.js`).
- Learn study tasks regain their reorder buttons (`js/studio.js`).

## Released (build 19, `d858ce0`) · Phase 1 content-integrity fixes 
- **Fictional labelling enforced in code.** The Worker (`worker.js` `/details`) puts a fixed "FICTIONAL: written by AI for this exercise…" line first on every AI-written scenario or material unless the model already opened with "fictional/hypothetical". The app repeats the check (`S.labelFiction`) and the Materials tab shows a Fictional note. Old courses are not rewritten.
- **Real-evidence assignments.** The outline can mark an apply or demonstrate assignment `realEvidence` when its objective needs authentic real-world material. For those, the Worker writes no scenario and no materials (enforced in code). The app lists only module readings whose link responded and whose page title matched (`S.setEvidence`); if there are none, the assignment shows "Source needed" and nothing is invented. Learn assignments never get materials. New optional fields `realEvidence` and `evidence` (older backups load unchanged).
- **File pre-check.** `S.files.check` runs when a file is chosen: unsupported types (DOCX, HEIC, etc.), PDFs over 2 MB, Excel over 5 MB and text files on file-only assignments show the reason and disable "Get AI feedback"; "Attach without AI feedback" stays available. The same check runs again at submit. Excel notes that only cell values are read.
- Worker `VERSION` 8, app `NEEDS_VERSION` 8 (**the production Worker must be updated to v8 with the release, or course building will report "outdated"**), build 19, cache `sovereign-v3-19`.

## Released (build 19, `d858ce0`) · Phase 1 real-test quality fixes 
- **Reading titles.** When a search result's page title is a number, file name, shouting capitals or contains "*" (for example "2024"), the model's own title is shown instead; the link check still uses the page's real title (`weakTitle` in `worker.js`).
- **Modules with no readings.** Course building makes a third and last search with different words. If it still finds nothing, the Learn assignment is told so (`readingsMissing`), is based on the module's key ideas, says plainly that readings still need adding, and no longer asks the learner to find their own sources.
- **Demonstrate assignments supply their own reference material** (a fictional case file, data or brief, labelled FICTIONAL) unless marked real evidence, in which case the real-evidence rules apply. Older AI-written Demonstrate pages without material show it as a gap in the workbench notice.
- Worker `VERSION` 9, app `NEEDS_VERSION` 9.

## Phase 0
- Added `ROADMAP.md`, `CHANGELOG.md`, `TESTING.md`, `docs/PHASE-0-AUDIT.md`. No application code changed.

## Build 17 · `7e66e88` · Four course designs
- Course design templates: The Modernist, The Editorial, The Intellectual, The Institution. Saved per course as `designTheme`, assigned at random on creation, switchable from "Customize appearance".
- Self-hosted fonts (SIL OFL): Inter Tight, Playfair Display, Instrument Serif, Cinzel, Cormorant Garamond. Added to the service-worker cache.
- Covers, course headers, module tiles, major headings and the Portfolio cover follow the course's design.

## Build 16 · `3ca093f` · Visual redesign
- Swiss-modernist / editorial identity: `css/design.css`. Course covers, masthead, stats, assignment page grid, rubric bars, Portfolio plates.
- Learn / Apply / Demonstrate markers (circle, square, triangle plus a word).

## Build 15 · `2a427cc`
- Assignment kinds drive the pedagogy: Learn uses readings, Apply uses a fictional scenario, Demonstrate is a portfolio-grade artifact. Finished Demonstrate work is saved to the course Portfolio. Worker `VERSION` 7.

## `7e43a14`
- Readings vs scenario assignments, file-only formats with Excel reading, ungraded office hours.

## `585dce2`
- Service worker revalidates files; build number shown on Data & Backup.

## `94e3b7e`, `fd5085e`, `6ec76ef`
- Full assignment pages written per module by the Worker (`/details`): overviews, steps, format line, weighted criteria. Worker version check. Per-course Portfolio moved into each course menu.

## `17ae388` · Round B
- Submissions (text or file) with per-submission consent, AI feedback and grading, the 72-hour revision window, locked due dates for AI courses, local file storage (IndexedDB).

## `9aef5db`, `fc01c6a`, `e406114`
- Syllabi section with on-demand sourcing; Wikipedia and shadow libraries blocked; readings derived from syllabi; higher-ed resource priority; credentials and milestones.

## `6f32083`
- First version of Sovereign with the optional "Build with AI" feature (Cloudflare Worker).

## Earlier (2026-11-18)
- `984ddf4` Initial commit; `a5d57a7` uploaded the first static app.
