// Copyright (c) 2026 VeilAssist. All rights reserved.
// Static index behind the in-window settings search. Every `anchor` / `data-settings-anchor` in
// renderer/settings/*.jsx has exactly one entry here (scripts/test-settings-ux-contract.cjs enforces it),
// so a row that exists in the UI can always be found, opened and focused from the search box.
//
// Entry: { section, tab, label, hint, keywords?, via? }
//   section  the anchor id on the row / section / collapsible
//   tab      the tab id from SETTINGS_TABS
//   via      anchor of an enclosing collapsible that is not mounted while closed; search opens that instead
// Plain JS with explicit .js imports so Node can load it in tests.

import { HOTKEY_DEFS } from './settingsConstants.js'

/** @type {{ section: string, tab: string, label: string, hint: string, keywords?: string }[]} */
const STATIC_ENTRIES = [
  // Profile
  { tab: 'profile', section: 'modes', label: 'Modes', hint: 'Interview, Meeting or General', keywords: 'mode interview meeting general switch' },
  { tab: 'profile', section: 'mode-materials', label: 'Resumes and documents', hint: 'Upload a resume, meeting prompt or purpose documents', keywords: 'resume cv upload document purpose prompt pdf' },

  // AI Provider
  { tab: 'ai', section: 'provider', label: 'AI provider', hint: 'Choose the service that writes answers', keywords: 'openai claude anthropic groq nvidia gemini deepseek vendor llm' },
  { tab: 'ai', section: 'api-key', label: 'API key', hint: 'Save the key for your AI provider', keywords: 'secret token credential' },
  { tab: 'ai', section: 'model', label: 'Model', hint: 'Pick the chat model and sync the list', keywords: 'chat model sync vision' },
  { tab: 'ai', section: 'test-connection', label: 'Test connection', hint: 'Check that your key and model work', keywords: 'verify sync models' },
  { tab: 'ai', section: 'fallback-provider', label: 'Fallback provider', hint: 'Backup provider if the main one fails', keywords: 'backup rate limit 403 timeout' },

  // Audio
  { tab: 'audio', section: 'microphone', label: 'Microphone settings', hint: 'What Listen captures', keywords: 'mic capture audio' },
  { tab: 'audio', section: 'microphone-toggle', label: 'Microphone on or off', hint: 'Turn off to use screen questions only', keywords: 'mic mute audio listen' },
  { tab: 'audio', section: 'mic-device', label: 'Microphone device', hint: 'Choose which input Listen uses', keywords: 'input device refresh' },
  { tab: 'audio', section: 'mic-sensitivity', label: 'Mic sensitivity', hint: 'Boost quiet microphones', keywords: 'gain boost quiet volume' },
  { tab: 'audio', section: 'listen-language', label: 'Speech language', hint: 'The language you speak', keywords: 'listen language accent recognition stt' },
  { tab: 'audio', section: 'speech-recognition', label: 'Speech recognition', hint: 'Where your voice is turned into text', keywords: 'stt transcription whisper' },
  { tab: 'audio', section: 'processing', label: 'Processing: local or cloud', hint: 'Transcribe on this PC or with a cloud provider', keywords: 'local cloud on-device stt' },
  { tab: 'audio', section: 'local-model', label: 'Local speech model', hint: 'Moonshine model used on this PC', keywords: 'moonshine whisper offline' },
  { tab: 'audio', section: 'stt-provider', label: 'Speech provider', hint: 'Cloud provider for speech recognition', keywords: 'deepgram elevenlabs azure google soniox groq stt' },
  { tab: 'audio', section: 'stt-key', label: 'Speech provider API key', hint: 'Key for the cloud speech provider', keywords: 'stt secret token' },
  { tab: 'audio', section: 'stt-model', label: 'Speech model', hint: 'Model or region for the cloud provider', keywords: 'stt region azure soniox deepgram' },
  { tab: 'audio', section: 'backup-keys', label: 'Backup provider keys', hint: 'Keys for providers you are not using now', keywords: 'stt keys deepgram elevenlabs azure soniox' },

  // General
  { tab: 'display', section: 'theme', label: 'Theme', hint: 'Match Windows, or force light or dark', keywords: 'appearance dark light mode color' },
  { tab: 'display', section: 'open-at-login', label: 'Open at login', hint: 'Start in the tray when you sign in', keywords: 'startup boot autostart' },
  { tab: 'display', section: 'answers', label: 'Answer settings', hint: 'How Ask AI writes what you say next', keywords: 'answers writing' },
  { tab: 'display', section: 'conversation-memory', label: 'Conversation memory', hint: 'How much of the conversation the AI remembers', keywords: 'context window transcript history 30s 1m' },
  { tab: 'display', section: 'custom-instructions', label: 'Custom instructions', hint: 'Extra guidance appended to every answer', keywords: 'prompt style tone filler' },
  { tab: 'display', section: 'answer-structure', label: 'Answer structure', hint: 'STAR, CAR, SOAR and other frameworks', keywords: 'star car soar par behavioral' },
  { tab: 'display', section: 'response-format', label: 'Response format', hint: 'Bullets, conversational or example-driven', keywords: 'bullets spoken style' },
  { tab: 'display', section: 'answer-length', label: 'Answer length', hint: 'Short, medium or long answers', keywords: 'tokens verbose brief' },
  { tab: 'display', section: 'response-language', label: 'AI response language', hint: 'The language answers are written in', keywords: 'translate hindi spanish language output' },

  // Overlay
  { tab: 'overlay', section: 'opacity', label: 'Window opacity', hint: 'How see-through the overlay is', keywords: 'transparency transparent subtle clear' },
  { tab: 'overlay', section: 'font-size', label: 'Font size', hint: 'Size of answer and question text', keywords: 'text small large standard' },
  { tab: 'overlay', section: 'show-transcript', label: 'Show transcript', hint: 'Live captions in the overlay', keywords: 'captions live transcript' },
  { tab: 'overlay', section: 'teleprompter', label: 'Teleprompter', hint: 'Larger type, minimal chrome', keywords: 'reading mode' },
  { tab: 'overlay', section: 'focus-mode', label: 'Focus mode', hint: 'Hide the input for more answer space', keywords: 'reading mode input' },
  { tab: 'overlay', section: 'answer-history', label: 'Answer history', hint: 'Latest answer only, or keep earlier replies', keywords: 'latest full history' },
  { tab: 'overlay', section: 'pin-answers', label: 'Pin answers to top', hint: 'Keep the newest answer at the top while streaming', keywords: 'scroll stream' },
  { tab: 'overlay', section: 'mouse-passthrough', label: 'Mouse passthrough', hint: 'Clicks pass through the overlay', keywords: 'click through' },
  { tab: 'overlay', section: 'hide-from-taskbar', label: 'Hide from taskbar', hint: 'Keep the app off the Windows taskbar', keywords: 'stealth taskbar icon' },
  { tab: 'overlay', section: 'panel-size', label: 'Panel size', hint: 'Width and height of the expanded overlay', keywords: 'width height resize dimensions' },
  { tab: 'overlay', section: 'move-overlay', label: 'Move overlay to', hint: 'Snap the overlay to a screen corner', keywords: 'position snap corner top right left bottom center' },

  // Shortcuts (one entry per action is added below)
  { tab: 'keybinds', section: 'shortcuts', label: 'Keyboard shortcuts', hint: 'Change a shortcut, or reset them all to default', keywords: 'hotkeys keybinds keys restore reset defaults' },

  // Meetings
  { tab: 'meetings', section: 'calendar', label: 'Google Calendar', hint: 'Upcoming meetings and reminders', keywords: 'gcal connect disconnect' },
  { tab: 'meetings', section: 'calendar-account', label: 'Google account', hint: 'Connect, refresh or disconnect', keywords: 'sign in google calendar connect' },
  { tab: 'meetings', section: 'calendar-developer-setup', label: 'Google OAuth credentials', hint: 'Developer setup for builds without bundled credentials', keywords: 'oauth client id secret developer' },
  { tab: 'meetings', section: 'reminders', label: 'Start-time reminders', hint: 'Notify before accepted meetings start', keywords: 'notification calendar' },
  { tab: 'meetings', section: 'reminder-time', label: 'Reminder time', hint: 'How early the reminder appears', keywords: 'minutes before' },
  { tab: 'meetings', section: 'meeting-detection', label: 'Meeting app detection', hint: 'Toast when Zoom, Teams, Meet or Webex is active', keywords: 'zoom teams meet webex toast' },
  { tab: 'meetings', section: 'follow-up-drafts', label: 'Smart follow-up drafts', hint: 'AI follow-up email from session decisions', keywords: 'email summary action items' },
  { tab: 'meetings', section: 'upcoming-meetings', label: 'Upcoming meetings', hint: 'Your next accepted calendar events', keywords: 'schedule events join link' },
  { tab: 'meetings', section: 'upcoming-day', label: 'Upcoming meetings day', hint: 'Choose which day to list', keywords: 'date calendar picker' },
  { tab: 'meetings', section: 'session-recaps', label: 'Session recaps', hint: 'Saved notes from past sessions', keywords: 'recap summary export delete notes' },

  // Phone
  { tab: 'phone', section: 'phone-link', label: 'Phone Link', hint: 'Pair a phone over Wi-Fi with a QR code', keywords: 'mobile pair qr wifi' },
  { tab: 'phone', section: 'phone-link-toggle', label: 'Phone Link on or off', hint: 'Let a phone connect to this PC', keywords: 'mobile' },
  { tab: 'phone', section: 'remote-mic', label: 'Remote mic', hint: "Use the phone's microphone while linked", keywords: 'phone microphone audio' },
  { tab: 'phone', section: 'pairing-qr', label: 'Pairing QR code', hint: 'Scan with the phone to link it', keywords: 'qr scan token' },
  { tab: 'phone', section: 'phone-server', label: 'Phone Link server', hint: 'Port and connected phones', keywords: 'status firewall port running' },
  { tab: 'phone', section: 'android-mirror', label: 'Android mirror', hint: 'Mirror an Android phone over USB with scrcpy', keywords: 'scrcpy adb usb screen mirror' },
  { tab: 'phone', section: 'mirror-tools', label: 'adb and scrcpy tools', hint: 'Check the required tools are installed', keywords: 'android mirror adb scrcpy path', via: 'android-mirror' },
  { tab: 'phone', section: 'mirror-device', label: 'Android device', hint: 'Pick which phone to mirror', keywords: 'android mirror usb debugging', via: 'android-mirror' },
  { tab: 'phone', section: 'mirror-max-size', label: 'Mirror max width', hint: 'Largest mirror dimension in pixels', keywords: 'android mirror scrcpy size resolution', via: 'android-mirror' },
  { tab: 'phone', section: 'mirror-include-in-ask', label: 'Include phone in Ask', hint: 'Attach the phone screen to Ask', keywords: 'android mirror screenshot', via: 'android-mirror' },
  { tab: 'phone', section: 'mirror-window', label: 'Mirror window', hint: 'Start or stop the scrcpy window', keywords: 'android mirror start stop', via: 'android-mirror' },

  // Privacy
  { tab: 'privacy', section: 'hide-from-capture', label: 'Hide from screen capture', hint: 'Harder to capture in shares and recordings', keywords: 'stealth invisible content protection undetectable' },
  { tab: 'privacy', section: 'do-not-save-meetings', label: "Don't save meeting recaps", hint: 'Stop Listen will not write a recap', keywords: 'recap history privacy' },
  { tab: 'privacy', section: 'your-data', label: 'Your data', hint: 'Export or delete local data', keywords: 'gdpr local storage' },
  { tab: 'privacy', section: 'export-data', label: 'Export my data', hint: 'Save profile text and preferences to a file', keywords: 'download backup json' },
  { tab: 'privacy', section: 'delete-data', label: 'Delete all my data', hint: 'Erase everything stored on this device', keywords: 'wipe remove reset erase' },

  // Help
  { tab: 'help', section: 'faq', label: 'FAQ', hint: 'Common questions', keywords: 'questions answers help' },
  { tab: 'help', section: 'guide', label: 'Full guide', hint: 'The complete user guide', keywords: 'documentation manual docs' },
  { tab: 'help', section: 'support', label: 'Support', hint: 'Fixes and where to get help', keywords: 'problem bug contact troubleshooting' },
  { tab: 'help', section: 'app-version', label: 'App version', hint: 'Include this when you contact support', keywords: 'version build number' },
]

