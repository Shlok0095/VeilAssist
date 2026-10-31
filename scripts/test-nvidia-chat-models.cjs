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
  assert.ok(catalog.includes('nvidia/llama-3.1-nemotron-nano-vl-8b-v1'))
  assert.ok(catalog.includes('nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'))
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
    'meta/llama-4-scout-17b-16e-instruct',
  ])
  assert.deepEqual(out, [
    'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
    'meta/llama-4-scout-17b-16e-instruct',
  ])
})
