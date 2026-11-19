#!/usr/bin/env node
/**
 * Asserts auto-answer + answer auto-scroll are permanently retired:
 * UI, hotkey, store migration, overlay hard-disable, manual transcript consume.
 */
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')

const ROOT = path.join(__dirname, '..')
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

let failed = 0
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\n── Auto-answer / auto-scroll retirement ──\n')

const hotkeys = read('lib', 'hotkeys.js')
const store = read('lib', 'store.js')
const settingsConsts = read('renderer', 'settings', 'settingsConstants.js')
const main = read('main', 'index.js')
const overlay = read('renderer', 'overlay', 'App.jsx')
const panel = read('renderer', 'overlay', 'components', 'ResponsePanel.jsx')
const display = read('renderer', 'settings', 'DisplaySettingsPanel.jsx')
const settingsApp = read('renderer', 'settings', 'App.jsx')

check('hotkeys: no toggleAutoAnswer binding', !/toggleAutoAnswer:\s*'/.test(hotkeys))
check('store defaults: no toggleAutoAnswer default', !/toggleAutoAnswer:\s*'CommandOrControl\+Shift\+X'/.test(store))
check('store: migrateRetireAutoAnswer present', /migrateRetireAutoAnswer/.test(store))
check('store: assistAutoTrigger default false', /assistAutoTrigger:\s*\{\s*type:\s*'boolean',\s*default:\s*false/.test(store))
check('store: overlayAnswerAutoScroll default false', /overlayAnswerAutoScroll:\s*\{\s*type:\s*'boolean',\s*default:\s*false/.test(store))
check('settingsConstants: no toggleAutoAnswer action', !/toggleAutoAnswer/.test(settingsConsts))
check('main: no toggleAutoAnswer register', !/hotkeys\.register\('toggleAutoAnswer'/.test(main))
check('main: no toggleAssistAutoTrigger', !/function toggleAssistAutoTrigger/.test(main))
check('main: no overlayFontPayloadForAutoScrollToggle', !/overlayFontPayloadForAutoScrollToggle/.test(main))
check('main: set-store forces assistAutoTrigger false', /key === 'assistAutoTrigger'[\s\S]{0,160}store\.set\('assistAutoTrigger',\s*false\)/.test(main))
check('main: set-store forces overlayAnswerAutoScroll false', /key === 'overlayAnswerAutoScroll'[\s\S]{0,120}store\.set\('overlayAnswerAutoScroll',\s*false\)/.test(main))
check('main: answerLength does NOT sync font (IM)', /overlayPayloadForAnswerLength/.test(main) && !/overlayFontPayloadForAnswerLength/.test(main))

check('DisplaySettingsPanel: no Auto-answer row', !/Auto-answer questions/.test(display))
check('DisplaySettingsPanel: no Auto-scroll answers row', !/Auto-scroll answers/.test(display))
check('DisplaySettingsPanel: no Question detection UI', !/Question detection/.test(display))
check('DisplaySettingsPanel: keeps Auto-scroll transcript', /Auto-scroll transcript/.test(display))
check('settings App: no applyAssistAutoTrigger', !/applyAssistAutoTrigger/.test(settingsApp))
check('settings App: no applyOverlayAnswerAutoScroll', !/applyOverlayAnswerAutoScroll/.test(settingsApp))
check('settings App: answerLength does NOT set font (IM)', !/const applyAnswerLength[\s\S]{0,350}fontSizeFromAnswerLength\(next\)/.test(settingsApp))

check('overlay: rejects opts.auto === true', /if \(opts\.auto === true\) return/.test(overlay))
check('overlay: forces assistAutoTriggerRef false on load', /Auto-answer retired[\s\S]{0,120}assistAutoTriggerRef\.current = false/.test(overlay))
check('overlay: forces overlayAnswerAutoScroll false on load', /overlayAnswerAutoScrollRef\.current = false\s*\n\s*setOverlayAnswerAutoScroll\(false\)/.test(overlay))
check('overlay: clears live transcript after successful manual ask', /askResult\?\.ok === true && isManualAsk[\s\S]{0,40}clearRollingSpeech\(\)/.test(overlay))
check('overlay: no STT suppress blackout (2026.11.01.03.01-aligned)', !/suppressTranscriptUntilRef/.test(overlay) && !/manualAskBusy/.test(overlay))
check('overlay: clearRollingSpeech wipes micTranscriptRef', /micTranscriptRef\.current = ''/.test(overlay) && /latestTranscriptRef\.current = ''/.test(overlay))
check('ResponsePanel: followStream always false', /const followStream = false/.test(panel))

if (failed) {
  console.log(`\n${failed} check(s) failed\n`)
  process.exit(1)
}
console.log('\nAll retirement checks passed.\n')
