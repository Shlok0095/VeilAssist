// Copyright (c) 2026 VeilAssist. All rights reserved.
// UI contract for the polish pass: things that were visibly broken with realistic data or for assistive tech.
//   - an expanded session recap must stack under its header (the row layout put the summary BESIDE it)
//   - toggles / radios / selected rows keep their on/selected state in Windows High Contrast (forced colors)
//   - Global Chat and the Launcher follow the app theme, have landmarks, and announce answers
//   - no `rgba(var(--accent-rgb), a)` (space-separated channels need `rgb(var(--accent-rgb) / a)`)
//   - the overlay's error text uses a red that is readable on the dark panel
//
//   node --test scripts/test-ui-polish-contract.cjs

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const settingsCss = read('renderer', 'settings', 'index.css')
const overlayCss = read('renderer', 'overlay', 'index.css')
const meetings = read('renderer', 'settings', 'MeetingsSettingsPanel.jsx')
const details = read('renderer', 'settings', 'MeetingDetailsModal.jsx')
const nav = read('renderer', 'settings', 'settingsNav.jsx')
const chat = read('renderer', 'global-chat', 'App.jsx')
const launcher = read('renderer', 'launcher', 'App.jsx')
const main = read('main', 'index.js')

function forcedColorsBlock(css) {
  const start = css.indexOf('@media (forced-colors: active)')
  assert.ok(start >= 0, 'settings CSS has a forced-colors block')
  return css.slice(start)
}

test('an expanded recap stacks under its header instead of sitting beside it', () => {
  assert.match(meetings, /<li key=\{s\.id\} className="settings-row-tile settings-row-tile-stack">/)
  assert.match(settingsCss, /\.settings-row-tile\.settings-row-tile-stack \{\s*display: block;\s*padding: 0;/)
  // The tile used to clip its own focus ring; nothing may re-add overflow-hidden on it.
  assert.doesNotMatch(meetings, /settings-row-tile[^"]*overflow-hidden/)
})

test('scrolling boxes can be reached and named from the keyboard', () => {
  assert.match(meetings, /role="region"[\s\S]{0,120}aria-label=\{`Summary of /)
  assert.match(meetings, /tabIndex=\{0\}/)
  assert.match(details, /role="region"\s+aria-label="Transcript"\s+tabIndex=\{0\}/)
})

test('recap controls are real 24px targets with distinguishable names', () => {
  assert.ok((meetings.match(/inline-flex min-h-\[24px\] items-center/g) || []).length >= 4, 'join link + three recap actions')
  assert.match(meetings, /aria-label=\{`Join link for \$\{m\.title\}`\}/)
})

test('forced colors: toggle on/off, radio dot, selected row/card and current nav page stay visible', () => {
  const fc = forcedColorsBlock(settingsCss)
  assert.match(fc, /\.nat-toggle\[aria-checked='true'\] \{\s*background: Highlight;/)
  assert.match(fc, /\.nat-toggle \.nat-toggle-knob \{\s*background: ButtonText;/)
  assert.match(fc, /\.select-row-radio::before \{\s*background: CanvasText;/)
  assert.match(fc, /\.select-row-selected,\s*\.mode-card-active \{\s*outline: 2px solid Highlight;/)
  assert.match(fc, /\.settings-nav-btn-active[\s\S]{0,200}background: Highlight;\s*color: HighlightText;/)
})

test('Settings has one h1 (the nav title) above the page h2', () => {
  assert.match(nav, /<h1 className="settings-nav-title">Settings<\/h1>/)
  assert.match(settingsCss, /\.settings-nav-title \{\s*margin: 0;/)
})

test('Global Chat and Launcher: main passes the theme, windows follow it, landmarks exist', () => {
  assert.match(main, /const chatTheme = resolveUiColorScheme\(\)/)
  assert.match(main, /globalChatWindow\.loadFile\(getGlobalChatHtmlPath\(\), \{ search: `\?theme=\$\{chatTheme\}` \}\)/)
  assert.match(main, /const launcherTheme = resolveUiColorScheme\(\)/)
  assert.match(main, /launcherWindow\.loadFile\(getLauncherHtmlPath\(\), \{ search: `\?theme=\$\{launcherTheme\}` \}\)/)
  for (const file of ['global-chat', 'launcher']) {
    const entry = read('renderer', file, 'main.jsx')
    assert.match(entry, /applyColorScheme\(new URLSearchParams\(window\.location\.search\)\.get\('theme'\)\)/, `${file} applies ?theme=`)
  }
  assert.match(chat, /:root\[data-color-scheme='light'\]/)
  assert.match(launcher, /:root\[data-color-scheme='light'\]/)
  assert.match(chat, /<main className="gc-main">[\s\S]*<\/main>/)
  assert.match(launcher, /<main className="launcher-main">[\s\S]*<\/main>/)
  assert.match(launcher, /<h1 className="launcher-brand">/)
})

test('Global Chat announces finished answers (not every streamed token) and labels its input', () => {
  assert.match(chat, /role="log"\s+aria-live="polite"\s+aria-label="Conversation"/)
  assert.match(chat, /className="gc-msg-text whitespace-pre-wrap"\s+aria-hidden="true"/)
  assert.match(chat, /aria-label="Your question"/)
  assert.match(chat, /className="gc-thinking" role="status"/)
})

test('Global Chat send button keeps readable text on the light IM accent', () => {
  const send = chat.slice(chat.indexOf('.gc-send {'), chat.indexOf('.gc-send:disabled'))
  assert.match(send, /background: rgb\(var\(--accent-rgb\)\);/)
  assert.match(send, /color: #0a0a0b;/)
})

test('no renderer CSS uses the invalid comma form with space-separated accent channels', () => {
  const offenders = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(jsx|js|css)$/.test(e.name) && /rgba\(var\(--accent[a-z-]*-rgb\),/.test(fs.readFileSync(p, 'utf8'))) offenders.push(path.relative(ROOT, p))
    }
  }
  walk(path.join(ROOT, 'renderer'))
  assert.deepEqual(offenders, [])
})

test('overlay error text uses the readable red token, not the dark fill red', () => {
  assert.match(overlayCss, /--danger-text-rgb: 248 113 113;/)
  assert.match(overlayCss, /\.crystal-error-text \{\s*color: rgb\(var\(--danger-text-rgb\)\);/)
  assert.match(overlayCss, /\.crystal-error-retry-btn \{[\s\S]{0,400}color: rgb\(var\(--danger-text-rgb\)\);/)
})
