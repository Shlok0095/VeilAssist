import type { AppSettings } from './profileTypes'
import { ensureWav16k } from './audioConvert'
import {
  getSttApiKey,
  getSttModel,
  nvidiaLanguageCode,
  NVIDIA_NIM_FUNCTION_ID,
  whisperLangParams,
} from './sttRegistry'
import { isLikelyCorsOrNetworkError, mobileApiGet, mobileApiPost, type MobileHttpResponse } from './mobileHttp'
import { nvidiaNativeSttAvailable, transcribeWavNative } from './nvidiaNativeStt'
import { Capacitor } from '@capacitor/core'

function transcribeProxyUrls(): string[] {
  const urls: string[] = []
  const origin = String(import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '')
  if (origin) urls.push(`${origin}/api/interview/transcribe`)
  if (import.meta.env.VITE_MOBILE_APK) {
    urls.push('https://veilassist.vercel.app/api/interview/transcribe')
  }
  urls.push('/api/interview/transcribe')
  return [...new Set(urls)]
}

async function parseTranscriptBody(res: MobileHttpResponse): Promise<string> {
  const text = res.text
  if (!res.ok) {
    throw new Error(`Transcription failed (${res.status}): ${text.slice(0, 200)}`)
  }
  try {
    const json = JSON.parse(text)
    return String(json.text || json.transcript || '').trim()
  } catch {
    return text.trim()
  }
}

async function parseTranscriptResponse(res: Response): Promise<string> {
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Transcription failed (${res.status}): ${text.slice(0, 200)}`)
  }
  try {
    const json = JSON.parse(text)
    return String(json.text || json.transcript || '').trim()
  } catch {
    return text.trim()
  }
}

async function transcribeNvidiaProxy(
  settings: AppSettings,
  wavBlob: Blob,
  apiKey: string,
  proxyUrl: string,
): Promise<string> {
  const arr = new Uint8Array(await wavBlob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < arr.length; i += 1) binary += String.fromCharCode(arr[i])
  const audioBase64 = btoa(binary)
  const functionId = settings.nvidiaNimFunctionId?.trim() || NVIDIA_NIM_FUNCTION_ID
  const body = {
    provider: 'nvidia',
    apiKey,
    model: getSttModel(settings),
    language: nvidiaLanguageCode(settings.micListenLanguage),
    functionId,
    audioBase64,
  }

  const proxyRes = await mobileApiPost(proxyUrl, { 'Content-Type': 'application/json' }, body)
  return await parseTranscriptBody(proxyRes)
}

async function transcribeNvidia(settings: AppSettings, wavBlob: Blob): Promise<string> {
  const apiKey = getSttApiKey(settings, 'nvidia')
  if (!apiKey) throw new Error('Add NVIDIA API key in Audio → NVIDIA Parakeet.')

  if (nvidiaNativeSttAvailable()) {
    try {
      return await transcribeWavNative(settings, wavBlob)
    } catch (nativeErr) {
      const msg = nativeErr instanceof Error ? nativeErr.message : String(nativeErr)
      console.warn('[stt] NVIDIA native gRPC failed, trying proxy fallback:', msg)
    }
  }

  const errors: string[] = []
  for (const url of transcribeProxyUrls()) {
    try {
      return await transcribeNvidiaProxy(settings, wavBlob, apiKey, url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${url}: ${msg}`)
      if (!/404|not found/i.test(msg)) break
    }
  }

  if (settings.groqKey.trim()) {
    try {
      return await transcribeWhisper(settings, wavBlob, 'https://api.groq.com/openai/v1')
    } catch (groqErr) {
      const msg = groqErr instanceof Error ? groqErr.message : String(groqErr)
      errors.push(`groq-fallback: ${msg}`)
    }
  }

  const hint = Capacitor.getPlatform() === 'android'
    ? 'Native NVIDIA gRPC failed. Check API key and network.'
    : 'NVIDIA Parakeet needs gRPC proxy or native bridge.'
  throw new Error(`${hint} ${errors[0] || ''}`.trim())
}

async function transcribeWhisper(
  settings: AppSettings,
  wavBlob: Blob,
  base: string,
): Promise<string> {
  const apiKey = getSttApiKey(settings, 'groq')
  if (!apiKey) throw new Error('Add Groq API key in Audio → Groq Whisper.')

  const lang = whisperLangParams(settings.micListenLanguage)
  const form = new FormData()
  form.append('file', wavBlob, 'audio.wav')
  form.append('model', getSttModel(settings))
  form.append('temperature', '0')
  form.append('response_format', 'json')
  if (lang.language) form.append('language', lang.language)
  if (lang.prompt) form.append('prompt', lang.prompt)

  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  return await parseTranscriptResponse(res)
}

export async function transcribeAudioBlob(
  settings: AppSettings,
  blob: Blob,
  opts?: { retries?: number },
): Promise<string> {
  const retries = opts?.retries ?? 1

  const run = async (remaining: number): Promise<string> => {
    try {
      const wav = await ensureWav16k(blob)
      const provider = settings.sttProvider

      if (provider === 'groq') {
        return transcribeWhisper(settings, wav, 'https://api.groq.com/openai/v1')
      }
      if (provider === 'nvidia') {
        return transcribeNvidia(settings, wav)
      }

      throw new Error('Unknown STT provider')
    } catch (e) {
      if (remaining > 0 && !isLikelyCorsOrNetworkError(String(e))) return run(remaining - 1)
      if (remaining > 0) return run(remaining - 1)
      throw e
    }
  }

  return run(retries)
}

/** Lightweight STT readiness probe — no audio, no inference. */
export async function probeSttHealth(settings: AppSettings): Promise<{ ok: boolean; error?: string }> {
  if (settings.sttMode === 'device') {
    return { ok: true }
  }

  const apiKey = getSttApiKey(settings)
  if (!apiKey) {
    return { ok: false, error: "Couldn't start listening — check your speech settings." }
  }

  if (settings.sttProvider === 'nvidia' && !nvidiaNativeSttAvailable()) {
    return { ok: false, error: "Couldn't start listening — check your speech settings." }
  }

  const url =
    settings.sttProvider === 'groq'
      ? 'https://api.groq.com/openai/v1/models'
      : 'https://integrate.api.nvidia.com/v1/models'

  try {
    const res = await mobileApiGet(
      url,
      { Authorization: `Bearer ${apiKey}` },
      { connectTimeout: 5000, readTimeout: 5000 },
    )
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Couldn't start listening — check your speech settings." }
    }
    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      return { ok: true }
    }
    if (!res.ok && res.status >= 500) {
      return { ok: false, error: "Couldn't start listening — check your connection and try again." }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Couldn't start listening — check your connection and try again." }
  }
}
