# Overview

VeilAssist is an **undetectable AI assistant for live meetings**. It runs from the system tray, shows a floating overlay on your screen, listens when you enable it, captures your screen on demand for vision models, and streams answers in a compact panel — so you can follow meetings without switching apps.

**Important:** VeilAssist is positioned for **live work meetings**, not hiring interviews. You must disclose AI use wherever your organization or participants require it.

## What VeilAssist does

| Capability | Summary |
|------------|---------|
| **Listen** | Transcribes your microphone and system audio (remote participants) into a live transcript |
| **Ask AI** | Sends transcript + optional screen screenshot to your chosen LLM; answers stream in the overlay |
| **Profile modes** | Personas with instructions, reference files, resume, and job description for role-specific answers |
| **Intelligence** | Smart context routing, long-term memory, meeting search, and mode suggestions |
| **Calendar** | Optional Google Calendar, reminders, meeting detection, and session recaps |
| **Phone** | Optional QR companion and Android USB mirror |
| **Stealth** | Content protection, mouse passthrough, hide from taskbar — harder to capture in shares |

## Bring your own key (BYOK)

VeilAssist does **not** bundle API keys. You paste keys for your chosen providers in Settings. Traffic goes directly from your PC to the vendor. Keys are stored locally and encrypted when Windows DPAPI is available.

## The basic loop

1. Launch VeilAssist — it lives in the **system tray** (^ near the clock).
2. Open **Settings** (`Ctrl+Shift+S`) — connect a chat provider, pick a model, configure audio.
3. Optionally set up **Profile** (persona, resume, reference files).
4. Press **Listen** (mic button or `Ctrl+Shift+\`) when you want speech captured.
5. **Ask** — type a question, use action chips, or press `Ctrl+Enter` (with screen) / `Ctrl+Shift+Enter` (audio only).
6. Press **Stop** when done — a session recap may be saved locally.
7. Hide the overlay with `Escape` or `Ctrl+\`; the app keeps running in the tray until you **Quit**.

## Settings tabs (quick map)

| Tab | Purpose |
|-----|---------|
| **Profile** | Persona modes, resume, job description, skills |
| **AI Provider** | Provider, API key, model, fallback provider |
| **Audio** | Microphone, speech recognition, speech language |
| **General** | Theme, startup, how answers are written |
| **Overlay** | Look, reading modes, window behavior, size and position |
| **Shortcuts** | Global shortcuts |
| **Meetings** | Calendar, reminders, session recaps |
| **Phone** | Phone Link and Android mirror |
| **Privacy** | Hide from screen capture, export or delete local data |
| **Help** | FAQ and user guide |
| **About** | Version and product info |
