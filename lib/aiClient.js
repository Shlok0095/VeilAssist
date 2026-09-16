// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

const OpenAI = require('openai')
const providers = require('./providers')
const { runStreamingFallback, formatUserFacingChatError } = require('./chatStreamFallback')
const { catalogNvidiaVisionModels, resolveNvidiaChatModel } = require('./nvidiaChatModels.cjs')

const openaiClientCache = {}

function openaiNativeHostname(baseURL) {
  try {
    const u = new URL(String(baseURL || 'https://api.openai.com/v1').replace(/\/$/, ''))
    return u.hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** Only api.openai.com — Groq/NIM/etc. still expect max_tokens. */
function isOpenAINativeApi(baseURL) {
  return openaiNativeHostname(baseURL) === 'api.openai.com'
}

/**
 * Chat Completions on OpenAI: newer GPT / o-series reject max_tokens and require max_completion_tokens.
 * @see https://platform.openai.com/docs/api-reference/chat/create
 */
function openaiModelUsesMaxCompletionTokens(modelId) {
  const m = String(modelId || '').toLowerCase().trim()
  if (!m) return false
  if (/^o[0-9]/.test(m)) return true
  if (m.startsWith('gpt-5')) return true
  if (m.startsWith('gpt-4.1') || m.startsWith('gpt-4.5')) return true
  if (m.startsWith('gpt-4o')) return true
  if (m.startsWith('chatgpt-4o')) return true
  return false
}

function chatCompletionTokenParams(maxTokens, baseURL, model) {
  if (isOpenAINativeApi(baseURL) && openaiModelUsesMaxCompletionTokens(model)) {
    return { max_completion_tokens: maxTokens }
  }
  return { max_tokens: maxTokens }
}

function getOpenAICompatClient(apiKey, baseURL) {
  const base = (baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const cacheKey = `${base}:${apiKey.slice(-12)}`
  if (!openaiClientCache[cacheKey]) {
    const opts = { apiKey, baseURL: base }
    if (openaiNativeHostname(base) === 'openrouter.ai') {
      opts.defaultHeaders = {
        'HTTP-Referer': 'https://veilassist.app',
        'X-Title': 'VeilAssist',
      }
    }
    openaiClientCache[cacheKey] = new OpenAI(opts)
  }
  return openaiClientCache[cacheKey]
}

function isNvidiaNimHost(baseURL) {
  return openaiNativeHostname(baseURL) === 'integrate.api.nvidia.com'
}

/** NIM VL models that accept chat_template_kwargs / enable_thinking. */
function supportsNvidiaChatTemplateKwargs(model) {
  return /nemotron/i.test(String(model || ''))
}

/** NIM chat/vision models — use low-latency inference params (temp/seed). */
function isNvidiaFastChatModel(baseURL, model) {
  if (!isNvidiaNimHost(baseURL)) return false
  // Include Mistral for speed params only; chat_template_kwargs is gated separately.
  return /nemotron-nano-vl|nemotron-nano-12b|nemotron-3-nano-omni|llama-4-(scout|maverick)|llama-3\.2-11b-vision|llama-3\.1-nemotron/i.test(String(model || ''))
}

/**
 * OpenRouter Nemotron / Llama-4 VL — same latency knobs as NIM so Answer length /
 * structure settings are not drowned by long thinking chains.
 * Does not send NIM-only chat_template_kwargs (can 400 on OpenRouter).
 */
function isOpenRouterFastChatModel(baseURL, model) {
  if (openaiNativeHostname(baseURL) !== 'openrouter.ai') return false
  return /nemotron-nano-vl|nemotron-nano-12b|nemotron-3-nano-omni|llama-4-(scout|maverick)|llama-3\.2-11b-vision|llama-3\.1-nemotron/i.test(
    String(model || ''),
  )
}

function applyProviderReasoningControls(messages, baseURL, model) {
  // /no_think is Nemotron-oriented — apply for NIM and OpenRouter Nemotron so answers
  // stay concise like NVIDIA NIM (same answer settings path for all providers).
  if (!/nemotron/i.test(String(model || ''))) return messages
  const next = (messages || []).map((message) => ({ ...message }))
  const systemIndex = next.findIndex((message) => message.role === 'system')
  if (systemIndex >= 0 && typeof next[systemIndex].content === 'string') {
    const content = next[systemIndex].content
    next[systemIndex] = {
      ...next[systemIndex],
      content: content.includes('/no_think') ? content : `/no_think\n${content}`,
    }
  } else {
    next.unshift({ role: 'system', content: '/no_think' })
  }
  return next
}

function convertContentForAnthropic(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content)
  const parts = content.map((p) => {
    if (!p) return null
    if (p.type === 'text') return { type: 'text', text: String(p.text || '') }
    if (p.type === 'image_url') {
      const url = String(p.image_url?.url || '')
      const m = url.match(/^data:(image\/[a-z+]+);base64,(.+)$/)
      if (m) return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }
    }
    return null
  }).filter(Boolean)
  if (parts.length === 0) return '[no content]'
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text
  return parts
}

function splitMessagesForAnthropic(messages) {
  let system = ''
  const out = []
  for (const m of messages) {
    if (m.role === 'system') {
      system += (typeof m.content === 'string' ? m.content : '') + '\n'
    } else if (m.role === 'user') {
      out.push({ role: 'user', content: convertContentForAnthropic(m.content) })
    } else if (m.role === 'assistant') {
      out.push({ role: 'assistant', content: typeof m.content === 'string' ? m.content : String(m.content) })
    }
  }
  return { system: system.trim(), messages: out.length ? out : [{ role: 'user', content: 'Hello' }] }
}

async function testConnection(provider, apiKey, getStore) {
  try {
    if (!apiKey) return { success: false, error: 'No API key provided' }
    if (providers.isAnthropic(provider)) {
      const AnthropicSdk = require('@anthropic-ai/sdk')
      const client = new AnthropicSdk({ apiKey })
      const testModel = providers.getTestModel(provider, getStore)
      await client.messages.create({
        model: testModel,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Hi' }],
      })
      return { success: true }
    }
    const baseURL = providers.resolveBaseURL(provider, getStore)
    const client = getOpenAICompatClient(apiKey, baseURL)
    const testModels =
      provider === 'nvidia'
        ? [...new Set([
          resolveNvidiaChatModel(providers.getModelForProvider('nvidia', getStore)),
          ...catalogNvidiaVisionModels(),
        ])]
        : [providers.getTestModel(provider, getStore)]
    let lastErr = null
    for (let i = 0; i < testModels.length; i += 1) {
      const testModel = testModels[i]
      try {
        await client.chat.completions.create({
          model: testModel,
          messages: [{ role: 'user', content: 'Hi' }],
          ...chatCompletionTokenParams(5, baseURL, testModel),
        })
        return { success: true, model: testModel }
      } catch (err) {
        lastErr = err
        lastErr.model = testModel
        const status = err?.status ?? err?.statusCode
        const canTryNext =
          provider === 'nvidia' &&
          (status === 410 || status === 404) &&
          i < testModels.length - 1
        if (!canTryNext) break
      }
    }
    if (lastErr) {
      if (!lastErr.model) lastErr.model = testModels[0]
      return { success: false, error: formatUserFacingChatError(lastErr) }
    }
    return { success: false, error: 'Connection failed' }
  } catch (err) {
    return { success: false, error: formatUserFacingChatError(err) || err.message || 'Connection failed' }
  }
}

/** O-series reasoning models reject temperature, seed, top_p. */
function isOSeriesModel(modelId) {
  const m = String(modelId || '').toLowerCase().trim()
  return /^o[0-9]/.test(m)
}

function isGoogleGenerativeHost(baseURL) {
  return openaiNativeHostname(baseURL) === 'generativelanguage.googleapis.com'
}

function isDeepSeekHost(baseURL) {
  return openaiNativeHostname(baseURL) === 'api.deepseek.com'
}

function isOpenRouterHost(baseURL) {
  return openaiNativeHostname(baseURL) === 'openrouter.ai'
}

/** OpenAI native models that hide tokens in reasoning (o-series / GPT-5). */
function isOpenAINativeReasoningModel(baseURL, model) {
  if (!isOpenAINativeApi(baseURL)) return false
  const m = String(model || '').toLowerCase().trim()
  return isOSeriesModel(m) || m.startsWith('gpt-5')
}

/**
 * Non-NVIDIA thinking/reasoning controls so Answer length stays usable.
 * Never touches NIM helpers (isNvidiaFastChatModel / chat_template_kwargs).
 * @returns {Record<string, unknown>|null} params to use, or null to fall through
 */
function resolveNonNvidiaReasoningInferParams(baseURL, model) {
  const m = String(model || '').toLowerCase().trim()

  if (isOpenAINativeReasoningModel(baseURL, model)) {
    // Keep visible completion budget for Medium/Short; avoid empty inferParams.
    return { reasoning_effort: 'low' }
  }

  if (isGoogleGenerativeHost(baseURL)) {
    // Gemini OpenAI-compat rejects `seed` on many builds; omit it.
    const params = { temperature: 0 }
    if (/gemini-2\.5|thinking/i.test(m)) {
      params.reasoning_effort = 'none'
    }
    return params
  }

  if (isDeepSeekHost(baseURL) && /reasoner|r1/i.test(m)) {
    return { temperature: 0 }
  }

  if (
    isOpenRouterHost(baseURL) &&
    !/nemotron/i.test(m) &&
    /deepseek-r1|reasoner|:thinking|\/o1|\/o3|o4-mini|gpt-5|claude.*thinking/i.test(m)
  ) {
    return {
      temperature: 0,
      reasoning: { effort: 'low', exclude: true },
    }
  }

  return null
}

/**
 * Phase 9 — slight temperature/seed variation when answer diversity is enabled.
 * @param {(key: string) => any} [getStore]
 * @param {string} [userQuestion]
 */
function resolveChatInferenceParams(getStore, userQuestion = '') {
  const diversityOn = typeof getStore === 'function' && getStore('answerDiversityEnabled') === true
  if (!diversityOn) return { temperature: 0, seed: 7, diversity: false }

  const q = String(userQuestion || '')
  let hash = 0
  for (let i = 0; i < q.length; i++) hash = (hash * 31 + q.charCodeAt(i)) | 0
  const seed = Math.abs(hash) % 10000
  const temperature = 0.32 + (Math.abs(hash) % 19) / 100
  return { temperature, seed, diversity: true }
}

function buildAnswerDiversityHint() {
  return 'Prefer a fresh phrasing — avoid repeating boilerplate from prior turns unless the user asks for the same wording.'
}

async function* streamChatAnthropic(apiKey, { messages, model, maxTokens = 8192, signal, inferenceParams }) {
  const AnthropicSdk = require('@anthropic-ai/sdk')
  const client = new AnthropicSdk({ apiKey })
  const { system, messages: amsg } = splitMessagesForAnthropic(messages)
  const temp = inferenceParams?.diversity ? Math.min(0.55, inferenceParams.temperature || 0.42) : 0
  const stream = await client.messages.create(
    {
      model,
      max_tokens: maxTokens,
      temperature: temp,
      system: system || undefined,
      messages: amsg,
      stream: true,
    },
    { signal }
  )
  let finishReason = 'stop'
  for await (const event of stream) {
    if (signal?.aborted) return
    if (event.type === 'message_delta' && event.delta?.stop_reason) {
      finishReason = event.delta.stop_reason === 'max_tokens' ? 'length' : event.delta.stop_reason
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
      yield event.delta.text
    }
  }
  return { finishReason }
}

async function* streamChatOpenAICompat(apiKey, baseURL, options) {
  const { messages, model = 'gpt-4o', maxTokens = 8192, signal, inferenceParams } = options
  const client = getOpenAICompatClient(apiKey, baseURL)
  const controlledMessages = applyProviderReasoningControls(messages, baseURL, model)
  const qwenGroqVision =
    openaiNativeHostname(baseURL) === 'api.groq.com' &&
    String(model).toLowerCase() === 'qwen/qwen3.6-27b'
  const nvidiaFastVision = isNvidiaFastChatModel(baseURL, model)
  const openRouterFastVision = isOpenRouterFastChatModel(baseURL, model)
  const nonNvidiaReasoning = resolveNonNvidiaReasoningInferParams(baseURL, model)
  let inferParams
  if (qwenGroqVision) {
    inferParams = {
      // Non-thinking mode streams visible output immediately.
      temperature: 0,
      top_p: 0.8,
      seed: 7,
      reasoning_effort: 'none',
    }
  } else if (nvidiaFastVision) {
    inferParams = {
      // NIM instruct/no-think mode — docs recommend temperature 0 when thinking is off.
      temperature: 0,
      top_p: 0.7,
      seed: 7,
      // Only Nemotron templates accept this; Mistral returns 400 otherwise.
      ...(supportsNvidiaChatTemplateKwargs(model)
        ? { chat_template_kwargs: { enable_thinking: false } }
        : {}),
    }
  } else if (openRouterFastVision) {
    inferParams = {
      // Match NIM latency knobs for OpenRouter Nemotron/Llama VL (no NIM kwargs).
      temperature: 0,
      top_p: 0.7,
      seed: 7,
    }
  } else if (nonNvidiaReasoning) {
    inferParams = nonNvidiaReasoning
  } else if (inferenceParams?.diversity) {
    inferParams = {
      temperature: inferenceParams.temperature ?? 0.4,
      ...(isGoogleGenerativeHost(baseURL) ? {} : { seed: inferenceParams.seed ?? 7 }),
    }
  } else if (isGoogleGenerativeHost(baseURL)) {
    inferParams = { temperature: 0 }
  } else {
    inferParams = { temperature: 0, seed: 7 }
  }
  const stream = await client.chat.completions.create(
    {
      model,
      messages: controlledMessages,
      stream: true,
      ...inferParams,
      ...chatCompletionTokenParams(maxTokens, baseURL, model),
    },
    { signal }
  )
  let finishReason = 'stop'
  for await (const chunk of stream) {
    if (signal?.aborted) return
    const choice = chunk.choices?.[0]
    if (choice?.finish_reason) finishReason = choice.finish_reason
    const token = choice?.delta?.content || ''
    if (token) yield token
  }
  return { finishReason }
}

async function* streamChat(provider, apiKey, options, getStore) {
  if (!apiKey) throw new Error('No API key')
  const inferenceParams =
    options.inferenceParams ||
    resolveChatInferenceParams(getStore, options.userQuestion || '')
  const merged = { ...options, inferenceParams }
  const openAttempt = (attemptProvider, attemptKey, attemptOptions) => {
    if (providers.isAnthropic(attemptProvider)) {
      return streamChatAnthropic(attemptKey, attemptOptions)
    }
    const baseURL = providers.resolveBaseURL(attemptProvider, getStore)
    return streamChatOpenAICompat(attemptKey, baseURL, attemptOptions)
  }
  const primary = {
    provider,
    model: merged.model,
    open: (signal) => openAttempt(provider, apiKey, { ...merged, signal }),
  }
  const fallbackConfigs = Array.isArray(merged.fallbacks)
    ? merged.fallbacks
    : merged.fallback
      ? [merged.fallback]
      : []
  const fallbacks = fallbackConfigs
    .filter((cfg) => cfg?.provider && cfg?.apiKey && cfg?.model)
    .map((cfg) => ({
      provider: cfg.provider,
      model: cfg.model,
      open: (signal) => openAttempt(
        cfg.provider,
        cfg.apiKey,
        {
          ...merged,
          model: cfg.model,
          maxTokens: cfg.maxTokens || merged.maxTokens,
          signal,
          fallback: undefined,
          fallbacks: undefined,
        },
      ),
    }))
  return yield* runStreamingFallback({
    primary,
    fallbacks,
    signal: merged.signal,
    firstTokenTimeoutMs: Number(merged.firstTokenTimeoutMs) || 5000,
    onAttempt: merged.onAttempt,
    onFinish: merged.onFinish,
  })
}

/** Non-streaming completion — meeting summaries, short tasks. */
async function completeChat(provider, apiKey, options, getStore) {
  if (!apiKey) throw new Error('No API key')
  const { messages, model, maxTokens = 2048, signal } = options
  if (providers.isAnthropic(provider)) {
    const AnthropicSdk = require('@anthropic-ai/sdk')
    const client = new AnthropicSdk({ apiKey })
    const { system, messages: amsg } = splitMessagesForAnthropic(messages)
    const resp = await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        temperature: 0,
        system: system || undefined,
        messages: amsg,
      },
      signal ? { signal } : undefined,
    )
    return (resp.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
  }
  const baseURL = providers.resolveBaseURL(provider, getStore)
  const client = getOpenAICompatClient(apiKey, baseURL)
  const controlledMessages = applyProviderReasoningControls(messages, baseURL, model)
  const nvidiaFast = isNvidiaFastChatModel(baseURL, model)
  const openRouterFast = isOpenRouterFastChatModel(baseURL, model)
  const nonNvidiaReasoning = resolveNonNvidiaReasoningInferParams(baseURL, model)
  let inferParams
  if (nvidiaFast) {
    inferParams = {
      temperature: 0,
      top_p: 0.7,
      seed: 7,
      ...(supportsNvidiaChatTemplateKwargs(model)
        ? { chat_template_kwargs: { enable_thinking: false } }
        : {}),
    }
  } else if (openRouterFast) {
    inferParams = {
      temperature: 0,
      top_p: 0.7,
      seed: 7,
    }
  } else if (nonNvidiaReasoning) {
    inferParams = nonNvidiaReasoning
  } else if (isGoogleGenerativeHost(baseURL)) {
    inferParams = { temperature: 0 }
  } else {
    inferParams = { temperature: 0, seed: 7 }
  }
  const resp = await client.chat.completions.create(
    {
      model,
      messages: controlledMessages,
      ...inferParams,
      ...chatCompletionTokenParams(maxTokens, baseURL, model),
    },
    signal ? { signal } : undefined,
  )
  return resp.choices?.[0]?.message?.content || ''
}

module.exports = {
  getOpenAICompatClient,
  testConnection,
  streamChat,
  streamChatOpenAICompat,
  completeChat,
  resolveChatInferenceParams,
  buildAnswerDiversityHint,
  applyProviderReasoningControls,
  resolveNonNvidiaReasoningInferParams,
}
