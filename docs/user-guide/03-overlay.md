# Floating overlay

The overlay is a always-on-top floating panel above your other windows. It has two states: a **collapsed notch** (status bar) and an **expanded panel** (chat, transcript, input).

## Notch (collapsed bar)

The slim bar shows at a glance:

- App logo and status
- **Listen** button (mic) — start/stop the listening session
- **Settings** — opens the settings window
- **Quit** — fully exits VeilAssist

The notch is designed without obvious hover tooltips during screen sharing.

## Expand and collapse

The panel **expands** automatically when you:

- Start Listen
- Send a question or use an Ask hotkey
- Receive a streaming AI response

**Collapse** manually or press **Stop Listen** to end the session view.

| Action | Default shortcut |
|--------|------------------|
| Show / hide overlay | `Ctrl+\` |
| Hide overlay | `Escape` |
| Focus overlay input (stealth typing) | `Ctrl+Shift+T` |

## Move and resize

- **Move** — drag the top strip (notch or panel header) to reposition anywhere on screen.
- **Resize** — drag edges and corners when expanded (within min/max limits).
- **Nudge position** — `Ctrl+Arrow keys` (customizable in Settings → Shortcuts).
- **Snap to corner/edge** — Settings → General → Snap position (Top-Right, Top-Left, Bottom-Right, Bottom-Left, Center-Right).

## Show transcript (captions)

When Listen is active, **Show transcript** turns on short captions in the mode bar only — there is no separate Me/Participant transcript panel.

- Speech-to-text still runs whenever Listen is on (for auto-answer and Ask context).
- **Show transcript** only controls whether those captions are visible in the chrome.

## Reading modes

| Setting | Location | Effect |
|---------|----------|--------|
| **Teleprompter mode** | Overlay → Reading | Larger type, minimal chrome for reading answers aloud |
| **Focus mode** | Overlay → Reading | Hides input until you tap — less visual clutter |
| **Pin answers to top** | Overlay → Reading | Streaming answers stay pinned at the top while scrolling history |

## Appearance

**Settings → Overlay → Appearance:**

| Control | What it does |
|---------|--------------|
| **Window opacity** | Subtle (65%), Balanced (85%), Clear (92%), or custom slider |
| **Font size** | Small, medium, or large |
| **Panel width / height** | Overlay → Size and position — set dimensions and click Apply |

## Invisible mode (stealth) and discretion

| Setting | What it does |
|---------|--------------|
| **Hide from screen capture** / overlay **Invisible** | Windows content protection (`WDA_EXCLUDEFROMCAPTURE`) — you still see the UI; shares and recordings should not |
| **Quit confirm** | Same protection when Invisible is on — the “Quit VeilAssist?” dialog stays on your screen but should not appear in captures |
| **Mouse passthrough** | Clicks pass through transparent overlay areas; hover the notch or panel to interact |
| **Hide from taskbar** | No taskbar icon for the overlay window (Invisible always hides it) |

## Audio consent

The first time you start Listen, a modal reminds you to disclose AI use to meeting participants when required.

## Scroll answers

When the response panel has long content:

| Action | Default shortcut |
|--------|------------------|
| Scroll answers up | `Ctrl+Shift+Up` |
| Scroll answers down | `Ctrl+Shift+Down` |
