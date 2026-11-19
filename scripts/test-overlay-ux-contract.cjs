// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

/**
 * Overlay smoothness / UX contracts (Stage 1 of docs/PERFORMANCE_AND_UX_PLAN.md).
 *
 *  - O1  a rejected ask keeps the typed text (handleAsk reports acceptance; InputBar clears only on accept)
 *  - O2  the resize handle registers `mouseup` before get-window-bounds resolves (no stuck resize mode)
 *  - O3  markdown blocks are memoized on content, so streaming re-renders only the growing block
 *  - O5/O6/O7/O9  idle animation is compositor-only, long tokens wrap, live regions are sane, captions are capped
 *
 * O3 is tested behaviourally: the REAL parseMarkdown / sameMarkdownNode are extracted from ResponsePanel.jsx
 * and a realistic answer is "streamed" in small increments.
 *
 * Usage: node scripts/test-overlay-ux-contract.cjs
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8').replace(/\r\n/g, '\n')
const app = read('renderer', 'overlay', 'App.jsx')
const panel = read('renderer', 'overlay', 'components', 'ResponsePanel.jsx')
const input = read('renderer', 'overlay', 'components', 'InputBar.jsx')
const css = read('renderer', 'overlay', 'index.css')
const caption = read('renderer', 'overlay', 'components', 'RollingTranscript.jsx')
const search = read('renderer', 'overlay', 'components', 'PastMeetingSearch.jsx')

let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}\n      ${String(e && e.message).split('\n')[0]}`)
  }
}
function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker)
  assert.ok(a >= 0, `marker not found: ${startMarker}`)
  const b = src.indexOf(endMarker, a + startMarker.length)
  assert.ok(b >= 0, `end marker not found: ${endMarker}`)
  return src.slice(a, b)
}

// ── O1: rejected asks keep the typed text ───────────────────────────────────────────────────────────────
const handleAsk = slice(app, 'const handleAsk = useCallback(', 'handleAskRef.current = handleAsk')

test('O1 handleAsk returns false on every up-front rejection and true once started', () => {
  assert.match(handleAsk, /if \(opts\.auto === true\) return false/)
  assert.match(handleAsk, /BLOCKED: response in-flight'\)\n\s+return false/)
  assert.match(handleAsk, /BLOCKED: already processing'\)\n\s+return false/)
  assert.match(handleAsk, /if \(isProcessingAskRef\.current\) return false/)
  assert.match(handleAsk, /if \(!sessionOnRef\.current\) return false/)
  assert.match(handleAsk, /MIN_ASK_GAP_MS\) return false/)
  assert.match(handleAsk, /\}\)\(\)\n\s+return true\n\s+\},/)
})

test('O1 no bare `return` is left between the entry of handleAsk and the async launch', () => {
  const head = handleAsk.slice(0, handleAsk.indexOf('void (async () => {'))
  // Early exits in the synchronous part must carry a value; `return` alone would read as "accepted".
  const bare = head.split('\n').filter((l) => /^\s*(if \(.*\) )?return\s*$/.test(l) && !/return (true|false)/.test(l))
  assert.deepStrictEqual(bare, [])
})

test('O1 InputBar clears the text only when the ask was not rejected', () => {
  assert.match(input, /const accepted = onAsk\(trimmed,/)
  assert.match(input, /if \(accepted === false\) flagRejected\(\)\s*\n\s*else setValue\(''\)/)
  // the old unconditional clear must be gone
  assert.ok(!/onAsk\(trimmed, \{ source: 'typed', bypassCaptureCooldown: true \}\)\n\s+setValue\(''\)/.test(input))
})

test('O1 the input-box handler reports acceptance and keeps focus-mode input open on rejection', () => {
  assert.match(app, /const handleInputAsk = useCallback\(/)
  assert.match(app, /if \(accepted !== false && overlayFocusMode\) setFocusInputOpen\(false\)\s*\n\s+return accepted/)
  assert.match(app, /onAsk=\{handleInputAsk\}/)
})

test('O1 a rejected ask is announced to assistive tech without removing the text', () => {
  assert.match(input, /role="status" aria-live="polite"/)
  assert.match(input, /your text is kept/)
  assert.match(css, /\.crystal-input-nudge\s*\{[^}]*animation: crystal-input-nudge/)
})

test('O8 the disabled input explains itself instead of saying "type here"', () => {
  assert.match(input, /sessionOn \? 'type here' : 'Start listening to ask a question'/)
})

// ── O2: resize handle cannot get stuck ──────────────────────────────────────────────────────────────────
test('O2 resize registers mouseup synchronously, before get-window-bounds resolves', () => {
  const handle = slice(app, 'function ResizeHandle(', 'const style =')
  const up = handle.indexOf("document.addEventListener('mouseup', onUp)")
  const bounds = handle.indexOf("ipc?.invoke('get-window-bounds')")
  assert.ok(up > 0 && bounds > 0, 'both calls present')
  assert.ok(up < bounds, 'mouseup listener must be added before the bounds IPC is awaited')
  assert.match(handle, /if \(!bounds \|\| released\) \{\s*\n\s+abortResize\(\)/)
  assert.match(handle, /\.catch\(\(\) => abortResize\(\)\)/)
})

test('O2 finishing a resize removes both listeners and leaves resize mode exactly once', () => {
  const handle = slice(app, 'function ResizeHandle(', 'const style =')
  assert.match(handle, /document\.removeEventListener\('mousemove', onMove\)\s*\n\s+document\.removeEventListener\('mouseup', onUp\)/)
  assert.strictEqual((handle.match(/classList\.remove\('overlay-resizing'\)/g) || []).length, 2) // abort + finish
  assert.match(handle, /if \(finished\) return\s*\n\s+finished = true/)
})

// ── O3: memoized markdown, tested behaviourally ─────────────────────────────────────────────────────────
const parserSrc =
  slice(panel, 'function isProseFenceLang(', 'function normalizeInterviewAnswerMarkdown(') +
  slice(panel, 'function normalizeInterviewAnswerMarkdown(', '/** Parsed markdown cache')
const equalSrc = slice(panel, 'function sameMarkdownNode(a, b) {', '/**\n * One rendered markdown block.')
// eslint-disable-next-line no-new-func
const { parseMarkdown, sameMarkdownNode } = new Function(`${parserSrc}\n${equalSrc}\nreturn { parseMarkdown, sameMarkdownNode }`)()

const ANSWER = [
  '## Approach',
  'We build the pipeline in three stages so each one can be tested on its own and replaced without touching the others.',
  '',
  '- Ingest: read events from the queue and validate the schema',
  '  - reject malformed records early',
  '  - keep a dead-letter copy for replay',
  '- Transform: normalise timestamps and enrich with the customer record',
  '- Load: write in batches of 500 with an idempotency key',
  '',
  '1. Start with the happy path',
  '2. Add retries with backoff',
  '3. Add metrics and alerting',
  '',
  '> Keep each stage small enough to explain in one sentence.',
  '',
  '```python',
  'def load(batch):',
  '    for row in batch:',
  '        upsert(row, key=row.id)',
  '```',
  '',
  'The main trade-off is latency versus cost: larger batches are cheaper but delay the first row by a few seconds.',
].join('\n')

test('O3 parseMarkdown extraction works on a realistic answer', () => {
  const nodes = parseMarkdown(ANSWER)
  const types = nodes.map((n) => n.type)
  for (const t of ['h2', 'p', 'ul', 'ol', 'blockquote', 'code']) assert.ok(types.includes(t), `missing ${t}: ${types}`)
})

test('O3 sameMarkdownNode: equal content with different identity is equal; any real change is not', () => {
  const a = parseMarkdown(ANSWER)
  const b = parseMarkdown(ANSWER)
  assert.ok(a !== b && a.every((n, i) => n !== b[i]), 'fresh objects each parse')
  assert.ok(a.every((n, i) => sameMarkdownNode(n, b[i])))
  const p = { type: 'p', content: 'hello' }
  assert.ok(!sameMarkdownNode(p, { type: 'p', content: 'hello w' }))
  assert.ok(!sameMarkdownNode(p, { type: 'h1', content: 'hello' }))
  assert.ok(!sameMarkdownNode({ type: 'code', lang: 'js', content: 'x' }, { type: 'code', lang: 'ts', content: 'x' }))
  const ul = (items) => ({ type: 'ul', items })
  assert.ok(sameMarkdownNode(ul([{ text: 'a', subs: ['x'] }]), ul([{ text: 'a', subs: ['x'] }])))
  assert.ok(!sameMarkdownNode(ul([{ text: 'a', subs: ['x'] }]), ul([{ text: 'a', subs: ['x', 'y'] }])))
  assert.ok(!sameMarkdownNode(ul([{ text: 'a', subs: [] }]), ul([{ text: 'a', subs: [] }, { text: 'b', subs: [] }])))
  assert.ok(!sameMarkdownNode(ul([{ text: 'a', subs: [] }]), ul([{ text: 'b', subs: [] }])))
  assert.ok(sameMarkdownNode({ type: 'blockquote', items: ['q'] }, { type: 'blockquote', items: ['q'] }))
  assert.ok(!sameMarkdownNode({ type: 'blockquote', items: ['q'] }, { type: 'blockquote', items: ['q2'] }))
  assert.ok(sameMarkdownNode({ type: 'hr' }, { type: 'hr' }))
})

test('O3 while an answer streams, only the growing block(s) re-render (and the work is measured)', () => {
  const STEP = 14 // characters per flush, ~ a 30 fps flush of a typical token rate
  let prev = []
  let flushes = 0
  let allBlocksRendered = 0 // old behaviour: every block re-renders on every flush
  let memoBlocksRendered = 0 // new behaviour: only blocks whose content changed
  let worst = 0
  for (let end = STEP; end <= ANSWER.length + STEP; end += STEP) {
    const nodes = parseMarkdown(ANSWER.slice(0, Math.min(end, ANSWER.length)))
    let changed = 0
    nodes.forEach((n, i) => {
      if (!prev[i] || !sameMarkdownNode(prev[i], n)) changed++
    })
    flushes++
    allBlocksRendered += nodes.length
    memoBlocksRendered += changed
    worst = Math.max(worst, changed)
    prev = nodes
  }
  const saved = 100 * (1 - memoBlocksRendered / allBlocksRendered)
  console.log(
    `INFO  ${ANSWER.length}-char answer, ${flushes} flushes: block renders ${allBlocksRendered} → ${memoBlocksRendered} (${saved.toFixed(0)}% fewer); worst single flush re-renders ${worst} block(s)`,
  )
  assert.ok(worst <= 3, `a single flush re-rendered ${worst} blocks`)
  assert.ok(memoBlocksRendered < allBlocksRendered * 0.6, 'memoization should skip well over 40% of block renders')
})

test('O3 MarkdownNodes still renders every node type through the memoized block (no key/DOM-shape change)', () => {
  assert.match(panel, /const MarkdownNode = memo\(/)
  assert.match(panel, /\(prev, next\) => prev\.suppressHighlight === next\.suppressHighlight && sameMarkdownNode\(prev\.n, next\.n\)/)
  assert.match(panel, /<MarkdownNode key=\{i\} n=\{n\} suppressHighlight=\{suppressHighlight\} \/>/)
  for (const t of ['code', 'hr', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol']) assert.ok(new RegExp(`n\\.type === '${t}'`).test(panel), t)
})

// ── O5 / O6 / O7 / O9 ───────────────────────────────────────────────────────────────────────────────────
test('O6 idle empty-state animation no longer animates box-shadow (compositor-only opacity instead)', () => {
  const kf = slice(css, '@keyframes crystalEmptyBreathe', '.crystal-empty-icon-ring {')
  assert.ok(!/box-shadow/.test(kf), 'keyframes must not animate box-shadow')
  assert.match(kf, /opacity/)
  assert.match(css, /\.crystal-empty-icon-ring::after\s*\{[^}]*animation: crystalEmptyBreathe[^}]*infinite/)
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\n\s*\.crystal-empty-icon-ring::after \{ animation: none !important; \}/)
})

test('O5 the empty state explains what to do', () => {
  assert.match(panel, /Ready when you are/)
  assert.match(panel, /Type a question below, or use your Ask shortcut to read the screen/)
})

test('O6 long URLs/identifiers wrap in committed answers and flex list items can shrink', () => {
  assert.match(panel, /crystal-answer-text \[overflow-wrap:anywhere\]/)
  assert.strictEqual((panel.match(/<span className="min-w-0" dangerouslySetInnerHTML/g) || []).length, 4)
})

test('O6 focus ring is a solid accent outline, and script-focused tabindex=-1 containers are excluded', () => {
  assert.match(css, /\[tabindex\]:not\(\[tabindex='-1'\]\):focus-visible\s*\{\s*outline: 2px solid rgb\(var\(--accent-light-rgb\)/)
  assert.ok(!/box-shadow: 0 0 0 2px rgba\(255, 255, 255, 0\.20\)/.test(css))
})

test('O7 live captions are not announced; answers are announced once, when added', () => {
  assert.match(app, /crystal-transcript-bar min-w-0 flex-1" aria-live="off"/)
  assert.match(panel, /role="log"\s*\n\s+aria-live="polite"\s*\n\s+aria-relevant="additions"/)
  assert.match(panel, /aria-busy=\{isThinking \? 'true' : 'false'\}/)
})

test('O9 caption bar renders only the tail of the rolling transcript', () => {
  assert.match(caption, /const CAPTION_TAIL_CHARS = 400/)
  assert.match(caption, /fullText\.slice\(-CAPTION_TAIL_CHARS\)/)
})

test('O13 past-meeting search says "No matches" only after a search ran, and reports failures', () => {
  assert.match(search, /searched && searched === query\.trim\(\) && !busy/)
  assert.match(search, /catch \{\s*\n\s+setHits\(\[\]\)/)
  assert.match(search, /Search failed\. Try again\./)
})

if (failed) {
  console.log(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll overlay UX contract checks passed')
