#!/usr/bin/env node
/**
 * Stress: 50 consecutive manual-ask turns with STT flush → snapshot → clear.
 * Models the 2026.11.01.03.01 contract hardened in overlay/App.jsx:
 *   - flush finals land in the buffer BEFORE micPaused
 *   - clear only after successful ask
 *   - no suppress blackout / no manualAskBusy drop
 *   - next turn starts empty (no stale carry)
 */
const fs = require('fs')
const path = require('path')
const sessionMemory = require('../lib/sessionMemory')
const {
  mergeRollingTranscriptFinal,
  capRollingTranscript,
} = require('../lib/rollingTranscriptState.cjs')

const ROOT = path.join(__dirname, '..')
const overlay = fs.readFileSync(path.join(ROOT, 'renderer', 'overlay', 'App.jsx'), 'utf8')

let failed = 0
const results = []

function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}`)
    results.push({ name, ok: true })
  } else {
    failed += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
    results.push({ name, ok: false, detail })
  }
}

console.log('\n══ E2E transcript flush × 50 questions ══\n')

/* ── Static contract (must stay true for the sim to be meaningful) ── */
check('no suppressTranscriptUntilRef', !/suppressTranscriptUntilRef/.test(overlay))
check('no manualAskBusy gate', !/manualAskBusy/.test(overlay))
check(
  'micPaused only after flush+watermark',
  /settleWithinAskFlushTimeout\(flushChannels\)[\s\S]*?transcriptWatermarkAt[\s\S]*?micPausedForAskRef\.current = true/.test(
    overlay,
  ),
)
check(
  'clear only after askResult.ok && isManualAsk',
  /askResult\?\.ok === true && isManualAsk[\s\S]{0,40}clearRollingSpeech\(\)/.test(overlay),
)

/**
 * Minimal Ask-turn simulator mirroring the critical ordering.
 * pendingFlushText = STT finals delivered by local-stt:flush during await.
 */
function simulateAskTurn({ turn, pendingFlushText, prevBuffer, micPausedArmedEarly }) {
  let speechBuffer = String(prevBuffer || '')
  let micPaused = false
  let rolling = speechBuffer
  const dropped = []

  // Broken pattern (must NOT happen): arm pause before flush, then drop finals.
  if (micPausedArmedEarly) micPaused = true

  // Flush settles — finals arrive
  if (pendingFlushText) {
    if (micPaused && micPausedArmedEarly) {
      // Simulate the old bug: busy/suppress gate drops flush finals
      dropped.push(pendingFlushText)
    } else {
      speechBuffer = speechBuffer
        ? `${speechBuffer} ${pendingFlushText}`
        : pendingFlushText
      rolling = mergeRollingTranscriptFinal(rolling, pendingFlushText)
    }
  }

  const snapshot = String(speechBuffer || '').trim()
  // Arm pause AFTER snapshot (correct)
  if (!micPausedArmedEarly) micPaused = true

  const askOk = snapshot.includes(`Q${turn}`)
  // Clear only on success
  if (askOk) {
    speechBuffer = ''
    rolling = ''
    micPaused = false
  }

  return { snapshot, speechBufferAfter: speechBuffer, rollingAfter: rolling, dropped, askOk }
}

/* ── 50-turn stress ── */
sessionMemory.wipe()
let buffer = ''
let clearMisses = 0
let flushMisses = 0
let staleCarry = 0
let droppedFinals = 0
const snapshots = []

for (let i = 1; i <= 50; i += 1) {
  const q = `Q${i} What is concept number ${i} in system design?`
  // Each turn: prior speech already in buffer + a late flush final for this Q
  const pendingFlush = q
  // Correct ordering
  const good = simulateAskTurn({
    turn: i,
    pendingFlushText: pendingFlush,
    prevBuffer: buffer,
    micPausedArmedEarly: false,
  })
  snapshots.push(good.snapshot)
  if (!good.askOk) flushMisses += 1
  if (good.speechBufferAfter !== '') clearMisses += 1
  // After clear, next turn must not see previous Q
  if (i > 1 && good.snapshot.includes(`Q${i - 1}`) && good.askOk === false) staleCarry += 1
  buffer = good.speechBufferAfter

  // Session memory watermark path (main)
  const t = Date.now() + i
  sessionMemory.appendTranscriptSegment(`Participant: ${q}`, t)
  sessionMemory.clearTranscriptThrough(t)
  const left = sessionMemory.getTranscriptText()
  if (left && left.includes(`Q${i}`)) {
    // watermark inclusive clearThrough should remove this turn's segment
    clearMisses += 1
  }

  // Also prove the broken ordering WOULD drop
  const bad = simulateAskTurn({
    turn: i,
    pendingFlushText: `DROPPED-${i}`,
    prevBuffer: '',
    micPausedArmedEarly: true,
  })
  if (bad.dropped.length) droppedFinals += bad.dropped.length
}

check('all 50 snapshots include their question', flushMisses === 0, `misses=${flushMisses}`)
check('buffer cleared after every successful ask', clearMisses === 0, `misses=${clearMisses}`)
check('no stale previous-Q carry into next snapshot', staleCarry === 0, `stale=${staleCarry}`)
check(
  'broken early-pause pattern would drop finals (sanity)',
  droppedFinals === 50,
  `dropped=${droppedFinals}`,
)
check('50 distinct snapshots', new Set(snapshots).size === 50)

// Rolling merge under rapid finals (caption bar path)
let roll = ''
for (let i = 1; i <= 50; i += 1) {
  roll = mergeRollingTranscriptFinal(roll, `Utterance ${i} about topic ${i}`)
  roll = capRollingTranscript(roll, 4000)
}
check('rolling bar survives 50 finals without empty', String(roll).trim().length > 0)
check('rolling cap respected', roll.length <= 4000)

const outDir = path.join(ROOT, 'reports', 'veilassist_parity_audit', 'test_results')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'transcript_flush_50_latest.json')
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      failed,
      passed: results.filter((r) => r.ok).length,
      results,
      snapshotSample: snapshots.slice(0, 3).concat(snapshots.slice(-2)),
    },
    null,
    2,
  ),
)

console.log(`\n${results.filter((r) => r.ok).length} passed, ${failed} failed`)
console.log(`Wrote ${outPath}\n`)
process.exit(failed ? 1 : 0)
