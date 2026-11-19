#!/usr/bin/env node
/**
 * Visible-mode Ask capture must NOT hide/opacity-blink the overlay.
 * Stealth and Visible both exclude via contentProtection for the snap.
 */
const fs = require('fs')
const path = require('path')

const main = fs.readFileSync(path.join(__dirname, '..', 'main', 'index.js'), 'utf8')

let failed = 0
function check(name, cond) {
  if (cond) console.log(`  PASS  ${name}`)
  else {
    failed += 1
    console.log(`  FAIL  ${name}`)
  }
}

console.log('\n── Capture no-blink (visible + stealth) ──\n')

const wrapperStart = main.indexOf('async function withOverlayExcludedFromScreenCapture')
check('withOverlayExcludedFromScreenCapture exists', wrapperStart >= 0)
const wrapperEnd = main.indexOf('\nfunction showOverlay()', wrapperStart)
const wrapper = main.slice(wrapperStart, wrapperEnd > wrapperStart ? wrapperEnd : wrapperStart + 1600)

check('stealth path still uses content protection in place', /stealthOn[\s\S]{0,200}applyOverlayContentProtection\(true\)/.test(wrapper))
check('visible path arms setContentProtection(true) temporarily', /setContentProtection\(true\)/.test(wrapper) && /armedTempProtection/.test(wrapper))
check('visible path restores protection to stealth state after snap', /setContentProtection\(want\)/.test(wrapper) || /applyOverlayContentProtection\(true\)/.test(wrapper))
check('visible path does NOT call hideOverlayForCapture', !/hideOverlayForCapture\(/.test(wrapper))
check('visible path does NOT presentOverlayWindow restore flash', !/presentOverlayWindow/.test(wrapper))
check('visible path does NOT setOpacity(0) for capture blink', !/setOpacity\(0\)/.test(wrapper))

// hideOverlayForCapture may still exist for other callers — ensure capture wrapper is the screen path
check('screenCapture uses withOverlayExcludedFromScreenCapture', /setOverlayCaptureWrapper\(withOverlayExcludedFromScreenCapture\)/.test(main))
check('hotkey pre-capture also uses wrapper', /withOverlayExcludedFromScreenCapture\(async/.test(main))

const comment = main.slice(main.indexOf('Overlay content protection follows stealth'), main.indexOf('Overlay content protection follows stealth') + 500)
check('docs say both modes avoid hide/show blink', /no hide\/show blink/.test(comment) || /both modes exclude/.test(comment))

if (failed) {
  console.log(`\n${failed} check(s) failed\n`)
  process.exit(1)
}
console.log('\nCapture no-blink checks passed.\n')
