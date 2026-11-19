#!/usr/bin/env node
/**
 * Sprint B — resume/JD evidence retrieval + budgets.
 * Usage: node scripts/test-profile-evidence.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')

const { parseResumeTree, parseJdTree } = require('../lib/profileTreeService')
const {
  buildProfileChunks,
  retrieveProfileEvidence,
  charsFromTokenBudget,
  clipTextToBudget,
} = require('../lib/profileEvidence')
const { LAYER_BUDGET } = require('../lib/contextRouter')
const { INTELLIGENCE_FLAGS } = require('../lib/intelligenceFlags')

const SAMPLE_RESUME = `
SUMMARY
Senior frontend engineer with React and TypeScript.

SKILLS
React, TypeScript, Node.js, GraphQL

EXPERIENCE
Acme Corp — Built checkout with React and Stripe.
Beta Labs — Led migration from Angular to React.

PROJECTS
Realtime dashboard using WebSockets and Redis.

EDUCATION
B.S. Computer Science
`.trim()

const SAMPLE_JD = `
ROLE
Senior Frontend Engineer

REQUIREMENTS
5+ years React, TypeScript, GraphQL

RESPONSIBILITIES
Own UI architecture and mentoring
`.trim()

test('charsFromTokenBudget maps LAYER_BUDGET resume', () => {
  const chars = charsFromTokenBudget(LAYER_BUDGET.resume)
  assert.ok(chars >= 400)
  assert.equal(chars, Math.round(LAYER_BUDGET.resume * 4))
})

test('clipTextToBudget truncates with ellipsis', () => {
  const out = clipTextToBudget('a'.repeat(800), 250)
  assert.ok(out.length < 800)
  assert.ok(out.length <= 260)
  assert.ok(out.includes('…'))
})

test('buildProfileChunks is section-aware and pins summary/skills', async () => {
  const tree = parseResumeTree(SAMPLE_RESUME)
  const chunks = buildProfileChunks(tree, SAMPLE_RESUME)
  assert.ok(chunks.length >= 3)
  const pinned = chunks.filter((c) => c.pin)
  assert.ok(pinned.some((c) => c.section === 'summary'))
  assert.ok(pinned.some((c) => c.section === 'skills'))
})

test('retrieveProfileEvidence prefers experience for React query', async () => {
  const tree = parseResumeTree(SAMPLE_RESUME)
  const evidence = await retrieveProfileEvidence({
    tree,
    raw: SAMPLE_RESUME,
    query: 'Tell me about your React experience at Acme',
    maxChars: 1800,
    topK: 5,
  })
  assert.ok(evidence.evidenceCount >= 1)
  assert.ok(evidence.text.toLowerCase().includes('acme') || evidence.text.toLowerCase().includes('react'))
  assert.ok(evidence.sectionsUsed.includes('experience') || evidence.sectionsUsed.includes('skills'))
  assert.equal(evidence.usedEmbedding, false)
})

test('retrieveProfileEvidence respects maxChars budget', async () => {
  const tree = parseResumeTree(SAMPLE_RESUME)
  const evidence = await retrieveProfileEvidence({
    tree,
    raw: SAMPLE_RESUME,
    query: 'React TypeScript GraphQL Node',
    maxChars: 500,
    topK: 8,
  })
  assert.ok(evidence.charCount <= 560)
})

test('JD evidence surfaces requirements for role-fit query', async () => {
  const tree = parseJdTree(SAMPLE_JD)
  const evidence = await retrieveProfileEvidence({
    tree: { ...tree, kind: 'jd' },
    raw: SAMPLE_JD,
    query: 'What does this role require for React?',
    maxChars: 1200,
    topK: 4,
  })
  assert.ok(evidence.evidenceCount >= 1)
  assert.ok(
    evidence.sectionsUsed.includes('requirements') ||
      evidence.sectionsUsed.includes('role') ||
      /react/i.test(evidence.text),
  )
})

test('profileTreeV2 and vectorMemory default on in flags', () => {
  // profileTreeV2 is intentionally locked (no UI row) — assert store schema default.
  const store = require('../lib/store')
  assert.equal(store.schema.profileTreeV2Enabled.default, true)
  const vec = INTELLIGENCE_FLAGS.find((f) => f.id === 'vectorMemory')
  assert.equal(vec?.defaultOn, true)
  assert.equal(store.schema.vectorMemoryEnabled.default, true)
})
