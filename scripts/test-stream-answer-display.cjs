#!/usr/bin/env node
/**
 * Overlay stream display — InterviewMan paints markdown into the helper bubble live (A.mz / gpt_markdown).
 * Usage: node scripts/test-stream-answer-display.cjs
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

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

console.log('\n── Stream answer display (InterviewMan live markdown) ──\n')

const panel = fs.readFileSync(
  path.join(__dirname, '..', 'renderer', 'overlay', 'components', 'ResponsePanel.jsx'),
  'utf8',
)
const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'overlay', 'App.jsx'), 'utf8')
const streamHelper = fs.readFileSync(
  path.join(__dirname, '..', 'renderer', 'overlay', 'streamAnswerDisplay.js'),
  'utf8',
)

test('StreamingAnswerPreview renders MarkdownNodes (not stripped plain text)', () => {
  assert(panel.includes('function StreamingAnswerPreview'), 'StreamingAnswerPreview exists')
  assert(panel.includes('<MarkdownNodes nodes={nodes}'), 'live stream uses MarkdownNodes')
  assert(
    !/StreamingAnswerPreview[\s\S]{0,900}stripMarkdownForStreamDisplay/.test(panel),
    'stream preview must not strip markdown like the old Natively path',
  )
  assert(panel.includes('normalizeInterviewAnswerMarkdown'), 'IM-style bullet/Takeaway normalize before paint')
})

test('bullet glyph • becomes "- " before parse (IM cZb display path)', () => {
  assert(panel.includes("replace(/^([ \\t]*)•[ \\t]+/gm, '$1- ')"), '• → - marker')
})

test('splitStreamTakeaway is not used for live stream layout', () => {
  assert(!panel.includes('splitStreamTakeaway'), 'no takeaway split on live stream')
})

test('streamPreviewIntervalFor remains one display frame', () => {
  assert(streamHelper.includes('STREAM_PREVIEW_INTERVAL_MS = 16'))
})

test('overlay paints the stream on rAF', () => {
  assert(app.includes('window.requestAnimationFrame'), 'stream preview uses rAF')
  assert(app.includes('cancelStreamPreviewFlush'), 'pending frames are cancelled on commit')
  assert(panel.includes('container.scrollTop = Math.max(0, blockBottom - container.clientHeight + 12)'))
  assert(!panel.includes('STREAM_SCROLL_MAX_STEP_PX'), 'no stepped 28px scroll lag')
  assert(panel.includes('STREAM_SCROLL_AWAY_PX = 50'), 'user scroll away pauses follow, like InterviewMan')
  assert(panel.includes('followPausedRef'), 'auto-scroll does not yank back after Ctrl+Shift+Up')
  assert(panel.includes('const followStream = false'), 'answer auto-scroll retired — stream never follows')
  assert(app.includes('autoAnswerStream={autoAnswerStream}'), 'overlay passes auto-answer stream flag')
})

console.log(`\n${passed}/${passed + failed} passed`)
if (failed) process.exit(1)
