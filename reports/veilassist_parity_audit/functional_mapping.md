# Functional Mapping — Overlapping Features Only

**Prerequisite:** `repository_analysis.md`  
**Method:** Static inspection of IM `main.dart.js` + ShadowAssist sources; prior test inventory cross-check. Live UI iterations documented separately in `test_execution_report.md`.

Legend: **Aligned** / **Partial** / **Gap** / **Ours-only (excluded from IM port)** / **Untested**

---

## 1. Profile management

| Capability | InterviewMan (VeilAssist2) | ShadowAssist v2 | Status |
|------------|----------------------------|-----------------|--------|
| Create profile from CV upload | PDF picker → `/v1/responses` ParsedCV → `PersonalInfo` (`Du`) | File picker → `resume-profile:parse` → ParsedCV / fallbacks → `resumeLibrary` entry | **Partial** — formats & size differ |
| Accepted formats | **PDF only** (UI: “PDF only, max 10MB”) | **pdf, txt, md** (hint: PDF preferred) | **Partial (Low)** — broader by design; hint updated |
| Max upload size | **10MB** | **10MB** (aligned) | **Aligned** |
| Multi-resume library | `resumes[]` + `activeResumeId`; picker when ≥2 | `resumeLibrary` max 20 + `activeResumeId` | **Aligned** |
| Select / switch active resume | `ckx(resumeId)` | Settings select + store | **Aligned** |
| Edit / update fields | Personal info UI + `extraContext` | `InterviewResumesSection` inline editor + `extraContext` | **Aligned** |
| Reorder experience / projects / education | Six-dot grip drag on list rows | Same grip (`GripVertical`) on Work Experience, Projects, Education | **Aligned** (2026-11-19) |
| OS file-drop onto Profile | Not IM’s “drag” meaning | Removed mistaken `FileDropZone`; upload via picker only | **Aligned** |
| Persistence | `profile.json` / patched local API | electron-store keys (`resumeLibrary`, `activeResumeId`, `resumeProfile`, …) | **Aligned** (different stores) |
| Personal info prompt shape | `My personal information is:\n` + `bGI()` | `---\nMy personal information is:\n` + `formatResumeProfile` | **Aligned** (minor delimiter) |
| Conditional attach | Only if detection `requiresPersonalInfo` **and** resume non-empty (`!aBm(0)`) | `shouldAttachPersonalInfo` + `applyPersonalInfoSignal` cue veto; coding forbids resume | **Aligned** (module-verified ×5) |
| Empty CV reject | Empty extract → error | Empty extract → error, nothing saved | **Aligned** |
| Legacy single profile | Synthetic `"default"` resume from `personalInfoData` | Migration from `resumeProfile` / paste `resumeContext` | **Partial** — dual path in ours |
| Profile ↔ document association | CV tied to resume entries only | CV tied to resume entries; Meeting/General docs are separate mode libs | CV path **Aligned**; mode docs **Ours-only** |

---

## 2. Document uploading (shared = profile CV)

| Capability | InterviewMan | ShadowAssist | Status |
|------------|--------------|--------------|--------|
| Upload within profile | CV on personal-info / resumes | Profile → Interview resumes | **Aligned** |
| Validation | PDF + 10MB | Extension filter + 12MB PDF | **Partial** |
| Progress / processing | Parse via responses; retries; error on empty | IPC parse; NVIDIA visual fallback; chat fallback | **Partial** — different backends, same outcome |
| Extraction | Structured ParsedCV fields | Same schema intent + normalize | **Aligned** |
| Persistence after refresh | Profile hydrate | Store reload | **Aligned** (needs live verify) |
| Re-upload same file | New/updated library entry | Prepend new / library normalize | **Untested** live |
| Unsupported / corrupt | UI constraint + parse errors | Parse errors; txt/md allowed | **Partial** |
| Use docs in conversation | Resume → personal block when gated | Same + optional topic / extraContext | **Aligned** |
| Meeting/General multi-doc libraries | **Not in IM bundle** | Full libraries + `mode-document:parse` | **Ours-only — excluded from IM gap list** |
| Multiple docs (CV library) | Multiple resumes | Multiple resumes (≤20) | **Aligned** |

---

## 3. Conversational memory

| Capability | InterviewMan | ShadowAssist | Status |
|------------|--------------|--------------|--------|
| Setting label / choices | “Conversation Memory” 30s/1m/2m/3m | Same label + `[30,60,120,180]` in General → Answers | **Aligned** |
| Transcript retention for model | `ck2(text, seconds*15)` | `clipTranscriptTail` / `CHARS_PER_SECOND=15` | **Aligned** |
| Prior answered questions | `gaDx` last N, N=clamp(s/15,3,12); empty → `(no questions answered yet)` | `formatAnsweredQuestionsBlock` same math + empty line | **Aligned** |
| Prompt wrapper | `<answered_questions>…` | Same tags | **Aligned** |
| Follow-up / duplicate avoidance | Similarity dedupe (`acf`) | Ledger normalize + similarity / fragment dedupe | **Aligned** intent |
| Cross-conversation persistence | Session deque; optional history flag | Session ledger cleared on purge; not long-term IM memory | **Aligned** for IM memory model |
| Profile-specific context | Active resume + topic + instructions | Active resume + topic + custom instructions + route | **Aligned** |
| Conflicting / updated info | Latest resume active; detection gates attach | Same + router can drop resume for defs/coding | **Aligned** |
| Irrelevant context avoidance | Personal info flag; coding rules in screenshot prompts | `requiresPersonalInfo`, coding contract, strip resume | **Aligned** intent — retest coding/speech |

