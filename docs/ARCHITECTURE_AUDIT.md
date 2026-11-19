# VeilAssist Architecture Audit

**Date:** 2026-09-17 (original read-only audit) — **updated 2026-09-17/18** with a P0 hardening pass and a Rust decision record. Original findings are preserved for history; resolved items are marked in place rather than deleted, so this stays an accurate log of what changed and why.  
**Scope:** Desktop Electron app (`main/`, `lib/`, `renderer/`, packaging). Sibling `landing/` and `webapp/` noted only where they diverge.  
**Method:** Inspected actual source and configs — not package.json claims alone; the P0 pass additionally ran the real test suite, built the app, and profiled production code paths (see §7).

> Canonical interactive view: Cursor canvas `veilassist-architecture-audit.canvas.tsx`.

---

## 1. Executive Summary

VeilAssist is a **local-first Electron 34** desktop meeting assistant (Cluely/Natively-style): frameless always-on-top overlay, dual-channel audio (mic + Windows loopback), local Moonshine/Whisper STT and/or cloud streaming STT, on-demand vision screenshots into multi-provider streaming chat, and hybrid memory (electron-store meetings + SQLite/sqlite-vec semantic recall).

It is **not** a React→remote-backend SaaS app. Orchestration lives in a monolithic `main/index.js` plus `lib/*` services. Desktop UI is **React JSX** (not TypeScript). **Rust layer: MISSING — evaluated for the audio DSP path and deliberately declined on profiling evidence** (§7), not merely absent. Native work uses Electron APIs, `koffi`→Win32, `better-sqlite3`/`sqlite-vec`, and ONNX via `@huggingface/transformers`.

Production-relevant gaps vs a hardened Cluely-class stack, as of the original audit: unrestricted preload IPC, STT API keys returned to the overlay renderer, ScriptProcessor PCM on the audio thread, no formal SQL migrations for meetings, dead OCR/screenshot-queue→LLM paths, and no Rust/native real-time audio core. **The first, second, and fifth of those are now resolved** (IPC allowlist, STT key isolation, dead-path removal — §13/§14/§19); the rest remain open and are tracked as such below.

---

## 2. Actual Technology Stack

| Layer | Technology | Status | Evidence |
|-------|------------|--------|----------|
| Desktop shell | Electron 34.3.0 | Implemented | [package.json](package.json) `"main": "main/index.js"`; [main/index.js](main/index.js) |
| UI | React 18 + JSX | Implemented | [renderer/overlay/main.jsx](renderer/overlay/main.jsx); ~49 `.jsx` under `renderer/` |
| Desktop TypeScript | — | Missing | 0 `.ts`/`.tsx` in `renderer/` or `main/`/`lib/` |
| Bundler | Vite 5 + `@vitejs/plugin-react` | Implemented | [vite.config.js](vite.config.js) multi-page → `out/` |
| CSS | Tailwind + PostCSS | Implemented | [tailwind.config.js](tailwind.config.js); `@tailwind` in overlay/settings CSS |
| IPC bridge | `contextBridge` → `window.shadowAPI` | Implemented | [preload.js](preload.js) |
| Persistence | electron-store (+ safeStorage for keys) | Implemented | [lib/store.js](lib/store.js) |
| Vector DB | better-sqlite3 + optional sqlite-vec | Implemented | [lib/vectorMemory.js](lib/vectorMemory.js) |
| Embeddings | Transformers.js MiniLM (worker) | Implemented | [lib/embedding/embeddingWorker.mjs](lib/embedding/embeddingWorker.mjs) |
| Local STT | Moonshine / Whisper ONNX | Implemented | [lib/localStt/](lib/localStt/) |
| Cloud STT | Deepgram, ElevenLabs, Azure, Google, Soniox, NVIDIA NIM, Groq/OpenAI Whisper | Implemented | [lib/streamingSttRouter.js](lib/streamingSttRouter.js), overlay MediaRecorder path |
| LLM | Groq, NVIDIA NIM, OpenRouter, OpenAI, Anthropic, Google, DeepSeek, custom | Implemented | [lib/providers.js](lib/providers.js), [lib/aiClient.js](lib/aiClient.js) |
| FFI | koffi → user32.dll | Implemented (Win32 chrome) | [lib/win32BackgroundWindow.js](lib/win32BackgroundWindow.js) |
| Rust | — | **MISSING** | No `.rs`, no `Cargo.toml` anywhere |
| Packaging | electron-builder (inline config) | Implemented | [package.json](package.json) `build`; [scripts/run-electron-builder.cjs](scripts/run-electron-builder.cjs) |
| Auto-update | electron-updater | Implemented | [main/index.js](main/index.js) ~4925+ |
| Marketing site | Vite + TypeScript (`landing/`) | Implemented (separate) | Not the desktop runtime |
| Web app | Next.js + Postgres/Drizzle (`webapp/`) | Present, separate product path | Not wired as Electron backend |

