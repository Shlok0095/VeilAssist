# Performance & UX Optimization Plan

Branch: `ship/manual-ask-landing-windows` · Written 2026-11-20

## Goal

Make the app start faster, idle cheaper, stream more smoothly and be easier to use, **without changing core
logic**: prompt building, answer planning, context routing, question detection, STT semantics, memory/recall
semantics and store key names are all out of scope. Settings gets a standard, familiar structure.

## How this plan was made

Three read-only reviews of the current working tree (overlay renderer, Settings window, main process + lib).
Every item below was either confirmed by reading the code or measured. Where a review could not verify something
(real Electron frame times, child-process CPU) it is marked *unverified* and is not claimed as a gain.

## Baseline (before any change)

| Check | Result |
|---|---|
| Test files passing | **55 / 71** (every file run individually; `npm run test:ci` stops at the first failure) |
| Pre-existing failures | 16. 8 need Electron/API keys/an optional module; 8 are stale source-text wiring checks or need diagnosis |
| `vite build` | 5.2 s. JS: overlay 137 kB, vendor-react 142 kB, vendor-hljs 118 kB, settings 92 kB, Advance panel 55 kB |
| Assets | `logo.png` 1.5 MB, `overlaylogo.png` 309 kB bundled |

**Rule:** no test file in the passing set may fail afterwards. A test that encodes the *old* settings layout may be
updated only when the layout change is intentional, and it will be listed.

## Stage 1 — Overlay (renderer) · low risk

| ID | Change | Why (verified) |
|---|---|---|
| O1 | Keep typed text when an ask is rejected (`handleAsk` returns `false` on silent bail-outs; `InputBar` clears only on accept) | Typing during a stream or within the 2 s gap wipes the text with no feedback. Confirmed in `InputBar.jsx` / `handleAsk` |
| O2 | Register resize `mouseup` synchronously | Release before `get-window-bounds` resolves leaves the window following the cursor |
| O3 | Memoize rendered markdown blocks | Whole answer re-parsed/re-rendered ~30×/s while streaming; cost grows with answer length |
| O4 | Instant "pending" feedback between Enter and the first AI event | Up to 2.5 s of nothing after Enter when speech was recent |
| O5 | Empty-state hint and a visible message when Ask produces no output | Silent dead ends |
| O6 | Replace the infinite `box-shadow` animation; `overflow-wrap` on answer text; stronger focus ring | Per-frame repaint while idle; long URLs clipped after commit; ring too faint |
| O7 | Fix live regions (caption bar off; answers `role="log"`; `aria-busy`) | Caption bar announces up to 8×/s; answers announce nothing |
| O8 | Auto-growing input, honest disabled placeholder | Multi-line text invisible; placeholder misleading when disabled |
| O9 | Cap caption text rendered (display only) and memoize handlers | Layout read on every caption update; inline `onAsk` defeats `memo(InputBar)` |

## Stage 2 — Main process & lib · low risk

| ID | Change | Why |
|---|---|---|
| M1 | In-memory cache inside `lib/store.js` (same API, same file, same keys); skip writes whose value is unchanged | Every `get` re-reads, decrypts (PBKDF2) and parses the whole file (~4.5 ms); every `set` ~14 ms. One Ask makes ~60 reads; opening Settings ~140 |
| M2 | Lazy-load `@grpc/grpc-js`/proto-loader, `ws`, `electron-updater` | ~135 + 27 + 270 ms of require-time work before the first window |
| M3 | Screenshot: use the `NativeImage` directly instead of PNG → data URL → decode | Sync main-thread round trip on the Ctrl+Enter path |
| M4 | Prewarm `aiClient`; skip duplicate `applyRuntimeBranding` | First-Ask latency; icon decoded twice |

## Stage 3 — Settings window · standard layout

Information architecture (nav groups → tabs):

