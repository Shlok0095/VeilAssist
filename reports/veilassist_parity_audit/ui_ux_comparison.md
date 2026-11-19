# UI/UX Comparison — Overlapping Surfaces

**Method:** Source/layout inspection + launch attempt + display capture.  
**Constraint:** Both helper windows used `WDA_EXCLUDEFROMCAPTURE` during capture, so overlay pixels were not readable from screenshots.  
**Last updated:** 2026-11-19 — resume grip reorder, no file-drop upload zones, quit dialog stealth coverage.

---

## 1. Profile / resumes

| Aspect | InterviewMan | VeilAssist | Assessment |
|--------|--------------|------------|------------|
| Entry | Personal info / resumes routes | Settings → Profile → Interview resumes | Equivalent job |
| Upload affordance | “PDF only, max 10MB” | **Upload resume** button only (picker). No “drop a resume” zone | **Aligned intent** — picker upload, not OS file-drop |
| Library select | Tap active resume; pre-interview picker if ≥2 | List + select + expand editor | Aligned functionally |
| Edit fields | Structured PersonalInfo + extra context | Inline editor + `extraContext` | Aligned |
| Reorder experience / projects / education | Six-dot **grip** drag-and-drop on list rows after extract | Same: `GripVertical` on Work Experience, Projects, Education rows | **Aligned** (2026-11-19) |
| Errors | Parse/empty CV messaging | Empty/corrupt/size errors in IPC | Aligned intent |

**Note:** “Drag and drop” in IM means **reordering profile cards** with the grip handle — not dropping a PDF onto the Profile page. VeilAssist matches that.

---

## 2. Answers settings (General)

| Control | IM | Ours | Assessment |
|---------|----|------|------------|
| Conversation Memory | 30s / 1m / 2m / 3m + warn >60s | Same options + similar hint | **Aligned** |
| Custom instructions | `extraInstructions` | textarea → `interviewCustomInstructions` | Aligned |
| Answer structure | STAR/CAR/SOAR/PAR/SOARA | Same | Aligned |
| Response format | Bullet / Conversational / Example | Same; conversational = spoken fillers, **not** Takeaway panel | **Aligned** (prior mis-map fixed) |
| Answer length | Short/Medium/Long | Same; hint: does **not** change font | **Aligned** |
| Font size | Separate `font-size` route | Separate overlay font control | **Aligned** |
| Answer history | Helper history prefs | Latest vs keep earlier | Partial UX chrome difference |

---

## 3. Answer panel / conversation

| Aspect | IM | Ours | Assessment |
|--------|----|------|------------|
| Streaming | Live `gpt_markdown` in helper bubble | `StreamingAnswerPreview` + `MarkdownNodes` | Intent aligned |
| Code | JetBrainsMono + copy | hljs + fenced blocks | Intent aligned |
| Lists | Markdown | `•` normalized to `-` | Aligned |
| Long answers | Scroll + auto-scroll pref | Scroll + history setting | Aligned intent |
| Loading | Stream until complete | Stream preview → commit | Aligned intent |
| Errors | In-bubble | `role: error` | Aligned intent |
| Focus after answer | Flutter focus model | Electron overlay focus | **Untested live** (stealth) |
| Screen-reader | Flutter semantics | React DOM | **Untested** this pass |

---

## 4. Invisible / stealth capture exclusion

| Surface | IM | VeilAssist | Assessment |
|---------|----|------------|------------|
| Overlay | Excluded from share/capture when stealth on | `setContentProtection` when **Hide from screen capture** / Invisible | Aligned |
| Settings | Hidden/protected under stealth | Settings hide on win32 when stealth turns on; protection on managed windows | Aligned intent |
| **Quit confirm dialog** | Must not leak into share | `quitConfirmWindow` in stealth-managed set; content protection on create/show; non-modal under stealth (avoids win32 modal+parent spam) | **Fixed 2026-11-19** |
| Meeting toast | Product-specific | Meeting toast **excluded** from stealth list (by design) | Documented difference |

**User-visible rule:** Invisible mode still shows UI on *your* monitor so you can quit/confirm. Shares and recordings should not see overlay **or** the Quit dialog.

---

## 5. Overlay chrome (VeilAssist-specific, IM-adjacent)

| Aspect | Behavior (current) |
|--------|-------------------|
| Fonts | **Poppins** for all Settings + overlay UI (IM google_fonts), with **bold hierarchy** (body 500, labels/nav 600–700, page titles 800); JetBrains Mono for code/API. Tailwind `sans` must stay Poppins — not Segoe |
| Danger / Quit / Delete | Shared `--danger-fill` red (not purple accent) |
| Show transcript | Mode-bar captions only — **no** separate Me/Participant live transcript panel |
| Send (input) | Arrow-up control; must not crash if icon import missing |

---

## 6. Readability / clipping / responsiveness

| Check | Result |
|-------|--------|
| Overlay screenshot readability | **Blocked** — excluded from capture (expected in Invisible) |
| Settings panels | Not captured this pass |
| Content clipping / overlap | No pixel evidence; ResponsePanel code supports turn grouping + scroll |
| Keyboard navigation | Shortcut parity is a separate track (`IM-PARITY.md`); not re-audited here |

---

## 7. Document upload UX (CV only)

| Check | IM | Ours |
|-------|----|------|
| Progress | Extracting state | “Extracting…” on button |
| Unsupported | Constrained at picker | Broader picker (`pdf`/`txt`/`md`); size/parse errors |
| Multi-doc | Multi-resume library | Multi-resume library (≤20) |
| File drop onto Profile | Not the IM “grip” feature | **Removed** mistaken drop zones (2026-11-19) |

Meeting/General upload UX exists only on our side — excluded from IM alignment targets.

---

## 8. Recommended UI polish (overlap only, residual)

1. Optional: Interview resume file dialog filter default to **PDF** (advanced: “All supported”).
2. After stealth off: capture paired screenshots for visual QA of spacing/typography.
3. Confirm focus moves to newest answer without stealing OS focus in stealth mode (manual).
4. Manual: Quit while Invisible — confirm dialog visible locally, absent from a second “share” capture.
