// Copyright (c) 2026 VeilAssist. All rights reserved.
// InterviewMan auto-answer transcript timing (from main.dart.js).
//
// Detection does not run on every STT partial. An utterance endpoint emits immediately, then a 5s
// window swallows further interims. After the last emit, wait 2s of quiet and only then ask the
// detector. The model sees the tail of the rolling transcript: durationSeconds * 15 characters
// (default 30s → 450), cut on a word boundary.

const DETECT_DEBOUNCE_MS = 2000
const ENDPOINT_COALESCE_MS = 5000
const INTERIM_EMIT_MS = 100
const DEFAULT_TRANSCRIPT_DURATION_SECONDS = 30
const TRANSCRIPT_DURATION_CHOICES = [30, 60, 120, 180]
const CHARS_PER_SECOND = 15

/** Interview Man's Conversation Memory control: 30s, 1m, 2m, 3m. Anything else is 30s. */
function normalizeTranscriptDurationSeconds(value) {
  const n = Number(value)
  return TRANSCRIPT_DURATION_CHOICES.includes(n) ? n : DEFAULT_TRANSCRIPT_DURATION_SECONDS
}

/**
 * How many already-answered questions the model sees.
 * Interview Man: clamp(round(seconds / 15), 3, 12) → 30s=3, 1m=4, 2m=8, 3m=12.
 */
function answeredQuestionLimit(durationSeconds) {
  const n = Math.round(normalizeTranscriptDurationSeconds(durationSeconds) / 15)
  if (n < 3) return 3
  if (n > 12) return 12
  return n
}

function cleanQuestionLine(question) {
  return String(question || '').replace(/\s+/g, ' ').trim().slice(0, 300)
}

/**
 * Question text only. Never the answer. Empty history is omitted unless includeEmpty,
 * which auto-answer uses so the model still sees the tag.
 */
function formatAnsweredQuestionsBlock(questions, durationSeconds, { includeEmpty = false } = {}) {
  const lines = (Array.isArray(questions) ? questions : [])
    .map(cleanQuestionLine)
    .filter(Boolean)
    .slice(-answeredQuestionLimit(durationSeconds))
  if (!lines.length && !includeEmpty) return ''
  const body = lines.length ? lines.map((q) => `- ${q}`).join('\n') : '(no questions answered yet)'
  return `<answered_questions>\n${body}\n</answered_questions>`
}

function transcriptMaxChars(durationSeconds = DEFAULT_TRANSCRIPT_DURATION_SECONDS) {
  const secs = Number(durationSeconds)
  const n = Number.isFinite(secs) && secs > 0 ? Math.floor(secs) : DEFAULT_TRANSCRIPT_DURATION_SECONDS
  return n * CHARS_PER_SECOND
}

/**
 * Last `durationSeconds * 15` characters, preferring a word boundary (InterviewMan `clA`).
 * @param {unknown} text
 * @param {number} [durationSeconds]
 * @returns {string}
 */
function clipTranscriptTail(text, durationSeconds = DEFAULT_TRANSCRIPT_DURATION_SECONDS) {
  const s = String(text || '')
  const maxChars = transcriptMaxChars(durationSeconds)
  if (s.length <= maxChars) return s.trim()
  const start = s.length - maxChars
  const space = s.indexOf(' ', start)
  return (space === -1 ? s.slice(start) : s.slice(space + 1)).trim()
}

const OTHER_LABEL_RE = /^\s*(?:\[INTERVIEWER\]|Participant|Interviewer|Other):\s*/i
const ME_LABEL_RE = /^\s*(?:\[ME\]|Me|You):\s*/i
const SPEAKER_N_RE = /^\s*Speaker (\d+):\s*/

/**
 * InterviewMan's diarized transcript: "Speaker N: " only where the speaker changes, a blank line
 * between speakers, and consecutive speech from one speaker joined into one paragraph. The other
 * side (system audio) is Speaker 1, the user's microphone Speaker 2. An unlabeled line continues the
 * current speaker (a clipped tail can start mid-line with no label, as in InterviewMan).
 * @param {unknown} transcript  "Participant: …" / "Me: …" lines
 * @returns {string}
 */
function toInterviewManTranscript(transcript) {
  let out = ''
  let current = null
  for (const raw of String(transcript || '').split('\n')) {
    let speaker = null
    let text = raw
    const numbered = raw.match(SPEAKER_N_RE)
    if (numbered) {
      speaker = Number(numbered[1])
      text = raw.slice(numbered[0].length)
    } else if (OTHER_LABEL_RE.test(raw)) {
      speaker = 1
      text = raw.replace(OTHER_LABEL_RE, '')
    } else if (ME_LABEL_RE.test(raw)) {
      speaker = 2
      text = raw.replace(ME_LABEL_RE, '')
    }
    text = text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (speaker != null && speaker !== current) {
      if (out) out += '\n\n'
      out += `Speaker ${speaker}: ${text}`
      current = speaker
    } else {
      out += out ? ` ${text}` : text
    }
  }
  return out
}

/**
 * InterviewMan's transcript user turn, used by both its detector and its answer request.
 * @param {unknown} transcript
 * @returns {string}
 */
