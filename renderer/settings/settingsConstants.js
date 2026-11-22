// Copyright (c) 2026 VeilAssist. All rights reserved.

/** Mirrors `lib/hotkeys.js` DEFAULT_HOTKEYS — used for reset + display. */
export const DEFAULT_HOTKEYS_MAP = {
  toggleOverlay: 'CommandOrControl+\\',
  hideOverlay: 'Escape',
  askAI: 'CommandOrControl+Return',
  askAINoScreen: 'CommandOrControl+Shift+Return',
  followUp: 'CommandOrControl+4',
  clearChat: 'CommandOrControl+R',
  toggleSession: 'CommandOrControl+Shift+\\',
  moveUp: 'CommandOrControl+Up',
  moveDown: 'CommandOrControl+Down',
  moveLeft: 'CommandOrControl+Left',
  moveRight: 'CommandOrControl+Right',
  scrollUp: 'CommandOrControl+Shift+Up',
  scrollDown: 'CommandOrControl+Shift+Down',
  settings: 'CommandOrControl+Shift+S',
  copyResponse: 'CommandOrControl+Shift+C',
  captureScreenshot: 'CommandOrControl+H',
  focusOverlayInput: 'CommandOrControl+Shift+T',
  toggleMousePassthrough: 'CommandOrControl+Shift+P',
}

export const HOTKEY_DEFS = [
  { action: 'toggleOverlay', label: 'Show / hide overlay' },
  { action: 'hideOverlay', label: 'Hide overlay' },
  { action: 'askAI', label: 'Ask AI with screen (vision + audio/text)' },
  { action: 'askAINoScreen', label: 'Ask AI without screen (audio/text only)' },
  { action: 'followUp', label: 'Follow up on the relevant prior turn' },
  { action: 'clearChat', label: 'Clear chat / session buffer' },
  { action: 'toggleSession', label: 'Start / stop listening session' },
  { action: 'captureScreenshot', label: 'Capture screenshot (queue)' },
  { action: 'focusOverlayInput', label: 'Focus overlay input (stealth typing)' },
  { action: 'toggleMousePassthrough', label: 'Toggle mouse passthrough' },
  { action: 'settings', label: 'Open this settings window' },
  { action: 'copyResponse', label: 'Copy last assistant reply' },
  { action: 'moveUp', label: 'Nudge overlay up' },
  { action: 'moveDown', label: 'Nudge overlay down' },
  { action: 'moveLeft', label: 'Nudge overlay left' },
  { action: 'moveRight', label: 'Nudge overlay right' },
  { action: 'scrollUp', label: 'Scroll answers up' },
  { action: 'scrollDown', label: 'Scroll answers down' },
]

export const GROQ_WHISPER = ['whisper-large-v3', 'whisper-large-v3-turbo']

export const OVERLAY_POSITION_PRESETS = ['Top-Right', 'Top-Left', 'Bottom-Right', 'Bottom-Left', 'Center-Right']

/**
 * Factory defaults for the settings that offer a per-section "Reset to default".
 * Mirrors the defaults in lib/store.js. Reset goes through the same apply* handlers
 * (and therefore the same store keys and IPC) as changing the control by hand.
 */
export const SETTINGS_DEFAULTS = {
  uiColorScheme: 'system',
  openAtLogin: false,
  transcriptDurationSeconds: 30,
  interviewCustomInstructions: '',
  answerStructure: 'star',
  responseFormat: 'bullets',
  answerLength: 'medium',
  aiResponseLanguage: '',
  overlayOpacity: 0.5,
  overlayFontSize: 'medium',
  overlayLiveTranscriptEnabled: true,
  overlayMousePassthroughEnabled: false,
  hideFromTaskbarEnabled: false,
  overlayTeleprompter: false,
  overlayFocusMode: false,
  overlayAnswerView: 'latest',
  overlayAnswerPinToTop: true,
  overlayWidth: 480,
  overlayHeight: 580,
  audioEnabled: true,
  micSensitivity: 'standard',
  meetingListenLanguage: 'en',
  sttMode: 'local',
  localSttModelPreference: 'auto',
  calendarRemindersEnabled: true,
  calendarReminderMinutes: 5,
  meetingForegroundDetectionEnabled: true,
  followUpDraftEnabled: false,
  phoneLinkEnabled: false,
  phoneLinkRemoteMicEnabled: false,
  phoneMirrorMaxSize: 1080,
  phoneMirrorIncludeInAsk: false,
  stealth_mode: false,
  doNotSaveMeetingsEnabled: false,
}

/** Real overlay opacity range; keep in step with lib/overlayOpacity.cjs. */
export const OVERLAY_OPACITY_RANGE = { min: 0.3, max: 1 }

/** Bounds shared by the overlay size inputs and the clamp in App.applyOverlaySize. */
/** minH is the shortest expanded panel the overlay will actually show (notch + gap + 220 + 8 = 280px; taller while Listening). */
export const OVERLAY_SIZE_LIMITS = { minW: 280, maxW: 860, minH: 280, maxH: 940 }
