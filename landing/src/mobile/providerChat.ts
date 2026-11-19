import type { AppSettings, PersonalProfile } from './profileTypes'
import { profileToContextText } from './profileTypes'
import { getActiveApiKey, getActiveModel } from './profileStorage'
import { buildChatPayload } from './promptBuilder'
import { getChatBaseUrl, getChatProviderMeta, getProviderApiKey } from './providerRegistry'
import { applyNemotronReasoning, nvidiaChatHeaders, stripThinkingTrace } from './nvidiaChatHelpers'
import { Capacitor } from '@capacitor/core'
import { isLikelyCorsOrNetworkError, mobileApiGet, mobileApiPost } from './mobileHttp'
import { readOpenAiChatStream, streamOpenAiChatViaXhr } from './chatStream'
import { executeFallbackPlan } from './multimodalRouter'
import type { SessionTurn } from './sessionLoopTypes'

const REQUEST_TIMEOUT_MS = 45000
const VISION_TIMEOUT_MS = 120000

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

function isTimeoutError(e: unknown): boolean {
  return e instanceof Error && e.message === 'REQUEST_TIMEOUT'
}

async function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    promise
      .then((v) => {
        clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', onAbort)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', onAbort)
        reject(e)
      })
  })
}

function parseCompletion(text: string): string {
  const data = JSON.parse(text)
  const raw = data?.choices?.[0]?.message?.content
  const answer = Array.isArray(raw)
    ? raw.map((part: { text?: string }) => String(part?.text || '')).join('').trim()
    : String(raw || '').trim()
  if (!answer) throw new Error('Empty response from AI provider')
  return stripThinkingTrace(answer)
}

async function emitAsTokens(
  answer: string,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
) {
  const parts = answer.match(/\S+\s*/g) || [answer]
  for (const part of parts) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    onDelta(part)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }
}

