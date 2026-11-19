/**
 * Smoke test: longTermMemory retain + recall.
 * Usage: node scripts/test-long-term-memory.mjs
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const root = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.join(root, '..')
const require = createRequire(import.meta.url)

const { createLongTermMemoryStore } = require(path.join(appRoot, 'lib', 'longTermMemory.js'))

let passed = 0
function pass(msg) { console.log(`PASS  ${msg}`); passed++ }
function fail(msg, e) { console.error(`FAIL  ${msg} — ${e?.message || e}`) }

const mem = []
const store = {
  get(k) {
    if (k === 'longTermMemoryEnabled') return true
    if (k === 'longTermMemory') return mem
    return undefined
  },
  set(k, v) {
    if (k === 'longTermMemory') {
      mem.length = 0
      mem.push(...v)
    }
  },
}

const ltm = createLongTermMemoryStore(store)
ltm.retain({
  content: 'Discussed enterprise pricing objection and ROI calculator for Q3 pipeline.',
  source: 'meeting_summary',
  mode: 'Sales',
  meetingId: 'ms-1',
})
ltm.retain({
  content: 'Q: What discount can we offer?\nA: Up to 15% for annual commits.',
  source: 'meeting_exchanges',
  tags: ['qa'],
})

const hits = await ltm.recall('pricing objection last meeting discount')
if (!hits.length || !hits[0].text.includes('pricing')) {
  fail('recall pricing', new Error(JSON.stringify(hits)))
} else pass('recall keyword match')

const block = ltm.formatRecallBlock(hits)
if (!block.includes('LONG-TERM MEMORY')) fail('format block', new Error('missing header'))
else pass('formatRecallBlock')

const mainSrc = require('fs').readFileSync(path.join(appRoot, 'main', 'index.js'), 'utf8')
if (mainSrc.includes('longTermMemory.retain') || mainSrc.includes('createLongTermMemoryStore')) {
  fail('main no longer retains long-term memory', new Error('retain or store still wired'))
} else pass('main does not retain long-term memory')

console.log('')
console.log(`Done: ${passed} passed`)
process.exit(passed >= 3 ? 0 : 1)
