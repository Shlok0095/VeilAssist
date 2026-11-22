// Copyright (c) 2026 VeilAssist. All rights reserved.
// Overlay behaviour found by the 2026-11-22 audit (then verified on real screen pixels where it mattered):
//  - opacity was applied twice (window x page): 70% looked like 49%
//  - a hidden overlay (opacity 0) stayed clickable and could swallow clicks
//  - nudging / re-seating saved the collapsed notch height (43px) as the panel size
//  - Settings' Apply wrote back a stale position and accepted heights the overlay cannot show
//
//   node --test scripts/test-overlay-behaviour.cjs

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')
const main = read('main', 'index.js')
const overlayApp = read('renderer', 'overlay', 'App.jsx')
const settingsApp = read('renderer', 'settings', 'App.jsx')
const settingsConsts = read('renderer', 'settings', 'settingsConstants.js')
const overlayPanel = read('renderer', 'settings', 'OverlaySettingsPanel.jsx')
const store = read('lib', 'store.js')
const { clampOverlayOpacity, migrateLegacyOverlayOpacity, DEFAULT_OVERLAY_OPACITY, MIN_OVERLAY_OPACITY } = require('../lib/overlayOpacity.cjs')

/** Body of a top-level `function name(` in main/index.js. */
function bodyOf(src, name) {
  const start = src.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} exists`)
  const open = src.indexOf('{', src.indexOf(')', start))
  let depth = 0
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1)
  }
  throw new Error(`unterminated ${name}`)
}

// ── opacity: one number, applied once ───────────────────────────────────────────────────────────────
test('opacity is clamped to [0.30, 1] and falls back to the default', () => {
  assert.equal(MIN_OVERLAY_OPACITY, 0.3)
  assert.equal(clampOverlayOpacity(0.2), MIN_OVERLAY_OPACITY)
  assert.equal(clampOverlayOpacity(5), 1)
  assert.equal(clampOverlayOpacity(0.8), 0.8)
  assert.equal(clampOverlayOpacity('abc'), DEFAULT_OVERLAY_OPACITY)
  assert.equal(clampOverlayOpacity(undefined), DEFAULT_OVERLAY_OPACITY)
})

test('migration keeps an existing overlay looking the same: the old value looked like its square', () => {
  const m = (opacity, extra = {}) => migrateLegacyOverlayOpacity({ opacity, existingUser: true, alreadyMigrated: false, ...extra })
  assert.deepEqual(m(0.7), { opacity: 0.49, done: true }, 'the old default 70% really showed as 49%')
  assert.deepEqual(m(0.92), { opacity: 0.85, done: true }, 'the old "Clear" preset')
  assert.deepEqual(m(0.55), { opacity: 0.3, done: true }, 'the old "Subtle" preset looked like 30%: kept exactly')
  assert.deepEqual(m(0.8), { opacity: 0.64, done: true })
  assert.deepEqual(m(1), { opacity: null, done: true }, '100% is unchanged')
  assert.deepEqual(m(0.3), { opacity: null, done: true }, 'a value at the floor stays there')
})

test('migration runs once, never touches a brand-new install, and ignores junk', () => {
  assert.deepEqual(migrateLegacyOverlayOpacity({ opacity: 0.7, existingUser: true, alreadyMigrated: true }), { opacity: null, done: false })
  assert.deepEqual(migrateLegacyOverlayOpacity({ opacity: 0.5, existingUser: false, alreadyMigrated: false }), { opacity: null, done: true })
  assert.deepEqual(migrateLegacyOverlayOpacity({ opacity: 'x', existingUser: true, alreadyMigrated: false }), { opacity: null, done: true })
  // The default is what the old default looked like, so a new install matches an existing one.
  assert.equal(DEFAULT_OVERLAY_OPACITY, 0.5)
  assert.ok(Math.abs(DEFAULT_OVERLAY_OPACITY - 0.7 * 0.7) < 0.02)
})

test('defaults agree everywhere (store, Settings reset, presets) so "Reset to default" tells the truth', () => {
  assert.match(store, /overlayOpacity: \{ type: 'number', default: 0\.5 \}/)
  assert.match(store, /overlayOpacityMigrated: \{ type: 'boolean', default: false \}/)
  assert.match(settingsConsts, /overlayOpacity: 0\.5,/)
  assert.match(overlayPanel, /label: 'Default', pct: 50/)
  for (const pct of [30, 50, 85]) assert.match(overlayPanel, new RegExp(`pct: ${pct}\\b`))
  assert.match(settingsApp, /useState\(0\.5\)/)
  assert.match(settingsConsts, /OVERLAY_OPACITY_RANGE = \{ min: 0\.3, max: 1 \}/)
  assert.match(overlayPanel, /min=\{Math\.round\(OVERLAY_OPACITY_RANGE\.min \* 100\)\}/)
})

test('the window owns the opacity alone: the overlay page no longer applies the setting a second time', () => {
  assert.doesNotMatch(overlayApp, /useState\(0\.7\)[\s\S]{0,40}setOpacity|const \[opacity, setOpacity\]/)
  assert.doesNotMatch(overlayApp, /setOpacity\(/)
  assert.match(overlayApp, /opacity: hiding \|\| !overlayMainVisible \? 0 : 1,/, 'the page only fades for hide/show')
  assert.match(main, /savedOpacity = clampOverlayOpacity\(store\.get\('overlayOpacity'\)\)/)
  assert.match(main, /const clamped = clampOverlayOpacity\(o\)/)
  assert.match(main, /const o = clampOverlayOpacity\(opts\.overlayOpacity\)/)
})

test('main converts the saved opacity once at startup, before the overlay window is created', () => {
  const init = main.slice(main.indexOf('async function initApp()'))
  assert.match(init, /migrateLegacyOverlayOpacity\(\{[\s\S]{0,300}hasCompletedOnboarding/)
  assert.match(init, /store\.set\('overlayOpacityMigrated', true\)/)
  assert.ok(init.indexOf('migrateLegacyOverlayOpacity') < init.indexOf('createOverlayWindow()'), 'migrate first')
})

// ── a hidden overlay must not catch clicks ──────────────────────────────────────────────────────────
test('a hidden overlay (opacity 0) is click-through, and showing it restores capture', () => {
  const sync = bodyOf(main, 'syncOverlayMouseCapture')
  const hidden = sync.slice(sync.indexOf('if (!overlayVisible)'), sync.indexOf('if (passthrough)'))
  assert.match(hidden, /overlayWindow\.setIgnoreMouseEvents\(true\)/)
  assert.match(hidden, /overlayMouseCaptureApplied = 'ignore'/)
  // Both ways of showing the overlay re-run the sync AFTER the window is visible again.
  const present = bodyOf(main, 'presentOverlayWindow')
  assert.ok(present.indexOf('overlayWindow.setOpacity(targetOpacity)') < present.lastIndexOf('syncOverlayMouseCapture()'))
  assert.match(present, /overlayMouseCapture|syncOverlayMouseCapture\(\)/)
  assert.match(bodyOf(main, 'hideOverlay'), /syncOverlayMouseCapture\(\)/)
  // Created while hidden: invisible AND click-through from the first frame.
  assert.match(main, /overlayWindow\.setOpacity\(0\)\s*\n\s*syncOverlayMouseCapture\(\)/)
})

// ── only the position is saved by move / nudge / re-seat ─────────────────────────────────────────────
test('moving the overlay saves its position only, never the (often collapsed) live size', () => {
  const save = bodyOf(main, 'saveOverlayPosition')
  assert.match(save, /const \{ x, y \} = overlayWindow\.getBounds\(\)/)
  assert.match(save, /\{ \.\.\.prev, x, y \}/)
  assert.doesNotMatch(save, /width|height/)
  for (const fn of ['moveOverlay', 'reseatOverlayIfOffscreen']) {
    const body = bodyOf(main, fn)
    assert.match(body, /saveOverlayPosition\(\)/, `${fn} saves the position`)
    assert.doesNotMatch(body, /store\.set\('overlayBounds'/, `${fn} must not write the whole window bounds`)
  }
  assert.match(main, /overlayWindow\.on\('moved',[\s\S]{0,300}saveOverlayPosition\(\)/, 'a dragged overlay is remembered')
})

test('a saved collapsed height (left by the old bug) is healed at startup instead of becoming the panel size', () => {
  const create = bodyOf(main, 'createOverlayWindow')
  assert.match(create, /const h = savedBounds\.height > 48 \? savedBounds\.height : 540/)
  assert.match(create, /store\.set\('overlayBounds', \{ \.\.\.savedBounds, height: h \}\)/)
})

// ── Settings → Apply size ───────────────────────────────────────────────────────────────────────────
test('Apply size no longer writes back a stale snapshot, and stays on screen', () => {
  const apply = settingsApp.slice(settingsApp.indexOf('const applyOverlaySize'), settingsApp.indexOf('const snapOverlayToPreset'))
  assert.doesNotMatch(apply, /save\('overlayBounds'/, 'would overwrite x/y with the position Settings read when it opened')
  assert.match(apply, /apply-overlay-display', \{ width: w, height: h \}/)
  const snap = settingsApp.slice(settingsApp.indexOf('const snapOverlayToPreset'), settingsApp.indexOf('/** Registration state'))
  assert.match(snap, /b\.height > 48/, 'the collapsed live height is never shown as the panel height')
  const display = main.slice(main.indexOf("typeof opts.width === 'number' || typeof opts.height === 'number'"))
  assert.match(display.slice(0, 1800), /applyOverlayResize\(w, curH <= 48 \? curH : h\)/)
  assert.doesNotMatch(display.slice(0, 1800), /overlayWindow\.setSize\(/, 'raw setSize could run off-screen')
})

test('Settings only accepts heights the overlay can really show (280px minimum)', () => {
  assert.match(settingsConsts, /minH: 280/)
  assert.match(main, /Math\.min\(940, Math\.max\(280, Math\.round\(opts\.height\)\)\)/)
  // renderer: notch (42) + gap (10) + 220 + 8 = 280
  assert.match(overlayApp, /const minExpandedH = PILL_H \+ STACK_GAP \+ 220 \+ 8/)
  assert.match(overlayApp, /const PILL_H = NOTCH_INNER_H \+ NOTCH_BORDER_H/)
  assert.match(overlayApp, /const STACK_GAP = 10/)
  assert.match(overlayApp, /const NOTCH_INNER_H = 40/)
  assert.match(overlayApp, /const NOTCH_BORDER_H = 2/)
})

// ── Settings stays in step with changes made elsewhere ──────────────────────────────────────────────
test('an open Settings window learns about Ctrl+Shift+P and about dragging the overlay edge', () => {
  const toggle = bodyOf(main, 'toggleMousePassthrough')
  assert.match(toggle, /sendToSettingsWindow\('overlay-display-update', \{ overlayMousePassthroughEnabled: next \}\)/)
  assert.match(main, /overlay-resize-end[\s\S]{0,600}if \(b\.height > 48\) sendToSettingsWindow\('overlay-display-update', \{ overlayBounds: \{ width: b\.width, height: b\.height \} \}\)/)
  // ...and Settings finally does something with it (the listener used to have an empty body).
  const listener = settingsApp.slice(settingsApp.indexOf("ipc.on('overlay-display-update'"), settingsApp.indexOf("ipc.on('settings-toast'"))
  assert.match(listener, /typeof p\.overlayMousePassthroughEnabled === 'boolean'/)
  assert.match(listener, /setOverlayMousePassthroughUi\(p\.overlayMousePassthroughEnabled\)/)
  assert.match(listener, /setOverlayW\(Math\.round\(b\.width\)\)/)
  assert.match(listener, /setOverlayH\(Math\.round\(b\.height\)\)/)
  assert.doesNotMatch(listener, /\(_, p\) => \{\s*\}\)/, 'no empty handler')
})

// ── the hit-region safety net backs off but never stops ─────────────────────────────────────────────
test('the hit-region safety net slows down when idle but keeps running while the overlay is shown', () => {
  const hook = read('renderer', 'overlay', 'useOverlayBoundedRegions.js')
  assert.doesNotMatch(hook, /setInterval|clearInterval/, 'the old interval cancelled itself after ~2s and was never re-created')
  assert.match(hook, /const tick = \(\) => \{\s*pushRegions\(false\)\s*pushTimer = window\.setTimeout\(tick, nextRegionPollDelay\(unchangedTicksRef\.current\)\)/)
  assert.match(hook, /window\.clearTimeout\(pushTimer\)/, 'and it is cleaned up when the overlay hides')

  const fast = Number(hook.match(/REGION_PUSH_INTERVAL_MS = (\d+)/)[1])
  const idle = Number(hook.match(/REGION_PUSH_IDLE_MS = (\d+)/)[1])
  const fnSource = hook.slice(hook.indexOf('export function nextRegionPollDelay'), hook.indexOf('function roundRect')).replace('export ', '')
  const delay = new Function(`const REGION_PUSH_INTERVAL_MS = ${fast}, REGION_PUSH_IDLE_MS = ${idle}; ${fnSource}; return nextRegionPollDelay`)()
  assert.equal(delay(0), fast)
  assert.equal(delay(4), fast, 'still fast through the first stable ticks')
  assert.equal(delay(5), idle, 'slower once stable')
  assert.equal(delay(100000), idle, 'and never stops, however long it stays stable')
  assert.ok(idle > fast && Number.isFinite(delay(1e9)) && delay(1e9) > 0)
})