/** Direct provider call with optional SSE streaming (line-by-line in UI). */
export async function requestInterviewAnswerDirect(params: {
  question: string
  profile: PersonalProfile
  settings: AppSettings
  think: boolean
  source?: 'manual_input' | 'transcript'
  turnHistory?: SessionTurn[]
  recentConversation?: string
  signal?: AbortSignal
  onDelta?: (chunk: string) => void
  onStreamReset?: () => void
  imageDataUrl?: string
}): Promise<string> {
  const apiKey = getActiveApiKey(params.settings)
  const canRoute =
    params.settings.provider === 'nvidia' || params.settings.provider === 'groq'
      ? Boolean(apiKey) ||
        Boolean(getProviderApiKey(params.settings, 'nvidia')) ||
        Boolean(getProviderApiKey(params.settings, 'groq'))
      : Boolean(apiKey)
  if (!canRoute) throw new Error('Add your API key in Settings → AI Providers.')

  const model = getActiveModel(params.settings)
  const profileText = profileToContextText(params.profile)
  const jobDescription = params.profile.jobDescription || params.settings.interviewTopic
  const meta = getChatProviderMeta(params.settings.provider)
  const useStream = Boolean(params.onDelta)

  const { payload, systemPrompt } = buildChatPayload({
    question: params.question,
    profileText,
    jobDescription,
    settings: params.settings,
    think: params.think,
    source: params.source,
    model,
    turnHistory: params.turnHistory,
    recentConversation: params.recentConversation,
    stream: useStream,
    imageDataUrl: params.imageDataUrl,
  })

  if (meta.kind === 'anthropic') {
    const answer = await requestAnthropic({
      apiKey,
      model,
      systemPrompt,
      question: params.question,
      payload,
      signal: params.signal,
    })
    if (params.onDelta && answer) params.onDelta(answer)
    return answer
  }

  const requestTimeout = params.imageDataUrl ? VISION_TIMEOUT_MS : REQUEST_TIMEOUT_MS

  const runOpenAiCompat = async (opts: {
    providerId: AppSettings['provider']
    model: string
    apiKey: string
  }) => {
    const base = getChatBaseUrl(params.settings, opts.providerId)
    const headers: Record<string, string> = { ...nvidiaChatHeaders(opts.apiKey) }
    if (opts.providerId === 'openrouter') {
      headers['HTTP-Referer'] = 'https://veilassist.vercel.app'
      headers['X-Title'] = 'VeilAssist Interview'
    }
    const { payload: targetPayload } = buildChatPayload({
      question: params.question,
      profileText,
      jobDescription,
      settings: { ...params.settings, provider: opts.providerId },
      think: params.think,
      source: params.source,
      model: opts.model,
      turnHistory: params.turnHistory,
      recentConversation: params.recentConversation,
      stream: useStream,
      imageDataUrl: params.imageDataUrl,
    })
    const think = Boolean(params.think)
    const messages = applyNemotronReasoning(
      targetPayload.messages as Array<{ role: string; content: string | unknown }>,
      base,
      opts.model,
      think,
    )
    const body = { ...targetPayload, model: opts.model, messages, stream: useStream }

    const doRequestBatch = async () => {
      try {
        return await withTimeout(
          mobileApiPost(`${base}/chat/completions`, headers, { ...body, stream: false }, {
            connectTimeout: 25000,
            readTimeout: requestTimeout,
          }),
          requestTimeout,
          params.signal,
        )
      } catch (e) {
        if (isAbortError(e)) throw e
        const msg = e instanceof Error ? e.message : String(e)
        if (isTimeoutError(e)) throw e
        if (isLikelyCorsOrNetworkError(msg)) {
          throw new Error(`Could not reach ${opts.providerId} API. Check internet connection and API key. (${msg})`)
        }
        throw e
      }
    }

    if (useStream && params.onDelta) {
      if (params.imageDataUrl && Capacitor.isNativePlatform()) {
        const res = await doRequestBatch()
        if (!res.ok) throw new Error(`AI provider error (${res.status}): ${res.text.slice(0, 300)}`)
        const answer = parseCompletion(res.text)
        await emitAsTokens(answer, params.onDelta, params.signal)
        return answer
      }
      try {
        if (Capacitor.isNativePlatform()) {
          return stripThinkingTrace(
            await streamOpenAiChatViaXhr(
              `${base}/chat/completions`,
              { ...headers, Accept: 'text/event-stream', 'Content-Type': 'application/json' },
              body,
              params.onDelta,
              params.signal,
            ),
          )
        }
        const res = await withTimeout(
          fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: { ...headers, Accept: 'text/event-stream', 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: params.signal,
          }),
          REQUEST_TIMEOUT_MS,
          params.signal,
        )
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`AI provider error (${res.status}): ${errText.slice(0, 300)}`)
        }
        if (!res.body) throw new Error('Empty stream from AI provider')
        return stripThinkingTrace(await readOpenAiChatStream(res.body, params.onDelta, params.signal))
      } catch (e) {
        if (isAbortError(e)) throw e
        const msg = e instanceof Error ? e.message : String(e)
        if (!isLikelyCorsOrNetworkError(msg) && !isTimeoutError(e)) throw e
        const res = await doRequestBatch()
        if (!res.ok) throw new Error(`AI provider error (${res.status}): ${res.text.slice(0, 300)}`)
        const answer = parseCompletion(res.text)
        await emitAsTokens(answer, params.onDelta, params.signal)
        return answer
      }
    }

    const res = await doRequestBatch()
    if (!res.ok) {
      let detail = res.text.slice(0, 300)
      try {
        const parsed = JSON.parse(res.text)
        detail = parsed?.error?.message || parsed?.error || detail
      } catch {
        /* keep */
      }
      throw new Error(`AI provider error (${res.status}): ${detail}`)
    }
    return stripThinkingTrace(parseCompletion(res.text))
  }

  if (params.settings.provider === 'nvidia' || params.settings.provider === 'groq') {
    const { value } = await executeFallbackPlan({
      settings: params.settings,
      image: Boolean(params.imageDataUrl),
      thinking: params.think,
      onAttemptStart: (index) => {
        if (index > 0) params.onStreamReset?.()
      },
      run: (target) =>
        runOpenAiCompat({
          providerId: target.provider,
          model: target.model,
          apiKey: target.apiKey,
        }),
    })
    return value
  }

  return runOpenAiCompat({
    providerId: params.settings.provider,
    model,
    apiKey,
  })
}

function isAuthFailure(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true
  return /invalid api key|incorrect api key|unauthorized|authentication/i.test(body)
}

function isTransientProviderCapacity(status: number, body: string): boolean {
  if (status === 429 || status === 502 || status === 503 || status === 504) return true
  return /resourceexhausted|request limit reached|rate limit|overloaded|temporarily unavailable|service unavailable/i.test(
    body,
  )
}

