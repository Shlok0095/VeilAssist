// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

/**
 * Mic transcription routing — aligned with Natively AI's STT provider set.
 * Supported: Groq Whisper, OpenAI Whisper, Deepgram, ElevenLabs, Azure Speech, Google Cloud STT.
 * Chat LLM (store `provider`) and STT (store `sttProvider`) are independent.
 */

const nvidiaNimStt = require('./nvidiaNimStt')

const NATIVE_STT_PROVIDER_IDS = [
  // Whisper REST providers
  'groq', 'openai', 'nvidia',
  // Dedicated STT-only providers (Natively-aligned)
  'deepgram', 'elevenlabs', 'azure', 'google', 'soniox',
]

const OPENAI_STYLE_STT = {
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    keyField: 'groqKey',
    modelFromStore: 'groqWhisperModel',
    // whisper-large-v3 hallucinates far less than turbo on silence/noise
    defaultModel: 'whisper-large-v3',
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    keyField: 'apiKey',
    fixedModel: 'whisper-1',
  },
  nvidia: {
    baseURL: 'https://integrate.api.nvidia.com/v1',
    keyField: 'nvidiaKey',
    modelFromStore: 'nvidiaWhisperModel',
    defaultModel: 'nvidia/parakeet-1.1b-rnnt-multilingual-asr',
  },
}

const DEDICATED_STT = {
  deepgram: {
    keyField: 'deepgramKey',
    modelFromStore: 'deepgramModel',
    defaultModel: 'nova-3-general',
    sttKind: 'deepgram_streaming',
    useMainProcessStt: true,
  },
  elevenlabs: {
    keyField: 'elevenLabsKey',
    modelFromStore: 'elevenLabsModel',
    defaultModel: 'scribe_v2_realtime',
    sttKind: 'elevenlabs_streaming',
    useMainProcessStt: true,
  },
  azure: {
    keyField: 'azureSpeechKey',
    modelFromStore: null,
    defaultModel: 'conversation',
    sttKind: 'azure_streaming',
    useMainProcessStt: true,
  },
  google: {
    keyField: 'googleSttKey',
    modelFromStore: null,
    defaultModel: 'default',
    sttKind: 'google_streaming',
    useMainProcessStt: true,
  },
  soniox: {
    keyField: 'sonioxKey',
    modelFromStore: 'sonioxModel',
    defaultModel: 'stt-rt-v5',
    sttKind: 'soniox_streaming',
    useMainProcessStt: true,
  },
}

const STT_MODEL_FIELDS = {
  groq: 'groqWhisperModel',
  nvidia: 'nvidiaWhisperModel',
}

const MIC_LISTEN_LANG_MODES = new Set(['en', 'hi', 'en_hi_hinglish'])

const WHISPER_PRIMERS = {
  // A neutral primer with clear speech biases the model away from silence hallucinations.
  // Avoid any word from the HALLUCINATIONS blocklist — Whisper tends to echo the prompt style.
  en: "Okay, so let me think about this. The question is asking about... right, and the answer would be...",
  hi: 'ठीक है, तो इस सवाल का जवाब देते हैं। मुझे लगता है कि इसका उत्तर यह है।',
  en_hi_hinglish:
    "Okay so yaar, is question ka answer kya hoga? Let me think... haan, toh basically yeh hai.",
}

const ALLOWED_WHISPER_LANGUAGES = {
  en: ['english'],
  hi: ['hindi'],
  en_hi_hinglish: ['english', 'hindi'],
}

function micListenLanguageFormFields(get, _sttVendor) {
  const raw = get('micListenLanguage')
  const mode = MIC_LISTEN_LANG_MODES.has(raw) ? raw : 'en'

  const primer = WHISPER_PRIMERS[mode] || WHISPER_PRIMERS.en
  const allowedLanguages = ALLOWED_WHISPER_LANGUAGES[mode] || ALLOWED_WHISPER_LANGUAGES.en

  if (mode === 'en') return { language: 'en', prompt: primer, allowedLanguages }
  if (mode === 'hi') return { language: 'hi', prompt: primer, allowedLanguages }

  return { prompt: primer, allowedLanguages }
}

/** Legacy: dedicated fallback key when chat vendor had no STT */
function legacyFallbackTranscription(get) {
  const fbKey = get('audioFallbackKey')
  if (!fbKey) return null
  const fbProv = get('audioFallbackProvider') || 'openai'
  if (fbProv === 'groq') {
    return {
      url: 'https://api.groq.com/openai/v1/audio/transcriptions',
      model: get('groqWhisperModel') || 'whisper-large-v3',
      apiKey: fbKey,
      responseKind: 'text',
      useWhisperSegmentMeta: true,
    }
  }
  return {
    url: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1',
    apiKey: fbKey,
    responseKind: 'text',
    useWhisperSegmentMeta: true,
  }
}