**Note:** `conversationMemoryService.js` (turn recall) exists in ours but is **not** the IM Conversation Memory control; IM parity = transcript window + answered_questions only.

---

## 4. General conversational capabilities (shared)

| Category | Both support? | Notes |
|----------|---------------|-------|
| General / knowledge questions | Yes | Ours: `technical_explanation` / `general_assistant` contracts |
| Contextual / follow-up | Yes | Transcript + answered_questions |
| Multi-turn | Yes | Overlay history / IM helper history |
| Profile-based questions | Yes | Gated personal block |
| Document-based (CV) | Yes | Via personal info |
| Document-based (meeting files) | Ours only | Excluded from IM parity targets |
| Summarization / extraction / reasoning | Yes (LLM) | Settings length/format modulate style |
| Long / short answers | Yes | Answer Length setting |
| Ambiguous questions | Yes | Detector + Ask path |
| Coding / screen questions | Yes | IM screenshot prompts; ours screen + routing |

---

## 5. Answer generation + answer panel

| Capability | InterviewMan | ShadowAssist | Status |
|------------|--------------|--------------|--------|
| Generation flow | Detect → `aQD` stream (`d8o`) | Detect / Ask → chat stream → overlay | **Aligned** |
| Structure / Format / Length injection | `cxf` templates | `getInterviewAnswerSuffixFromStore` / OUTPUT CONTRACT | **Aligned** |
| Coding answers | Screenshot coding section order + finality rules | `coding_answer` contract; fence-first; no STAR/resume | **Aligned** (coding-answer-parity ×5); keep retesting speech |
| Streaming UI | Live `gpt_markdown` in helper bubble | `StreamingAnswerPreview` + `MarkdownNodes` | **Aligned** intent |
| Loading / completion | Stream until done; think prefs | Stream preview + finalize into messages | **Aligned** intent |
| Formatting (headings, lists, code) | gpt_markdown + mono code | Custom markdown parser + hljs; `•`→`-` | **Partial** — verify typography/spacing live |
| Answer Length ≠ Font Size | Font on separate route | Explicit hint + separate `overlayFontSize` | **Aligned** |
| Response Format ≠ Takeaway panel | Format is bullets/conversational/example | `overlayDisplayStyleFromFormat` forced `detailed` | **Aligned** (prior fix) |
| History / scroll | Helper prefs auto-scroll | Answer history setting + scroll | **Partial** — UX compare needed |
| Regeneration | IM may re-ask / new generate | New Ask / Ctrl+Enter | **Partial** |
| Errors | Stream/API errors in bubble | `role: error` messages | **Aligned** intent |
| Panel placement | Flutter helper overlay | Electron ResponsePanel in overlay | Different chrome; compare readability |

---

## 6. Screen / UI-UX (shared screens)

| Surface | Compare |
|---------|---------|
| Profile / resumes section | Layout density, upload affordance, PDF-only messaging |
| General → Answers settings | Same control set; font elsewhere |
| Overlay answer panel | Streaming markdown, code fences, long-answer scroll |
| Accessibility | Focus after answer, contrast, clipping — live screenshots required |

---

## 7. Mapping decisions (what we will / will not change)

### In scope to align (if tests confirm gaps)

1. CV upload UX constraints closer to IM where we claim interview CV parity (size messaging; optional PDF-primary copy) — **without** ripping our txt/md unless product requires.
2. Personal-info gating and coding/definition contracts under live multi-iteration tests.
3. Memory window + answered_questions injection correctness.
4. Answer panel streaming/markdown/readability parity for shared answer types.
5. Settings decoupling regressions (length/font/format/panel).

### Explicitly out of scope

1. Adding IM-only Flutter features with no ShadowAssist counterpart.
2. Removing Meeting/General document libraries to “match” IM.
3. Modifying `E:\RCA\veilassist2`.
4. Unrelated STT/provider work except where it blocks shared conversation tests.

---

## 8. Test plan mapping (scenarios × ≥5 iterations)

| ID | Scenario | Overlap area |
|----|----------|--------------|
| T-P1 | Create/select resume, switch active, persist after reload | Profile |
| T-P2 | Personal attach on “tell me about yourself”; skip on definition | Profile + memory |
| T-D1 | Upload valid PDF CV; corrupt; oversized; unsupported ext | Document (CV) |
| T-D2 | Re-upload; multi-resume isolation | Document + profile |
| T-M1 | Memory 30/60/120/180 → char window + answered_q limit | Memory |
| T-M2 | Follow-ups use prior Q list; no irrelevant resume on coding | Memory + answers |
| T-C1 | General / contextual / follow-up / ambiguous prompts ×5 | Conversation |
| T-A1 | Same prompt ×5: structure/format/length effects | Answer gen |
| T-A2 | Coding prompt ×5: fences, no STAR, no fake job | Answer gen |
| T-U1 | Screenshots: settings Answers, overlay panel short/long/code | UI/UX |

Scripts live under `reports/veilassist_parity_audit/test_scripts/`. Results under `test_results/`. Screenshots under `screenshots/`.
