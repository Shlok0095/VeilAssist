#!/usr/bin/env node
/**
 * Static + live checks for every default hotkey action.
 * Live mode: node scripts/test-hotkeys-wiring.cjs --live
 */
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')

const ROOT = path.join(__dirname, '..')
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

const ACTIONS = [
  'toggleOverlay',
  'hideOverlay',
  'askAI',
  'askAINoScreen',
  'followUp',
  'clearChat',
  'toggleSession',
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'scrollUp',
  'scrollDown',
  'settings',
  'copyResponse',
  'captureScreenshot',
  'focusOverlayInput',
  'toggleMousePassthrough',
]

let failed = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  PASS  ${name}`)
  else {
    failed += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\n── Hotkeys wiring ──\n')

const hotkeysSrc = read('lib', 'hotkeys.js')
const win32Src = read('lib', 'win32Hotkeys.js')
const mainSrc = read('main', 'index.js')
const preloadSrc = read('preload.js')
const constsSrc = read('renderer', 'settings', 'settingsConstants.js')
const keybindsSrc = read('renderer', 'settings', 'KeybindsSettingsPanel.jsx')

check('DEFAULT_HOTKEYS includes toggleSession Ctrl+Shift+\\', /toggleSession:\s*'CommandOrControl\+Shift\+\\\\'/.test(hotkeysSrc))
check('no toggleAutoAnswer in DEFAULT_HOTKEYS', !/toggleAutoAnswer:/.test(hotkeysSrc))
check('registerAll checks Electron return + Win32 fallback', /win32Hotkeys\.registerAccelerator/.test(hotkeysSrc) && /globalShortcut\.register/.test(hotkeysSrc))
check('getStatus + invoke exported', /function getStatus/.test(hotkeysSrc) && /function invoke/.test(hotkeysSrc))
check('Win32 supports Ctrl+Shift+\\', /CommandOrControl\+Shift\+\\\\/.test(win32Src) && /VK_OEM_5/.test(win32Src))
check('Win32 supports Ctrl+Arrow', /CommandOrControl\+Up/.test(win32Src))

for (const action of ACTIONS) {
  check(`main registers handler ${action}`, new RegExp(`hotkeys\\.register\\('${action}'`).test(mainSrc))
}

check('setupHotkeys calls registerAll', /hotkeys\.registerAll\(\)/.test(mainSrc))
check('settings closed unsuspends hotkeys', /settingsWindow\.on\('closed'[\s\S]{0,280}hotkeys\.setSuspended\(false\)/.test(mainSrc))
check('window-all-closed does not unregisterAll', !/window-all-closed[\s\S]{0,200}unregisterAll/.test(mainSrc))
check('preload allows hotkeys:status/invoke/reregister', /hotkeys:status/.test(preloadSrc) && /hotkeys:invoke/.test(preloadSrc) && /hotkeys:reregister/.test(preloadSrc))
check('settingsConstants lists toggleSession', /action: 'toggleSession'/.test(constsSrc))
check('Keybinds panel unsuspends on unmount', /beforeunload/.test(keybindsSrc) && /setHotkeysSuspended\(false\)/.test(keybindsSrc))

const { DEFAULT_HOTKEYS } = require('../lib/hotkeys.js')
for (const action of ACTIONS) {
  check(`DEFAULT_HOTKEYS.${action} set`, !!DEFAULT_HOTKEYS[action], String(DEFAULT_HOTKEYS[action]))
}

if (failed) {
  console.log(`\n${failed} wiring check(s) failed\n`)
  process.exit(1)
}
console.log('\nAll wiring checks passed.\n')

if (!process.argv.includes('--live')) process.exit(0)

// ── Live Electron registration smoke ─────────────────────────────────────────
console.log('── Live Electron hotkey registration ──\n')

const { spawn } = require('child_process')
const electronBin = require('electron')
const runner = path.join(ROOT, 'scripts', '_hotkeys-live-runner.cjs')

const child = spawn(electronBin, [runner], {
  cwd: ROOT,
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let out = ''
child.stdout.on('data', (d) => { out += d.toString(); process.stdout.write(d) })
child.stderr.on('data', (d) => { out += d.toString(); process.stderr.write(d) })

const timer = setTimeout(() => {
  child.kill()
  console.error('Live hotkey test timed out')
  process.exit(1)
}, 45000)

child.on('exit', (code) => {
  clearTimeout(timer)
  if (code !== 0 || !/LIVE_HOTKEYS_OK/.test(out)) {
    console.error('Live hotkey test failed')
    process.exit(code || 1)
  }
  process.exit(0)
})
