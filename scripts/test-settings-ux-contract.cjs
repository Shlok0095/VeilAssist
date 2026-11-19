#!/usr/bin/env node
/**
 * Settings window UX contract (Stage 3 of docs/PERFORMANCE_AND_UX_PLAN.md).
 *
 * Source-contract style like the rest of scripts/: read renderer/settings/** and assert the guarantees the
 * redesign introduced, plus behaviour checks for the pure modules (hotkey validation, search, tab ids,
 * save tracker, contrast math). No Electron, no network.
 *
 * Usage: node scripts/test-settings-ux-contract.cjs
 */
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const root = path.join(__dirname, '..')
const settingsDir = path.join(root, 'renderer', 'settings')

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n')
}
const S = (name) => read(`renderer/settings/${name}`)
const esm = (name) => import(pathToFileURL(path.join(settingsDir, name)).href)

let failed = 0
let passed = 0
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Source of a function/const body starting at `start`, up to the matching closing brace.
 * Skips the parameter list first, so destructured params like `({ a, b }) {` do not confuse it.
 */
function bodyFrom(src, start) {
  let from = start
  const paren = src.indexOf('(', start)
  const brace = src.indexOf('{', start)
  if (paren >= 0 && (brace < 0 || paren < brace)) {
    let depth = 0
    for (let i = paren; i < src.length; i += 1) {
      if (src[i] === '(') depth += 1
      else if (src[i] === ')') {
        depth -= 1
        if (depth === 0) {
          from = i + 1
          break
        }
      }
    }
  }
  const open = src.indexOf('{', from)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return src.slice(open)
}

/** Opening tags of `<Name ...>` in JSX source (brace/quote aware so `=>` inside props is fine). */
function openingTags(src, name) {
  const tags = []
  let from = 0
  const needle = `<${name}`
  while (true) {
    const at = src.indexOf(needle, from)
    if (at < 0) break
    const next = src[at + needle.length]
    if (next && /[\w.]/.test(next)) {
      from = at + needle.length
      continue
    }
    let i = at + needle.length
    let depth = 0
    let quote = ''
    for (; i < src.length; i += 1) {
      const c = src[i]
      if (quote) {
        if (c === quote && src[i - 1] !== '\\') quote = ''
        continue
      }
      if (c === '"' || c === "'" || c === '`') quote = c
      else if (c === '{') depth += 1
      else if (c === '}') depth -= 1
      else if (c === '>' && depth === 0) break
    }
    tags.push(src.slice(at, i + 1))
    from = i + 1
  }
  return tags
}

