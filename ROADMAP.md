# Sovereign 2.0 roadmap

Vision: an internationally respected independent university with the art direction of a cultural magazine, delivered as a sophisticated, interactive learning application.

**Status key:** ✅ done · 🟡 proposed, awaiting approval · ⬜ not started · ⛔ blocked

**Working rules (from the product owner)**
- One polished experience at a time. A phase starts only after the previous one is reviewed.
- Nothing is committed, pushed or deployed without explicit approval. `main` is the stable production branch.
- Learn → Apply → Demonstrate stays the educational framework. The AI Worker's assignment-generation rules are not changed in visual phases.
- No new frameworks. Browser storage, optional AI backend and PWA/offline behaviour are preserved. No secrets in code.
- Every phase ends with the same implementation summary: what changed, files modified, what was tested (labelled mock / code inspection / browser / real API), what passed, what could not be tested, bugs and limits, and a recommendation.

## Stable baseline

| | |
|---|---|
| Production | `main` at commit `7e66e88`, app build 17, Worker `VERSION` 7 |
| Local frozen copy | `Documents-Sovereign-STABLE-build17` (next to the working folder) |
| Rule | Phase work happens in the working folder and a local `phase-1` branch. `main` only changes on approval. |

## Phases

| # | Phase | Status | Depends on |
|---|---|---|---|
| 0 | Audit, preservation, plan | ✅ complete, awaiting review (`docs/PHASE-0-AUDIT.md`) | none |
| 1 | **Learning Studio**: Module and Assignment redesign | ✅ released: build 19, `d858ce0`, Worker v9 | 0 approved |
| 2 | **Academic Experience**: Syllabus, Grades, Portfolio redesign | ✅ released (build 20 to 23) | 1 released |
| 2b | **Visual refresh and Home** (Track A): palette tokens, navy shell, Up Next Home, Reading Room columns | ✅ released (build 21) | 2 built |
| 2d | **Check content** (does a reading's page hold the reading?) | ✅ released (build 22, Worker v13), one real test (5 of 5, $0.006) | none |
| 2c | **Syllabus reliability** (Track B): audit, stages, paste, review screen, assignment revisions | ✅ released (builds 21 to 23), real tests R1 to R5 | none |
| S1 | **Review accuracy and Office Hours reliability** (1A context + evidence schema + modes; 1B eval + capped real test; 1C Review Studio) | 🟡 1A + 1B done (Worker v14, real-AI evaluated, $0.4953); 1C Review Studio complete (build 25, approved, not yet released). Limitations: see TESTING.md | Worker v14 |
| S2 | **Evidence packets** (spec: docs/PHASE2-SPEC.md). 2A Evidence Architect: tables, documents, timelines, charts, CSV, automatic generation in course build, upgrade with preview | 🟡 2A built (build 26, Worker v15), mock-tested, awaiting your review and the design checkpoint. 2B workspace/design, 2C evidence-aware review, 2D learner import not started | S1; Worker v15 |
| G1 | **Global UX: auto-hiding overlay navigation** (edge trigger, hover or keyboard opens a floating sidebar that never reflows the page, pin preference kept locally, touch menu button; review `.content` max-width and workbench widths). Separate from Phase 2, tested on its own | ✅ built and approved by you (build 27, incl. full-width workbench, 55/45 split, Expand table); unreleased | none |
| S3 | **Standalone course capstone** (generation, workbench, Portfolio link; grade policy approved first) | 🟡 decisions approved (docs/PHASE3-SPEC.md); 3-1 model + grade maths, 3-2 generation (Worker v18) and 3-3 screens (create/preview/finish, workbench reuse) built, mock-tested, unreleased; 3-5 Grades and Portfolio displays built and mock-tested, unreleased; remaining for Phase 3: one capped real-AI test (Worker v18 deployed first) and release | S1; Worker v18 |
| S4 | **Designed PDFs**: Syllabus, Portfolio, Feedback Report on one engine; rename "Course Sheet" to "Syllabus" | ✅ released (build 32, `e0f43b3`, live). Still open: your real-data check on a separate copy (docs/PHASE4-REALDATA-TEST.md) | S3 |
| S5 | **Dashboard Learning Progress** replaces Module Library (docs/PHASE5-PROPOSAL.md) | 🟡 built (build 33), 24 tests pass with fictional data; unreleased, awaiting your review | S3 |
| 3 | **Discover**: search, library, collections, Save to Course | ⬜ | 1 (resource cards), and the resource model below |
| 4 | **Study Notebook and Reading Assistant** | ⬜ | 3 (library and resource model), a Worker text-retrieval design |
| 5 | **Knowledge Checks and Adaptive Practice** | ⬜ | 1 (stage UI), Worker changes (needs approval) |
| 6 | **Integration and Polish** | ⬜ | all |

### Recommended order changes
1. **Resource model before Discover.** Today a "resource" is a reading embedded in a module (`readings[]` with title, url, note, done and the AI's source labels). Discover, collections, Save to Course and the Reading Assistant all need one shared resource record. Phase 3 should begin by adding an additive `library[]` and `collections[]` to the saved data, with module readings keeping their embedded copy plus an optional `libraryId`. No existing record changes shape.
2. **Phase 5 needs Worker changes** (question generation, adaptive recommendations). It stays after Phase 4 and requires its own approval, because it changes AI behaviour and cost.
3. **Phase 2 is small** once Phase 1's components exist. It may be merged into a short second pass if you prefer.

## Phase 1: Learning Studio (proposed)

See `docs/PHASE-0-AUDIT.md` for architecture, reuse, risks and acceptance criteria.

Scope in one line: a Module page with Learn / Apply / Demonstrate stages and a next-activity bar, and an Assignment page as a two-pane workbench (reference left, work right) with tabs; refined navigation; theme-aware module openings. **No schema change. No Worker change. No AI feature added.**

## Phase 3: Discover (preliminary notes, to be confirmed in that phase's plan)
- Searching real sources without AI: OpenAlex (scholarly works), Crossref (DOIs), Open Library (books and covers), Internet Archive and Wikimedia Commons (open media). All have public APIs. They would be called through the existing Worker (keeps keys private, adds caching and rate limits).
- Thumbnails: only real ones (a cover image or the page's own Open Graph image, fetched by the Worker with the existing SSRF-safe fetcher). Otherwise a typographic preview built from the real title, author and source. Never a generated image.
- Search "saved in Sovereign" runs entirely in the browser over `library[]` and module readings.
- Keyboard-navigable grid with stable card dimensions (no layout shift); filters by type.

## Phase 4: Study Notebook and Reading Assistant (preliminary notes)
Architecture to evaluate in that phase's own plan:
1. **Separate a source URL from its retrieved text.** A resource has `url` (a pointer) and, only if retrieval succeeds, a stored `text` snapshot with `retrievedAt`, `contentHash`, and an `access` status (`open`, `paywalled`, `blocked`, `pdf-unreadable`, `not-attempted`).
2. **Ingestion** in the Worker: fetch with the existing SSRF guard, honour robots and paywalls (do not circumvent), extract text (HTML readability, PDF text layer). User-supplied PDFs and pasted text are processed only with per-use consent.
3. **Passages:** chunk text into stable passages with ids and character offsets.
4. **Retrieval:** start lexical (BM25) per question over only the module's retrieved passages. No vector database needed at this scale.
5. **Grounded answering:** the model sees only retrieved passages and must cite passage ids. The Worker verifies every citation (the passage exists, any quoted words appear in it) and drops anything it cannot verify.
6. **Citations stored** as `{ resourceId, passageId, quote, retrievedAt }` and linked to the stored passage. Links open the source URL, with a text fragment where the source supports it.
7. **Disclosure:** the answer states which sources were read and which could not be (blocked, paywalled, unreadable). It never implies reading material that was not retrieved.
8. **Copyright and privacy:** short excerpts only in answers; no bulk storage of third-party works beyond the user's own device; nothing uploaded without consent.

## Phase 5 and 6
Defined in their own plans when reached.

## Deferred or rejected (so far)
- Four different functional interfaces per theme: rejected. Themes stay presentational.
- Animation beyond short state transitions, shadows, glass effects: not planned.
- Gamification (streaks, points): not planned.

### Track A and B follow-up (after 2C, not released)
Review Studio wider resizable feedback, legacy local quote matching, and non-duplicated Materials with an approval gate are built and mock-tested; they ship in the next build once approved. Real-AI confirmation of the tightened Worker `materials` rule is still pending a Worker redeploy.

### 2D progress
2D-1 (import engine), 2D-2 (storage, versions, Your data screens), 2D-3 (authorization, Worker v17, mock-tested) and 2D-4 (cited rows and per-review versions in Review Studio) are built; 2D-5 (one capped real-AI test, needs Worker v17 deployed) done: one real review passed ($0.0436). Remaining phases after 2D follow the approved spec. Not released.
