# Gap Analysis — Overlapping Features Only

**Inputs:** `repository_analysis.md`, `functional_mapping.md`, `test_results/parity_suite_latest.*`  
**Rule:** Gaps only where both products already have corresponding functionality.

---

## Summary

| Severity | Count | Notes |
|----------|-------|-------|
| High | 0 open | Behavioral misroute + font-coupling test drift **fixed this pass** |
| Medium | 1 residual | Live dual-app UI pixel compare blocked by stealth capture exclusion |
| Low | 2 residual | TXT/MD still accepted for CV (IM PDF-only); settings detection UI not surfaced |

---

## Profile management

| ID | Finding | IM | Ours (before → after) | Severity | Correction |
|----|---------|----|------------------------|----------|------------|
| G-P1 | CV PDF size | 10MB | 12MB → **10MB** | Low | **Fixed** in `main/index.js`; error copy includes “PDF only, max 10MB” |
| G-P2 | CV formats | PDF only | pdf/txt/md kept | Low | Keep broader formats; UI hint now says PDF preferred / 10MB. Do **not** remove txt/md (ours-only convenience, not IM exclusive feature port) |
| G-P3 | Behavioral asks as `general_assistant` | Behavioral + personal | Misroute for “describe a time…”, “how do you handle…” | High | **Fixed** — expanded `BEHAVIORAL_RE` / cues; narrowed `DEFINITIONAL_RE` |
| G-P4 | Personal-info false-negative | Cue keeps personal block | Could leave `useResume=false` on personal asks | High | **Fixed** — `applyPersonalInfoSignal` personalCue veto restores resume |
| G-P5 | Dual legacy paste + library | Single library model | Dual path remains | Low | Documented; no architecture rewrite |

---

## Document uploading (shared = profile CV)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| G-D1 | Size/format messaging vs IM | Low | **Fixed** size; Partial format (intentional) |
| G-D2 | Meeting/General file libs | — | **Out of scope** (ours-only; no IM equivalent to align to) |
| G-D3 | Live upload iterations in both GUIs | Medium | **Blocked** this pass — stealth windows excluded from capture; fixtures created under `%TEMP%\veilassist_parity_fixtures` |

---

## Conversational memory

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| G-M1 | Duration / ×15 / answered_q clamp | — | **Aligned** (60/60 suite incl. memory-window) |
| G-M2 | `<answered_questions>` shape | — | **Aligned** |

---

## Answer generation + panel

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| G-A1 | Answer Length coupled to font in tests | High (regression risk) | **Fixed** — wiring tests now assert **decoupling** (IM) |
| G-A2 | Coding contract / no STAR on code | — | **Aligned** (`coding-answer-parity` ×5) |
| G-A3 | Streaming markdown panel | — | **Aligned** intent (`stream-answer-display`, `im-answer-ui-parity`) |
| G-A4 | Pixel/layout compare of helper bubble | Medium | **Blocked** by `WDA_EXCLUDEFROMCAPTURE` |

---

## Screen readability / UI-UX

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| G-U1 | Cannot screenshot stealth overlays | Medium | Documented in `screenshots/README.md`; manual opt-out path |
| G-U2 | Question detection settings UI | Low | Store+overlay wired; Settings panel retired with auto-answer — intentional product choice |

---

## Backend / frontend implementation gaps (overlap only)

| Area | Gap | Action |
|------|-----|--------|
| `lib/answerPlanner.js` | Behavioral regex too narrow vs DEFINITIONAL `describe`/`how do` | **Done** |
| `lib/contextRouter.js` | Personal cue veto incomplete for `general_assistant` | **Done** |
| `main/index.js` | 12MB vs IM 10MB | **Done** |
| `InterviewResumesSection.jsx` | Upload hint weak vs IM “PDF only, max 10MB” | **Done** (preferred wording) |
| Settings tests | Still expected length→font coupling | **Done** (assertions inverted to IM) |

---

## Explicit non-gaps (do not “fix” by adding IM-only or removing ours-only)

1. Meeting/General document libraries (ours).
2. Flutter-only chrome / stock IM shortcut table (separate IM-PARITY track).
3. Expecting identical LLM wording across apps.