---

## 3. Project Structure

```text
shadowassist-v2/
├── main/                 # Electron main process (index.js, dockPolicy.js)
├── lib/                  # Local services: STT, AI, store, memory, capture, hotkeys
├── renderer/             # Vite multi-window React sources
│   ├── overlay/          # Primary Cluely-style HUD
│   ├── settings/         # Settings UI
│   ├── onboarding/, consent/, quit-confirm/
│   ├── meeting-toast/, launcher/, global-chat/
│   └── shared/           # branding, IPC shim, PCM tap, markdown
├── preload.js            # Primary contextBridge
├── preload-meeting-toast.cjs
├── out/                  # Vite production output (loaded by Electron)
├── build/                # Icons, version-state, update-channel
├── scripts/              # Build, publish, tests (no root test/)
├── docs/, legal/
├── landing/              # Marketing + Capacitor mobile (TS)
├── webapp/               # Separate Next/Postgres app
├── api/                  # Interview API fragment
├── .github/workflows/    # CI / release / landing deploy
├── package.json          # electron-builder config inline
├── vite.config.js
└── logo.png, overlaylogo.png
```

**Roles:** `main/` owns windows/lifecycle/IPC orchestration; `lib/` is the local backend; `renderer/` is UI only via `shadowAPI`; `out/` is shipped HTML/JS; `landing/`/`webapp/` are adjacent products, not the overlay runtime.

---

## 4. Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ React JSX renderers (overlay, settings, …)  file:// + CSP    │
│ window.shadowAPI / meetingToast (preload)                    │
└─────────────────────────────┬────────────────────────────────┘
                              │ IPC (unrestricted invoke/send/on)
┌─────────────────────────────▼────────────────────────────────┐
│ Electron main — main/index.js (monolith orchestrator)        │
│  BrowserWindows │ hotkeys │ session │ ask-AI │ STT IPC       │
└───┬─────────┬─────────┬──────────┬──────────┬────────────────┘
    │         │         │          │          │
┌───▼───┐ ┌───▼────┐ ┌──▼───┐ ┌────▼────┐ ┌───▼──────────────┐
│store  │ │AI      │ │STT   │ │screen   │ │vectorMemory      │
│safeSt.│ │aiClient│ │local │ │Capture  │ │sqlite+MiniLM     │
│meetings││providers│ │stream│ │desktopC.│ │profileEvidence   │
└───────┘ └────┬───┘ └──┬───┘ └─────────┘ └──────────────────┘
               │         │
               ▼         ▼
         Cloud LLM    Cloud STT WS/gRPC / local ONNX workers
