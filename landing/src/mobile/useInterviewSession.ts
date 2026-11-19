import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { scrollContainerToBottomFromAnchor } from './useAutoScroll'
import { minCharsForDetection } from './answerRouting'
import { transcribeAudioBlob } from './cloudStt'
import { connectNvidiaStreaming, nvidiaStreamingAvailable, type NvidiaStreamingHandle } from './nvidiaStreamingStt'
import { startPcmStreamCapture } from './pcmStreamCapture'
import {
  isDuplicateDeviceFinal,
  isLikelySttGarbage,
  isRepetitionHallucination,
  isUtteranceReadyForAutoAnswer,
} from './sttGarbage'
import { startUtteranceVadCapture } from './utteranceVadCapture'
import { capTranscriptLength } from './transcriptMerge'
import {
  appendSpeechSegment,
  consumeSegmentsForQuestion,
  fullTranscriptText,
  isLikelySelfReadback,
  pendingTranscriptText,
  questionsAreSimilar,
  selectActiveQuestion,
  stripSelfReadback,
  transcriptInWindow,
  type SpeechSegment,
} from './transcriptSegments'
import { extractFollowUpAfterAnswer, resolveFollowUpQuestion, classifyPostAnswerSpeech, combineQuestion, estimatedAnswerHoldMs } from './transcriptFollowUp'
import type { AppSettings, PersonalProfile } from './profileTypes'
import { profileIsReady } from './profileTypes'
import { getActiveApiKey, hasRoutableChatKey, loadProfile } from './profileStorage'
import { getProviderApiKey, speechLangFromSettings } from './providerRegistry'
import { sttKeyConfigured } from './sttRegistry'
import {
  createSpeechRecognition,
  requestInterviewAnswer,
  speechRecognitionAvailable,
  type SessionPhase,
} from './interviewTypes'
import {
  configureDeviceSpeechRecognition,
  deviceRecognitionRestartDelayMs,
} from './deviceStt'
import {
  loopPhaseLabel,
  MAX_TURN_HISTORY,
  type SessionLoopPhase,
  type SessionTurn,
} from './sessionLoopTypes'
import {
  allowSessionPersist,
  blockSessionPersist,
  persistSessionFields,
  saveSessionSnapshot,
} from './sessionPersistence'
import { runSessionPreflight, SESSION_PREFLIGHT_FAIL } from './sessionPreflight'

const STARTUP_TIMEOUT_MS = 30000
/** Cloud STT: silence after last audio activity before auto-answer. */
const CLOUD_UTTERANCE_END_SILENCE_MS = 1400
/**
 * On-device Web Speech: silence after last speech activity before auto-answer.
 * Android often emits partial isFinal chunks mid-utterance — never answer on final alone.
 */
const DEVICE_UTTERANCE_END_SILENCE_MS = 1200
const MIN_AUDIO_BYTES = 800
const MAX_STT_RESTART_ATTEMPTS = 5
const STT_RESTART_BASE_MS = 250

function utteranceEndSilenceMs(settings: AppSettings): number {
  return settings.sttMode === 'device' ? DEVICE_UTTERANCE_END_SILENCE_MS : CLOUD_UTTERANCE_END_SILENCE_MS
}

function effectiveMinChars(settings: AppSettings): number {
  const base = minCharsForDetection(settings.questionDetection)
  if (settings.micSensitivity === 'boost') return Math.max(8, Math.floor(base * 0.65))
  return base
}

function sttLoopAllowsTranscription(phase: SessionLoopPhase): boolean {
  return phase === 'listening' || phase === 'idle' || phase === 'generating_answer'
}

function speechErrorMessage(code: string): string | null {
  switch (code) {
    case 'aborted':
    case 'no-speech':
      return null
    case 'not-allowed':
      return 'Mic access needed — enable microphone in Android settings'
    case 'audio-capture':
      return 'Mic capture failed — check microphone hardware'
    case 'network':
      return null // transient — recognition restarts automatically
    case 'service-not-allowed':
      return 'Speech recognition not allowed on this device'
    default:
      return `Microphone error: ${code}`
  }
}

