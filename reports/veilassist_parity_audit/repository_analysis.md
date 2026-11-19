# Repository Analysis — VeilAssist2 (InterviewMan) vs ShadowAssist v2

**Date:** 2026-11-19  
**Scope:** Overlapping product surfaces only (profile, document/CV upload, conversational memory, conversation, answer generation/panel, UI/UX).  
**Rule:** Do not inventory or port features that exist only in one product.  
**Status:** Discovery complete. No product code modified for this audit phase.

---

## 1. Reference application — `E:\RCA\veilassist2`

| Item | Detail |
|------|--------|
| Product | VeilAssist / InterviewMan UNO shell around stock Flutter InterviewMan |
| UI | Flutter compiled to `runtime/resources/web/main.dart.js` (byte-identical to `dist/stage/resources/web/main.dart.js`, SHA256 `6BCBBF91…`) |
| Shell | Electron `runtime/resources/app/electron.js` — redirects `api.interviewman.com` / Deepgram to local `127.0.0.1:4175` |
| Profile store | `%APPDATA%/veilassist2/profile.json` (patched hydrate via `scripts/patch-profile-local.mjs`) |
| Docs | `IM-PARITY.md`, `ONBOARDING.md`, `SETTINGS-BYOK.md` |
| Test scripts | `parity:e2e`, `parity:smoke`, `parity:30q`, `parity:aa`, etc. |

### Architecture (overlapping concerns)

```
Flutter UI (main.dart.js)
  ├─ Profile / resumes (A.ni, ckx, PersonalInfo Du)
  ├─ AnswerSettings (A.ka) + font-size route (separate)
  ├─ Transcript + answered_questions (bnL / gaDx / ck2)
  ├─ Detection → answer stream (aQD / d8o)
  └─ Helper bubble markdown (A.YT / gpt_markdown)
Electron
  └─ Local API :4175 (chat, STT, profile, CV parse)
```

### Overlap-relevant surfaces found

1. **Profile / CV** — PDF-only upload (10MB), `/v1/responses` CV parse, multi-resume library, active resume, conditional `My personal information is:` injection.
2. **Context text** — `interviewTopic`, `extraInstructions`, resume `extraContext` (no separate meeting/JD file library in Flutter bundle).
3. **Conversation memory** — `transcriptDurationSeconds` ∈ {30,60,120,180}; transcript tail `seconds×15` chars; answered-question count `clamp(seconds/15, 3, 12)`.
4. **Answer settings** — Structure / Format / Length / detection sensitivity / englishForTechnicalTerms; **font size is a separate route**.
5. **Answer panel** — Streaming helper bubble with live markdown (`gpt_markdown` + JetBrainsMono for code).
6. **Screenshots** — Ctrl+H queue for on-screen questions (coding completeness rules in `agC`/`c6K`).

### Explicit non-overlap (out of scope for alignment *into* our app)

- Stock IM shortcut table / Flutter-only chrome already covered by separate IM-PARITY work.
- Features present only in IM with no ShadowAssist counterpart are **not** candidates to add under this audit.
- Meeting/General **file** document libraries: **absent** in IM Flutter bundle → not an IM target to copy; our exclusive extensions stay ours unless gaps appear in the shared CV path.

---

## 2. Our application — `c:\Users\shlok\Desktop\shadowassist-v2`

| Item | Detail |
|------|--------|
| Product | VeilAssist / ShadowAssist v2 (Electron + React/Vite overlay + settings) |
| Main | `main/index.js` |
| Overlay | `renderer/overlay/App.jsx`, `ResponsePanel.jsx` |
| Settings | `renderer/settings/*` (Profile, General/Answers, modes) |
| Store | `lib/store.js` (electron-store) |
| Tests | Extensive `scripts/test-*.cjs` + e2e scripts; CI via `test:ci` |

### Architecture (overlapping concerns)

