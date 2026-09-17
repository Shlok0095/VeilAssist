// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

const { contextBridge, ipcRenderer } = require('electron')

// IPC allowlist — the renderer must never be able to invoke/send/listen on an
// arbitrary main-process channel (a single XSS in any privileged window would
// otherwise gain the full local IPC surface). These three lists are the exact
// channel names the renderer codebase calls today (renderer -> main direction
// for invoke/send, main -> renderer direction for on/removeAllListeners).
// Extend them here — deliberately, one name at a time — when new IPC is added.
const INVOKE_CHANNELS = new Set([
  'abort-ai', 'accept-mode-suggestion', 'apply-overlay-display', 'ask-ai-with-transcript',
  'branding:get', 'clipboard-write-text', 'cloud-stt:transcribe-rest', 'consent:complete', 'consent:decline',
  'debug-log:open-file', 'delete-all-data-relaunch', 'dismiss-mode-suggestion', 'export-user-data',
  'get-all-settings', 'get-app-info', 'get-chat-model-catalog', 'get-desktop-source-id', 'get-hotkeys',
  'get-intelligence-flags', 'get-provider-metadata', 'get-store', 'get-stt-policy',
  'get-stt-provider-metadata', 'get-transcription-config', 'get-window-bounds',
  'google-calendar:cancel-connect', 'google-calendar:connect', 'google-calendar:disconnect',
  'google-calendar:get-status', 'google-calendar:list-upcoming', 'help:get-doc',
  'hindsight-local:status', 'hotkeys:set-suspended', 'launcher:open-overlay', 'launcher:open-settings',
  'launcher:toggle-session', 'legal:open', 'list-remote-models', 'local-stt:feed-pcm', 'local-stt:flush',
  'local-stt:model-info', 'local-stt:prepare', 'local-stt:stop', 'local-stt:stream-start',
  'logs:open-folder', 'long-term-memory:clear', 'meeting-sessions:clear', 'meeting-sessions:delete',
  'meeting-sessions:export', 'meeting-sessions:follow-up-draft', 'meeting-sessions:get',
  'meeting-sessions:list', 'meeting-sessions:update-speakers', 'memory:search-past-meetings',
  'nvidia-nim:transcribe-wav', 'overlay:set-ignore-mouse-events', 'parse-playbook',
  'phone-link:regenerate-token', 'phone-link:status', 'phone-mirror:list-devices', 'phone-mirror:probe',
  'phone-mirror:start', 'phone-mirror:status', 'phone-mirror:stop', 'protection:get', 'protection:set',
  'quit-confirm:ready', 'resize-window', 'session-active', 'session-start-confirmed', 'session-transcript-append',
  'set-overlay-position-preset', 'set-store', 'show-open-dialog', 'skills:delete', 'skills:get',
  'skills:list', 'skills:save', 'streaming-stt:flush', 'streaming-stt:start', 'streaming-stt:stop',
  'test-api', 'update-hotkey', 'window:close', 'window:maximize-toggle', 'window:minimize',
])
const SEND_CHANNELS = new Set([
  'app-quit', 'complete-onboarding', 'local-stt:speech-ended', 'local-stt:write-chunk', 'open-settings',
  'overlay-hide', 'overlay-resize-end', 'overlay-resize-start', 'overlay:resize-live',
  'overlay:update-hit-regions', 'quit-confirm:decide', 'shadowassist-stream-ended',
  'streaming-stt:speech-ended', 'streaming-stt:write-chunk', 'ui-toggle-session',
])
const ON_CHANNELS = new Set([
  'ai-aborted', 'ai-error', 'ai-no-output', 'ai-start', 'ai-thinking', 'ai-token', 'branding-updated',
  'clear-conversation', 'context-index-update', 'context-prompt-update', 'local-stt:transcript',
  'meeting-summary-status', 'mode-suggestion', 'overlay-display-update', 'overlay-mouse-passthrough',
  'overlay-request-hit-regions', 'overlay-visibility', 'overlay:focus-input', 'prompt-audio-consent',
  'quit-confirm-payload', 'scroll', 'session-purge', 'session-status', 'settings-navigate', 'settings-toast',
  'stealth-mode-update', 'streaming-stt:transcript', 'trigger-ask-ai', 'trigger-ask-ai-no-screen',
  'trigger-follow-up', 'ui-accent-update', 'verbose-logging-changed',
])

let verboseLogging = false

function setVerboseLoggingFlag(v) {
  verboseLogging = !!v
}

ipcRenderer.invoke('get-store', 'verboseDebugLogging').then((v) => setVerboseLoggingFlag(v === true)).catch(() => {})
ipcRenderer.on('verbose-logging-changed', (_e, v) => setVerboseLoggingFlag(v))

function patchConsoleForward() {
  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }
  const forward = (level, origFn, args) => {
    origFn(...args)
    if (!verboseLogging) return
    try {
      const text = args
        .map((a) => {
          if (a instanceof Error) return a.stack || a.message
          if (typeof a === 'object') {
            try {
              return JSON.stringify(a)
            } catch {
              return String(a)
            }
          }
          return String(a)
        })
        .join(' ')
      ipcRenderer.send('debug-log:forward', level, text)
    } catch (_) {}
  }
  console.log = (...args) => forward('LOG', orig.log, args)
  console.warn = (...args) => forward('WARN', orig.warn, args)
  console.error = (...args) => forward('ERROR', orig.error, args)
}

patchConsoleForward()

contextBridge.exposeInMainWorld('shadowAPI', {
  setProtection: (enabled) => ipcRenderer.invoke('protection:set', enabled),
  getProtection: () => ipcRenderer.invoke('protection:get'),
  invoke: (channel, ...args) => {
    if (!INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Blocked IPC invoke on unlisted channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  send: (channel, ...args) => {
    if (!SEND_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked IPC send on unlisted channel: ${channel}`)
      return
    }
    ipcRenderer.send(channel, ...args)
  },
  /** Synchronous brand snapshot (sendSync) so first paint shows the custom brand. */
  getBrandingSync: () => {
    try {
      return ipcRenderer.sendSync('branding:get-sync')
    } catch (_) {
      return null
    }
  },
  on: (channel, listener) => {
    if (!ON_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked IPC listener on unlisted channel: ${channel}`)
      return () => {}
    }
    const wrapped = (_event, ...args) => listener(...args)
    ipcRenderer.on(channel, wrapped)
    return () => {
      try {
        ipcRenderer.removeListener(channel, wrapped)
      } catch (_) {}
    }
  },
  removeAllListeners: (channel) => {
    if (!ON_CHANNELS.has(channel)) return
    ipcRenderer.removeAllListeners(channel)
  },
})