/** Strip // and /* *​/ comments so copy checks only see what can reach the screen. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

// WCAG contrast
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
function token(block, name) {
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`))
  return m ? m[1] : null
}

async function main() {
  console.log('\n── Settings UX contract ──\n')

  const panelFiles = fs
    .readdirSync(settingsDir)
    .filter((f) => f.endsWith('.jsx'))
  const allSource = Object.fromEntries(panelFiles.map((f) => [f, S(f)]))

  // ── 1. Panels are only mounted while their tab is open (S1 / B1) ───────────────────────────────
  {
    const tabs = S('SettingsTabContent.jsx')
    const ids = ['profile', 'ai', 'audio', 'display', 'overlay', 'keybinds', 'meetings', 'phone', 'privacy', 'help', 'about']
    check('tab router mounts each panel only inside its own activeTab branch', ids.every((id) => tabs.includes(`activeTab === '${id}'`)))
    const components = ['AiProviderPanel', 'SpeechSettingsPanel', 'PhoneLinkSettingsPanel', 'OverlaySettingsPanel']
    check(
      'router has no always-mounted panel (every <Panel is inside an if branch)',
      components.every((c) => (tabs.match(new RegExp(`<${c}\\b`, 'g')) || []).length === 1),
    )
    const speech = S('SpeechSettingsPanel.jsx')
    const calls = speech.match(/getUserMedia\(/g) || []
    const revealAt = speech.indexOf('const revealDeviceNames')
    const reveal = speech.slice(revealAt, speech.indexOf('}, [refreshAudioDevices])', revealAt))
    check('Audio tab never opens the microphone on mount (getUserMedia only in the user-initiated reveal)', calls.length === 1 && reveal.includes('getUserMedia('))
    check('Audio tab lists devices without a permission prompt (enumerateDevices on mount)', /enumerateDevices\(\)/.test(speech))
    const phone = S('PhoneLinkSettingsPanel.jsx')
    const mirrorBody = bodyFrom(phone, phone.indexOf('function AndroidMirrorBody'))
    check('adb/scrcpy probe lives in the Android mirror body, not the always-on Phone panel', mirrorBody.includes("'phone-mirror:probe'") && phone.split("'phone-mirror:probe'").length === 2)
    check('Android mirror collapsible unmounts its body while closed', /title="Android mirror"[\s\S]{0,260}unmountWhenClosed/.test(phone))
    check('phone status polling pauses while the window is hidden', /document\.hidden/.test(phone) && /visibilitychange/.test(phone))
    const comps = S('SettingsComponents.jsx')
    check('SettingsCollapsible supports unmountWhenClosed', /unmountWhenClosed = false/.test(comps) && /unmountWhenClosed && !bodyOpen \? null : children/.test(comps))
    check('Audio "Backup provider keys" collapsible unmounts while closed', /title="Backup provider keys"[\s\S]{0,300}unmountWhenClosed/.test(speech))
  }

  // ── 2. Drafts: no per-keystroke / per-tick store writes (S4 / B2) ──────────────────────────────
  {
    const draft = S('useDraftSetting.js')
    check('useDraftSetting commits on blur, Enter, debounce and unmount/pagehide', /onBlur: flush/.test(draft) && /e\.key === 'Enter'/.test(draft) && /setTimeout/.test(draft) && /pagehide/.test(draft))
    check('useCommitOnRelease commits on pointer-up / key-up / blur', /onPointerUp: draft\.flush/.test(draft) && /onKeyUp: draft\.flush/.test(draft))
    const resumes = S('InterviewResumesSection.jsx')
    const field = bodyFrom(resumes, resumes.indexOf('function Field('))
    check('resume editor Field uses a draft (no onChange straight to the store)', field.includes('useDraftSetting') && !/onChange=\{\(event\) => onChange\(event\.target\.value\)\}/.test(field))
    const overlay = S('OverlaySettingsPanel.jsx')
    check('opacity slider previews locally and commits on release', overlay.includes('useCommitOnRelease') && !/type="range"[\s\S]{0,300}onChange=\{\(e\) => onChange/.test(overlay))
    const phone = S('PhoneLinkSettingsPanel.jsx')
    check('phone max-size uses a draft that clamps on commit (not per keystroke)', /useDraftSetting\([\s\S]{0,120}phoneMirrorMaxSize/.test(phone) && /delay: 0/.test(phone) && !/onChange=\{\(e\) => onPhoneMirrorMaxSizeChange/.test(phone))
    const speech = S('SpeechSettingsPanel.jsx')
    check('Azure region / Soniox model inputs use DraftTextInput', (speech.match(/<DraftTextInput/g) || []).length >= 5 && !/onChange=\{\(e\) => \{\s*onPatchSnap\('azureSpeechRegion'/.test(speech))
    const comps = S('SettingsComponents.jsx')
    check('DraftTextInput is built on useDraftSetting', /export function DraftTextInput[\s\S]{0,400}useDraftSetting\(/.test(comps))
  }

  // ── 3. Shortcut validation helper (S5 / B3) ─────────────────────────────────────────────────────
  {
    const hk = await esm('hotkeyUtils.js')
    const consts = await esm('settingsConstants.js')
    const map = { ...consts.DEFAULT_HOTKEYS_MAP }
    const ctx = { defs: consts.HOTKEY_DEFS, defaults: consts.DEFAULT_HOTKEYS_MAP }
    const v = (acc, action = 'askAI') => hk.validateAccelerator(acc, action, map, ctx)

    check('unmodified key is rejected', v('K').ok === false && v('K').code === 'unmodified')
    check('function key alone is allowed', v('F9').ok === true)
    check('Ctrl+C is rejected as reserved', v('CommandOrControl+C').code === 'reserved')
    check('Alt+F4 is rejected as reserved', v('Alt+F4').code === 'reserved')
    const dup = v(map.toggleOverlay, 'askAI')
    check('duplicate of another action is rejected and names it', dup.code === 'duplicate' && dup.conflictAction === 'toggleOverlay' && /Show \/ hide overlay/.test(dup.message))
    check('aliases compare equal (CmdOrCtrl+Enter == CommandOrControl+Return)', hk.normalizeAccelerator('CmdOrCtrl+Enter') === hk.normalizeAccelerator('CommandOrControl+Return'))
    check('modifier order does not matter for duplicates', hk.normalizeAccelerator('Shift+Control+K') === hk.normalizeAccelerator('CommandOrControl+Shift+K'))
    check('rebinding an action to its own current value is not a duplicate', v(map.askAI, 'askAI').ok === true)
    check('a free, modified combination is accepted', v('CommandOrControl+Alt+J').ok === true)
    check('shipped default bare Escape stays valid for hideOverlay only', v('Escape', 'hideOverlay').ok === true && v('Escape', 'askAI').ok === false)
    check('empty accelerator is rejected', v('').code === 'empty')

    check('Windows labels are text, not Mac glyphs', hk.displayKeyLabel('CommandOrControl', false) === 'Ctrl' && hk.displayKeyLabel('Shift', false) === 'Shift' && hk.displayKeyLabel('Alt', false) === 'Alt')
    check('Mac keeps its glyphs', hk.displayKeyLabel('CommandOrControl', true) === '⌘')
    check('spoken form reads naturally', hk.describeAccelerator('CommandOrControl+Shift+Return', false) === 'Ctrl + Shift + Enter')
    check('inline form for copy', hk.inlineAccelerator('CommandOrControl+Return', false) === 'Ctrl+Enter')
    check('"Hide overlay" label has no hard-coded key name', consts.HOTKEY_DEFS.find((d) => d.action === 'hideOverlay').label === 'Hide overlay')

    const keys = S('KeybindsSettingsPanel.jsx')
    check('Shortcuts panel validates before committing and shows the message inline', /validateAccelerator\(/.test(keys) && /if \(!check\.ok\) \{\s*setError\(check\.message\)\s*return\s*\}/.test(keys))
    check('Shortcuts panel wires the per-row reset (onResetOne) and labels each combo with its action', /onResetOne/.test(keys) && /label=\{label\}/.test(keys) && /aria-label=\{[\s\S]{0,200}\$\{label\}/.test(keys))
    check('Shortcuts panel shows registration failures reported by hotkeys:status', /hotkeyFailures/.test(keys))
    check('Shortcuts panel no longer renders Mac glyph literals', !/['"]⌘['"]|['"]⇧['"]|['"]⌥['"]/.test(keys))
    const app = S('App.jsx')
    const commit = bodyFrom(app, app.indexOf('const commitHotkey'))
    check('commitHotkey uses the IPC result, verifies registration and restores the previous shortcut on refusal', /hotkeys:status/.test(app) && /const applied = await ipc\.invoke\('update-hotkey'/.test(commit) && /update-hotkey', action, previous/.test(commit))
    const resetAll = bodyFrom(app, app.indexOf('const resetAllHotkeys'))
    check('resetAllHotkeys is wrapped in try/catch and reports through the toast', /try \{/.test(resetAll) && /catch \(e\)/.test(resetAll) && /showToast\(/.test(resetAll))
  }

  // ── 4. Search registry covers every row (S3) ────────────────────────────────────────────────────
  {
    const { SETTINGS_REGISTRY, searchSettings } = await esm('settingsRegistry.js')
    const tabsMod = await esm('settingsTabs.js')
    const consts = await esm('settingsConstants.js')
    const tabIds = tabsMod.SETTINGS_TAB_DEFS.map((t) => t.id)

    const anchors = new Set()
    const dynamicHotkey = /anchor=\{`hotkey-\$\{action\}`\}/
    let hasHotkeyAnchors = false
    for (const [file, src] of Object.entries(allSource)) {
      for (const m of src.matchAll(/(?:data-settings-anchor|anchor)="([a-z0-9-]+)"/g)) anchors.add(m[1])
      if (file === 'KeybindsSettingsPanel.jsx' && dynamicHotkey.test(src)) hasHotkeyAnchors = true
    }
    const registrySections = new Set(SETTINGS_REGISTRY.map((e) => e.section))

    const missing = [...anchors].filter((a) => !registrySections.has(a))
    check('every anchor in the UI has a registry entry', missing.length === 0, missing.join(', '))
    const orphan = [...registrySections].filter((s) => !anchors.has(s) && !s.startsWith('hotkey-'))
    check('every registry entry points at a real anchor', orphan.length === 0, orphan.join(', '))
    const badVia = SETTINGS_REGISTRY.filter((e) => e.via && !anchors.has(e.via)).map((e) => e.section)
    check('entries reached via a collapsible name a real anchor', badVia.length === 0, badVia.join(', '))
    check('every shortcut has an anchored row and a registry entry', hasHotkeyAnchors && consts.HOTKEY_DEFS.every((d) => registrySections.has(`hotkey-${d.action}`)))
    check('registry tab ids are real tabs', SETTINGS_REGISTRY.every((e) => tabIds.includes(e.tab)))
    check('registry entries are unique per (tab, section)', new Set(SETTINGS_REGISTRY.map((e) => `${e.tab}:${e.section}`)).size === SETTINGS_REGISTRY.length)
    check('registry entries have a label and a hint', SETTINGS_REGISTRY.every((e) => e.label && e.hint))

    let unlabeled = 0
    for (const [file, src] of Object.entries(allSource)) {
      if (file === 'SettingsComponents.jsx') continue
      for (const tag of openingTags(src, 'SettingsRow')) {
        if (!/\banchor=/.test(tag)) unlabeled += 1
      }
    }
    check('every <SettingsRow> carries an anchor (so search can reach it)', unlabeled === 0, `${unlabeled} without`)

    const labels = Object.fromEntries(tabsMod.SETTINGS_TAB_DEFS.map((t) => [t.id, t.label]))
    const top = (q) => searchSettings(q, { tabLabels: labels })[0]
    check('search "opacity" finds Window opacity in Overlay', top('opacity')?.section === 'opacity' && top('opacity')?.tab === 'overlay')
    check('search "api key" finds the key field', searchSettings('api key', { tabLabels: labels }).some((e) => e.section === 'api-key'))
    check('search "qr" finds Phone pairing', searchSettings('qr', { tabLabels: labels }).some((e) => e.tab === 'phone'))
    check('search "hide capture" finds Privacy > Hide from screen capture', top('hide capture')?.section === 'hide-from-capture' && top('hide capture')?.tab === 'privacy')
    check('search matches shortcut labels', searchSettings('screenshot', { tabLabels: labels }).some((e) => e.section === 'hotkey-captureScreenshot'))
    check('search is empty for an empty query and for nonsense', searchSettings('', {}).length === 0 && searchSettings('zzzzqqq', {}).length === 0)

    const nav = S('settingsNav.jsx')
    check('nav search is a labelled combobox with keyboard handling', /role="combobox"/.test(nav) && /aria-label="Search settings"/.test(nav) && /ArrowDown/.test(nav) && /Escape/.test(nav))
    check('selecting a result opens the tab and focuses the row', /onPick\(entry\.tab, entry\.via \|\| entry\.section\)/.test(nav) && /focusSettingsAnchor\(root, section\)/.test(S('App.jsx')))
    const focus = S('settingsFocus.js')
    check('anchor focus opens enclosing <details>, scrolls, focuses and respects reduced motion', /details\.open = true/.test(focus) && /scrollIntoView/.test(focus) && /\.focus\(/.test(focus) && /prefers-reduced-motion/.test(focus))
  }

  // ── 5. Nav groups / ids / legacy deep links / a11y ──────────────────────────────────────────────
  {
    const t = await esm('settingsTabs.js')
    const groups = []
    for (const tab of t.SETTINGS_TAB_DEFS) if (!groups.includes(tab.group)) groups.push(tab.group)
    check('nav groups in order', JSON.stringify(groups) === JSON.stringify(['Setup', 'Preferences', 'Meetings & devices', 'Privacy & data', 'Support']))
    check('no group shares its name with one of its tabs', t.SETTINGS_TAB_DEFS.every((tab) => tab.group !== tab.label))
    check('tab ids are unique', new Set(t.SETTINGS_TAB_DEFS.map((x) => x.id)).size === t.SETTINGS_TAB_DEFS.length)
    const n = t.normalizeSettingsTabId
    check('legacy advance maps by section', n('advance') === 'ai' && n('advance', 'speech') === 'audio' && n('advance', 'audio') === 'audio' && n('advance', 'phone') === 'phone' && n('advance', 'overlay') === 'overlay')
    check('legacy ids still resolve', n('speech') === 'audio' && n('intelligence') === 'display' && n('skills') === 'profile' && n('meeting') === 'meetings' && n('general') === 'display')
    check('current ids are stable (deep links from main keep working)', ['profile', 'ai', 'audio', 'display', 'overlay', 'keybinds', 'meetings', 'phone', 'privacy', 'help', 'about'].every((id) => n(id) === id))
    check('unknown ids fall back to General', n('nope') === 'display' && n('') === 'display')
    const q = t.parseSettingsQuery('?tab=advance&section=Audio&firstRun=1')
    check('query string: legacy tab + section deep link', q.tab === 'audio' && q.section === 'audio' && q.firstRun === true)

    const nav = S('settingsNav.jsx')
    check('active nav item has aria-current', /aria-current=\{active \? 'page' : undefined\}/.test(nav))
    check('nav groups are labelled groups inside a labelled <nav>', /<nav className="settings-nav" aria-label=/.test(nav) && /role="group" aria-labelledby/.test(nav))
    const app = S('App.jsx')
    check('focus moves to the page heading after a tab change', /\.settings-page-title'\)\?\.focus/.test(app) && /<h2 className="settings-page-title" tabIndex=\{-1\}/.test(S('SettingsComponents.jsx')))
  }

  // ── 6. No "saved" indicator; a failed write still tells the user (S3, revised) ───────────────────
  {
    const nav = S('settingsNav.jsx')
    const app = S('App.jsx')
    const comps = S('SettingsComponents.jsx')
    const css = S('index.css')
    check('static "Changes save automatically" text is gone', !nav.includes('Changes save automatically'))
    // ("Saving…" is NOT checked: it legitimately labels unrelated buttons such as "Save credentials".)
    check(
      'nav footer has no save-status indicator ("All changes saved")',
      !/SaveStatusIndicator|useSaveStatus/.test(nav) && !/All changes saved/.test(nav + comps + app),
    )
    check('the indicator component and its CSS are removed', !/SaveStatusIndicator/.test(comps) && !/settings-save-status|settings-nav-autosave/.test(css))
    check(
      'root save is still wrapped by trackSave (so failures are reported)',
      app.includes("const save = (k, v) => trackSave(ipc?.invoke('set-store', k, v), k)"),
    )

    // trackSave in Node: stub the DOM bits the toast emitter needs.
    const toasts = []
    globalThis.window = new EventTarget()
    window.addEventListener('settings:toast', (e) => toasts.push(e.detail))
    const tracker = await esm('saveTracker.js')
    const ok = Promise.resolve(1)
    check('trackSave returns the original promise untouched', tracker.trackSave(ok, 'k') === ok)
    await ok
    await new Promise((r) => setTimeout(r, 5))
    check('a successful write shows nothing', toasts.length === 0)
    const boom = Promise.reject(new Error('disk full'))
    boom.catch(() => {})
    tracker.trackSave(boom, 'overlayBounds')
    await new Promise((r) => setTimeout(r, 5))
    check(
      'a failed write raises one error toast naming the setting and the reason',
      toasts.length === 1 && toasts[0].tone === 'error' && /could not be saved/.test(toasts[0].message) && /overlayBounds: disk full/.test(toasts[0].detail),
      JSON.stringify(toasts),
    )
    check('non-promise results are ignored', tracker.trackSave(undefined, 'x') === undefined)
    delete globalThis.window
  }

  // ── 7. Save / test feedback, toasts, confirms (S6 / S9 / B4 / B8) ──────────────────────────────
  {
    const app = S('App.jsx')
    const test = bodyFrom(app, app.indexOf('const testApiFor'))
    check('testApiFor resets the button in a finally block', /finally \{[\s\S]{0,120}setTestingProvider\(/.test(test))
    const saveKey = bodyFrom(app, app.indexOf('const saveKey'))
    check('saveKey awaits the write before reporting success', /await save\(storeKey, key\)/.test(saveKey) && /return true/.test(saveKey) && /return false/.test(saveKey))
    const comps = S('SettingsComponents.jsx')
    const keyField = bodyFrom(comps, comps.indexOf('export function SecretKeyField'))
    check('key fields save on Enter and explain an empty Save', /e\.key === 'Enter'/.test(keyField) && /Paste your API key first/.test(keyField))
    check('AI Provider and Audio key inputs use the shared SecretKeyField', /<SecretKeyField/.test(S('AiProviderPanel.jsx')) && /<SecretKeyField/.test(S('SpeechSettingsPanel.jsx')))
    check('no native window.alert anywhere in settings', Object.values(allSource).every((src) => !/window\.alert\(/.test(src)))
    check('exports report through the shared toast', /toastExportResult\(/.test(S('PrivacySettingsPanel.jsx')) && /toastExportResult\(/.test(S('MeetingsSettingsPanel.jsx')) && /toastExportResult\(/.test(S('MeetingDetailsModal.jsx')))
    check('toast listener reads the payload from the second shim argument', /ipc\.on\('settings-toast', \(_, payload\) => showToast\(payload\)\)/.test(app))
    check('in-window feedback shares the same toast (onSettingsToast)', /onSettingsToast\(showToast\)/.test(app))

    check('Remove resume asks first', /<ConfirmDialog[\s\S]{0,200}Remove this resume\?/.test(S('InterviewResumesSection.jsx')) && !/onClick=\{onDelete\}/.test(S('InterviewResumesSection.jsx')))
    const mm = S('ModeMaterialsSection.jsx')
    check('Remove document and Remove purpose ask first', /Remove this document\?/.test(mm) && /Remove this purpose\?/.test(mm) && !/onClick=\{\(\) => onDelete\?\.\(doc\.id\)\}/.test(mm) && !/onClick=\{\(\) => onDelete\?\.\(purpose\.id\)\}/.test(mm))
    check('OAuth credentials cannot be marked ready without a secret', /Enter the OAuth client secret too/.test(app) && /return \{ ok: false, error: 'Enter the OAuth client ID\.' \}/.test(app))
    check('OAuth fields save on Enter and show an unsaved marker', /settings-unsaved/.test(S('MeetingsSettingsPanel.jsx')) && /e\.key === 'Enter'/.test(S('MeetingsSettingsPanel.jsx')))
    check('overlay size reports when it clamps', /limited to/.test(S('OverlaySettingsPanel.jsx')) && /OVERLAY_SIZE_LIMITS/.test(S('OverlaySettingsPanel.jsx')))
  }

  // ── 8. Dependent controls and dependent copy (S7 / B5) ─────────────────────────────────────────
  {
    const speech = S('SpeechSettingsPanel.jsx')
    check('Audio dependents are disabled while the microphone is off, with one explanation', /const micOff = !audioEnabled/.test(speech) && (speech.match(/disabled=\{micOff\}/g) || []).length >= 6 && /Microphone is off/.test(speech))
    check('cloud mode without a key warns', /No \{providerLabel\} API key is saved yet/.test(speech))
    check('Audio uses CheckmarkSelect, not native <select>', !/<select\b/.test(speech))
    const overlay = S('OverlaySettingsPanel.jsx')
    check('"Move overlay to" is an action control with a placeholder, not a stuck "Top-Right"', /label="Move overlay to"/.test(overlay) && /placeholder="Choose a position"/.test(overlay) && !/Snap position/.test(overlay))
    const comps = S('SettingsComponents.jsx')
    check('SettingsRow disables its control and shows a reason', /disabled && takesDisabled/.test(comps) && /settings-row-reason/.test(comps))
    check('SettingsSection offers a per-section reset behind a ConfirmDialog', /onReset/.test(comps) && /Reset to default/.test(comps) && /confirmReset/.test(comps))
    const resettable = ['DisplaySettingsPanel.jsx', 'OverlaySettingsPanel.jsx', 'SpeechSettingsPanel.jsx', 'PhoneLinkSettingsPanel.jsx', 'MeetingsSettingsPanel.jsx']
    check('General, Overlay, Audio, Phone and Meetings sections offer Reset to default', resettable.every((f) => /onReset=\{/.test(S(f))))
    check('reset uses the existing handlers and store defaults, not new store keys', /SETTINGS_DEFAULTS/.test(S('DisplaySettingsPanel.jsx')) && /SETTINGS_DEFAULTS/.test(overlay))
    const privacy = S('PrivacySettingsPanel.jsx')
    check('Hide from screen capture and Do not save meetings live in Privacy', /Hide from screen capture/.test(privacy) && /anchor="do-not-save-meetings"/.test(privacy))
    const display = S('DisplaySettingsPanel.jsx')
    check('General no longer carries privacy toggles', !/stealthModeUi/.test(display) && !/doNotSaveMeetings/.test(display))
    check('overlay settings live in one tab', !/overlayOpacityUi/.test(display) && /overlayOpacityUi/.test(overlay) && /overlayTeleprompterUi/.test(overlay))
  }

  // ── 9. Copy (S8 / B6) ───────────────────────────────────────────────────────────────────────────
  {
    const banned = [/InterviewMan/, /IM default/, /#6FA0FF/i, /auto-?answer/i, /Visible mode/, /Invisible mode/, /Snap position/, /moonshine-base\s*·/]
    const hits = []
    for (const [file, src] of Object.entries(allSource)) {
      if (file === 'App.jsx') continue // contains code comments only; copy is checked via panels
      const visible = stripComments(src)
      for (const re of banned) if (re.test(visible)) hits.push(`${file}: ${re}`)
    }
    check('no InterviewMan / IM default / hex colour / retired auto-answer / Visible-Invisible copy in panels', hits.length === 0, hits.join('; '))
    const ai = S('AiProviderPanel.jsx')
    check('AI Provider copy no longer mentions auto-answer or "Vision for screen Ask"', !/auto-answer/i.test(ai) && !/Vision for screen Ask/.test(ai))
    const meetings = S('MeetingsSettingsPanel.jsx')
    const dev = meetings.indexOf('title="Developer setup"')
    const envAt = meetings.indexOf('VEILASSIST_GOOGLE_CAL_CLIENT_ID')
    check('Google env var names appear only inside the collapsed Developer setup', dev > 0 && envAt > dev)
    check('shortcut copy is read from the live hotkeys map', /inlineAccelerator\(/.test(S('DisplaySettingsPanel.jsx')) && /inlineAccelerator\(/.test(S('OverlaySettingsPanel.jsx')) && !/>Ctrl\+Enter</.test(S('DisplaySettingsPanel.jsx')))
    const fmt = await esm('settingsFormatters.js')
    check('local speech model status is humanized', fmt.humanizeModelName('onnx-community/moonshine-base-ONNX') === 'Moonshine Base' && !/idle/.test(fmt.describeLocalModelStatus({ spec: { modelId: 'onnx-community/moonshine-base-ONNX' }, status: {} })))
    const copy = await esm('settingsCopy.js')
    check('polishCopy still strips em/en dashes', copy.polishCopy('Foo — bar') === 'Foo. bar' && copy.polishCopy('A – B') === 'A. B')
  }

  // ── 10. Accessibility (S10 / C1-C5) ─────────────────────────────────────────────────────────────
  {
    const comps = S('SettingsComponents.jsx')
    const css = read('renderer/settings/index.css')

    const select = bodyFrom(comps, comps.indexOf('export function CheckmarkSelect'))
    check('CheckmarkSelect: listbox takes focus and exposes the active option', /menuRef\.current\?\.focus/.test(select) && /aria-activedescendant/.test(select))
    check('CheckmarkSelect: Arrow/Home/End/Enter/Escape/Tab handled', ['ArrowDown', 'ArrowUp', "'Home'", "'End'", "'Enter'", "'Escape'", "'Tab'"].every((k) => select.includes(k)))
    check('CheckmarkSelect: focus returns to the trigger on close', /triggerRef\.current\?\.focus/.test(select))
    check('CheckmarkSelect: accessible name is "label: value" (or labelledby + value)', /aria-label': `\$\{ariaLabel\}: \$\{label\}`/.test(select) && /aria-labelledby': `\$\{ariaLabelledBy\} \$\{valueId\}`/.test(select))
    check('CheckmarkSelect options are real role=option elements', /role="option"/.test(select))

    const seg = bodyFrom(comps, comps.indexOf('export function SegmentedControl'))
    check('SegmentedControl accepts aria-labelledby and supports arrow-key navigation', /'aria-labelledby': ariaLabelledBy/.test(comps) && /ArrowRight/.test(seg) && /ArrowLeft/.test(seg) && /tabIndex=\{/.test(seg))
    const row = bodyFrom(comps, comps.indexOf('export function SettingsRow'))
    check('SettingsRow forwards its label to the control (aria-labelledby) and to ariaLabel-style controls', /aria-labelledby'\] = labelId/.test(row) && /childProps\.ariaLabel/.test(row))

    const dialog = bodyFrom(comps, comps.indexOf('export function ConfirmDialog'))
    check('ConfirmDialog: Escape / focus trap / focus restore via useDialogA11y', /useDialogA11y\(open, onCancel/.test(dialog))
    const hook = bodyFrom(comps, comps.indexOf('export function useDialogA11y'))
    check('useDialogA11y handles Escape, Tab trapping and restores focus', /'Escape'/.test(hook) && /e\.key !== 'Tab'/.test(hook) && /previous\.focus/.test(hook) && /dialogStack/.test(hook))
    const modal = S('MeetingDetailsModal.jsx')
    check('MeetingDetailsModal: dialog hook, accessible close buttons, theme tokens', /useDialogA11y\(!!sessionId, onClose/.test(modal) && /aria-label="Close session details"/.test(modal) && !/bg-\[#0c0c0e\]/.test(modal) && !/bg-\[#121214\]/.test(modal))

    // focus ring
    check('focus ring token is defined for both themes', /--focus-ring:/.test(css) && /\[data-color-scheme='light'\] \{[\s\S]*?--focus-ring:/.test(css))
    check('one shared 2px solid ring covers select triggers, pills, inputs, ranges and keycaps', /\.checkmark-select-trigger:focus-visible/.test(css) && /\.settings-advance-pill:focus-visible/.test(css) && /input\[type='range'\]:focus-visible/.test(css) && /\.hotkey-combo:focus-visible/.test(css) && /\.input-shadow:focus-visible/.test(css) && /outline: 2px solid var\(--focus-ring\)/.test(css))

    // contrast math from the real tokens
    const dark = css.slice(css.indexOf('.settings-body {'), css.indexOf(".settings-body[data-color-scheme='light'] {"))
    const lightStart = css.indexOf(".settings-body[data-color-scheme='light'] {")
    const light = css.slice(lightStart, css.indexOf('}', lightStart))
    const dCard = token(dark, '--bg-card')
    const lCard = token(light, '--bg-card')
    const lPrimary = token(light, '--bg-primary')
    check('dark --text-tertiary >= 4.5:1 on the card', contrast(token(dark, '--text-tertiary'), dCard) >= 4.5, String(contrast(token(dark, '--text-tertiary'), dCard).toFixed(2)))
    check('light --text-tertiary >= 4.5:1 on the page and card', contrast(token(light, '--text-tertiary'), lPrimary) >= 4.5 && contrast(token(light, '--text-tertiary'), lCard) >= 4.5, String(contrast(token(light, '--text-tertiary'), lPrimary).toFixed(2)))
    check('dark toggle OFF track >= 3:1 against the card', contrast(token(dark, '--toggle-track-off'), dCard) >= 3, String(contrast(token(dark, '--toggle-track-off'), dCard).toFixed(2)))
    check('focus ring >= 3:1 on both themes', contrast(token(dark, '--focus-ring'), dCard) >= 3 && contrast(token(light, '--focus-ring'), lCard) >= 3)
    check('dark danger text >= 4.5:1 and light danger text >= 4.5:1', contrast(token(dark, '--danger-text'), dCard) >= 4.5 && contrast(token(light, '--danger-text'), lCard) >= 4.5)
    check('light OFF toggle has a >= 3:1 border', /--toggle-track-border-off: rgba\(0, 0, 0, 0\.4[5-9]|--toggle-track-border-off: rgba\(0, 0, 0, 0\.[5-9]/.test(light))

    const menu = css.slice(css.indexOf('.checkmark-select-menu,'), css.indexOf('.checkmark-select-menu::-webkit-scrollbar,'))
    check('dropdown menu follows the theme (no hard-coded dark background)', /background: var\(--menu-bg\)/.test(menu) && !/background: #/.test(menu))
    check('dropdown option text uses theme tokens', !/\.checkmark-select-opt-label \{[^}]*#fafafa/.test(css) && /color: var\(--menu-text\)/.test(css))
    check('reduced-motion safety net is intact', /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after/.test(css) && /\.settings-anchor-flash/.test(css))
  }

  // ── 11. Network / polling gates (S11 / D1) ──────────────────────────────────────────────────────
  {
    const app = S('App.jsx')
    const sync = app.slice(app.indexOf('// The list-remote-models call'), app.indexOf('// The list-remote-models call') + 900)
    check('vendor model sync only runs while the AI Provider tab is open', /activeTabId !== 'ai'/.test(sync) && /syncRemoteModelsFor\(provider\)/.test(sync) && /modelListSourceByProvider\[provider\]/.test(sync))
    check('calendar results are cached for minutes and Refresh forces', /CALENDAR_CACHE_MS = 5 \* 60 \* 1000/.test(app) && /opts\?\.force === true/.test(app) && /onRefreshCalendarMeetings\(\{ force: true \}\)/.test(S('MeetingsSettingsPanel.jsx')))
    check('google-calendar:get-status is requested from one place only', (app.match(/google-calendar:get-status/g) || []).length === 1)
    const init = app.slice(app.indexOf("ipc.invoke('get-all-settings')") - 40, app.indexOf("ipc.invoke('get-all-settings')") + 900)
    check('catalog, STT policy and app info join the first hydration batch', /get-chat-model-catalog/.test(init) && /get-stt-policy/.test(init) && /get-app-info/.test(init))
    check('no second effect fetches the catalog / policy', (app.match(/get-chat-model-catalog/g) || []).length === 1 && (app.match(/get-stt-policy/g) || []).length === 1)
  }

  // ── 12. Render performance (D2) ─────────────────────────────────────────────────────────────────
  {
    const app = S('App.jsx')
    check('profilePanel is a memoized object with stable handlers', /const profilePanel = useMemo\(/.test(app) && /const profileHandlers = useMemo\(/.test(app) && /profileApi\.current = \{/.test(app) && !/profilePanel=\{\{/.test(app))
    check('Profile page is React.memo', /export default memo\(ProfileSettingsPanel\)/.test(S('ProfileSettingsPanel.jsx')))
  }

  // ── 13. Source health ───────────────────────────────────────────────────────────────────────────
  {
    let esbuild = null
    try {
      esbuild = require('esbuild')
    } catch {
      /* optional */
    }
    if (esbuild) {
      const broken = []
      for (const [file, src] of Object.entries(allSource)) {
        try {
          esbuild.transformSync(src, { loader: 'jsx' })
        } catch (e) {
          broken.push(`${file}: ${String(e.message).split('\n')[0]}`)
        }
      }
      check('every renderer/settings/*.jsx parses (includes the previously broken PersonalBackgroundSection)', broken.length === 0, broken.join('; '))
    } else {
      check('esbuild unavailable: parse check skipped', true)
    }
    check('PersonalBackgroundSection JD "Clear" button tag is closed', /className="btn-danger inline-flex items-center gap-1 px-3 py-1\.5 text-\[12px\]"\n\s+>/.test(S('PersonalBackgroundSection.jsx')))
  }

  // ── Polish requested after review: clean dropdown menus + the app's own scrollbar on search results ──
  {
    const comps = S('SettingsComponents.jsx')
    const css = S('index.css')
    check(
      'dropdown options render only their label — no visible grey sub-line',
      !/className="checkmark-select-opt-detail"/.test(comps),
    )
    check(
      'an option\'s explanation is kept as a hover tooltip (title) so acronyms like SOARA stay discoverable',
      /title=\{opt\.detail \|\| undefined\}/.test(comps),
    )
    const results = css.match(/\.settings-nav-results\s*\{[^}]*\}/)
    check('search results list has a rule block', !!results)
    check(
      'search results use the same thin grey scrollbar as the dropdown menus, not the native arrow-button bar',
      !!results && /scrollbar-width:\s*thin/.test(results[0]) && /scrollbar-color:\s*#52525b transparent/.test(results[0]),
    )
    check('search results contain scroll chaining (overscroll-behavior: contain)', !!results && /overscroll-behavior:\s*contain/.test(results[0]))
  }

  console.log(`\n${passed}/${passed + failed} passed`)
  if (failed) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