```
React Settings + Overlay
  ├─ Resume library (resumeProfile.cjs) + legacy paste path
  ├─ Meeting/General document libraries (modeContext.cjs)  ← ours-only extension
  ├─ Conversation memory (autoAnswerTranscript.cjs)
  ├─ Question detector + personal-info gate
  ├─ Answer contracts (interviewSettingsCatalog / interviewAnswerPrompt)
  └─ ResponsePanel streaming markdown
Main process
  └─ IPC: resume-profile:parse, mode-document:parse, ask/stream, STT
```

### Overlap-relevant surfaces found

1. **Profile / CV** — Library + active resume; parse via `/v1/responses` ParsedCV (+ NVIDIA PDF fallback); personal info gate; accepts `pdf|txt|md` (limit **12MB** on PDF path).
2. **Conversation memory** — Same duration choices and `×15` / `÷15` formulas as IM.
3. **Answer settings** — Structure / Format / Length / custom instructions / language / history; font size decoupled from length.
4. **Answer panel** — Live markdown stream preview (IM `gpt_markdown` parity intent); coding contracts fence-first.
5. **Documents** — Meeting + General libraries (ours-only; not mirrored in IM). Shared “document upload” for parity = **profile CV upload**.

---

## 3. Shared functional domains (audit boundary)

| Domain | IM | Ours | In audit scope? |
|--------|----|------|-----------------|
| Resume/CV upload + library + active select | Yes | Yes | **Yes** |
| Conditional personal-info prompt block | Yes | Yes | **Yes** |
| Conversation Memory (transcript + answered_questions) | Yes | Yes | **Yes** |
| Answer structure / format / length | Yes | Yes | **Yes** |
| Font size independent of answer length | Yes | Yes | **Yes** |
| Streaming answer markdown panel | Yes | Yes | **Yes** |
| Coding / screen answer contracts | Yes (screenshot prompts) | Yes (screen + speech routing) | **Yes** (shared behavior) |
| Meeting/General file document libraries | No | Yes | **No** for IM-parity targets; still test *our* persistence if needed as regression, not as IM gap |
| Flutter-only onboarding chrome | Yes | Different UX | Only where we already have equivalent settings |

---

## 4. Key source anchors

### InterviewMan (`main.dart.js`)

| Concern | Symbols / evidence |
|---------|-------------------|
| PDF only, 10MB | UI string `PDF only, max 10MB` (~184986) |
| Personal info injection | `cxd` ~43916: `e && r!=null && !r.aBm(0)` → `\nMy personal information is: \n` + `bGI()` |
| Conversation Memory UI | ~178816 label + hint; choices `B.caL` [30,60,120,180] |
| Transcript clip | `ck2(text, f*15)` |
| Answered questions | `gaDx` clamp(f/15, 3, 12); `<answered_questions>` |
| Answer settings | `A.ka` / `aTB`; structure `A.mT`, format `A.pN`, length `A.rS` |
| Font size | Separate `font-size` route (`A.a_C`) |
| Markdown panel | `A.aBM` / `YT` + `gpt_markdown` |

### ShadowAssist

| Concern | Files |
|---------|-------|
| Resume library / gate | `lib/resumeProfile.cjs`, `main/index.js` (`resume-profile:parse`) |
| Memory window | `lib/autoAnswerTranscript.cjs` |
| Detector / ledger | `lib/questionDetector.cjs`, overlay `App.jsx` |
| Answer contracts | `lib/interviewSettingsCatalog.cjs`, `lib/interviewAnswerPrompt.cjs`, `lib/answerPlanner.js` |
| Settings UI | `renderer/settings/DisplaySettingsPanel.jsx`, `InterviewResumesSection.jsx` |
| Answer panel | `renderer/overlay/components/ResponsePanel.jsx` |

---

## 5. Discovery conclusions

1. Both products already share the same **interview copilot** core: profile CV, memory window, answer settings, streaming helper answers.
2. The largest *shared* risks historically were **mis-mapped settings** (Answer Length ≠ Font Size; Response Format ≠ Takeaway panel) and **wrong answer contracts** on coding/definitions — already partially addressed in prior work; this audit re-validates them.
3. Document upload parity for this audit means **profile CV workflow**, not Meeting/General libraries.
4. Next artifact: `functional_mapping.md` (row-level behavior map). Then automated multi-iteration tests before any further product edits.