| Group | Tabs |
|---|---|
| Setup | Profile · AI Provider · Audio |
| Preferences | General · Overlay · Shortcuts |
| Meetings & devices | Meetings · Phone |
| Privacy & data | Privacy |
| Support | Help · About |

| ID | Change |
|---|---|
| S1 | Render each Advance section only while open (today opening Advance starts a mic probe and a 4 s `adb`/`scrcpy` poll for *collapsed* sections) |
| S2 | Promote the Advance sections to real tabs; consolidate the three Overlay locations; keep deep links and legacy tab ids working |
| S3 | In-window search; per-section "Reset to default"; one global save-status indicator |
| S4 | Local draft + commit-on-blur/debounce for text inputs and sliders (resume editor, opacity, region/model inputs, phone max-size) |
| S5 | Shortcuts: Windows labels (Ctrl/Shift/Alt, not ⌘⇧⌥), reject unmodified/duplicate combos, per-row reset, show registration failures |
| S6 | Save/test feedback: `try/finally` on API test, Enter-to-save on key fields, errors via the existing `settings-toast`, no native `alert` |
| S7 | Dependent controls disabled with a reason (e.g. mic off); "Snap position" becomes an action |
| S8 | Copy clean-up (no "InterviewMan", env-var names, retired auto-answer, hard-coded shortcuts) |
| S9 | Confirm before removing a resume / document / purpose |
| S10 | Accessibility: keyboard-operable select, solid 3:1 focus rings, labelled controls, `aria-current`, dialog focus handling, `--text-tertiary` contrast |
| S11 | Gate remote model sync to the AI Provider tab; cache calendar status |

## Not doing — your call

These were found but change product behaviour or touch sensitive areas, so I am **not** changing them unasked:

