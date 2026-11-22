const test = require('node:test')
const assert = require('node:assert/strict')
const { isMultimodalChatModel } = require('../lib/chatMultimodalModels')
const {
  isDeprecatedNvidiaChatModel,
  resolveNvidiaChatModel,
  filterActiveNvidiaChatModels,
  nvidiaFallbackModelsFor,
  isReasoningNvidiaModel,
  nvidiaFastFallbackModelsFor,
  catalogNvidiaVisionModels,
  reasoningAwareMaxTokens,
  DEFAULT_NVIDIA_CHAT_MODEL,
} = require('../lib/nvidiaChatModels.cjs')

test('reasoning models are recognised by name', () => {
  assert.equal(isReasoningNvidiaModel('nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'), true)
  assert.equal(isReasoningNvidiaModel('vendor/some-thinking-model'), true)
  assert.equal(isReasoningNvidiaModel('meta/llama-3.2-11b-vision-instruct'), false)
  assert.equal(isReasoningNvidiaModel(''), false)
})

test('latency-bound fallbacks keep the answer chain order but drop reasoning models', () => {
  const full = nvidiaFallbackModelsFor(DEFAULT_NVIDIA_CHAT_MODEL)
  const fast = nvidiaFastFallbackModelsFor(DEFAULT_NVIDIA_CHAT_MODEL)
  assert.ok(full.some(isReasoningNvidiaModel), 'the answer chain does include a reasoning model')
  assert.ok(fast.length > 0 && !fast.some(isReasoningNvidiaModel))
  assert.deepEqual(fast, full.filter((id) => !isReasoningNvidiaModel(id)), 'order is preserved')
})

test('mistral-small-4 is marked deprecated on NIM', () => {
  assert.equal(isDeprecatedNvidiaChatModel('mistralai/mistral-small-4-119b-2603'), true)
})

test('llama 4 maverick is marked deprecated (EOL 2026-07-27)', () => {
  assert.equal(isDeprecatedNvidiaChatModel('meta/llama-4-maverick-17b-128e-instruct'), true)
  assert.equal(
    resolveNvidiaChatModel('meta/llama-4-maverick-17b-128e-instruct'),
    DEFAULT_NVIDIA_CHAT_MODEL,
  )
})

test('llama 3.2 90b vision is excluded from active NVIDIA models', () => {
  assert.equal(isDeprecatedNvidiaChatModel('meta/llama-3.2-90b-vision-instruct'), true)
  assert.equal(isMultimodalChatModel('nvidia', 'meta/llama-3.2-90b-vision-instruct'), false)
})

test('deprecated models resolve to the default Nemotron VL primary', () => {
  assert.equal(
    resolveNvidiaChatModel('mistralai/mistral-small-4-119b-2603'),
    DEFAULT_NVIDIA_CHAT_MODEL,
  )
  assert.equal(
    resolveNvidiaChatModel('meta/llama-3.2-90b-vision-instruct'),
    DEFAULT_NVIDIA_CHAT_MODEL,
  )
})

test('active vision models pass through unchanged', () => {
  assert.equal(
    resolveNvidiaChatModel('meta/llama-4-scout-17b-16e-instruct'),
    'meta/llama-4-scout-17b-16e-instruct',
  )
  assert.equal(
    resolveNvidiaChatModel('nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'),
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  )
  assert.equal(isMultimodalChatModel('nvidia', 'meta/llama-4-scout-17b-16e-instruct'), true)
})

test('catalog lists only screen-capable multimodal NVIDIA models', () => {
  const catalog = catalogNvidiaVisionModels()
  assert.ok(catalog.includes(DEFAULT_NVIDIA_CHAT_MODEL))
  assert.ok(catalog.includes('nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'))
  assert.ok(catalog.every((id) => !isDeprecatedNvidiaChatModel(id) && isMultimodalChatModel('nvidia', id)), 'every catalog model is active and multimodal')
  for (const retired of RETIRED_2026_11) assert.ok(!catalog.includes(retired), retired)
  assert.ok(!catalog.includes('meta/llama-3.2-90b-vision-instruct'))
  assert.ok(!catalog.includes('mistralai/mistral-small-4-119b-2603'))
  assert.ok(!catalog.includes('meta/llama-4-maverick-17b-128e-instruct'))
})

