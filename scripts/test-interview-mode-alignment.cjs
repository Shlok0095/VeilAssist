#!/usr/bin/env node
/**
 * Interview / modes alignment battery.
 * Runs the scripts that prove Interview, Meeting, General + CAR/Conversational
 * / memory / resume routing stay wired after recent changes.
 *
 *   node scripts/test-interview-mode-alignment.cjs
 */
const { spawnSync } = require('child_process')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SUITE = [
  ['Modes shipped + session rules', 'scripts/test-default-modes.cjs'],
  ['Interview answer contract (CAR / format / length)', 'scripts/test-desktop-interview-wiring.cjs'],
  ['General Answers settings → prompt wiring', 'scripts/test-general-answer-settings-wiring.cjs'],
  ['Conversation Memory window (IM titles + tail)', 'scripts/test-conversation-memory-window.cjs'],
  ['Conversation follow-up memory helpers', 'scripts/test-conversation-memory.cjs'],
  ['Ask context priority + Interview mode kind', 'scripts/test-ask-context-priority.cjs'],
  ['Resume / JD routing in Interview', 'scripts/test-resume-jd-routing.cjs'],
  ['E2E answer context (Interview / Meeting / General)', 'scripts/e2e-answer-context.cjs'],
  ['E2E profile attach rules by mode', 'scripts/e2e-auto-manual-profile.cjs'],
  ['E2E profile memory + 3 modes UI', 'scripts/e2e-profile-memory.cjs'],
  ['Manual transcript flush after answer', 'scripts/test-transcript-flush.cjs'],
  ['Auto-answer retired (manual-only path)', 'scripts/test-autoanswer-retired.cjs'],
]

console.log('\n══ Interview / modes alignment ══\n')

const failed = []
for (const [label, rel] of SUITE) {
  process.stdout.write(`→ ${label} … `)
  const r = spawnSync(process.execPath, [path.join(ROOT, rel)], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  })
  if (r.status === 0) {
    console.log('PASS')
  } else {
    console.log('FAIL')
    failed.push({ label, rel, out: (r.stdout || '') + (r.stderr || '') })
  }
}

console.log('')
if (failed.length) {
  for (const f of failed) {
    console.log(`── FAIL: ${f.label} (${f.rel}) ──`)
    console.log(f.out.slice(-1200))
    console.log('')
  }
  console.log(`${SUITE.length - failed.length}/${SUITE.length} groups passed\n`)
  process.exit(1)
}

console.log(`ALL ${SUITE.length} groups passed — Interview / Meeting / General + CAR/memory wiring look aligned.\n`)
