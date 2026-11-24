<div align="center">
  <img
    src="https://capsule-render.vercel.app/api?type=waving&height=220&color=gradient&customColorList=12,19,24&text=VeilAssist&fontColor=ffffff&fontSize=58&fontAlignY=38&desc=Real-time%20AI%20assistance%20for%20Windows&descAlignY=60&animation=fadeIn"
    width="100%"
    alt="VeilAssist animated header"
  />
  <img src="./logo.png" width="112" alt="VeilAssist logo" />

  <br />

  <a href="https://git.io/typing-svg">
    <img
      src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=22&duration=2600&pause=800&color=8F7CFF&center=true&vCenter=true&width=760&lines=Listen+to+live+conversations;Understand+the+screen+in+real+time;Generate+grounded+answers+while+you+work;Local-first+memory+with+multimodal+AI"
      alt="Animated VeilAssist capabilities"
    />
  </a>

  <br />

  [![Latest release](https://img.shields.io/github/v/release/Shlok0095/VeilAssist?label=release&style=for-the-badge&color=7c6cf0)](https://github.com/Shlok0095/VeilAssist/releases/latest)
  [![Website](https://img.shields.io/badge/OPEN_WEBSITE-VeilAssist-17152b?style=for-the-badge)](https://veilassist-web.vercel.app)
  [![Windows](https://img.shields.io/badge/Windows-10%2B-0078D4?style=for-the-badge&logo=windows11&logoColor=white)](#requirements)
  [![Electron](https://img.shields.io/badge/Electron-34-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
</div>

VeilAssist is a Windows Electron assistant for live meetings. It combines live transcription, screen understanding, conversational memory, and streaming AI responses in a discreet desktop overlay.

## Highlights

- Real-time microphone and system-audio transcription
- Multimodal screen analysis with automatic provider fallback
- Streaming answers, reusable profile modes, and follow-up memory
- Local-first meeting history and semantic recall
- Capture-protected overlay and configurable global hotkeys

The desktop application lives at the repository root. The independently built product website is in `landing/`.

## Requirements

- Windows 10 or later
- Node.js 20 or later

## Development

```powershell
npm ci
npm run dev
```

The application can stay active in the system tray after its overlay closes. Use the tray menu to show or quit it, or run `npm run start:force`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Build and launch Electron with logging |
| `npm start` | Build and launch Electron |
| `npm run build` | Build all Electron renderer windows |
| `npm run test` | Run deterministic desktop tests and website type checking |
| `npm run verify` | Run all automated checks and both production builds |
| `npm run dist:dir` | Build an unpacked Windows application |
| `npm run dist:release` | Build portable and NSIS release executables |
| `npm run dev:web` | Start the website development server |
| `npm run build:web` | Build the website |

## Structure

```text
.
├─ main/                 Electron process and IPC orchestration
├─ lib/                  Desktop domain and infrastructure services
├─ renderer/             Overlay, settings, onboarding, and secondary windows
├─ scripts/              Tests, packaging, and release tools
├─ docs/user-guide/      Documentation bundled into the application
├─ legal/                Packaged legal documents
├─ landing/              Website package
└─ package.json          Desktop application and repository commands
```

See `docs/REPOSITORY_STRUCTURE.md` for ownership and packaging boundaries and `docs/LAUNCH_END_TO_END.md` for release operations.

## Release

Windows releases are built by `.github/workflows/release-windows.yml`. Keep the `package.json` version aligned with a release tag such as `v1.0.1`.

The website deploys from `landing/` through Vercel and GitHub Pages. Its download routes resolve to the rolling GitHub release assets.

## Default hotkeys

- `Ctrl+\` — toggle overlay
- `Ctrl+Enter` — ask AI
- `Ctrl+R` — clear chat
- `Ctrl+Shift+\` — toggle listening
- `Ctrl+Shift+S` — open settings
- `Ctrl+Arrow` — move overlay

Provider credentials are configured in onboarding or Settings.

<img
  src="https://capsule-render.vercel.app/api?type=waving&height=110&section=footer&color=gradient&customColorList=12,19,24"
  width="100%"
  alt=""
/>
