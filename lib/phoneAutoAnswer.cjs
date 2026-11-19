// Copyright (c) 2026 VeilAssist. All rights reserved.
// Phone-parity helpers for desktop auto-answer when both
// assistAutoTrigger + overlayAnswerAutoScroll are on.
// Mirrors landing/src/mobile/transcriptFollowUp.ts + transcriptSegments.ts.

const { isUtteranceReadyForAutoAnswer } = require('./utteranceReady.cjs')

function normalizeQuestion(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function questionsAreSimilar(a, b) {
  const na = normalizeQuestion(a)
  const nb = normalizeQuestion(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length > nb.length ? na : nb
  if (longer.includes(shorter) && shorter.length / longer.length >= 0.88) return true
  const aWords = new Set(na.split(' ').filter((w) => w.length > 2))
  const bWords = nb.split(' ').filter((w) => w.length > 2)
  if (!aWords.size || !bWords.length) return false
  let overlap = 0
  for (const w of bWords) {
    if (aWords.has(w)) overlap += 1
  }
  return overlap / Math.max(aWords.size, bWords.length) >= 0.9
}

/** Last unconsumed, non-readback utterance — phone selectActiveQuestion. */
function selectActiveQuestion(segments) {
  const pending = (Array.isArray(segments) ? segments : []).filter(
    (s) => s && !s.consumed && !s.readback && !s.interim && String(s.text || '').trim(),
  )
  if (!pending.length) return ''

  // Prefer interviewer/other when available (dual-channel interview).
  let preferred = null
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    if (pending[i].speaker === 'other' || pending[i].channel === 'sys') {
      preferred = pending[i]
      break
    }
  }
  const anchor = preferred || pending[pending.length - 1]
  const channel = anchor.channel
  const speaker = anchor.speaker
  const anchorAt = Number(anchor.updatedAt || anchor.capturedAt || 0)

  // Join recent same-speaker fragments (Deepgram often splits one scenario into many finals).
  const JOIN_WINDOW_MS = 20000
  const chrono = []
  for (const s of pending) {
    if (channel && s.channel && s.channel !== channel) continue
    if (speaker && s.speaker && s.speaker !== speaker) continue
    const t = Number(s.updatedAt || s.capturedAt || 0)
    if (anchorAt && t && Math.abs(anchorAt - t) > JOIN_WINDOW_MS) continue
    chrono.push(String(s.text || '').trim())
  }
  const unique = []
  for (const p of chrono) {
    if (!p) continue
    if (unique.some((u) => u.includes(p) && u.length > p.length)) continue
    for (let i = unique.length - 1; i >= 0; i -= 1) {
      if (p.includes(unique[i]) && p.length > unique[i].length) unique.splice(i, 1)
    }
    unique.push(p)
  }
  return unique.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Channel ('sys' = the other participant, 'mic' = the user's microphone) of the newest pending
 * utterance, or '' when unknown. The user reading an answer aloud is always on the mic channel, so
 * speech that arrives on the system channel can never be readback.
 */
function latestPendingChannel(segments) {
  const pending = (Array.isArray(segments) ? segments : []).filter(
    (s) => s && !s.consumed && !s.readback && !s.interim && String(s.text || '').trim(),
  )
  const last = pending[pending.length - 1]
  return last && (last.channel === 'sys' || last.channel === 'mic') ? last.channel : ''
}

/**
 * Should speech heard now wait out the "user is still reading the last answer aloud" hold?
 * The hold exists to ignore the user's own readback, which is always on the mic channel — so with
 * the AI gate, speech from the other participant (system channel) never waits: a follow-up is
 * judged as soon as it is heard.
 */
function readbackHoldApplies({ stillReading, bypassHold, aiGateOn, latestChannel }) {
  if (!stillReading || bypassHold) return false
  return !(aiGateOn && latestChannel === 'sys')
}

function extractFollowUpAfterAnswer(answered, current) {
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

const CONTINUATION_HINT =
  /^(also|and also|and then|specifically|more specifically|in particular|i mean|to clarify|actually|wait|sorry|what i meant|the question is|like|and|matlab|yaani|yani)\b/i

function combineQuestion(original, extra) {
  const o = String(original || '').trim()
  const e = String(extra || '').trim()
  if (!e) return o
  if (!o) return e
  if (questionsAreSimilar(o, e)) return e.length >= o.length ? e : o
  const oHead = o.slice(0, Math.min(48, o.length)).toLowerCase()
  if (e.toLowerCase().includes(oHead)) return e
  return `${o} ${e}`.trim()
}

// Short reactions after an answer ("okay, great, thanks for that", "interesting"). They carry no
// question, so they must never be glued back onto the answered question and re-fired.
const ACKNOWLEDGEMENT_WORD =
  '(?:ok(?:ay)?|alright|all right|great|good|nice|cool|perfect|awesome|excellent|fine|sure|right|yeah|yes|yep|yup|got it|i see|i get it|makes sense|that makes sense|understood|interesting|fair enough|fair|noted|' +
  'that(?:\'s| is) (?:great|good|fair|interesting|helpful|clear|perfect)|' +
  'thanks?(?: you)?(?: so much| very much| a lot)?(?: for (?:that|sharing|explaining|the (?:answer|explanation|details?)))?|' +
  'appreciate (?:it|that)|hmm+|mm+(?:-?hm+)?|uh-?huh|alrighty|wow)'
const ACKNOWLEDGEMENT_RE = new RegExp(`^(?:${ACKNOWLEDGEMENT_WORD}[\\s,.!;:-]*)+$`, 'i')

function isAcknowledgement(text) {
  const t = String(text || '').trim()
  if (!t || t.includes('?')) return false
  if (t.split(/\s+/).length > 10) return false
  return ACKNOWLEDGEMENT_RE.test(t)
}

function classifyPostAnswerSpeech(leftover, answeredQuestion) {
  const extra = String(leftover || '').trim()
  const answered = String(answeredQuestion || '').trim()
  if (!extra) return 'ignore'
  if (answered && questionsAreSimilar(extra, answered)) return 'ignore'
  if (isAcknowledgement(extra)) return 'ignore'
  if (CONTINUATION_HINT.test(extra)) return 'continuation'
  if (isUtteranceReadyForAutoAnswer(extra)) return 'new_question'
  return 'continuation'
}

/** Reading an on-screen interview answer (~130 wpm). Clamp 6s–45s. */
function estimatedAnswerHoldMs(answerText) {
  const words = String(answerText || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  const ms = Math.round((words / 130) * 60 * 1000)
  return Math.min(45_000, Math.max(6_000, ms))
}

/**
 * Phone-style "still using last answer" hold.
 * @param {{ sinceAnswerMs: number, quietMs: number, speakHoldMs: number }} opts
 */
function isStillUsingLastAnswer({ sinceAnswerMs, quietMs, speakHoldMs }) {
  if (sinceAnswerMs < 4000) return true
  if (quietMs >= 1600) return false
  if (sinceAnswerMs >= speakHoldMs) return false
  return true
}

module.exports = {
  normalizeQuestion,
  questionsAreSimilar,
  selectActiveQuestion,
  latestPendingChannel,
  readbackHoldApplies,
  extractFollowUpAfterAnswer,
  combineQuestion,
  isAcknowledgement,
  classifyPostAnswerSpeech,
  estimatedAnswerHoldMs,
  isStillUsingLastAnswer,
}
