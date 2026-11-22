// Copyright (c) 2026 VeilAssist. All rights reserved.
// Overlay-only shortcuts (Escape, Ctrl+Arrow nudge, Ctrl+Shift+Arrow scroll) must be claimed system-wide ONLY while
// the overlay is on screen. Before, all of them were registered all day, so while VeilAssist ran Escape stopped
// working in every other app and Ctrl+Arrow word-jumps broke in every text box.
//
// Runs the real lib/hotkeys.js against a fake globalShortcut, so it checks which keys are really held.
//
//   node --test scripts/test-hotkeys-scoping.cjs

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

const ROOT = path.join(__dirname, '..')

/** Load lib/hotkeys.js fresh with Electron's globalShortcut, the store and the Win32 helper replaced by fakes. */
function loadHotkeys({ storedHotkeys = {} } = {}) {
  const held = new Map() // accelerator -> handler
  const win32Held = new Set()
  const fakeElectron = {
    globalShortcut: {
      register: (acc, cb) => (held.set(acc, cb), true),
      unregister: (acc) => void held.delete(acc),
      unregisterAll: () => void held.clear(),
    },
  }
  const fakeStore = { get: (k) => (k === 'hotkeys' ? { ...storedHotkeys } : undefined), set: () => {} }
  const fakeWin32 = {
    isWin32Accelerator: () => false,
    registerAccelerator: () => false,
    unregisterAccelerator: (acc) => win32Held.delete(acc),
    unregisterAll: () => win32Held.clear(),
  }
  const original = Module._load
  Module._load = function patched(request, parent, ...rest) {
    if (parent && /lib[\\/]hotkeys\.js$/.test(parent.filename || '')) {
      if (request === 'electron') return fakeElectron
      if (request === './store') return fakeStore
      if (request === './win32Hotkeys') return fakeWin32
    }
    return original.call(this, request, parent, ...rest)
  }
  const file = path.join(ROOT, 'lib', 'hotkeys.js')
  delete require.cache[file]
  let hk
  try {
    hk = require(file)
  } finally {
    Module._load = original
  }
  for (const action of Object.keys(hk.DEFAULT_HOTKEYS)) hk.register(action, () => `fired:${action}`)
  return { hk, held }
}

const SCOPED = ['hideOverlay', 'moveUp', 'moveDown', 'moveLeft', 'moveRight', 'scrollUp', 'scrollDown']
const ALWAYS = ['toggleOverlay', 'askAI', 'askAINoScreen', 'followUp', 'clearChat', 'toggleSession', 'settings', 'copyResponse', 'captureScreenshot', 'focusOverlayInput', 'toggleMousePassthrough']

test('the overlay-only shortcuts are exactly Escape, the four nudge keys and the two scroll keys', () => {
  const { hk } = loadHotkeys()
  assert.deepEqual([...hk.OVERLAY_SCOPED_ACTIONS].sort(), [...SCOPED].sort())
  for (const action of ALWAYS) assert.ok(!hk.OVERLAY_SCOPED_ACTIONS.has(action), `${action} must stay global`)
})

test('overlay not on screen: Escape and Ctrl+Arrow belong to other apps, the always-on shortcuts are held', () => {
  const { hk, held } = loadHotkeys()
  hk.registerAll()
  for (const action of SCOPED) assert.ok(!held.has(hk.DEFAULT_HOTKEYS[action]), `${action} (${hk.DEFAULT_HOTKEYS[action]}) must not be held`)
  for (const action of ALWAYS) assert.ok(held.has(hk.DEFAULT_HOTKEYS[action]), `${action} must be held`)
  // not a failure: Settings only warns on ok:false
  for (const action of SCOPED) assert.deepEqual(hk.getStatus().registration[action], { accelerator: hk.DEFAULT_HOTKEYS[action], ok: true, via: 'scoped' })
})

test('overlay shown: they are claimed; hidden again: they are released, and nothing else moves', () => {
  const { hk, held } = loadHotkeys()
  hk.registerAll()
  const alwaysBefore = ALWAYS.map((a) => hk.DEFAULT_HOTKEYS[a])

  hk.setOverlayActive(true)
  for (const action of SCOPED) assert.ok(held.has(hk.DEFAULT_HOTKEYS[action]), `${action} held while the overlay is up`)
  assert.equal(hk.getStatus().registration.hideOverlay.via, 'electron')
  assert.equal(held.get('Escape')(), 'fired:hideOverlay', 'Escape reaches the hide handler')
  assert.equal(held.get('CommandOrControl+Left')(), 'fired:moveLeft')

  hk.setOverlayActive(false)
  for (const action of SCOPED) assert.ok(!held.has(hk.DEFAULT_HOTKEYS[action]), `${action} released again`)
  assert.deepEqual(alwaysBefore.map((acc) => held.has(acc)), alwaysBefore.map(() => true), 'the always-on shortcuts never dropped')
  assert.equal(hk.getStatus().registration.hideOverlay.via, 'scoped')
})

test('setting the same state twice does nothing; a rebind while hidden is applied when it is shown', () => {
  const { hk, held } = loadHotkeys({ storedHotkeys: { hideOverlay: 'CommandOrControl+Shift+Q' } })
  hk.registerAll()
  assert.equal(hk.setOverlayActive(false), false)
  assert.ok(!held.has('CommandOrControl+Shift+Q'), 'rebound Escape is not held while hidden')
  hk.setOverlayActive(true)
  assert.ok(held.has('CommandOrControl+Shift+Q'), 'the user\'s own binding is the one claimed')
  assert.ok(!held.has('Escape'), 'and the default Escape is not')
  assert.equal(hk.setOverlayActive(true), true)
})

test('while Settings is capturing a key (suspended) nothing is claimed; resuming honours the current overlay state', () => {
  const { hk, held } = loadHotkeys()
  hk.registerAll()
  hk.setSuspended(true)
  assert.equal(held.size, 0)
  hk.setOverlayActive(true)
  assert.equal(held.size, 0, 'showing the overlay must not register anything while suspended')
  hk.setSuspended(false)
  assert.ok(held.has('Escape') && held.has('CommandOrControl+Up') && held.has('CommandOrControl+\\'), 'all back, scoped ones included because the overlay is up')
  hk.setOverlayActive(false)
  hk.setSuspended(true)
  hk.setSuspended(false)
  assert.ok(!held.has('Escape') && held.has('CommandOrControl+\\'), 'resumed with the overlay hidden: scoped keys stay released')
})

test('main keeps the registry in step with the overlay: presented, hidden and closed', () => {
  const main = fs.readFileSync(path.join(ROOT, 'main', 'index.js'), 'utf8')
  assert.match(main, /function syncOverlayScopedHotkeys\(\) \{[\s\S]{0,200}hotkeys\.setOverlayActive\(!!\(overlayWindow && !overlayWindow\.isDestroyed\(\) && overlayVisible\)\)/)
  const body = (name) => {
    const start = main.indexOf(`function ${name}(`)
    return main.slice(start, main.indexOf('\n}\n', start))
  }
  assert.match(body('hideOverlay'), /syncOverlayScopedHotkeys\(\)/)
  assert.match(body('presentOverlayWindow'), /syncOverlayScopedHotkeys\(\)/)
  assert.ok((body('presentOverlayWindow').match(/syncOverlayScopedHotkeys\(\)/g) || []).length >= 2, 'both the stealth path and the normal path')
  assert.match(main, /overlayWindow\.on\('closed', \(\) => \{[\s\S]{0,400}syncOverlayScopedHotkeys\(\)/)
})
