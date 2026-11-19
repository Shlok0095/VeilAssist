import { isUtteranceReadyForAutoAnswer } from './sttGarbage'
import { normalizeQuestion, pendingTranscriptText, questionsAreSimilar, type SpeechSegment } from './transcriptSegments'

/** Extract speech added after the answered snapshot (InterviewMan-style follow-up tail). */
export function extractFollowUpAfterAnswer(answered: string, current: string): string {
  const answeredText = String(answered || '').trim()
  const currentText = String(current || '').trim()
  if (!currentText) return ''
  if (!answeredText) return currentText
  if (currentText === answeredText) return ''

  if (currentText.startsWith(answeredText)) {
    return currentText.slice(answeredText.length).replace(/^[\s,.\-?!:;]+/, '').trim()
  }

  const answeredLower = answeredText.toLowerCase()
  const currentLower = currentText.toLowerCase()
  if (currentLower.startsWith(answeredLower)) {
    return currentText.slice(answeredText.length).replace(/^[\s,.\-?!:;]+/, '').trim()
  }

  const idx = currentLower.indexOf(answeredLower)
  if (idx >= 0) {
    const tail = currentText.slice(idx + answeredText.length).replace(/^[\s,.\-?!:;]+/, '').trim()
    if (tail) return tail
  }

  return ''
}

export function consumeAnsweredTranscript(answered: string, current: string): string {
  return extractFollowUpAfterAnswer(answered, current)
}

/** Pick the new question spoken after (or during) the last answered one. */
export function resolveFollowUpQuestion(
  answeredQuestion: string,
  segments: SpeechSegment[],
): string {
  const answered = String(answeredQuestion || '').trim()
  const pending = pendingTranscriptText(segments)
  if (!pending) return ''

  const trimmed = extractFollowUpAfterAnswer(answered, pending)
  const candidate = (trimmed || pending).trim()
  if (!candidate) return ''
  if (answered && normalizeQuestion(candidate) === normalizeQuestion(answered)) return ''
  return candidate
}

const CONTINUATION_HINT =
  /^(also|and also|and then|specifically|more specifically|in particular|i mean|to clarify|actually|wait|sorry|what i meant|the question is|like|and|matlab|yaani|yani)\b/i

export type PostAnswerSpeechKind = 'ignore' | 'continuation' | 'new_question'

export function combineQuestion(original: string, extra: string): string {
  const o = String(original || '').trim()
  const e = String(extra || '').trim()
  if (!e) return o
  if (!o) return e
  if (questionsAreSimilar(o, e)) return e.length >= o.length ? e : o
  const oHead = o.slice(0, Math.min(48, o.length)).toLowerCase()
  if (e.toLowerCase().includes(oHead)) return e
  return `${o} ${e}`.trim()
}

/** Same-question restatement vs a distinct follow-up that needs its own bubble. */
export function classifyPostAnswerSpeech(leftover: string, answeredQuestion: string): PostAnswerSpeechKind {
  const extra = String(leftover || '').trim()
  const answered = String(answeredQuestion || '').trim()
  if (!extra) return 'ignore'
  if (answered && questionsAreSimilar(extra, answered)) return 'ignore'
  if (CONTINUATION_HINT.test(extra)) return 'continuation'
  if (isUtteranceReadyForAutoAnswer(extra)) return 'new_question'
  return 'continuation'
}

/** Reading an on-screen interview answer is slower than conversation (~130 wpm). */
export function estimatedAnswerHoldMs(answerText: string): number {
  const words = String(answerText || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  const ms = Math.round((words / 130) * 60 * 1000)
  return Math.min(45_000, Math.max(6_000, ms))
}
