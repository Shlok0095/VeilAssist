# Test Execution Report

**Date:** 2026-11-19  
**Harness:** `test_scripts/run_parity_suite.cjs` (5 iterations/scenario)  
**Also:** `compare_im_overlap_constants.cjs`, `profile_upload_edge_cases.cjs`

---

## 1. Automated overlap suite

**Artifact:** `test_results/parity_suite_latest.json` / `.md`

| Scenario | Area | Pass | Fail |
|----------|------|------|------|
| memory-window | conversational_memory | 5 | 0 |
| autoanswer-transcript | conversational_memory | 5 | 0 |
| question-detector | conversational_memory | 5 | 0 |
| resume-upload | profile_documents | 5 | 0 |
| resume-jd-routing | profile_documents | 5 | 0 |
| ask-context-priority | answer_generation | 5 | 0 |
| coding-answer-parity | answer_generation | 5 | 0 |
| im-answer-ui-parity | answer_panel | 5 | 0 |
| stream-answer-display | answer_panel | 5 | 0 |
| general-answer-settings | answer_generation | 5 | 0 |
| desktop-interview-wiring | answer_generation | 5 | 0 |
| interview-mode-alignment | conversation | 5 | 0 |

**Totals:** 60 / 60 pass (`allGreen: true`) after gap fixes.

### Pre-fix baseline (same harness)

| Pass | Fail | Notes |
|------|------|-------|
| 45 | 15 | Failures clustered in `question-detector`, `general-answer-settings`, `interview-mode-alignment` (font-coupling expectations + behavioral misroute) |

---

## 2. Constant / formula checks vs IM

**Artifact:** `test_results/overlap_constants_latest.json` — **9/9 pass**

- Memory choices `[30,60,120,180]`
- Answered-question limit `clamp(s/15,3,12)`
- Transcript tail `seconds*15`
- Personal-info gate samples
- IM `main.dart.js` markers present
- CV PDF **10MB**

---

## 3. Profile upload edge cases (module)

**Artifact:** `test_results/profile_upload_edge_cases_latest.json` — **5/5 pass**

Fixtures written for later GUI runs: `%TEMP%\veilassist_parity_fixtures`  
(`sample_resume.txt`, `corrupt.pdf`, `resume.exe`) — path recorded in `test_results/profile_fixtures.json`.

---

## 4. Scenario coverage vs requested matrix

| Requested | Automated evidence | Live dual-app GUI |
|-----------|--------------------|-------------------|
| Profile create/select/switch/persist | resume-upload, e2e groups inside interview-mode-alignment | Partial — apps launched; stealth blocks capture |
| Document upload variants | size/format guards + fixtures | **Not executed in GUI this pass** (blocker) |
| Memory retention / follow-ups | memory-window, autoanswer-transcript, detector | Module-level only |
| General / coding / definition prompts ×5 | ask-context, coding-answer, detector | Module-level; wording not compared |
| Answer panel streaming/format | stream-answer-display, im-answer-ui-parity | Pixel compare blocked |
| Profile isolation across switch | covered in e2e profile groups | GUI not pixel-verified |

---

## 5. InterviewMan reference tests

Reference repo exposes `parity:e2e`, `parity:smoke`, etc. **Not executed in this pass** (would require its local API + keys; audit focused on overlap mapping + our regression pack). IM sources were read-only inspected (`main.dart.js`, `IM-PARITY.md`).

---

## 6. Honesty constraints honored

- Failures before fixes were recorded (45/60).
- Untested live GUI upload matrix is marked **not passed**.
- Stealth capture exclusion documented; screenshots folder contains desktop evidence + README blocker, not fabricated overlay PNGs.