test('fallback list excludes deprecated models and the active primary', () => {
  const fallbacks = nvidiaFallbackModelsFor(DEFAULT_NVIDIA_CHAT_MODEL)
  assert.ok(fallbacks.includes('meta/llama-4-scout-17b-16e-instruct'))
  assert.ok(!fallbacks.includes('mistralai/mistral-small-4-119b-2603'))
  assert.ok(!fallbacks.includes(DEFAULT_NVIDIA_CHAT_MODEL))
})

test('filterActiveNvidiaChatModels drops sunset endpoints', () => {
  const out = filterActiveNvidiaChatModels([
    'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
    'mistralai/mistral-small-4-119b-2603',
    'meta/llama-3.2-90b-vision-instruct',
    DEFAULT_NVIDIA_CHAT_MODEL,
    'meta/llama-4-scout-17b-16e-instruct',
  ])
  assert.deepEqual(out, [DEFAULT_NVIDIA_CHAT_MODEL, 'meta/llama-4-scout-17b-16e-instruct'])
})

// Live NIM probe 2026-11-22 returned HTTP 410 for these. The first two were the old default and first fallback,
// so every Ask used to run on the fourth model in the chain.
const RETIRED_2026_11 = [
  'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
  'nvidia/nemotron-nano-12b-v2-vl',
  'meta/llama-3.2-11b-vision-instruct',
]

test('models that now answer HTTP 410 are deprecated and remapped to the default', () => {
  for (const id of RETIRED_2026_11) {
    assert.equal(isDeprecatedNvidiaChatModel(id), true, id)
    assert.equal(resolveNvidiaChatModel(id), DEFAULT_NVIDIA_CHAT_MODEL, id)
    assert.equal(isMultimodalChatModel('nvidia', id), false, `${id} must not count as a usable vision model`)
  }
})

test('the default model is active, screen-capable and not reasoning-class (it must answer in well under a second)', () => {
  assert.equal(isDeprecatedNvidiaChatModel(DEFAULT_NVIDIA_CHAT_MODEL), false)
  assert.equal(isMultimodalChatModel('nvidia', DEFAULT_NVIDIA_CHAT_MODEL), true)
  assert.equal(isReasoningNvidiaModel(DEFAULT_NVIDIA_CHAT_MODEL), false)
  assert.equal(require('../lib/providers.js').getModelForProvider('nvidia', () => ''), DEFAULT_NVIDIA_CHAT_MODEL)
})

test('the fallback chain has no retired or duplicate model, and every entry can take a screenshot', () => {
  const chain = nvidiaFallbackModelsFor(DEFAULT_NVIDIA_CHAT_MODEL)
  assert.ok(chain.length >= 2, 'at least two fallbacks')
  assert.equal(new Set(chain).size, chain.length)
  assert.ok(chain.every((id) => !isDeprecatedNvidiaChatModel(id) && isMultimodalChatModel('nvidia', id)))
})