/**
 * @param {(key: string) => any} get
 * @returns {string}
 */
function getEffectiveSttProvider(get) {
  const explicit = get('sttProvider')
  if (explicit && NATIVE_STT_PROVIDER_IDS.includes(explicit)) {
    // NIM chat + Groq STT with no Groq key → NVIDIA Parakeet streaming (lower caption lag).
    if (
      explicit === 'groq' &&
      String(get('provider') || '') === 'nvidia' &&
      String(get('nvidiaKey') || '').trim() &&
      !String(get('groqKey') || '').trim()
    ) {
      return 'nvidia'
    }
    return explicit
  }
  const chat = get('provider') || 'groq'
  if (NATIVE_STT_PROVIDER_IDS.includes(chat)) return chat
  if (get('audioFallbackKey')) {
    const fb = get('audioFallbackProvider') || 'openai'
    return fb === 'groq' ? 'groq' : 'openai'
  }
  return 'groq'
}

function nvidiaLanguageCode(get) {
  const raw = get('micListenLanguage')
  if (raw === 'en') return 'en-US'
  if (raw === 'hi') return 'hi-IN'
  return 'multi'
}

/**
 * @param {string} sttProvider
 * @param {(key: string) => any} get
 * @returns {{ cfg: object | null, sttVendor: string | null }}
 */
function resolveSttConfigForProvider(sttProvider, get) {
  if (sttProvider === 'nvidia') {
    const apiKey = get('nvidiaKey')
    if (!apiKey) return { cfg: null, sttVendor: null }
    const model = get('nvidiaWhisperModel') || 'nvidia/parakeet-1.1b-rnnt-multilingual-asr'
    return {
      cfg: {
        model,
        apiKey,
        languageCode: nvidiaLanguageCode(get),
        nvcfFunctionId: get('nvidiaNimFunctionId') || nvidiaNimStt.DEFAULT_FUNCTION_ID,
        responseKind: 'json',
        /** Parakeet uses NVCF gRPC — not Whisper REST or verbose_json gate. */
        useWhisperSegmentMeta: false,
        sttKind: 'nvidia_nim',
        /** Hosted NVCF gRPC is streamed in the main process; unary Recognize remains fallback. */
        useMainProcessStt: true,
      },
      sttVendor: 'nvidia',
    }
  }

  const native = OPENAI_STYLE_STT[sttProvider]
  if (native) {
    const apiKey = get(native.keyField)
    if (apiKey) {
      const model = native.fixedModel || (get(native.modelFromStore) || native.defaultModel)
      const base = native.baseURL.replace(/\/$/, '')
      return {
        cfg: {
          url: `${base}/audio/transcriptions`,
          model,
          apiKey,
          responseKind: 'text',
          useWhisperSegmentMeta: true,
          sttKind: 'whisper',
          useMainProcessStt: false,
        },
        sttVendor: sttProvider,
      }
    }
  }

  const dedicated = DEDICATED_STT[sttProvider]
  if (dedicated) {
    const apiKey = get(dedicated.keyField)
    if (apiKey) {
      const model = get(dedicated.modelFromStore) || dedicated.defaultModel
      return {
        cfg: {
          apiKey,
          model,
          sttKind: dedicated.sttKind,
          useMainProcessStt: dedicated.useMainProcessStt === true,
        },
        sttVendor: sttProvider,
      }
    }
  }

  const leg = legacyFallbackTranscription(get)
  if (leg) {
    return {
      cfg: leg,
      sttVendor: get('audioFallbackProvider') === 'groq' ? 'groq' : 'openai',
    }
  }
  return { cfg: null, sttVendor: null }
}

/**
 * @param {(key: string) => any} get
 * @returns {{ cfg: object | null, sttVendor: string | null }}
 */
function resolveSttConfigAndVendor(get) {
  const sttProvider = getEffectiveSttProvider(get)
  return resolveSttConfigForProvider(sttProvider, get)
}

function getTranscriptionRequestConfig(get) {
  const { cfg, sttVendor } = resolveSttConfigAndVendor(get)
  if (!cfg || !sttVendor) return cfg
  if (sttVendor === 'nvidia') return cfg
  const lang = micListenLanguageFormFields(get, sttVendor)
  return { ...cfg, ...lang }
}

function needsSttKey(sttProvider) {
  return NATIVE_STT_PROVIDER_IDS.includes(sttProvider)
}

module.exports = {
  getTranscriptionRequestConfig,
  getEffectiveSttProvider,
  resolveSttConfigForProvider,
  NATIVE_STT_PROVIDER_IDS,
  STT_MODEL_FIELDS,
  needsSttKey,
  OPENAI_STYLE_STT,
  DEDICATED_STT,
}
