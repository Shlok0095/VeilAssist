#!/usr/bin/env node
/**
 * Conversation memory: time window of heard speech + prior Q&A.
 * Usage (from landing/): node --experimental-strip-types scripts/test-conversation-memory.mjs
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const landing = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { selectConversationMemory } = await import(
  pathToFileURL(path.join(landing, 'src', 'mobile', 'settingsCatalog.ts')).href
)
const { transcriptInWindow } = await import(
  pathToFileURL(path.join(landing, 'src', 'mobile', 'transcriptSegments.ts')).href
)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const now = 1_000_000
const turns = [
  { question: 'Q0 old', answer: 'A0', at: now - 200_000 },
  { question: 'Q1', answer: 'A1', at: now - 50_000 },
  { question: 'Q2', answer: 'A2', at: now - 10_000 },
]

const s30 = selectConversationMemory(turns, 30, now)
assert(s30.length === 1 && s30[0].question === 'Q2', `30s should keep 1 turn, got ${JSON.stringify(s30)}`)

const s60 = selectConversationMemory(turns, 60, now)
assert(s60.length === 2 && s60[0].question === 'Q1', `60s should keep 2, got ${s60.length}`)

const s180 = selectConversationMemory(turns, 180, now)
assert(s180.length === 2, `3m excludes 200s-old turn, got ${s180.length}`)

assert(selectConversationMemory([], 30, now).length === 0, 'empty history')
assert(selectConversationMemory([{ question: 'Q', answer: 'A' }], 30, now).length === 1, 'missing timestamp counts as now')

const segs = [
  { id: 1, text: 'earlier intro', consumed: true, capturedAt: now - 80_000 },
  { id: 2, text: 'what is your stack', consumed: true, capturedAt: now - 12_000 },
  { id: 3, text: 'and why that choice', consumed: false, capturedAt: now - 4_000 },
]
assert(transcriptInWindow(segs, 30, now) === 'what is your stack and why that choice', '30s heard speech')
assert(transcriptInWindow(segs, 180, now).includes('earlier intro'), '3m includes older speech')
assert(transcriptInWindow(segs, 30, now).length <= 4000, 'cap')

console.log('PASS conversation memory time window → transcript + interview history')