const HOTKEY_ENTRIES = HOTKEY_DEFS.map((d) => ({
  tab: 'keybinds',
  section: `hotkey-${d.action}`,
  label: d.label,
  hint: 'Keyboard shortcut',
  keywords: 'shortcut hotkey keybind keys',
}))

export const SETTINGS_REGISTRY = [...STATIC_ENTRIES, ...HOTKEY_ENTRIES]

function norm(text) {
  return String(text || '').toLowerCase()
}

/**
 * Rank registry entries for a query. Every query word must appear somewhere in the entry
 * (label, hint, keywords, tab name). Label hits rank above hint hits; word-start hits above substrings.
 * @param {string} query
 * @param {{ tabLabels?: Record<string, string>, limit?: number, registry?: typeof SETTINGS_REGISTRY }} [opts]
 */
export function searchSettings(query, opts = {}) {
  const { tabLabels = {}, limit = 8, registry = SETTINGS_REGISTRY } = opts
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const scored = []
  for (const entry of registry) {
    const label = norm(entry.label)
    const hint = norm(entry.hint)
    const keywords = norm(entry.keywords)
    const tabName = norm(tabLabels[entry.tab] || entry.tab)
    let score = 0
    let all = true
    for (const w of words) {
      let s = 0
      if (label.startsWith(w)) s = 100
      else if (label.includes(` ${w}`)) s = 80
      else if (label.includes(w)) s = 60
      else if (keywords.includes(w) || hint.includes(w)) s = 30
      else if (tabName.includes(w)) s = 10
      if (!s) {
        all = false
        break
      }
      score += s
    }
    if (all) scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
  return scored.slice(0, limit).map((x) => x.entry)
}
