# Listen and transcription

**Listen** turns on session capture. While active, VeilAssist transcribes speech into a running transcript used for live display and AI context.

## Start and stop

| Method | Action |
|--------|--------|
| Mic button on notch | Start / Stop Listen |
| Tray menu | Start / Stop Session |
| Hotkey | `Ctrl+Shift+\` (customizable) |

**Stop** ends capture, stops STT, and may trigger a **session recap** (unless disabled).

## What gets captured

| Source | Description |
|--------|-------------|
| **Microphone** | Your voice — primary STT input |
| **System audio (loopback)** | What plays on the PC (remote participants in Zoom/Teams/Meet). Uses Windows display-media capture; you may need to pick a screen or share target when prompted |

Both streams are processed in short segments. When speech is detected, text accumulates in the transcript buffer.

## Audio settings

**Settings → Audio:**

| Setting | Description |
|---------|-------------|
| **Microphone on** | Enable/disable mic capture for Listen |
| **Mic sensitivity** | Standard or Boost — restart Listen after changing |
| **Preferred microphone** | Pick input device (labels appear after mic permission) |
| **Preferred speaker** | Output device selection |

## Speech-to-text modes

### Local (on-device) — default

Runs **Moonshine** ONNX models on your PC. No cloud STT key required.

- First launch may take **10–30 seconds** while models load.
- **Local model preference:** Auto (language-based), Moonshine Base, or Moonshine Tiny (fastest).
- **Whisper Tiny gate** — optional experimental second pass (off by default).

### Cloud (API key)

Send audio to a cloud STT provider using your BYOK key.

**Supported cloud STT providers:**

| Provider | Notes |
|----------|-------|
| Groq | Whisper — fast batch cloud STT |
| OpenAI | Whisper-1 |
| NVIDIA NIM | Parakeet and other NIM models |
| Deepgram | Live streaming STT (Nova) — lower latency |
| ElevenLabs | Cloud STT |
| Azure | Microsoft Cognitive Services |
| Google Cloud STT | Cloud STT via main process |
| Soniox | Real-time streaming STT |

Enter keys under **Settings → Audio → Backup provider keys** for providers beyond your main chat account.

## Live transcript in overlay

When Listen is on and **Live transcript panel** is enabled (General settings), the overlay shows Me / Participant columns with auto-scroll.

## Session recap on Stop

When you press **Stop**, VeilAssist can generate a **bullet summary** of the session (transcript, asks, overlay activity):

- Saved **locally** on your device under app data.
- Uses your chat provider for a full LLM summary when configured.
- Falls back to a simple text recap if the provider call fails.
- Skipped when **Settings → General → Do not save meetings** is on.

Recaps appear in **Settings → Meetings → Session recaps** and in the **Launcher** recent sessions list.

## Tips

- Grant **microphone permission** when Windows prompts — required for mic labels and capture.
- For loopback, accept the **screen/share picker** when it appears — pick the display or window that carries meeting audio.
- Restart Listen after changing mic sensitivity, STT mode, or provider.
