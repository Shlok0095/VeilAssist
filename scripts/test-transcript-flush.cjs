#!/usr/bin/env node
/** Asserts transcript flush matches working package 2026.11.01.03.01 (+ mic ref wipe). */
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

console.log('\n── Transcript flush (aligned to 2026.11.01.03.01) ──\n')

check(
  'clearRollingSpeech zeroes mic + latest transcript refs',
  /micTranscriptRef\.current = ''\s*\n\s*latestTranscriptRef\.current = ''/.test(overlay),
)
check(
  'does NOT use post-flush STT suppress blackout',
  !/suppressTranscriptUntilRef/.test(overlay),
)
check(
  'does NOT gate processTranscribedText on manualAskBusy',
  !/manualAskBusy/.test(overlay),
)
check(
  'manual ask clears only after successful settle (not at start)',
  /askResult\?\.ok === true && isManualAsk[\s\S]{0,40}clearRollingSpeech\(\)/.test(overlay) &&
    !/Snapshot is already captured[\s\S]{0,200}clearRollingSpeech\(\)/.test(overlay),
)
check(
  'onThinking still clears for non-auto',
  /Ctrl\+Enter \/ typed ask: always clear the live transcript[\s\S]{0,80}clearRollingSpeech\(\)/.test(overlay),
)
check(
  'main uses watermark clear like 2026.11.01.03.01',
  /preserveTranscript === true/.test(main) &&
    /clearTranscriptThrough\(Number\(_askMeta\.transcriptWatermarkAt\)\)/.test(main) &&
    !/Manual Ask: always drop session speech/.test(main),
)

// Ordering guard — regression that made captions stick after 2026.11.03.02.01:
// micPaused / echo-guard must not arm before local-stt:flush finals land in the snapshot.
const askFnMatch = overlay.match(
  /lastAskRef\.current = \{[\s\S]*?void \(async \(\) => \{[\s\S]*?settleWithinAskFlushTimeout\(flushChannels\)[\s\S]*?const segmentSnapshot/,
)
check('Ask path still flushes then snapshots', !!askFnMatch)
if (askFnMatch) {
  const beforeSnapshot = askFnMatch[0]
  check(
    'micPausedForAskRef is NOT armed before settleWithinAskFlushTimeout',
    !/micPausedForAskRef\.current = true/.test(
      beforeSnapshot.slice(0, beforeSnapshot.indexOf('settleWithinAskFlushTimeout')),
    ),
  )
  check(
    'micPausedForAskRef arms only after flush+snapshot watermark',
    /settleWithinAskFlushTimeout\(flushChannels\)[\s\S]*?transcriptWatermarkAt[\s\S]*?micPausedForAskRef\.current = true/.test(
      overlay,
    ),
  )
}

check(
  'processTranscribedText has no early-return that drops STT solely for micPaused',
  !/if\s*\(\s*micPausedForAskRef\.current\s*\)\s*return/.test(overlay) &&
    !/if\s*\([^)]*micPausedForAskRef\.current[^)]*\)\s*\{\s*return/.test(
      overlay.slice(overlay.indexOf('function processTranscribedText')),
    ),
)

if (failed) {
  console.log(`\n${failed} check(s) failed\n`)
  process.exit(1)
}
console.log('\nTranscript flush checks passed.\n')
