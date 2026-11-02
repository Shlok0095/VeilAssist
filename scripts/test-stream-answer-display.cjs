#!/usr/bin/env node
/**
 * Overlay stream display — Natively-style plain text while generating.
 * Usage: node scripts/test-stream-answer-display.cjs
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  stripMarkdownForStreamDisplay,
  splitStreamTakeaway,
  streamPreviewIntervalFor,
} = require('../renderer/overlay/streamAnswerDisplay.js')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  PASS  ${name}`)
  } catch (e) {
    failed += 1
    console.log(`  FAIL  ${name} — ${e.message}`)
  }
}

console.log('\n── Stream answer display ──\n')

test('strips markdown fences and bold', () => {
  const raw = '**Takeaway:** Use a hash map.\n\n```python\nx = 1\n```'
  const plain = stripMarkdownForStreamDisplay(raw)
  assert(!plain.includes('**'), plain)
  assert(!plain.includes('```'), plain)
  assert(plain.includes('Use a hash map'), plain)
  assert(plain.includes('x = 1'), plain)
})

test('splitStreamTakeaway extracts first paragraph', () => {
  const raw = 'Lead with a direct answer.\n\nThen explain the approach in detail.'
  const { takeaway, rest } = splitStreamTakeaway(raw)
  assert.strictEqual(takeaway, 'Lead with a direct answer.')
  assert.ok(rest.includes('explain the approach'))
})

test('splitStreamTakeaway handles single paragraph', () => {
  const { takeaway, rest } = splitStreamTakeaway('Only one block here.')
  assert.strictEqual(takeaway, 'Only one block here.')
  assert.strictEqual(rest, '')
})

test('streamPreviewIntervalFor is one display frame (InterviewMan paints every chunk)', () => {
  assert.strictEqual(streamPreviewIntervalFor(100), 16)
  assert.strictEqual(streamPreviewIntervalFor(3000), 16)
  assert.strictEqual(streamPreviewIntervalFor(8000), 16)
})

test('overlay paints the stream on rAF and follows the growing bubble', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'overlay', 'App.jsx'), 'utf8')
  assert(app.includes('window.requestAnimationFrame'), 'stream preview uses rAF')
  assert(app.includes('cancelStreamPreviewFlush'), 'pending frames are cancelled on commit')
  const panel = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'overlay', 'components', 'ResponsePanel.jsx'), 'utf8')
  assert(panel.includes('container.scrollTop = Math.max(0, blockBottom - container.clientHeight + 12)'))
  assert(!panel.includes('STREAM_SCROLL_MAX_STEP_PX'), 'no stepped 28px scroll lag')
  assert(!panel.includes('splitStreamTakeaway'), 'live stream is one growing bubble, not a takeaway split')
  assert(panel.includes('STREAM_SCROLL_AWAY_PX = 50'), 'user scroll away pauses follow, like InterviewMan')
  assert(panel.includes('followPausedRef'), 'auto-scroll does not yank back after Ctrl+Shift+Up')
  assert(
    panel.includes('const followStream = false'),
    'answer auto-scroll retired — stream never follows',
  )
  assert(app.includes('autoAnswerStream={autoAnswerStream}'), 'overlay passes auto-answer stream flag')
  assert(!app.includes('overlayAnswerAutoScroll={overlayAnswerAutoScroll &&'), 'manual Ctrl+Enter is not gated at the setting prop')
})

console.log(`\n${passed}/${passed + failed} passed`)
if (failed) process.exit(1)
