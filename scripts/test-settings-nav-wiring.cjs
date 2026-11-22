#!/usr/bin/env node
/**
 * Settings nav + panel wiring after the Stage 3 IA change:
 *   Setup: Profile, AI Provider, Audio | Preferences: General, Overlay, Shortcuts |
 *   Meetings & devices: Meetings, Phone | Privacy & data: Privacy | Support: Help, About
 * (the Advance accordion was promoted to real tabs; legacy ids and `section` deep links still resolve).
 * Usage: node scripts/test-settings-nav-wiring.cjs
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

const results = []
function pass(name, detail = '') {
  results.push({ ok: true, name, detail })
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  results.push({ ok: false, name, detail })
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('\n── Settings nav wiring ──\n')

const navSrc = read('renderer/settings/settingsNav.jsx')
// Tab ids, groups, legacy ids and deep-link resolution live in one pure module that the nav re-exports.
const tabsSrc = read('renderer/settings/settingsTabs.js')
const tabSrc = read('renderer/settings/SettingsTabContent.jsx')
const profileSrc = read('renderer/settings/ProfileSettingsPanel.jsx')
const displaySrc = read('renderer/settings/DisplaySettingsPanel.jsx')
const overlaySrc = read('renderer/settings/OverlaySettingsPanel.jsx')
const aiSrc = read('renderer/settings/AiProviderPanel.jsx')
const meetingsSrc = read('renderer/settings/MeetingsSettingsPanel.jsx')
const appSrc = read('renderer/settings/App.jsx')

const tabIds = [...tabsSrc.matchAll(/id: '([^']+)'/g)].map((m) => m[1])
const expectedTabs = ['profile', 'ai', 'audio', 'display', 'overlay', 'keybinds', 'meetings', 'phone', 'privacy', 'help', 'about']
if (JSON.stringify(tabIds) === JSON.stringify(expectedTabs)) {
  pass('SETTINGS_TABS order', tabIds.join(', '))
} else {
  fail('SETTINGS_TABS order', `got ${tabIds.join(', ')}`)
}

const groups = [...tabsSrc.matchAll(/group: '([^']+)'/g)].map((m) => m[1])
const expectedGroups = ['Setup', 'Setup', 'Setup', 'Preferences', 'Preferences', 'Preferences', 'Meetings & devices', 'Meetings & devices', 'Privacy & data', 'Support', 'Support']
if (JSON.stringify(groups) === JSON.stringify(expectedGroups)) {
  pass('nav groups', [...new Set(groups)].join(' | '))
} else {
  fail('nav groups', `got ${groups.join(', ')}`)
}

const profileIdx = tabIds.indexOf('profile')
if (profileIdx >= 0 && tabIds[profileIdx + 1] === 'ai' && tabIds[profileIdx + 2] === 'audio') {
  pass('AI Provider and Audio follow Profile (Setup)')
} else {
  fail('AI Provider and Audio should follow Profile')
}
if (tabIds.indexOf('display') === tabIds.indexOf('audio') + 1 && tabIds.indexOf('overlay') === tabIds.indexOf('display') + 1) {
  pass('General then Overlay open the Preferences group')
} else {
  fail('General then Overlay should open Preferences')
}

for (const label of ['Profile', 'AI Provider', 'Audio', 'General', 'Overlay', 'Shortcuts', 'Meetings', 'Phone', 'Privacy', 'Help', 'About']) {
  if (tabsSrc.includes(`label: '${label}'`)) pass(`nav label: ${label}`)
  else fail(`nav label missing: ${label}`)
}

if (!tabsSrc.includes("label: 'Calendar'") && !tabsSrc.includes("label: 'AI Providers'") && !tabsSrc.includes("label: 'Advance'")) {
  pass('no top-level Calendar, AI Providers or Advance tabs')
} else {
  fail('old top-level tabs still in nav')
}

if (tabsSrc.includes('LEGACY_PROFILE_TAB_IDS') && tabsSrc.includes('LEGACY_ADVANCE_TAB_IDS') && navSrc.includes("from './settingsTabs.js'")) {
  pass('legacy tab id sets for profile and advance')
} else {
  fail('legacy tab id sets missing')
}

if (tabsSrc.includes("if (id === 'profile'") && tabsSrc.includes("LEGACY_PROFILE_TAB_IDS.has(id)) return 'profile'")) {
  pass('skills legacy id maps to profile tab')
} else {
  fail('skills legacy mapping')
}

if (
  tabsSrc.includes("if (id === 'advance') return ADVANCE_SECTION_TABS[") &&
  /ADVANCE_SECTION_TABS = \{[^}]*speech: 'audio'[^}]*phone: 'phone'[^}]*overlay: 'overlay'/s.test(tabsSrc)
) {
  pass('legacy advance + section deep links map to the new tabs')
} else {
  fail('advance legacy mapping')
}

const routes = [
  ['profile', 'ProfileSettingsPanel'],
  ['ai', 'AiProviderPanel'],
  ['audio', 'SpeechSettingsPanel'],
  ['display', 'DisplaySettingsPanel'],
  ['overlay', 'OverlaySettingsPanel'],
  ['keybinds', 'KeybindsSettingsPanel'],
  ['meetings', 'MeetingsSettingsPanel'],
  ['phone', 'PhoneLinkSettingsPanel'],
  ['privacy', 'PrivacySettingsPanel'],
  ['help', 'HelpSettingsPanel'],
  ['about', 'AboutSettingsPanel'],
]
for (const [id, component] of routes) {
  if (tabSrc.includes(`activeTab === '${id}'`) && tabSrc.includes(component)) pass(`SettingsTabContent routes ${id} → ${component}`)
  else fail(`SettingsTabContent route ${id} → ${component}`)
}

if (!tabSrc.includes('AdvanceSettingsPanel') && !tabSrc.includes("activeTab === 'advance'")) {
  pass('SettingsTabContent no longer mounts the Advance accordion')
} else {
  fail('SettingsTabContent still mounts Advance')
}

if (profileSrc.includes('InterviewResumesSection') && profileSrc.includes('mode-interview') && !profileSrc.includes('SkillsSettingsPanel')) {
  pass('Profile tab contains modes and interview resumes')
} else {
  fail('Profile tab missing interview resumes, or still mounts the skills panel')
}

if (!tabSrc.includes('ProfileModesPanel') && !tabSrc.includes('SkillsSettingsPanel') && !tabSrc.includes('IntelligenceSettingsPanel')) {
  pass('tab router does not include profile internals, skills or Intelligence')
} else {
  fail('tab router contains profile/skills/Intelligence')
}

if (displaySrc.includes('Conversation Memory') && displaySrc.includes('ariaLabel="Conversation Memory"')) {
  pass('General has Conversation Memory')
} else {
  fail('General missing Conversation Memory')
}

if (!displaySrc.includes('title="Advanced"')) {
  pass('General has no legacy top-level "Advanced" section')
} else {
  fail('General still has a legacy top-level "Advanced" section')
}

if (
  !/Diagnostics|[Vv]erbose debug logging|onOpenLogFile|verboseDebugLogging/.test(displaySrc) &&
  !/debug-log:open-file|logs:open-folder|Open log (file|folder)/.test(read('renderer/settings/HelpSettingsPanel.jsx'))
) {
  pass('no debug-log controls are exposed to end users (General has no Diagnostics, Help has no log buttons)')
} else {
  fail('debug-log controls leaked into the end-user settings UI')
}

{
  const debugLogSrc = read('lib/debugLog.js')
  if (
    /function isDebugLoggingAllowed/.test(debugLogSrc) &&
    /enabled = !!on && isDebugLoggingAllowed\(\)/.test(debugLogSrc) &&
    /isDebugLoggingAllowed\(\)\) return \{ ok: false/.test(read('main/index.js'))
  ) {
    pass('release builds can never write or open the debug log (gated in debugLog.js and the IPC handlers)')
  } else {
    fail('debug logging is not gated to unpackaged builds')
  }
}

const cssSrc = read('renderer/settings/index.css')
if (cssSrc.includes('.settings-scroll-outer') && cssSrc.includes('overflow-y: auto') && cssSrc.includes('min-height: 0')) {
  pass('main scroll region has constrained flex scroll styles')
} else {
  fail('main scroll region missing flex scroll styles')
}

if (
  displaySrc.includes('title="Answers"') &&
  displaySrc.includes('Answer structure') &&
  displaySrc.includes('CheckmarkSelect') &&
  displaySrc.includes('title="App"') &&
  displaySrc.includes('label="Theme"') &&
  !displaySrc.includes('Overlay look') &&
  !displaySrc.includes('Window opacity')
) {
  pass('General has App / Answers with checkmark dropdowns, and no overlay look block')
} else {
  fail('General layout: expected App + Answers only (overlay look moved to Overlay)')
}

if (
  overlaySrc.includes('title="Appearance"') &&
  overlaySrc.includes('label="Window opacity"') &&
  overlaySrc.includes('label="Font size"') &&
  overlaySrc.includes('title="Reading"') &&
  overlaySrc.includes('title="Size and position"') &&
  overlaySrc.includes('label="Move overlay to"')
) {
  pass('Overlay tab holds appearance, reading modes, size and position (one home for overlay settings)')
} else {
  fail('Overlay tab missing appearance / reading / size sections')
}

if (!aiSrc.includes('Interview answers')) {
  pass('AI Provider panel no longer owns interview answers')
} else {
  fail('AI Providers still has Interview answers section')
}

if (meetingsSrc.includes('title="Meetings"')) {
  pass('Meetings panel titled Meetings')
} else {
  fail('Meetings panel title not updated')
}

if (appSrc.includes('parseSettingsQuery') && appSrc.includes('normalizeSettingsTabId')) {
  pass('App parses URL tab query and normalizes tab ids')
} else {
  fail('App tab default/normalize')
}

if (appSrc.includes("setActiveTab('ai')") && !appSrc.includes("setActiveTab('advance')")) {
  pass('first-run opens the AI Provider tab (API setup)')
} else {
  fail('first-run should open AI Provider')
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)