function buildTranscriptUserTurn(transcript, durationSeconds = DEFAULT_TRANSCRIPT_DURATION_SECONDS) {
  // Speaker labels are longer than "Me:" / "Participant:", so the clip has to happen after that
  // conversion. InterviewMan clips the transcript the model actually reads.
  const body = clipTranscriptTail(toInterviewManTranscript(transcript), durationSeconds)
  return `Here is the transcript:\n<transcription>\n${body}\n</transcription>\n`
}

/**
 * Auto-answer user turn: InterviewMan's transcript template, plus the question the detector found.
 * InterviewMan's answer model returns JSON {question, answer} and only the answer is shown; answers
 * here stream as plain text, so the detected question anchors which question to answer. No screenshot.
 * @param {unknown} transcriptTail
 * @param {unknown} [detectedQuestion]
 * @returns {string}
 */
function buildAutoAnswerUserPrompt(transcriptTail, detectedQuestion, options = {}) {
  const ctx = String(transcriptTail || '').trim()
  if (!ctx) return ''
  const duration = normalizeTranscriptDurationSeconds(options.durationSeconds)
  const q = String(detectedQuestion || '').replace(/\s+/g, ' ').trim()
  const turn = buildTranscriptUserTurn(ctx, duration)
  const block = formatAnsweredQuestionsBlock(options.answeredQuestions, duration, { includeEmpty: true })
  const head = q ? `${turn}\nLast question asked: ${q}\n` : turn
  return `${head}\n${block}\n`
}

/**
 * One detect after the STT stream settles — not per partial.
 *
 * @param {{
 *   onDetect?: (text: string) => void,
 *   isBusy?: () => boolean,
 *   debounceMs?: number,
 *   coalesceMs?: number,
 *   interimEmitMs?: number,
 *   setTimeoutFn?: typeof setTimeout,
 *   clearTimeoutFn?: typeof clearTimeout,
 *   now?: () => number,
 * }} [opts]
 */
function createTranscriptDetectScheduler(opts = {}) {
  const onDetect = typeof opts.onDetect === 'function' ? opts.onDetect : () => {}
  const isBusy = typeof opts.isBusy === 'function' ? opts.isBusy : () => false
  const debounceMs = Number(opts.debounceMs) > 0 ? Number(opts.debounceMs) : DETECT_DEBOUNCE_MS
  const coalesceMs = Number(opts.coalesceMs) > 0 ? Number(opts.coalesceMs) : ENDPOINT_COALESCE_MS
  const interimEmitMs = Number(opts.interimEmitMs) > 0 ? Number(opts.interimEmitMs) : INTERIM_EMIT_MS
  const setTimeoutFn = opts.setTimeoutFn || setTimeout
  const clearTimeoutFn = opts.clearTimeoutFn || clearTimeout
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now()

  let coalesceUntil = 0
  let detectTimer = null
  let interimTimer = null
  let latest = ''
  let held = ''
  let disposed = false

  function emit(text) {
    latest = String(text || '')
    if (detectTimer != null) {
      clearTimeoutFn(detectTimer)
      detectTimer = null
    }
    detectTimer = setTimeoutFn(() => {
      detectTimer = null
      const next = latest
      if (!String(next || '').trim()) return
      // InterviewMan PE no-ops while Generating Answer; keep the latest tail for resume().
      if (isBusy()) {
        held = next
        return
      }
      held = ''
      onDetect(next)
    }, debounceMs)
  }

  function endpoint(text) {
    if (disposed) return
    if (interimTimer != null) {
      clearTimeoutFn(interimTimer)
      interimTimer = null
    }
    coalesceUntil = now() + coalesceMs
    emit(text)
  }

  function interim(text) {
    if (disposed) return
    if (now() < coalesceUntil) return
    if (interimTimer != null) {
      clearTimeoutFn(interimTimer)
      interimTimer = null
    }
    interimTimer = setTimeoutFn(() => {
      interimTimer = null
      emit(text)
    }, interimEmitMs)
  }

  function reset() {
    if (interimTimer != null) {
      clearTimeoutFn(interimTimer)
      interimTimer = null
    }
    if (detectTimer != null) {
      clearTimeoutFn(detectTimer)
      detectTimer = null
    }
    coalesceUntil = 0
    latest = ''
    held = ''
  }

  function resume() {
    if (disposed) return
    const text = String(held || latest || '').trim()
    if (!text) return
    held = ''
    emit(text)
  }

  function dispose() {
    disposed = true
    reset()
  }

  return { endpoint, interim, reset, resume, dispose }
}

module.exports = {
  DETECT_DEBOUNCE_MS,
  ENDPOINT_COALESCE_MS,
  INTERIM_EMIT_MS,
  DEFAULT_TRANSCRIPT_DURATION_SECONDS,
  TRANSCRIPT_DURATION_CHOICES,
  CHARS_PER_SECOND,
  normalizeTranscriptDurationSeconds,
  answeredQuestionLimit,
  formatAnsweredQuestionsBlock,
  transcriptMaxChars,
  clipTranscriptTail,
  toInterviewManTranscript,
  buildTranscriptUserTurn,
  buildAutoAnswerUserPrompt,
  createTranscriptDetectScheduler,
}
