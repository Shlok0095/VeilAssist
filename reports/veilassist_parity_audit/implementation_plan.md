# Implementation Plan — Overlap Gaps Only

## Principles

- Follow existing architecture (`answerPlanner` → `contextRouter` → ask suffix → `ResponsePanel`).
- No changes to `E:\RCA\veilassist2`.
- No Meeting/General feature ports from/to IM.
- Prefer small, test-backed diffs.

---

## Completed this audit

| Step | Change | Files | Validation |
|------|--------|-------|------------|
| 1 | Behavioral / definition boundary | `lib/answerPlanner.js` | `test-question-detector`, `test-ask-context-priority` |
| 2 | Personal-info cue veto | `lib/contextRouter.js` | `test-question-detector` |
| 3 | CV PDF 10MB + error copy | `main/index.js` | `profile_upload_edge_cases.cjs` |
| 4 | Resume upload hint | `InterviewResumesSection.jsx` | static |
| 5 | Font≠length test expectations | `test-general-answer-settings-wiring.cjs` | ×5 green |
| 6 | Audit harness | `reports/veilassist_parity_audit/test_scripts/*` | 60/60 |

---

## Remaining (optional follow-ups)

| Priority | Item | Approach |
|----------|------|----------|
| P1 | Live UI screenshot pack | Temporarily disable stealth; capture paired PNGs listed in `screenshots/README.md` |
| P2 | Live CV upload matrix in both GUIs | Use fixtures in `%TEMP%\veilassist_parity_fixtures`; record pass/fail in `test_results/` |
| P3 | PDF-only picker for Interview resumes (product decision) | If desired, narrow dialog filter to `pdf` only while keeping txt/md parse path for advanced users |
| P4 | Detection sensitivity settings UI | Only if product wants IM Advanced parity; store already supports keys |

---

## Regression pack to re-run after any further edit

```bash
node reports/veilassist_parity_audit/test_scripts/compare_im_overlap_constants.cjs
node reports/veilassist_parity_audit/test_scripts/profile_upload_edge_cases.cjs
set PARITY_ITERATIONS=5
node reports/veilassist_parity_audit/test_scripts/run_parity_suite.cjs
```

---

## Out of scope forever for this audit track

- Adding IM features we do not already have.
- Removing Meeting/General docs to mimic IM.
- Rewriting overlay to Flutter.