test('model pick: ordinary asks stay on the fast default, screen-led asks get the capable thinking models first', () => {
  const { pickNvidiaAskModel, NVIDIA_SCREEN_MODELS } = require('../lib/nvidiaChatModels.cjs')
  const D = DEFAULT_NVIDIA_CHAT_MODEL

  const text = pickNvidiaAskModel({ model: D })
  assert.equal(text.model, D)
  assert.equal(text.screenModel, false)

  // Ctrl+Enter with something said or typed: the screenshot is background, so stay fast.
  assert.equal(pickNvidiaAskModel({ model: D, hasScreenImage: true, screenOnly: false, contract: 'interview_detailed' }).model, D)
  assert.equal(pickNvidiaAskModel({ model: D, hasScreenImage: true, screenOnly: false, contract: 'technical_explanation' }).model, D)

  // The screen is the question, or a coding ask with a screenshot: capable models first, fast default last.
  for (const input of [
    { hasScreenImage: true, screenOnly: true },
    { hasScreenImage: true, screenOnly: false, contract: 'coding_answer' },
  ]) {
    const pick = pickNvidiaAskModel({ model: D, ...input })
    assert.equal(pick.screenModel, true)
    assert.equal(pick.model, NVIDIA_SCREEN_MODELS[0])
    assert.ok(isReasoningNvidiaModel(pick.model))
    assert.equal(pick.fallbacks[pick.fallbacks.length - 1], D, 'the fast default is the last resort')
    assert.ok([pick.model, ...pick.fallbacks].every((id) => !isDeprecatedNvidiaChatModel(id) && isMultimodalChatModel('nvidia', id)))
    assert.equal(new Set([pick.model, ...pick.fallbacks]).size, pick.fallbacks.length + 1, 'no duplicates')
  }

  // No screenshot: a coding ask or an empty ask never switches model.
  assert.equal(pickNvidiaAskModel({ model: D, hasScreenImage: false, screenOnly: true, contract: 'coding_answer' }).screenModel, false)

  // A model the user picked in Settings is always honoured, screen-led or not.
  const picked = 'nvidia/nemotron-3.5-super-vl-120b-a12b'
  const honoured = pickNvidiaAskModel({ model: picked, hasScreenImage: true, screenOnly: true, contract: 'coding_answer' })
  assert.equal(honoured.model, picked)
  assert.equal(honoured.screenModel, false)

  // A retired model saved by an older build resolves to the default first, so it behaves like auto.
  assert.equal(pickNvidiaAskModel({ model: 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1' }).model, D)
})

test('main wires the pick into the Ask path (model, fallbacks and first-token timeout all follow it)', () => {
  const main = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'main', 'index.js'), 'utf8')
  assert.match(main, /pickNvidiaAskModel\(\{[\s\S]{0,260}screenOnly: screenOnlyAsk/)
  assert.match(main, /const askModel = nvidiaPick \? nvidiaPick\.model : model/)
  assert.match(main, /\.filter\(\(id\) => id !== askModel && isMultimodalChatModel\('nvidia', id\)\)/)
  assert.match(main, /model: askModel,\s*\n\s*maxTokens,/)
  assert.match(main, /isReasoningNvidiaModel\(askModel\) \? 20000 : 3500/)
})

test('reasoning-class models get thinking ON and a budget that leaves room for the answer', () => {
  const ai = require('../lib/aiClient.js')
  const nim = 'https://integrate.api.nvidia.com/v1'
  const msgs = [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }]
  for (const id of ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 'nvidia/nemotron-3.5-super-vl-120b-a12b']) {
    assert.equal(isReasoningNvidiaModel(id), true, id)
    assert.ok(!ai.applyProviderReasoningControls(msgs, nim, id)[0].content.startsWith('/no_think'), `${id} must not be forced into no-think`)
    assert.ok(reasoningAwareMaxTokens(id, 140) >= 1800, 'a 140-token answer budget would be spent on hidden reasoning')
  }
  // The fast default keeps the low-latency no-think control and its small budget.
  assert.ok(ai.applyProviderReasoningControls(msgs, nim, DEFAULT_NVIDIA_CHAT_MODEL)[0].content.startsWith('/no_think'))
  assert.equal(reasoningAwareMaxTokens(DEFAULT_NVIDIA_CHAT_MODEL, 140), 140)
  // OpenRouter keeps its own, unchanged handling.
  assert.ok(ai.applyProviderReasoningControls(msgs, 'https://openrouter.ai/api/v1', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning')[0].content.startsWith('/no_think'))
})