```

**Pattern: Hybrid local-first (B+C):** React → Electron → local services/SQLite/store → external AI/STT APIs. No traditional remote app backend for the desktop product.

---

## 5. Frontend

| Question | Finding |
|----------|---------|
| React used? | **Yes** — createRoot mounts in each `renderer/*/main.jsx` |
| TypeScript (desktop)? | **No** — JSX/JS only |
| Vite? | **Yes** — multi-page inputs in [vite.config.js](vite.config.js) |
| Tailwind? | **Yes** — content globs `./renderer/**/*` |
| How started? | `npm run build` → Electron loads `out/<page>/index.html` (fallback `renderer/` if no build) |
| Talks to Electron? | [renderer/shared/ipcShim.js](renderer/shared/ipcShim.js) → `window.shadowAPI` |
| Separation? | **Mostly good** — no Node in renderer; **exception:** Whisper REST from overlay with key from IPC |
| Shared types? | **Missing** (no shared TS IPC contracts) |
| Suspicious Node in frontend? | No `require('fs')` in renderer; **fetch to STT APIs with Bearer key** in [renderer/overlay/App.jsx](renderer/overlay/App.jsx) ~2688 |

---

## 6. Electron

| Concern | Status | Evidence |
|---------|--------|----------|
| Main entry | Implemented | [main/index.js](main/index.js) |
| Preload | Implemented | [preload.js](preload.js), [preload-meeting-toast.cjs](preload-meeting-toast.cjs) |
| contextIsolation | Implemented / secure | `true` on UI windows |
| nodeIntegration | Implemented / secure | `false` |
| sandbox | Partial risk | `sandbox: false` on UI windows |
| Overlay | Implemented | transparent, frameless, alwaysOnTop `screen-saver`, skipTaskbar |
| Click-through | Implemented | `setIgnoreMouseEvents` + hit regions ([main/index.js](main/index.js)) |
| Hide from capture | Implemented | `setContentProtection` / stealth ([main/index.js](main/index.js) ~910+) |
| Global shortcuts | Implemented | [lib/hotkeys.js](lib/hotkeys.js) + `setupHotkeys()` |
| Multi-window | Implemented | overlay, settings, consent, onboarding, quit-confirm, toast, launcher, global-chat, Win32 owner |

**Flow:** React → `shadowAPI.invoke/send/on` ([preload.js](preload.js)) → `ipcMain.handle/on` ([main/index.js](main/index.js)) → `lib/*` / OS.

**Security flags:** unrestricted channel pass-through in preload; `get-transcription-config` returns plaintext STT keys to overlay.

---

## 7. Rust / Native Layer

### Rust layer: **MISSING**

| Question | Answer |
|----------|--------|
| A. Does Rust exist? | **No** — 0 `.rs`, 0 `Cargo.toml` |
| B. Compiled? | N/A |
| C. Called by Electron? | N/A |
| D–H. | N/A |
| I. Present but unused? | No Rust artifacts at all |

**What exists instead (native-ish):**

| Tech | Role | Status |
|------|------|--------|
| `koffi` + user32 | Win32 background window / Task Manager grouping | Implemented — [lib/win32BackgroundWindow.js](lib/win32BackgroundWindow.js) |
| `better-sqlite3` / `sqlite-vec` | Native Node addons | Implemented — packaged via `asarUnpack` |
| `onnxruntime-node` (via transformers) | Local STT/embeddings | Implemented |
| PowerShell | Meeting scan helper | Present — [lib/meetingScanMeet.ps1](lib/meetingScanMeet.ps1) |

### Rust decision record — audio DSP path (2026-09-17)

**Rust is an available architectural option here, not a mandatory technology.** Any candidate Rust
boundary must clear a profiling/complexity gate before implementation — this is not a one-time
verdict against Rust, it's the standing policy for evaluating it. The audio-preprocessing candidate
named in prior audits (PCM Float32→Int16 conversion, 48kHz→16kHz resampling, energy-based VAD) was
run through that gate and **declined for now**, on evidence, not by default:

**Method:** profiled the actual production code — [renderer/shared/pcmCaptureTap.js](renderer/shared/pcmCaptureTap.js)'s
conversion loop, [lib/localStt/audioResampler.js](lib/localStt/audioResampler.js), and
[lib/localStt/vadProcessor.js](lib/localStt/vadProcessor.js) — against 60s of synthesized dual-channel
(mic + system) audio at 48kHz, matching real chunk sizes (8192 samples) and cadence.

**Result:**

| Step | Total (60s of audio, both channels) | Per-chunk avg |
|---|---|---|
| PCM Float32→Int16 | ~15ms | 0.02ms |
| Resample 48k→16k (linear) | ~25ms | 0.035ms |
| VAD / RMS segmenting | ~15ms | 0.02ms |
| **Combined** | **~211ms CPU** | over **60,000ms** of real time — **0.35% of budget** |

Worst observed single-chunk latency across all three steps: 0.41ms — 2.5% of a 16.6ms UI-frame budget,
0.24% of the ~170ms real callback interval. No bottleneck, no measurable pressure, no gap between what
JS delivers and what real-time STT needs.

**Decision:** Do not implement Rust for PCM conversion, resampling, or VAD unless *future* profiling —
under real hardware load, not synthetic — demonstrates a measurable bottleneck. Writing a native
`napi-rs` module here today would mean taking on a Rust toolchain, cross-platform build complexity, and
a new native-module-load failure mode, to replace code that uses roughly a third of a percent of one
core — exactly the "Rust for architecture aesthetics" this project's own engineering rules reject.

**This does not close the door on Rust generally.** Preserve it as an option for a future boundary
where profiling shows real value (candidates worth re-checking as the product evolves: local ONNX STT
under sustained load on low-end hardware, high-volume vector-memory indexing, or a genuinely CPU-bound
native OS integration). The gate — profile → confirm bottleneck → confirm JS/workers insufficient →
only then introduce Rust, with an explicit why/what-bottleneck/how-packaged/how-tested/how-recovered
writeup — applies to any future candidate the same way it applied to this one.

---

## 8. Audio Pipeline

```text
Mic (getUserMedia) + System (getDisplayMedia loopback / legacy desktopCapturer)
        ↓
AudioContext DSP (HPF/gain/compressor) — renderer/overlay/App.jsx
        ↓
pcmCaptureTap Int16 ScriptProcessor — renderer/shared/pcmCaptureTap.js
        ↓
IPC write-chunk → main
        ↓
┌───────────────────┬────────────────────────────┬─────────────────────┐
│ localSttManager   │ streamingSttRouter         │ MediaRecorder slices│
│ Moonshine/Whisper │ DG/EL/Azure/Google/Soniox/ │ → Whisper REST      │
│ ONNX workers      │ NVIDIA gRPC                │ (Groq/OpenAI)       │
└─────────┬─────────┴─────────────┬──────────────┴──────────┬──────────┘
          └──────────┬────────────┘                         │
                     ▼                                      │
            transcript IPC (mic=Me, sys=Participant)         │
                     ↓                                      │
         sessionMemory / sessionRecorder / live UI ←────────┘
                     ↓
              Ask context → LLM
```

| Capability | Status | Notes |
|------------|--------|-------|
| Mic capture | Implemented | `acquireMicMeetingStream` |
| System/loopback | Implemented | [lib/screenCapture.js](lib/screenCapture.js) `getDisplayMediaLoopbackPayload`; Win-oriented |
| Streaming / buffering / chunking | Implemented | PCM taps + STT engines |
| PCM / resample 16 kHz | Implemented | [lib/localStt/audioResampler.js](lib/localStt/audioResampler.js) |
| Partial/final transcripts | Implemented | streaming + local sessions |
| Speaker diarization (ML) | Missing | Channel tags only (`Me` vs `Participant`) — [main/index.js](main/index.js) ~4340 |
| Device selection | Implemented | `preferredMicId` in store |
| Permissions | Partial | mic via getUserMedia + consent UI; system audio via display-media handler |
| `cloudRestStt` / `rest-stt` IPC | **Dead** | [lib/cloudRestStt.js](lib/cloudRestStt.js) exists; overlay does not call `rest-stt:*` |
| Phone remote mic | Partial | ingest exists; store notes flag not fully wired |

---

## 9. Screen Capture

| Capability | Status | Evidence |
|------------|--------|----------|
| Full screen / primary display | Implemented | [lib/screenCapture.js](lib/screenCapture.js) `captureScreenForVision`, `pickScreenSource` |
| Specific window / region | Partial / Missing | Source pick is screen-oriented; no user region picker found for Ask |
| Active window only | Cannot determine / likely Missing | No dedicated active-window capture path found |
| Screenshots for AI | Implemented | On-demand JPEG (~960w, q74) into multimodal Ask |
| Periodic continuous capture | Missing | Cooldown reuse only (`CAPTURE_COOLDOWN_MS = 1200`) |
| Manual screenshot queue | Implemented UI/storage | [lib/screenshotQueue.js](lib/screenshotQueue.js) max 5 PNGs |
| Queue → LLM | **Dead** | `getQueueAsBase64` unused |
| OCR | **Dead** | Explicitly removed; StatusBar still mentions OCR strings |
| Privacy | Implemented | Overlay hide + content-protection lift during capture |

Uses **Electron `desktopCapturer` + `nativeImage`**, not Rust.

---

## 10. AI Architecture

**Abstraction:** registry in [lib/providers.js](lib/providers.js) + unified client [lib/aiClient.js](lib/aiClient.js) (`completeChat`, `streamChat`, OpenAI-compat vs Anthropic paths). Not a formal OO `AIProvider` class hierarchy, but a practical provider map.

| Concern | Status |
|---------|--------|
| Multi-provider BYOK | Implemented |
| Streaming tokens to UI | Implemented (`ai-token`, batcher) |
| Retries / fallbacks | Partial — [lib/chatStreamFallback.js](lib/chatStreamFallback.js) |
| Vision multimodal | Implemented when provider supports it |
| Prompt / mode / profile injection | Implemented — main Ask builder + [lib/contextPrompts.js](lib/contextPrompts.js), [lib/profileEvidence.js](lib/profileEvidence.js) |
| Key storage | Implemented — `safeStorage` + electron-store encryption ([lib/store.js](lib/store.js)) |
| Key exposure | **Incorrect for production** — `get-transcription-config` returns `apiKey` to renderer; overlay sends `Authorization: Bearer` |

Local LLM runtime (Ollama etc.): **Missing** as a first-class desktop path (only cloud/custom OpenAI-compat URL).

---

## 11. RAG / Vector Search

```text
Saved meetings / profile / optional reference files
        ↓ chunkSession / buildProfileChunks
        ↓ MiniLM embeddings (worker)
        ↓ memory_chunks BLOB + optional sqlite-vec
        ↓ semantic (+ keyword) search
        ↓ injected into Ask system/context
        ↓ LLM
```

| Piece | Status | Evidence |
|-------|--------|----------|
| SQLite + sqlite-vec | Implemented | [lib/vectorMemory.js](lib/vectorMemory.js) |
| Embeddings 384-d | Implemented | Xenova/all-MiniLM-L6-v2 |
| Chunking / retrieval | Implemented | [lib/vectorMemoryUtils.js](lib/vectorMemoryUtils.js) |
| Reranking model | Missing | Score fusion / keyword overlap only |
| Chroma/Qdrant/Pinecone/FAISS | Missing | Not used |
| Migrations | Partial | `CREATE IF NOT EXISTS` + one-shot JSON→SQLite flag; no migration framework |
| Meetings primary store | electron-store JSON (max 50) | [lib/meetingSessions.js](lib/meetingSessions.js) — not SQLite |

---

## 12. Database

| Data | Technology | Status |
|------|------------|--------|
| Settings, API keys, modes, LTM | electron-store | Implemented |
| Meeting sessions / transcripts / summaries | electron-store array | Implemented |
| Vector chunks / embeddings | better-sqlite3 file under userData `memory/` | Implemented |
| Conversations (live) | in-memory services | Implemented |
| Screenshots | disk queue + ephemeral vision b64 | Partial |
| Formal ORM / migrations | — | Missing (desktop) |
| Concurrency | WAL pragma on vector DB | Partial |
| Backup | export IPC / clear-all-data | Partial |

**Schema (vector):** `memory_meta`, `memory_chunks` (+ optional `vec_memory_chunks` virtual table).

---

## 13. IPC

**RESOLVED (2026-09-17):** [preload.js](preload.js) now gates `invoke`/`send`/`on`/`removeAllListeners`
against three explicit `Set`s (`INVOKE_CHANNELS`, `SEND_CHANNELS`, `ON_CHANNELS`) built from the exact
channel names the renderer codebase calls — an unknown channel is rejected (`invoke`) or a no-op
(`send`/`on`) rather than passed through. The original finding (kept below for history) was that the
bridge exposed unrestricted `invoke`/`send`/`on` to any channel.

| Channel (representative) | Direction | Purpose | File | Security |
|--------------------------|-----------|---------|------|----------|
| `protection:set/get` | R→M | Stealth | main/index.js | OK |
| `overlay:set-ignore-mouse-events`, hit-regions | R→M | Click-through | main | Sender-aware in places |
| `get-store` / `set-store` / `get-all-settings` | R→M | Settings | main + store | Keys mostly redacted; `set-store` broad |
| `get-transcription-config` | R→M | STT config | main | **RESOLVED** — returns `hasApiKey: boolean`, never the raw key (see §14) |
| `cloud-stt:transcribe-rest` | R→M | STT REST call | main | New — performs the multipart POST server-side; key never leaves main |
| `local-stt:*` / `streaming-stt:*` | both | STT | main + lib | OK if keys stay main |
| `ask-ai-with-transcript`, `ai-token`… | both | Ask stream | main | OK |
| `screenshot:*` | both | Manual queue | main | Privileged |
| `meeting-sessions:*` | R→M | CRUD/export | main | Privileged |
| `vector-memory:*` / `memory:search-past-meetings` | R→M | RAG | main | Privileged |
| `phone-link:*` | R→M | Pairing token | main | Medium — token to UI |
| `parse-playbook` | R→M | File read | main | Mitigated (dialog allowlist) |
| `shadowAPI.invoke(any)` | R→M | ~~Any channel~~ | preload.js | **RESOLVED — allowlisted** |

Full channel surface is large (127 handlers concentrated in [main/index.js](main/index.js)) — allowlisting
narrowed the *exposed* surface to what the renderer legitimately calls, but did not reduce handler count;
main-process modularization (§19 gap 4) is still open.

---

## 14. Security

### CRITICAL
- None proven as remote RCE from this static pass (file:// + CSP + no nodeIntegration).

### HIGH — both RESOLVED 2026-09-17
- ~~Unrestricted preload IPC (`invoke`/`send`/`on` any channel)~~ — [preload.js](preload.js) now allowlists all three against renderer-derived channel sets. XSS in any privileged window is now bounded to those channels, not the full local IPC surface.
- ~~STT API keys delivered to overlay via `get-transcription-config` and used in renderer `fetch`~~ — the renderer now receives `hasApiKey: boolean` only; the actual multipart POST (with the real key resolved from `store`) happens in main via the new `cloud-stt:transcribe-rest` handler, mirroring the already-correct `nvidia-nim:transcribe-wav` pattern.

### MEDIUM
- `sandbox: false` on BrowserWindows — **still open**; `preload.js`/`preload-meeting-toast.cjs` only use `require('electron')` so a sandboxed preload looks feasible, but flipping it needs manual QA across mic/screen-capture/audio flows on all 8 windows before it's safe to ship (deferred, not attempted blind).
- Unbounded `set-store` from renderer — still open.
- Phone-link / regenerate token returned to UI — still open.
- electron-store `encryptionKey` string is app-static (defense-in-depth limited; `safeStorage` helps OS-backed fields) — still open.

### LOW
- `shell.openExternal` / `openPath` for legal/logs/OAuth (URL/path gated in known paths).
- Verbose console forward to main logs when enabled.

### INFO
- CSP meta tags on HTML entries; navigation hardening via `hardenWindow`.
- `forceCodeSigning: false` — unsigned Windows builds / SmartScreen friction.

---

## 15. Performance

| Bottleneck | Why it matters | Location |
|------------|----------------|----------|
| ScriptProcessor 8192 PCM tap | Deprecated API; main-thread audio glitches under load | [pcmCaptureTap.js](renderer/shared/pcmCaptureTap.js) |
| Monolithic main process | AI + STT IPC + window logic on one thread | [main/index.js](main/index.js) |
| ONNX STT/embed in Node workers | CPU contention; not Rust SIMD pipeline | `lib/localStt/*`, `lib/embedding/*` |
| Large overlay App.jsx | Re-render / session complexity risk | [renderer/overlay/App.jsx](renderer/overlay/App.jsx) |
| electron-store meeting history | Full JSON rewrite; no indexed SQL for sessions | meetingSessions |
| Vision capture + JPEG on Ask | Acceptable on-demand; cooldown helps | screenCapture.js |
| IPC token spam | Mitigated by token batcher | main ask path |

**Rust opportunities (not present today):** PCM resample/VAD, lock-free ring buffers, capture helpers — currently JS/WASM/ONNX. **Evaluated 2026-09-17 for PCM/resample/VAD specifically and declined** — profiling showed ~0.35% of real-time budget consumed; see §7's decision record. Ring buffers / capture helpers remain unevaluated candidates, not ruled out.

---

## 16. Build & Packaging

| Item | Status |
|------|--------|
| electron-builder | Implemented (inline [package.json](package.json)) |
| Win portable + NSIS | Implemented |
| macOS dmg/zip, Linux AppImage/deb | Configured |
| Native module unpack | Implemented (`asarUnpack` for `.node`, koffi, sqlite-vec, onnxruntime, STT worker) |
| Rust binaries in package | N/A (missing) |
| Code signing | Disabled (`forceCodeSigning: false`) |
| Auto-update | Implemented (electron-updater generic feed) |
| Version bump | [scripts/bump-build-version.cjs](scripts/bump-build-version.cjs) + run-electron-builder |

---

## 17. Testing

| Type | Status | Evidence |
|------|--------|----------|
| Unit / node:test | Implemented (many) | `scripts/test-*.cjs` + [scripts/run-ci-tests.mjs](scripts/run-ci-tests.mjs) |
| Electron integration | Partial | `test:electron-sqlite`, `test:persistent-memory`, `verify:dock` |
| IPC contract tests | Partial / Missing | No typed IPC suite |
| Rust tests | Missing | No Rust |
| Audio / STT | Partial | local-stt, nvidia-streaming-stt, transcript-lifecycle scripts |
| AI / chat fallback | Partial | test-chat-stream-fallback, ask-context |
| E2E UI (Playwright/Spectron) | Missing | Not found |
| Landing typecheck | Implemented | `test:web` |

No root `test/` directory for desktop; tests live under `scripts/`.

---

## 18. Cluely/Natively Compatibility

| Capability | Status |
|------------|--------|
| Floating transparent always-on-top overlay | IMPLEMENTED |
| Click-through / hit regions | IMPLEMENTED |
| Hidden from screen share (content protection) | IMPLEMENTED |
| Global hotkeys | IMPLEMENTED |
| Mic + system audio | IMPLEMENTED |
| Real-time STT → transcript UI | IMPLEMENTED |
| Screen → vision LLM context | IMPLEMENTED |
| Multi-provider streaming AI | IMPLEMENTED |
| Local SQLite vector recall | IMPLEMENTED |
| Secure typed IPC allowlist | IMPLEMENTED (2026-09-17) — channel-name allowlist in preload.js; not yet a shared TS contract |
| Rust native audio/OS layer | MISSING — evaluated for PCM/resample/VAD, declined on profiling evidence (§7) |
| ML speaker diarization | MISSING |
| Continuous screen OCR pipeline | MISSING (intentionally removed / dead) |
| Desktop TypeScript shared types | MISSING |
| Production code signing | MISSING / disabled |
| Screenshot queue feeding Ask | REMOVED (2026-09-17) — dead code deleted, was already unreachable |
| Main-process cloudRestStt path | REMOVED (2026-09-17) — dead module + IPC handlers deleted, zero callers traced first |

---

## 19. Critical Gaps

1. ~~No Rust/native real-time audio core~~ — **evaluated 2026-09-17, not a gap**: profiled and declined on evidence (§7). Still true that PCM runs on JS ScriptProcessor + Node workers; that's now a *deliberate* state, not an unexamined one. `ScriptProcessor`→`AudioWorklet` remains a legitimate separate gap (deprecated API, main-thread delivery) — tracked in §15, not yet fixed.
2. ~~Preload is an open IPC proxy~~ — **RESOLVED 2026-09-17**: allowlisted (§13).
3. ~~STT secrets in the renderer~~ — **RESOLVED 2026-09-17**: key resolution moved to main (§13/§14).
4. **Monolithic main** — hard to reason about, test, and isolate failures. Still open; a section-by-section map (windows / STT IPC / Ask orchestration / etc.) was produced 2026-09-17 as a starting point for a future service-split, but the split itself was not attempted (high regression risk without a larger test pass first).
5. **Meetings not in SQLite** — scale/query/privacy controls weaker than vector store. Still open.
6. **No ML diarization** — only mic vs loopback channel labels. Still open.
7. ~~Dead paths (OCR strings, screenshot-queue→LLM, rest-stt)~~ — **RESOLVED 2026-09-17**: all four traced to zero callers and removed.
8. **Unsigned Windows builds** for public distribution. Still open; blocked by signing credentials, not an engineering task.
9. **No shared typed IPC/schema** across main/renderer. Still open — the 2026-09-17 allowlist is a runtime channel-name gate, not a compile-time typed contract.
10. **Sibling webapp/landing** can be mistaken for desktop architecture — they are not the runtime.

---

## 20. Recommended Architecture (evolution from *this* codebase)

Keep local-first Electron; harden and modularize rather than rewrite:

```text
React (prefer gradual TS) 
  → allowlisted preload IPC (typed channels)
    → main process thin router
      → services: WindowService, AudioIngest, SttRouter, VisionCapture, AskOrchestrator, MemoryService
        → workers: ONNX STT, embeddings
        → (future) Rust napi addon: PCM ring buffer, resample, VAD
        → SQLite: meetings + vectors (unified schema + migrations)
        → AI providers (keys never leave main)
```

Priority order implied by current risks: ~~**IPC allowlist + keep STT keys in main**~~ (done 2026-09-17) → split `main/index.js` services → AudioWorklet replace ScriptProcessor → unify meeting persistence into SQLite → typed IPC contracts → E2E tests of critical journeys → optional Rust PCM *only if future profiling shows a real bottleneck* — not a greenfield Tauri rewrite.

---

## 21. Exact Files to Inspect Next

1. [main/index.js](main/index.js) — windows, Ask, STT IPC, stealth, updater  
2. [preload.js](preload.js) — bridge surface  
3. [renderer/overlay/App.jsx](renderer/overlay/App.jsx) — audio + STT UI orchestration  
4. [renderer/shared/pcmCaptureTap.js](renderer/shared/pcmCaptureTap.js)  
5. [lib/screenCapture.js](lib/screenCapture.js)  
6. [lib/localStt/localSttManager.js](lib/localStt/localSttManager.js)  
7. [lib/streamingSttRouter.js](lib/streamingSttRouter.js)  
8. [lib/aiClient.js](lib/aiClient.js)  
9. [lib/providers.js](lib/providers.js)  
10. [lib/store.js](lib/store.js)  
11. [lib/vectorMemory.js](lib/vectorMemory.js)  
12. [lib/profileEvidence.js](lib/profileEvidence.js)  
13. [lib/hotkeys.js](lib/hotkeys.js)  
14. [lib/sessionMemory.js](lib/sessionMemory.js) / [lib/sessionRecorder.js](lib/sessionRecorder.js)  
15. [lib/meetingSessions.js](lib/meetingSessions.js)  
16. [lib/screenshotQueue.js](lib/screenshotQueue.js)  
17. [package.json](package.json) `build` + asarUnpack  
18. [vite.config.js](vite.config.js)  
19. [lib/win32BackgroundWindow.js](lib/win32BackgroundWindow.js)  
20. [scripts/run-ci-tests.mjs](scripts/run-ci-tests.mjs)

---

### Feature gap snapshot (requested labels)

**IMPLEMENTED:** Electron overlay UX (transparent/AOT/click-through/stealth), dual audio, local+cloud STT, streaming multi-provider LLM, vision Ask, vector memory, hotkeys, electron-builder multi-OS, auto-updater hooks, BYOK key vaulting (main), **preload IPC channel allowlist, STT key isolation to main, settings/consent/onboarding window-flash fix (2026-09-17)**.

**PARTIAL:** Sandbox (still `false`, evaluated feasible but deferred pending QA), phone mic, reference-file vectors (default off), meeting SQL, diarization (channel-only), code signing, E2E tests.

**MISSING:** Rust layer (evaluated for audio DSP, declined on profiling evidence — not unexamined), typed shared contracts, ML diarization, continuous capture/OCR product path, desktop TypeScript.

**UNUSED / DEAD:** none currently known — the four items previously listed here (`cloudRestStt`/`rest-stt`, screenshot queue→LLM, OCR APIs/strings, `sessionMemory.addOcrSnapshot`) were traced to zero callers and removed 2026-09-17.

**ARCHITECTURALLY RISKY:** ~~Open preload IPC~~ (resolved) · ~~renderer-held STT keys~~ (resolved) · mega-main process (still open) · ScriptProcessor audio (still open — deprecated API; profiling shows current DSP load is trivial, but the API itself is still deprecated and still delivers via the render-thread callback) · JSON meeting store at scale (still open).
