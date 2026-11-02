#!/usr/bin/env node
/** Asserts manual-ask transcript flush wiring (UI + session memory). */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const overlay = fs.readFileSync(path.join(ROOT, 'renderer', 'overlay', 'App.jsx'), 'utf8')
const main = fs.readFileSync(path.join(ROOT, 'main', 'index.js'), 'utf8')

let failed = 0
function check(name, cond) {
  if (cond) console.log(`  PASS  ${name}`)
  else {
    failed += 1
    console.log(`  FAIL  ${name}`)
  }
}

console.log('\n── Transcript flush after response ──\n')

check('clearRollingSpeech zeroes mic + latest transcript refs', /micTranscriptRef\.current = ''\s*\n\s*latestTranscriptRef\.current = ''/.test(overlay))
check('clearRollingSpeech sets post-flush suppress window', /suppressTranscriptUntilRef\.current = Date\.now\(\) \+ 2000/.test(overlay))
check('processTranscribedText gates on manualAskBusy', /const manualAskBusy =/.test(overlay) && /isProcessingAskRef\.current/.test(overlay))
check('manual ask clears transcript at start', /Snapshot is already captured[\s\S]{0,200}if \(isManualAsk\) \{\s*\n\s*clearRollingSpeech\(\)/.test(overlay))
check('manual ask clears transcript after settle', /after the turn settles[\s\S]{0,200}if \(isManualAsk\) \{\s*\n\s*clearRollingSpeech\(\)/.test(overlay))
check('onThinking still clears for non-auto', /Ctrl\+Enter \/ typed ask: always clear the live transcript[\s\S]{0,80}clearRollingSpeech\(\)/.test(overlay))
check('main clears full session transcript on manual ask', /Manual Ask: always drop session speech[\s\S]{0,120}sessionMemory\.clearTranscript\(\)/.test(main))

if (failed) {
  console.log(`\n${failed} check(s) failed\n`)
  process.exit(1)
}
console.log('\nTranscript flush checks passed.\n')
