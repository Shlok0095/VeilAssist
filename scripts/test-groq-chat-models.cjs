#!/usr/bin/env node
// Copyright (c) 2026 VeilAssist. All rights reserved.
// Groq chat is vision-only. Qwen 3.6 is gone; Qwen 3.8 is the hosted replacement.
//   node scripts/test-groq-chat-models.cjs
//   GROQ_API_KEY=... node scripts/test-groq-chat-models.cjs

const assert = require('node:assert/strict')
const {
  DEFAULT_GROQ_CHAT_MODEL,
  isMultimodalChatModel,
  isDeprecatedGroqChatModel,
  filterMultimodalChatModels,
  staticAllowlist,
} = require('../lib/chatMultimodalModels')
const providers = require('../lib/providers')
const { groqFastVisionInferParams } = require('../lib/aiClient')
const catalog = require('../lib/chatModelCatalog.json')

const GROQ = 'qwen/qwen3.8-27b'

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log('ok', name)
    })
}

async function offline() {
  await check('Groq default is the live Qwen 3.8 vision model', () => {
    assert.equal(DEFAULT_GROQ_CHAT_MODEL, GROQ)
    assert.deepEqual(catalog.groq, [GROQ])
    assert.deepEqual(staticAllowlist('groq'), [GROQ])
    assert.equal(providers.REGISTRY.groq.defaultModel, GROQ)
    assert.equal(providers.REGISTRY.groq.testModel, GROQ)
  })

  await check('Qwen 3.6 and other retired Groq chat ids are not offered', () => {
    assert.equal(isDeprecatedGroqChatModel('qwen/qwen3.6-27b'), true)
    assert.equal(isMultimodalChatModel('groq', 'qwen/qwen3.6-27b'), false)
    assert.equal(isMultimodalChatModel('groq', 'meta-llama/llama-4-scout-17b-16e-instruct'), false)
    assert.equal(isMultimodalChatModel('groq', 'llama-3.3-70b-versatile'), false)
    assert.equal(isMultimodalChatModel('groq', 'openai/gpt-oss-120b'), false)
    assert.equal(isMultimodalChatModel('groq', 'whisper-large-v3'), false)
  })

  await check('only multimodal Groq ids survive a mixed catalog', () => {
    assert.equal(isMultimodalChatModel('groq', GROQ), true)
    assert.deepEqual(
      filterMultimodalChatModels('groq', [
        'llama-3.3-70b-versatile',
        'qwen/qwen3.6-27b',
        GROQ,
        'openai/gpt-oss-20b',
        'whisper-large-v3',
      ]),
      [GROQ],
    )
  })

  await check('a saved Qwen 3.6 id remaps to Qwen 3.8', () => {
    const get = (k) => (k === 'groqModel' ? 'qwen/qwen3.6-27b' : '')
    assert.equal(providers.getModelForProvider('groq', get), GROQ)
    assert.equal(providers.getTestModel('groq', get), GROQ)
  })

  await check('Groq generation turns thinking off so the spoken answer is visible', () => {
    const params = groqFastVisionInferParams()
    assert.equal(params.reasoning_effort, 'none')
    assert.ok(params.temperature > 0)
    assert.ok(params.temperature < 1)
  })
}

async function live(apiKey) {
  const listRes = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  assert.equal(listRes.status, 200, `models list HTTP ${listRes.status}`)
  const listed = ((await listRes.json()).data || []).map((row) => String(row.id || ''))
  const vision = filterMultimodalChatModels('groq', listed)
  console.log('live-groq-catalog', {
    total: listed.length,
    vision,
    has36: listed.includes('qwen/qwen3.6-27b'),
    has38: listed.includes(GROQ),
  })
  assert.equal(listed.includes('qwen/qwen3.6-27b'), false, 'Qwen 3.6 is still listed')
  assert.ok(listed.includes(GROQ), 'Qwen 3.8 is not on this Groq account')
  assert.deepEqual(vision.filter((id) => id === GROQ || /muse-spark/i.test(id)), vision)

  const textRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ,
      messages: [{
        role: 'user',
        content: 'I am in a job interview. Answer in one spoken first-person sentence: what is a REST API?',
      }],
      max_tokens: 120,
      ...groqFastVisionInferParams(),
    }),
  })
  const textJson = await textRes.json()
  const spoken = String(textJson.choices?.[0]?.message?.content || '')
  console.log('live-groq-text', textRes.status, spoken.replace(/\s+/g, ' ').slice(0, 220))
  assert.equal(textRes.status, 200)
  assert.match(spoken, /api|http|resource|endpoint/i)
  assert.doesNotMatch(spoken, /as an ai|language model/i)

  const sharp = require('sharp')
  const png = await sharp(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="220">
  <rect width="100%" height="100%" fill="white"/>
  <text x="36" y="90" font-size="48" font-family="Arial" fill="black">Ada Lovelace</text>
  <text x="36" y="160" font-size="28" font-family="Arial" fill="black">Analytical Engines</text>
</svg>`)).png().toBuffer()
  const visionRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Read the name on this picture. Reply with IMAGE and that name.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
        ],
      }],
      max_tokens: 40,
      ...groqFastVisionInferParams(),
    }),
  })
  const visionJson = await visionRes.json()
  const seen = String(visionJson.choices?.[0]?.message?.content || '')
  const err = String(visionJson.error?.message || visionJson.message || '').replace(/\s+/g, ' ').slice(0, 240)
  console.log('live-groq-vision', visionRes.status, seen.replace(/\s+/g, ' ').slice(0, 160) || err)
  assert.equal(visionRes.status, 200, err || `HTTP ${visionRes.status}`)
  assert.match(seen, /image/i)
  assert.match(seen, /lovelace/i)
}

async function main() {
  await offline()
  const key = String(process.env.GROQ_API_KEY || '').trim()
  if (!key) {
    console.log('live skipped: no GROQ_API_KEY')
    return
  }
  await live(key)
  console.log('ok live Groq Qwen 3.8 text and vision')
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err)
  process.exit(1)
})