| ID | Item | Why it needs you |
|---|---|---|
| X1 | Meeting-detection poll spawns `powershell.exe` (C# compile) every 2.5 s; ~15 s visible-window scan when no meeting is focused | Biggest idle-CPU cost, but slowing it changes detection latency |
| X2 | Stealth window refresh every 4 s (several `SetWindowPos` per window) | Stealth-adjacent |
| X3 | Local STT worker never released after a session | Next session would start slower; comment in code says warm is intentional |
| X4 | `peekOpenSegment()` concatenates the open speech buffer on every audio chunk | Audio/VAD path |
| X5 | Debounced disk writes for overlay bounds/opacity; replacing `electron-store` | A crash could lose the last write; encryption-format risk |
| X6 | Stream-to-commit flash (A3) | Needs a Performance-panel recording first; your own code comment says fusing ticks froze the panel |
| X7 | `disable-gpu-shader-disk-cache`, `PeekMessageW` pump, dead code (Skills panel, ~300 lines of old Profile editor) | Reason unknown / needs confirmation |

## Verification protocol

1. After each stage: `vite build`, then the full per-file test run; compare to the baseline set.
2. New or changed behaviour gets a test in `scripts/` (source-contract style, matching the existing suite).
3. Store cache: a before/after micro-benchmark on a copy of a real-size config, plus a round-trip check that the
   file on disk is byte-compatible (read by the unchanged reader).
4. Anything that needs a running Electron window to prove (frame times, focus behaviour) is reported as *not
   verified here* rather than claimed.

---

# Outcome (2026-11-20)

## Verification

| Check | Before | After |
|---|---|---|
| Test files passing (each file run individually) | 55 / 71 | **58 / 74**, **0 regressions** (the 16 pre-existing failures are unchanged; +3 new test files, all passing) |
| `vite build` | ok | ok |
| Settings tests edited | — | 3 existing tests updated because the layout they encode moved (`test-settings-nav-wiring`, `test-im-answer-ui-parity` font-size check, `test-conversation-memory-window`); plus `e2e-general-answers-settings.cjs` (not in CI) |

## Measured (not estimated)

| Item | Result | How |
|---|---|---|
| M1 store read | ~5.5 ms → **~0.0005 ms** per `get`; unchanged `set` ~14 ms → **~0.25 ms** (no disk write); `getAll()` ~0.25 ms | `scripts/test-store-cache.cjs`, 38 KB encrypted config |
| M1 changed `set` | modestly faster (skips the re-read); timings on this disk were noisy (11–75 ms cached vs 16–311 ms raw), so no precise figure is claimed | same |
| M3 screenshot, Ctrl+Enter path | ~208 ms → **~11.5 ms** per capture; decoded pixels **identical** (JPEG files ~1% smaller) | real Electron binary, headless, synthetic 1080p frame, fresh image per iteration |
| M3 screenshot queue (Ctrl+H) | ~370–385 ms → ~180–187 ms | same |
| M2 | `@grpc/*` and `ws` no longer load at startup; `electron-updater` (~270 ms, packaged builds) loads ~4 s after launch instead of blocking startup | require-time probe |
| O3 markdown | 735-char answer streamed in 53 flushes: block renders **220 → 59 (73% fewer)**, worst single flush re-renders 2 blocks | real `parseMarkdown` extracted from source (`scripts/test-overlay-ux-contract.cjs`) |
| Bundle | overlay JS 137.2 → 139.0 kB (+1.9). Settings initial chunk 91.7 → 106.4 kB, shared components 11.5 → 21.1 kB; every other Settings page is now its own lazy chunk | `vite build` |

## What shipped

**Overlay:** O1 typed text kept when an ask is rejected (+ nudge, screen-reader notice) · O2 resize can no longer get stuck ·
O3 memoized markdown blocks · O5 empty-state hint · O6 compositor-only idle animation, long-token wrapping, solid focus ring ·
O7 correct live regions · O8 honest disabled placeholder · O9 caption tail cap · past-meeting search "No matches"/error fix.

**Main/lib:** M1 store cache · M2 lazy gRPC/ws/updater · M3 screenshot path · M4 skip needless icon decode, AI-client prewarm.

**Settings:** S1–S11 as planned: five nav groups with 11 tabs, search, per-section reset, save-status footer, draft/commit inputs,
validated shortcuts with Windows labels, keyboard-operable dropdown, confirm dialogs, copy clean-up, Overlay and Privacy
settings consolidated, panels mounted only while active (no more mic probe or `adb` polling from a collapsed section).
Legacy `?tab=advance&section=…` links still resolve. User guide (`docs/user-guide/`) updated to the new labels.

## Not verified here (needs a real run)

Frame times and the stream-to-commit flash (X6); a full app launch (global hotkeys + stealth overlay were not started on this
machine); real hotkey registration, mic permission prompt, `adb`, Google OAuth; screen-reader output. The Settings UI was driven in a
scratch Electron window with a **mocked** IPC layer, not against the real main process.

## Still open — your decision

- X1–X7 above, unchanged.
- **O4** instant "pending" state between Enter and the first AI event, and **O5b** a visible message when Ask has nothing to answer:
  both need new state in the ask flow (many early-return paths) / a new message role. Deferred rather than risk a stuck "thinking" state.
- Auto-growing input box: the overlay computes footer heights from fixed constants; needs a layout pass first.
- `logo.png` is 1.5 MB (bundled); a 256 px derivative would cut decode/memory. Brand asset, so your call.
- `docs/user-guide/08-intelligence-and-memory.md` still documents "Settings → Intelligence", which no longer exists as a section.
- `AdvanceSettingsPanel.jsx` / `OverlayAdvancePanel.jsx` are now 8- and 4-line stubs; kept because `scripts/e2e-profile-memory.cjs` still reads one.
- Main-process support the Settings work would benefit from: `update-hotkey` returning `{ok, registered, error}`, an explicit ok/error from
  `set-store`, a `google-calendar:get-status` that never hits the network, and main-side caching for `list-remote-models`.