/** Lightweight key check — prefer /models so we don't burn NIM inference worker slots. */
export async function validateProviderKeyDirect(settings: AppSettings): Promise<{ ok: boolean; error?: string }> {
  const apiKey = getActiveApiKey(settings)
  if (!apiKey) return { ok: false, error: 'Add your API key in Settings → AI Providers.' }

  const model = getActiveModel(settings)
  const meta = getChatProviderMeta(settings.provider)
  if (meta.kind === 'anthropic') {
    try {
      const res = await withTimeout(
        fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            max_tokens: 8,
            messages: [{ role: 'user', content: 'ping' }],
          }),
        }),
        REQUEST_TIMEOUT_MS,
      )
      const errText = res.ok ? '' : await res.text()
      if (isAuthFailure(res.status, errText)) {
        return { ok: false, error: `Invalid API key for ${settings.provider}. Check Settings → AI Providers.` }
      }
      if (isTransientProviderCapacity(res.status, errText)) {
        return { ok: true }
      }
      if (!res.ok) {
        return { ok: false, error: `Could not verify ${settings.provider} key (${res.status}). Try again.` }
      }
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'API key validation failed'
      if (isLikelyCorsOrNetworkError(msg) || /timeout/i.test(msg)) return { ok: true }
      return { ok: false, error: msg }
    }
  }

  const base = getChatBaseUrl(settings, settings.provider)
  const headers: Record<string, string> = { ...nvidiaChatHeaders(apiKey) }
  if (settings.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://veilassist.vercel.app'
    headers['X-Title'] = 'VeilAssist Interview'
  }

  try {
    const modelsRes = await withTimeout(
      mobileApiGet(`${base}/models`, headers, { connectTimeout: 12000, readTimeout: 20000 }),
      25000,
    )
    if (isAuthFailure(modelsRes.status, modelsRes.text)) {
      return { ok: false, error: `Invalid API key for ${settings.provider}. Check Settings → AI Providers.` }
    }
    if (modelsRes.ok) return { ok: true }

    // Some providers gate /models; fall back to a tiny completion only if needed.
    if (isTransientProviderCapacity(modelsRes.status, modelsRes.text)) {
      return { ok: true }
    }

    const pingRes = await withTimeout(
      mobileApiPost(
        `${base}/chat/completions`,
        headers,
        {
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 8,
          temperature: 0,
        },
        { connectTimeout: 12000, readTimeout: 25000 },
      ),
      30000,
    )
    if (isAuthFailure(pingRes.status, pingRes.text)) {
      return { ok: false, error: `Invalid API key for ${settings.provider}. Check Settings → AI Providers.` }
    }
    // 503 ResourceExhausted / worker limits are temporary NIM capacity — key is fine.
    if (isTransientProviderCapacity(pingRes.status, pingRes.text)) {
      return { ok: true }
    }
    if (!pingRes.ok) {
      return { ok: false, error: `Could not verify ${settings.provider} key (${pingRes.status}). Try again.` }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'API key validation failed'
    // Network blips / timeouts shouldn't block starting an interview.
    if (isLikelyCorsOrNetworkError(msg) || /timeout/i.test(msg)) return { ok: true }
    return { ok: false, error: `Could not reach ${settings.provider} API. Check internet and API key.` }
  }
}

function anthropicMessages(payload: Record<string, unknown>, fallbackQuestion: string) {
  const raw = Array.isArray(payload.messages) ? payload.messages : []
  const mapped = raw
    .filter((m: { role?: string }) => m?.role === 'user' || m?.role === 'assistant')
    .map((m: { role: string; content: unknown }) => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : fallbackQuestion,
    }))
  return mapped.length ? mapped : [{ role: 'user' as const, content: fallbackQuestion }]
}

async function requestAnthropic(input: {
  apiKey: string
  model: string
  systemPrompt: string
  question: string
  payload: Record<string, unknown>
  signal?: AbortSignal
}): Promise<string> {
  const maxTokens = Number(input.payload.max_tokens) || 2048
  const fetchPromise = fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: maxTokens,
      system: input.systemPrompt,
      messages: anthropicMessages(input.payload, input.question),
    }),
    signal: input.signal,
  })

  const res = await withTimeout(fetchPromise, REQUEST_TIMEOUT_MS, input.signal)
  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 300)
    try {
      const parsed = JSON.parse(text)
      detail = parsed?.error?.message || detail
    } catch {
      /* keep raw */
    }
    throw new Error(`Anthropic error (${res.status}): ${detail}`)
  }

  const data = JSON.parse(text)
  const answer = data?.content?.find((c: { type?: string }) => c.type === 'text')?.text?.trim() || ''
  if (!answer) throw new Error('Empty response from Anthropic')
  return answer
}