export function useInterviewSession(profile: PersonalProfile, settings: AppSettings) {
  const [phase, setPhase] = useState<SessionPhase>('home')
  const [loopPhase, setLoopPhase] = useState<SessionLoopPhase>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [answer, setAnswer] = useState('')
  const [thinkMode, setThinkMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionActive, setSessionActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startFailed, setStartFailed] = useState(false)
  const [startingMessage, setStartingMessage] = useState('Starting…')
  const [isGenerating, setIsGenerating] = useState(false)
  const [listeningStatus, setListeningStatus] = useState('')
  const [turnHistory, setTurnHistory] = useState<SessionTurn[]>([])
  const [streamingAnswer, setStreamingAnswer] = useState('')
  const [streamingQuestion, setStreamingQuestion] = useState('')
  const [answerFailed, setAnswerFailed] = useState(false)
  const [lastFailedQuestion, setLastFailedQuestion] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [sttErrorState, setSttErrorState] = useState<string | null>(null)
  const [transcriptEditing, setTranscriptEditing] = useState(false)
  const [replacingTurn, setReplacingTurn] = useState(false)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const nvidiaStreamingRef = useRef<NvidiaStreamingHandle | null>(null)
  const pcmStreamRef = useRef<{ stop: () => void } | null>(null)
  const utteranceVadRef = useRef<{ stop: () => void } | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const transcribeQueueRef = useRef<Blob[]>([])
  const transcribeBusyRef = useRef(false)
  const generatingRef = useRef(false)
  const lastDeviceFinalRef = useRef('')
  const transcriptRef = useRef('')
  const answerEndRef = useRef<HTMLDivElement | null>(null)
  const autoAnswerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sttRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settingsRef = useRef(settings)
  const profileRef = useRef(profile)
  const sessionStartedAtRef = useRef(0)
  const sttHealthyRef = useRef(false)
  const sessionActiveRef = useRef(false)
  const loopPhaseRef = useRef<SessionLoopPhase>('idle')
  const recognitionActiveRef = useRef(false)
  const recognitionStartingRef = useRef(false)
  const restartAttemptsRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const turnHistoryRef = useRef<SessionTurn[]>([])
  const wakeLockActiveRef = useRef(false)
  const sessionNotificationIdRef = useRef(1)
  const lastSpeechActivityRef = useRef(0)
  const interimTranscriptRef = useRef('')
  const answeredTranscriptSnapshotRef = useRef('')
  const speechSegmentsRef = useRef<SpeechSegment[]>([])
  const lastSentQuestionRef = useRef('')
  const lastGeneratedAnswerRef = useRef('')
  const streamingAnswerRef = useRef('')
  const answerCompletedAtRef = useRef(0)
  const speakHoldMsRef = useRef(8000)
  const pendingFollowUpRef = useRef('')
  const followUpHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userPausedRef = useRef(false)
  const startAbortRef = useRef<AbortController | null>(null)
  const startingRef = useRef(false)

  settingsRef.current = settings
  profileRef.current = profile
  turnHistoryRef.current = turnHistory

  const statusLabel = loopPhaseLabel(loopPhase, {
    reconnecting,
    sttError: sttErrorState || undefined,
    answerFailed,
  })

  const setLoopPhaseSync = useCallback(
    (next: SessionLoopPhase) => {
      loopPhaseRef.current = next
      setLoopPhase(next)
      persistSessionFields({
        loopPhase: next,
        sessionActive: sessionActiveRef.current,
        transcript: transcriptRef.current,
        answer,
        turnHistory: turnHistoryRef.current,
      })
    },
    [answer],
  )

  const scrollAnswer = useCallback(() => {
    if (!settingsRef.current.autoScroll) return
    scrollContainerToBottomFromAnchor(answerEndRef.current)
  }, [])

  const clearAutoAnswerTimer = useCallback(() => {
    if (autoAnswerTimerRef.current) {
      clearTimeout(autoAnswerTimerRef.current)
      autoAnswerTimerRef.current = null
    }
  }, [])

  const clearSttRestartTimer = useCallback(() => {
    if (sttRestartTimerRef.current) {
      clearTimeout(sttRestartTimerRef.current)
      sttRestartTimerRef.current = null
    }
  }, [])

  const persistLive = useCallback(
    (patch: { transcript?: string; answer?: string; turnHistory?: SessionTurn[] }) => {
      persistSessionFields({
        sessionActive: sessionActiveRef.current,
        loopPhase: loopPhaseRef.current,
        transcript: patch.transcript ?? transcriptRef.current,
        answer: patch.answer ?? answer,
        turnHistory: patch.turnHistory ?? turnHistoryRef.current,
      })
    },
    [answer],
  )

  const clearUtteranceState = useCallback(() => {
    transcriptRef.current = ''
    lastDeviceFinalRef.current = ''
    speechSegmentsRef.current = []
    lastSentQuestionRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    setTranscriptEditing(false)
    persistLive({ transcript: '' })
  }, [persistLive])

  const syncTranscriptDisplay = useCallback(() => {
    const text = capTranscriptLength(fullTranscriptText(speechSegmentsRef.current))
    transcriptRef.current = text
    setTranscript(text)
    persistLive({ transcript: text })
  }, [persistLive])

  const abortInFlightAnswer = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

  const stopCloudCaptureOnly = useCallback(() => {
    transcribeQueueRef.current = []
    nvidiaStreamingRef.current?.stop()
    nvidiaStreamingRef.current = null
    pcmStreamRef.current?.stop()
    pcmStreamRef.current = null
    utteranceVadRef.current?.stop()
    utteranceVadRef.current = null
    const stream = mediaStreamRef.current
    mediaStreamRef.current = null
    if (stream) stream.getTracks().forEach((t) => t.stop())
    setReconnecting(false)
  }, [])

  const detachDeviceRecognition = useCallback(() => {
    const rec = recognitionRef.current
    recognitionRef.current = null
    recognitionActiveRef.current = false
    recognitionStartingRef.current = false
    if (rec) {
      try {
        rec.onresult = null
        rec.onerror = null
        rec.onend = null
        rec.stop()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const pauseListening = useCallback(() => {
    clearAutoAnswerTimer()
    clearSttRestartTimer()
    detachDeviceRecognition()
    stopCloudCaptureOnly()
    setListeningStatus('')
    setInterimTranscript('')
  }, [clearAutoAnswerTimer, clearSttRestartTimer, detachDeviceRecognition, stopCloudCaptureOnly])

  const generateFromTextRef = useRef<
    (
      q: string,
      opts?: {
        manual?: boolean
        source?: 'manual_input' | 'transcript'
        retry?: boolean
        followUp?: boolean
        replaceLastTurn?: boolean
        imageDataUrl?: string
      },
    ) => Promise<void>
  >()

  const clearFollowUpHold = useCallback(() => {
    if (followUpHoldTimerRef.current) {
      clearTimeout(followUpHoldTimerRef.current)
      followUpHoldTimerRef.current = null
    }
  }, [])

  const isStillUsingLastAnswer = useCallback(() => {
    if (!answerCompletedAtRef.current) return false
    const sinceAnswer = Date.now() - answerCompletedAtRef.current
    const quiet = Date.now() - lastSpeechActivityRef.current
    if (sinceAnswer < 4000) return true
    if (quiet >= 1600) return false
    if (sinceAnswer >= speakHoldMsRef.current) return false
    return true
  }, [])

  const armFollowUpHold = useCallback(() => {
    clearFollowUpHold()
    const tick = () => {
      followUpHoldTimerRef.current = null
      if (!sessionActiveRef.current) return
      if (loopPhaseRef.current === 'paused') {
        followUpHoldTimerRef.current = setTimeout(tick, 400)
        return
      }
      if (!pendingFollowUpRef.current || generatingRef.current) return
      if (isStillUsingLastAnswer()) {
        followUpHoldTimerRef.current = setTimeout(tick, 400)
        return
      }
      const q = pendingFollowUpRef.current
      pendingFollowUpRef.current = ''
      if (q) void generateFromTextRef.current?.(q, { source: 'transcript', followUp: true })
    }
    followUpHoldTimerRef.current = setTimeout(tick, 400)
  }, [clearFollowUpHold, isStillUsingLastAnswer])

  const tryAutoAnswer = useCallback(() => {
    if (loopPhaseRef.current === 'generating_answer' || loopPhaseRef.current === 'paused') return
    if (interimTranscriptRef.current.trim()) return

    const activeQ = selectActiveQuestion(speechSegmentsRef.current)
    if (!activeQ) return

    const s = settingsRef.current
    if (
      !sttHealthyRef.current ||
      !s.autoAnswer ||
      generatingRef.current ||
      activeQ.length < effectiveMinChars(s) ||
      !isUtteranceReadyForAutoAnswer(activeQ)
    ) {
      return
    }

    if (questionsAreSimilar(activeQ, lastSentQuestionRef.current)) return
    const lastTurn = turnHistoryRef.current[turnHistoryRef.current.length - 1]
    if (lastTurn && questionsAreSimilar(activeQ, lastTurn.question)) return
    if (isLikelySelfReadback(activeQ, lastGeneratedAnswerRef.current || streamingAnswerRef.current)) return
    if (pendingFollowUpRef.current) {
      if (
        !questionsAreSimilar(activeQ, pendingFollowUpRef.current) &&
        isUtteranceReadyForAutoAnswer(activeQ)
      ) {
        pendingFollowUpRef.current = activeQ
        speechSegmentsRef.current = consumeSegmentsForQuestion(speechSegmentsRef.current, activeQ)
      }
      return
    }
    if (isStillUsingLastAnswer()) {
      pendingFollowUpRef.current = activeQ
      speechSegmentsRef.current = consumeSegmentsForQuestion(speechSegmentsRef.current, activeQ)
      armFollowUpHold()
      return
    }

    void generateFromTextRef.current?.(activeQ, { source: 'transcript' })
  }, [isStillUsingLastAnswer, armFollowUpHold])

  const scheduleAutoAnswer = useCallback(
    (opts?: { silenceGateMs?: number }) => {
      if (loopPhaseRef.current === 'generating_answer' || loopPhaseRef.current === 'paused') return
      clearAutoAnswerTimer()

      const gate = opts?.silenceGateMs ?? utteranceEndSilenceMs(settingsRef.current)
      const wait = Math.max(120, gate - (Date.now() - lastSpeechActivityRef.current))

      autoAnswerTimerRef.current = setTimeout(() => {
        autoAnswerTimerRef.current = null
        if (loopPhaseRef.current === 'generating_answer' || loopPhaseRef.current === 'paused') return
        const silentFor = Date.now() - lastSpeechActivityRef.current
        if (silentFor < gate - 80 || interimTranscriptRef.current.trim()) {
          scheduleAutoAnswer({ silenceGateMs: gate })
          return
        }
        tryAutoAnswer()
      }, wait)
    },
    [clearAutoAnswerTimer, tryAutoAnswer],
  )

  const markSpeechActivity = useCallback(() => {
    lastSpeechActivityRef.current = Date.now()
  }, [])

  const appendTranscriptPiece = useCallback(
    (text: string, opts?: { scheduleAnswer?: boolean; silenceGateMs?: number }) => {
      if (!sttLoopAllowsTranscription(loopPhaseRef.current)) return
      const piece = String(text || '').trim()
      if (!piece || isLikelySttGarbage(piece) || isRepetitionHallucination(piece)) return
      if (lastSentQuestionRef.current && questionsAreSimilar(piece, lastSentQuestionRef.current)) return
      const lastTurn = turnHistoryRef.current[turnHistoryRef.current.length - 1]
      if (lastTurn && questionsAreSimilar(piece, lastTurn.question)) return

      const answerText = `${lastGeneratedAnswerRef.current} ${streamingAnswerRef.current}`.trim()
      const remainder = stripSelfReadback(piece, answerText)
      if (!remainder) {
        speechSegmentsRef.current = appendSpeechSegment(speechSegmentsRef.current, piece, {
          consumed: true,
          readback: true,
        })
        syncTranscriptDisplay()
        setInterimTranscript('')
        interimTranscriptRef.current = ''
        setListeningStatus('Listening…')
        sttHealthyRef.current = true
        setSttErrorState(null)
        markSpeechActivity()
        return
      }

      const duringAnswer = loopPhaseRef.current === 'generating_answer'
      const before = fullTranscriptText(speechSegmentsRef.current)
      speechSegmentsRef.current = appendSpeechSegment(speechSegmentsRef.current, remainder)
      const after = fullTranscriptText(speechSegmentsRef.current)
      if (before === after) return

      syncTranscriptDisplay()
      setInterimTranscript('')
      interimTranscriptRef.current = ''
      setListeningStatus('Listening…')
      sttHealthyRef.current = true
      setSttErrorState(null)
      markSpeechActivity()
      if (duringAnswer) {
        setListeningStatus('Listening…')
      } else if (opts?.scheduleAnswer) {
        scheduleAutoAnswer({ silenceGateMs: opts.silenceGateMs })
      }
    },
    [scheduleAutoAnswer, syncTranscriptDisplay, markSpeechActivity],
  )

  const commitCloudUtterance = useCallback(
    (text: string) => {
      interimTranscriptRef.current = ''
      setInterimTranscript('')
      appendTranscriptPiece(text, { scheduleAnswer: true, silenceGateMs: 450 })
    },
    [appendTranscriptPiece],
  )

  const setUtteranceTranscript = useCallback(
    (text: string, opts?: { scheduleAnswer?: boolean }) => {
      appendTranscriptPiece(text, opts)
    },
    [appendTranscriptPiece],
  )

  const finishAnswerCycle = useCallback(
    (opts?: { resumeListening?: boolean }) => {
      setAnswerFailed(false)
      setLastFailedQuestion('')
      if (!sessionActiveRef.current) {
        setLoopPhaseSync('idle')
        return
      }
      if (opts?.resumeListening && loopPhaseRef.current !== 'paused') {
        setLoopPhaseSync('listening')
      } else if (loopPhaseRef.current !== 'paused') {
        setLoopPhaseSync('listening')
      }
    },
    [setLoopPhaseSync],
  )

  const resumeListeningRef = useRef<() => void>(() => {})

  const processPostAnswerFollowUp = useCallback(() => {
    const snapshot = answeredTranscriptSnapshotRef.current
    answeredTranscriptSnapshotRef.current = ''

    speechSegmentsRef.current = consumeSegmentsForQuestion(speechSegmentsRef.current, snapshot)

    const pendingJoined = pendingTranscriptText(speechSegmentsRef.current)
    let tail = resolveFollowUpQuestion(snapshot, speechSegmentsRef.current)
    const interim = interimTranscriptRef.current.trim()
    if (!tail && interim) {
      tail = extractFollowUpAfterAnswer(snapshot, interim) || interim
    }

    syncTranscriptDisplay()
    lastDeviceFinalRef.current = ''
    interimTranscriptRef.current = ''
    setInterimTranscript('')

    if (!settingsRef.current.autoAnswer) return

    const next = [tail, pendingJoined]
      .map((t) => String(t || '').trim())
      .find((t) => t && !isLikelySttGarbage(t) && !isRepetitionHallucination(t) && !questionsAreSimilar(t, snapshot))
    if (!next) return
    const answerText = `${lastGeneratedAnswerRef.current} ${streamingAnswerRef.current}`.trim()
    const followUp = stripSelfReadback(next, answerText)
    if (!followUp || isLikelySelfReadback(followUp, answerText)) return

    const minChars = effectiveMinChars(settingsRef.current)
    if (followUp.length < minChars) return

    speechSegmentsRef.current = consumeSegmentsForQuestion(speechSegmentsRef.current, followUp)
    const kind = classifyPostAnswerSpeech(followUp, snapshot)

    if (kind === 'ignore') return

    if (kind === 'continuation') {
      const combined = combineQuestion(snapshot, followUp)
      const last = turnHistoryRef.current[turnHistoryRef.current.length - 1]
      let replaceLastTurn = false
      if (last && questionsAreSimilar(last.question, snapshot)) {
        const hist = [...turnHistoryRef.current]
        hist[hist.length - 1] = { ...last, question: combined }
        turnHistoryRef.current = hist
        setTurnHistory(hist)
        persistLive({ turnHistory: hist })
        replaceLastTurn = true
      }
      void generateFromTextRef.current?.(combined, {
        source: 'transcript',
        followUp: true,
        replaceLastTurn,
      })
      return
    }

    pendingFollowUpRef.current = followUp
    armFollowUpHold()
  }, [syncTranscriptDisplay, persistLive, armFollowUpHold])

  const generateFromText = useCallback(
    async (
      question: string,
      opts?: {
        manual?: boolean
        source?: 'manual_input' | 'transcript'
        retry?: boolean
        followUp?: boolean
        replaceLastTurn?: boolean
        imageDataUrl?: string
      },
    ) => {
      const q = String(question || '').trim()
      if (!q) return
      if (isRepetitionHallucination(q) || isLikelySttGarbage(q)) return
      if (generatingRef.current && !opts?.retry) return

      const lastTurn = turnHistoryRef.current[turnHistoryRef.current.length - 1]
      if (lastTurn && questionsAreSimilar(q, lastTurn.question) && !opts?.retry && !opts?.followUp && !opts?.replaceLastTurn && !opts?.imageDataUrl) return
      if (!opts?.followUp && !opts?.replaceLastTurn && !opts?.imageDataUrl && questionsAreSimilar(q, lastSentQuestionRef.current) && !opts?.retry) return
      if (!opts?.manual && !opts?.retry && !opts?.followUp && isLikelySelfReadback(q, lastGeneratedAnswerRef.current)) return

      const currentSettings = settingsRef.current
      const currentProfile = profileRef.current
      const hasRoutedKey =
        Boolean(getProviderApiKey(currentSettings, 'nvidia')) ||
        Boolean(getProviderApiKey(currentSettings, 'groq')) ||
        Boolean(getActiveApiKey(currentSettings))
      if (!hasRoutedKey) {
        setError('Add your API key in Settings → AI Providers.')
        return
      }

      pendingFollowUpRef.current = ''
      clearFollowUpHold()
      abortInFlightAnswer()
      clearAutoAnswerTimer()
      answeredTranscriptSnapshotRef.current = q
      lastSentQuestionRef.current = q
      const recentConversation = transcriptInWindow(
        speechSegmentsRef.current,
        currentSettings.conversationMemorySec,
      )
      const replaceInPlace = Boolean(opts?.replaceLastTurn)
      generatingRef.current = true
      setIsGenerating(true)
      setReplacingTurn(replaceInPlace)
      setAnswerFailed(false)
      setStreamingQuestion(replaceInPlace ? '' : q)
      streamingAnswerRef.current = ''
      setStreamingAnswer('')
      setLoopPhaseSync('generating_answer')
      setError(null)
      window.setTimeout(() => resumeListeningRef.current(), 0)
      // STT keeps running — transcript panel stays on "Listening…" while answer composes above.
      if (recognitionActiveRef.current || mediaStreamRef.current) {
        setListeningStatus('Listening…')
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const text = await requestInterviewAnswer({
          question: q,
          profile: currentProfile,
          settings: currentSettings,
          think: opts?.manual && opts?.source === 'manual_input' ? thinkMode : false,
          source: opts?.source || 'manual_input',
          turnHistory: turnHistoryRef.current,
          recentConversation,
          signal: controller.signal,
          imageDataUrl: opts?.imageDataUrl,
          onDelta: (chunk) => {
            streamingAnswerRef.current += chunk
            const smoothStream = Boolean(opts?.followUp || opts?.replaceLastTurn)
            if (smoothStream) {
              setStreamingAnswer((prev) => prev + chunk)
            } else {
              flushSync(() => {
                setStreamingAnswer((prev) => prev + chunk)
              })
            }
            scrollAnswer()
          },
          onStreamReset: () => {
            streamingAnswerRef.current = ''
            if (opts?.followUp || opts?.replaceLastTurn) {
              setStreamingAnswer('')
            } else {
              flushSync(() => setStreamingAnswer(''))
            }
          },
        })
        if (controller.signal.aborted) return

        lastGeneratedAnswerRef.current = text
        streamingAnswerRef.current = ''
        answerCompletedAtRef.current = Date.now()
        speakHoldMsRef.current = estimatedAnswerHoldMs(text)
        let nextHistory: SessionTurn[]
        if (replaceInPlace && turnHistoryRef.current.length > 0) {
          nextHistory = [...turnHistoryRef.current]
          const idx = nextHistory.length - 1
          nextHistory[idx] = { ...nextHistory[idx], question: q, answer: text, at: Date.now() }
        } else {
          nextHistory = [
            ...turnHistoryRef.current,
            { question: q, answer: text, at: Date.now() },
          ].slice(-MAX_TURN_HISTORY)
        }
        turnHistoryRef.current = nextHistory
        setTurnHistory(nextHistory)
        setStreamingAnswer('')
        setStreamingQuestion('')
        setReplacingTurn(false)
        setAnswer('')
        persistLive({ turnHistory: nextHistory, answer: '' })
        scrollAnswer()
      } catch (e) {
        if (controller.signal.aborted) return
        const msg = e instanceof Error ? e.message : 'Generation failed'
        setError(msg)
        setAnswerFailed(true)
        setLastFailedQuestion(q)
        if (!opts?.manual) console.warn('[interview]', msg)
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
        generatingRef.current = false
        setIsGenerating(false)
        setReplacingTurn(false)
        setStreamingAnswer('')
        setStreamingQuestion('')
        setStarting(false)
        finishAnswerCycle({ resumeListening: true })
        processPostAnswerFollowUp()
        resumeListeningRef.current()
      }
    },
    [
      thinkMode,
      scrollAnswer,
      clearAutoAnswerTimer,
      abortInFlightAnswer,
      setLoopPhaseSync,
      finishAnswerCycle,
      persistLive,
      processPostAnswerFollowUp,
      clearFollowUpHold,
    ],
  )
  generateFromTextRef.current = generateFromText

  const drainTranscribeQueue = useCallback(async () => {
    if (transcribeBusyRef.current) return
    if (!sttLoopAllowsTranscription(loopPhaseRef.current)) return
    if (transcribeQueueRef.current.length > 4) {
      transcribeQueueRef.current = transcribeQueueRef.current.slice(-3)
    }
    transcribeBusyRef.current = true
    while (transcribeQueueRef.current.length > 0) {
      if (!sttLoopAllowsTranscription(loopPhaseRef.current)) break
      const blob = transcribeQueueRef.current.shift()
      if (!blob) continue
      setListeningStatus('Transcribing…')
      try {
        const text = await Promise.race([
          transcribeAudioBlob(settingsRef.current, blob),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('request_timeout')), 90000),
          ),
        ])
        if (!text || isLikelySttGarbage(text)) {
          console.warn('[stt] skipped junk/empty transcript')
          continue
        }
        setUtteranceTranscript(text, { scheduleAnswer: true })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Cloud transcription failed'
        console.warn('[stt]', msg)
        if (!/timeout|request_timeout/i.test(msg)) {
          setSttErrorState('Transcription slow — still listening')
        }
      }
    }
    transcribeBusyRef.current = false
    if (sttLoopAllowsTranscription(loopPhaseRef.current)) setListeningStatus('Listening…')
  }, [setUtteranceTranscript])

  const enqueueAudioChunk = useCallback(
    (blob: Blob) => {
      if (!sttLoopAllowsTranscription(loopPhaseRef.current)) return
      if (!blob || blob.size < MIN_AUDIO_BYTES) return
      transcribeQueueRef.current.push(blob)
      void drainTranscribeQueue()
    },
    [drainTranscribeQueue],
  )

  const scheduleRecognitionRestart = useCallback(
    (recognition: SpeechRecognition) => {
      if (!sessionActiveRef.current || recognitionRef.current !== recognition) return
      if (!sttLoopAllowsTranscription(loopPhaseRef.current)) return
      if (recognitionActiveRef.current || recognitionStartingRef.current) return

      if (restartAttemptsRef.current >= MAX_STT_RESTART_ATTEMPTS) {
        setSttErrorState('Speech recognition stopped — tap New Question to retry')
        setError('Speech recognition stopped after repeated errors.')
        return
      }

      const delay =
        restartAttemptsRef.current === 0
          ? deviceRecognitionRestartDelayMs(lastSpeechActivityRef.current)
          : STT_RESTART_BASE_MS * 2 ** (restartAttemptsRef.current - 1)
      restartAttemptsRef.current += 1
      clearSttRestartTimer()
      sttRestartTimerRef.current = setTimeout(() => {
        sttRestartTimerRef.current = null
        if (!sessionActiveRef.current || recognitionRef.current !== recognition) return
        if (!sttLoopAllowsTranscription(loopPhaseRef.current)) return
        if (recognitionActiveRef.current || recognitionStartingRef.current) return
        try {
          recognitionStartingRef.current = true
          recognition.start()
          recognitionActiveRef.current = true
          recognitionStartingRef.current = false
          restartAttemptsRef.current = 0
          setSttErrorState(null)
        } catch {
          recognitionStartingRef.current = false
          scheduleRecognitionRestart(recognition)
        }
      }, delay)
    },
    [clearSttRestartTimer],
  )

  const sttPhaseActive = useCallback(
    (phase: SessionLoopPhase) => phase === 'listening' || phase === 'generating_answer',
    [],
  )

  const startDeviceRecognition = useCallback(() => {
    if (!speechRecognitionAvailable()) {
      setError('On-device speech recognition unavailable. Try Cloud API in Settings → Audio.')
      setSttErrorState('On-device STT unavailable')
      return
    }

    detachDeviceRecognition()
    restartAttemptsRef.current = 0

    try {
      const lang = speechLangFromSettings(settingsRef.current.micListenLanguage)
      const recognition = createSpeechRecognition(lang)
      configureDeviceSpeechRecognition(recognition, settingsRef.current)
      recognitionRef.current = recognition
      lastDeviceFinalRef.current = ''

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (!sttLoopAllowsTranscription(loopPhaseRef.current)) return
        restartAttemptsRef.current = 0
        const duringAnswer = loopPhaseRef.current === 'generating_answer'
        let interim = ''
        let finalChunk = ''
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i][0]?.transcript || ''
          if (event.results[i].isFinal) finalChunk += piece
          else interim += piece
        }

        if (interim.trim()) {
          const piece = interim.trim()
          if (isLikelySttGarbage(piece) || isRepetitionHallucination(piece)) return
          if (lastSentQuestionRef.current && questionsAreSimilar(piece, lastSentQuestionRef.current)) return
          const lastTurn = turnHistoryRef.current[turnHistoryRef.current.length - 1]
          if (lastTurn && questionsAreSimilar(piece, lastTurn.question)) return
          interimTranscriptRef.current = piece
          markSpeechActivity()
          if (!duringAnswer) clearAutoAnswerTimer()
          setInterimTranscript(piece)
          setListeningStatus('Listening…')
        } else if (!finalChunk.trim()) {
          interimTranscriptRef.current = ''
          setInterimTranscript('')
        }

        if (finalChunk.trim()) {
          const trimmedFinal = finalChunk.trim()
          if (isLikelySttGarbage(trimmedFinal) || isRepetitionHallucination(trimmedFinal)) return
          if (isDuplicateDeviceFinal(lastDeviceFinalRef.current, trimmedFinal)) return

          interimTranscriptRef.current = ''
          setInterimTranscript('')
          lastDeviceFinalRef.current = trimmedFinal
          appendTranscriptPiece(trimmedFinal, { scheduleAnswer: !duringAnswer })
        }
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'network') {
          setSttErrorState('Speech reconnecting…')
          return
        }
        const msg = speechErrorMessage(event.error)
        if (!msg) return
        setSttErrorState(msg)
        setError(msg)
        if (event.error === 'not-allowed' || event.error === 'audio-capture') {
          recognitionActiveRef.current = false
        }
      }

      const recWithStart = recognition as SpeechRecognition & { onstart?: () => void }
      recWithStart.onstart = () => {
        recognitionActiveRef.current = true
        recognitionStartingRef.current = false
      }

      recognition.onend = () => {
        recognitionActiveRef.current = false
        recognitionStartingRef.current = false
        if (
          sessionActiveRef.current &&
          recognitionRef.current === recognition &&
          sttPhaseActive(loopPhaseRef.current)
        ) {
          scheduleRecognitionRestart(recognition)
        }
      }

      recognitionStartingRef.current = true
      recognition.start()
      setListeningStatus('Listening…')
      sttHealthyRef.current = true
    } catch (e) {
      recognitionStartingRef.current = false
      const msg = e instanceof Error ? e.message : 'Speech recognition failed to start'
      setError(msg)
      setSttErrorState(msg)
    }
  }, [
    detachDeviceRecognition,
    appendTranscriptPiece,
    scheduleRecognitionRestart,
    markSpeechActivity,
    clearAutoAnswerTimer,
    sttPhaseActive,
  ])

  const startCloudCapture = useCallback(async () => {
    stopCloudCaptureOnly()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: settingsRef.current.micSensitivity === 'boost',
        },
      })
      mediaStreamRef.current = stream
      const provider = settingsRef.current.sttProvider
      sttHealthyRef.current = true
      setListeningStatus('Listening…')

      if (provider === 'nvidia' && nvidiaStreamingAvailable()) {
        try {
          const live = await connectNvidiaStreaming(settingsRef.current, {
            onInterim: (text) => {
              if (!sttLoopAllowsTranscription(loopPhaseRef.current)) return
              interimTranscriptRef.current = text
              markSpeechActivity()
              if (loopPhaseRef.current !== 'generating_answer') {
                clearAutoAnswerTimer()
              }
              setInterimTranscript(text)
              setListeningStatus('Listening…')
            },
            onUtterance: (text) => {
              commitCloudUtterance(text)
            },
            onError: (msg) => console.warn('[stt] NVIDIA stream', msg),
          })
          nvidiaStreamingRef.current = live
          pcmStreamRef.current = startPcmStreamCapture(stream, (samples, rate) => {
            if (sttLoopAllowsTranscription(loopPhaseRef.current)) live.sendPcm(samples, rate)
          })
          return
        } catch (streamErr) {
          console.warn('[stt] NVIDIA streaming failed — batch fallback', streamErr)
        }
      }

      utteranceVadRef.current = startUtteranceVadCapture(stream, (wav) => {
        enqueueAudioChunk(wav)
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Microphone permission denied'
      setError(msg)
      setSttErrorState(msg)
    }
  }, [enqueueAudioChunk, stopCloudCaptureOnly, markSpeechActivity, clearAutoAnswerTimer, commitCloudUtterance])

  const ensureListeningPipeline = useCallback(() => {
    if (!sessionActiveRef.current) return
    if (!sttPhaseActive(loopPhaseRef.current)) return
    if (!settingsRef.current.audioEnabled) return

    if (settingsRef.current.sttMode === 'cloud') {
      const stream = mediaStreamRef.current
      const provider = settingsRef.current.sttProvider
      if (!stream) {
        void startCloudCapture()
        return
      }
      if (provider === 'nvidia' && !nvidiaStreamingRef.current && !utteranceVadRef.current) {
        void startCloudCapture()
      }
      return
    }

    if (!recognitionRef.current && !recognitionActiveRef.current) {
      startDeviceRecognition()
    }
  }, [sttPhaseActive, startCloudCapture, startDeviceRecognition])

  const startRecognitionInternal = useCallback(() => {
    if (!sessionActiveRef.current) return
    if (!sttPhaseActive(loopPhaseRef.current)) return
    if (!settingsRef.current.audioEnabled) return

    pauseListening()

    if (settingsRef.current.sttMode === 'cloud') {
      void startCloudCapture()
      return
    }
    startDeviceRecognition()
  }, [pauseListening, startCloudCapture, startDeviceRecognition, sttPhaseActive])

  resumeListeningRef.current = () => {
    if (!sessionActiveRef.current || loopPhaseRef.current === 'paused') return
    interimTranscriptRef.current = ''
    lastSpeechActivityRef.current = Date.now()
    ensureListeningPipeline()
  }

  const stopRecognition = useCallback(() => {
    clearAutoAnswerTimer()
    clearSttRestartTimer()
    pauseListening()
  }, [clearAutoAnswerTimer, clearSttRestartTimer, pauseListening])

  const releaseSessionResources = useCallback(async () => {
    try {
      const { KeepAwake } = await import('@capacitor-community/keep-awake')
      if (wakeLockActiveRef.current) {
        await KeepAwake.allowSleep()
        wakeLockActiveRef.current = false
      }
    } catch {
      /* plugin optional */
    }
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      await LocalNotifications.cancel({ notifications: [{ id: sessionNotificationIdRef.current }] })
    } catch {
      /* ignore */
    }
  }, [])

  const activateSessionResources = useCallback(async () => {
    window.setTimeout(async () => {
      if (!sessionActiveRef.current) return
      if (settingsRef.current.keepScreenAwake) {
        try {
          const { KeepAwake } = await import('@capacitor-community/keep-awake')
          await KeepAwake.keepAwake()
          wakeLockActiveRef.current = true
        } catch {
          /* ignore */
        }
      }
    }, 400)
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      await LocalNotifications.requestPermissions()
      await LocalNotifications.schedule({
        notifications: [
          {
            id: sessionNotificationIdRef.current,
            title: 'VeilAssist Interview',
            body: 'Interview session active — listening for questions',
            autoCancel: false,
          },
        ],
      })
    } catch {
      /* notifications optional */
    }
  }, [])

  const startSession = useCallback(async () => {
    if (sessionActiveRef.current || startingRef.current) return
    startingRef.current = true

    const freshProfile = loadProfile()
    profileRef.current = freshProfile

    if (!profileIsReady(freshProfile)) {
      startingRef.current = false
      setError('Add your resume in Settings → Personal Info first.')
      return
    }
    if (!hasRoutableChatKey(settings)) {
      startingRef.current = false
      setError('Add your API key in Settings → AI Providers.')
      return
    }
    if (settings.sttMode === 'cloud' && !sttKeyConfigured(settings, settings.sttProvider)) {
      startingRef.current = false
      setError(`Add your ${settings.sttProvider} API key in Settings → Audio.`)
      return
    }
    if (settings.sttMode === 'device' && !speechRecognitionAvailable()) {
      startingRef.current = false
      setError(
        'On-device speech recognition is not available on this phone. Switch to Cloud API in Settings → Audio.',
      )
      return
    }

    setError(null)
    setStartFailed(false)
    setStarting(true)
    setStartingMessage('Starting session…')
    setPhase('interview')
    setLoopPhaseSync('idle')

    startAbortRef.current?.abort()
    const ac = new AbortController()
    startAbortRef.current = ac

    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('STARTUP_TIMEOUT')), STARTUP_TIMEOUT_MS)
    })

    const failStart = (message: string) => {
      if (ac.signal.aborted) return
      startingRef.current = false
      setStarting(false)
      setStartFailed(true)
      setError(message)
    }

    try {
      const preflight = await Promise.race([
        runSessionPreflight(settings, freshProfile, setStartingMessage),
        timeout,
      ])
      if (ac.signal.aborted) {
        startingRef.current = false
        return
      }
      if (!preflight.ok) {
        failStart(preflight.error || SESSION_PREFLIGHT_FAIL)
        return
      }
    } catch {
      failStart(SESSION_PREFLIGHT_FAIL)
      return
    }

    if (ac.signal.aborted) {
      startingRef.current = false
      return
    }

    sessionActiveRef.current = true
    setSessionActive(true)
    userPausedRef.current = false
    sessionStartedAtRef.current = Date.now()
    sttHealthyRef.current = false
    allowSessionPersist()

    setTurnHistory([])
    turnHistoryRef.current = []
    lastGeneratedAnswerRef.current = ''
    setAnswerFailed(false)
    setLastFailedQuestion('')
    setReconnecting(false)
    setSttErrorState(null)
    setStartFailed(false)

    clearUtteranceState()
    setAnswer('')
    setLoopPhaseSync('listening')

    saveSessionSnapshot({
      sessionActive: true,
      loopPhase: 'listening',
      transcript: '',
      answer: '',
      turnHistory: [],
      updatedAt: Date.now(),
    })

    void activateSessionResources()
    startRecognitionInternal()
    setStartingMessage('Listening for questions…')
    setStarting(false)
    startingRef.current = false
  }, [
    settings,
    clearUtteranceState,
    setLoopPhaseSync,
    startRecognitionInternal,
    activateSessionResources,
  ])

  const stopSession = useCallback(() => {
    startAbortRef.current?.abort()
    startAbortRef.current = null
    startingRef.current = false
    sessionActiveRef.current = false
    userPausedRef.current = false
    blockSessionPersist()
    setSessionActive(false)
    abortInFlightAnswer()
    stopRecognition()
    setInterimTranscript('')
    lastGeneratedAnswerRef.current = ''
    streamingAnswerRef.current = ''
    pendingFollowUpRef.current = ''
    answerCompletedAtRef.current = 0
    turnHistoryRef.current = []
    transcriptRef.current = ''
    setTurnHistory([])
    setTranscript('')
    setAnswer('')
    setStreamingAnswer('')
    setStreamingQuestion('')
    clearFollowUpHold()
    setStarting(false)
    setStartFailed(false)
    setListeningStatus('')
    setReconnecting(false)
    setSttErrorState(null)
    setAnswerFailed(false)
    setLoopPhaseSync('idle')
    setPhase('home')
    void releaseSessionResources()
  }, [stopRecognition, abortInFlightAnswer, setLoopPhaseSync, releaseSessionResources, clearFollowUpHold])

  const assistNow = useCallback(() => {
    const q = transcriptRef.current.trim() || `${transcript} ${interimTranscript}`.trim()
    if (!q || isLikelySttGarbage(q)) {
      setError('No speech detected yet. Speak a question, then tap Assist.')
      return
    }
    void generateFromText(q, { source: 'transcript' })
  }, [transcript, interimTranscript, generateFromText])

  const retryFailedAnswer = useCallback(() => {
    const q = lastFailedQuestion.trim()
    if (!q) return
    void generateFromText(q, { source: 'transcript', retry: true })
  }, [lastFailedQuestion, generateFromText])

  const newQuestion = useCallback(() => {
    clearAutoAnswerTimer()
    clearFollowUpHold()
    pendingFollowUpRef.current = ''
    answerCompletedAtRef.current = 0
    abortInFlightAnswer()
    answeredTranscriptSnapshotRef.current = ''
    clearUtteranceState()
    setAnswer('')
    persistLive({ answer: '' })
    setError(null)
    setAnswerFailed(false)
    setLastFailedQuestion('')
    setSttErrorState(null)
    sttHealthyRef.current = settingsRef.current.sttMode === 'device'
    sessionStartedAtRef.current = Date.now()
    if (sessionActiveRef.current && loopPhaseRef.current !== 'paused') {
      setLoopPhaseSync('listening')
      startRecognitionInternal()
    }
  }, [
    clearAutoAnswerTimer,
    clearFollowUpHold,
    abortInFlightAnswer,
    clearUtteranceState,
    persistLive,
    setLoopPhaseSync,
    startRecognitionInternal,
  ])

  const sendTypedQuestion = useCallback(
    (text: string) => {
      const q = text.trim()
      if (!q) return
      transcriptRef.current = q
      setTranscript(q)
      setInterimTranscript('')
      void generateFromText(q, { manual: true, source: 'manual_input' })
    },
    [generateFromText],
  )

  const sendPhotoQuestion = useCallback(
    (imageDataUrl: string) => {
      const q = 'Photo question'
      transcriptRef.current = q
      setTranscript(q)
      setInterimTranscript('')
      void generateFromText(q, { manual: true, source: 'manual_input', imageDataUrl })
    },
    [generateFromText],
  )

  const pauseSession = useCallback(() => {
    if (!sessionActiveRef.current) return
    abortInFlightAnswer()
    pauseListening()
    userPausedRef.current = true
    setLoopPhaseSync('paused')
    setListeningStatus('Paused')
    setStarting(false)
  }, [abortInFlightAnswer, pauseListening, setLoopPhaseSync])

  const resumeSession = useCallback(() => {
    if (!sessionActiveRef.current) return
    userPausedRef.current = false
    setLoopPhaseSync('listening')
    setListeningStatus('Listening…')
    setStarting(false)
    resumeListeningRef.current()
  }, [setLoopPhaseSync])

  const setTranscriptManual = useCallback(
    (text: string) => {
      const piece = String(text || '').trim()
      if (piece) {
        speechSegmentsRef.current = appendSpeechSegment(speechSegmentsRef.current, piece)
      } else {
        speechSegmentsRef.current = []
      }
      syncTranscriptDisplay()
      setInterimTranscript('')
      setTranscriptEditing(false)
      if (piece && settingsRef.current.autoAnswer) scheduleAutoAnswer()
    },
    [syncTranscriptDisplay, scheduleAutoAnswer],
  )

  const clearError = useCallback(() => setError(null), [])

  const restoreSessionFromSnapshot = useCallback(() => {
    return false
  }, [])

  // App lifecycle: background / foreground
  useEffect(() => {
    let remove: (() => void) | undefined
    void import('@capacitor/app')
      .then(async ({ App }) => {
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (!sessionActiveRef.current) return
          if (!isActive) {
            pauseListening()
            if (loopPhaseRef.current !== 'paused') {
              setLoopPhaseSync('paused')
              setListeningStatus('Paused (app backgrounded)')
            }
          } else if (loopPhaseRef.current === 'paused' && !userPausedRef.current) {
            setLoopPhaseSync('listening')
            setListeningStatus('Resuming…')
            resumeListeningRef.current()
          }
        })
        remove = () => void handle.remove()
      })
      .catch(() => {
        /* web dev */
      })
    return () => remove?.()
  }, [pauseListening, setLoopPhaseSync])

  // Persist answer on change
  useEffect(() => {
    if (!sessionActive) return
    persistLive({ answer })
  }, [answer, sessionActive, persistLive])

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  useEffect(() => {
    return () => {
      clearAutoAnswerTimer()
      clearSttRestartTimer()
      stopRecognition()
      void releaseSessionResources()
    }
  }, [stopRecognition, clearAutoAnswerTimer, clearSttRestartTimer, releaseSessionResources])

  const displayTranscript = (() => {
    const committed = transcript.trim()
    const interim = interimTranscript.trim()
    if (!interim) return committed
    if (!committed) return interim
    if (interim.startsWith(committed) || committed.startsWith(interim)) {
      return interim.length >= committed.length ? interim : committed
    }
    return `${committed} ${interim}`.trim()
  })()

  return {
    phase,
    loopPhase,
    statusLabel,
    transcript: displayTranscript,
    answer,
    thinkMode,
    setThinkMode,
    error,
    sessionActive,
    starting,
    startFailed,
    startingMessage,
    listeningStatus,
    startSession,
    stopSession,
    pauseSession,
    resumeSession,
    assistNow,
    newQuestion,
    sendTypedQuestion,
    sendPhotoQuestion,
    answerEndRef,
    isGenerating,
    clearError,
    answerFailed,
    retryFailedAnswer,
    transcriptEditing,
    setTranscriptEditing,
    setTranscriptManual,
    turnHistory,
    streamingAnswer,
    streamingQuestion,
    replacingTurn,
    restoreSessionFromSnapshot,
  }
}
