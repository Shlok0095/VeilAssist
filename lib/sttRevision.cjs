// Copyright (c) 2026 VeilAssist. All rights reserved.
// Streaming STT often re-sends the whole utterance as a new "final" with small word fixes
// ("I built deep learning" → "I built a deep learning model to"). Those are revisions of one
// line, not new speech — appending each one floods the transcript the detector reads.

const MIN_WORDS = 3
const MIN_OVERLAP = 0.8
const PREFIX_SLACK_WORDS = 4
const MIN_KEEP_RATIO = 0.6

function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function lcsLength(a, b) {
  let prev = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i += 1) {
    const cur = new Array(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * Is `next` a re-send of `prev` (same utterance, possibly extended or with a few words fixed)?
 * Compares `prev` with the start of `next`, so a genuinely new sentence is never swallowed.
 */
function isSttRevision(prev, next) {
  const a = words(prev)
  const b = words(next)
  if (!a.length || !b.length) return false
  const aj = a.join(' ')
  const bj = b.join(' ')
  if (aj === bj) return true
  let shared = 0
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared += 1
  // A re-send can fix words but never drops most of the line: "so" after a long answer is new speech.
  // A rewrite of the same opening may get briefly shorter ("exe boost can you" → "explain").
  const keepRatio = shared >= 3 ? 0.5 : MIN_KEEP_RATIO
  if (b.length < a.length * keepRatio) return false
  if (bj.startsWith(aj) || aj.startsWith(bj)) return true
  // Same opening while the recognizer rewrites the rest ("hey what is exchange" → "hey what is x g").
  if (shared >= 3) return true
  // An unfinished short hypothesis ("Hey, what do you") replaced before it becomes a question.
  if (shared >= 2 && a.length < 8 && !/\?\s*$/.test(String(prev).trim())) return true
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (shorter.length < MIN_WORDS) return false
  const window = longer.slice(0, shorter.length + PREFIX_SLACK_WORDS)
  if (lcsLength(shorter, window) / shorter.length >= MIN_OVERLAP) return true
  // A full resend of the same long utterance ("…exeboost…random forest" sent again with
  // a few words fixed). Short questions stay distinct: both sides must be long.
  if (shorter.length >= 12 && longer.length <= 160) {
    return lcsLength(shorter, longer) / shorter.length >= 0.75
  }
  return false
}

/** A one-word non-question ("s .", "ing ?") that should not become its own transcript line. */
function isIgnorableScrap(text) {
  const w = words(text)
  if (w.length !== 1) return false
  return !/^(what|why|how|who|where|when|which|can|could|do|does|did|is|are|tell)$/i.test(w[0])
}

/** A re-send arrives while the speaker is still on the same utterance. */
const REVISION_WINDOW_MS = 12000

/**
 * Commit an STT final into the live segment list: fills the channel's open interim, replaces a
 * recent re-send of the same utterance, or appends a new line.
 * @returns {object[]} new list (input is not mutated)
 */
function lineBody(line) {
  return String(line || '').replace(/^(?:Speaker \d+|Me|Participant|Interviewer|You|\[[A-Za-z]+\])\s*:\s*/i, '').trim()
}

/**
 * True when speech that arrived during a detector call is a new utterance, not a rewrite of the
 * one the model just judged. A word-fix of the last line is the same utterance.
 */
function isStaleDetectionTranscript(beforeLines, afterLines) {
  const before = collapseRepeatedTurns(beforeLines)
  const after = collapseRepeatedTurns(afterLines)
  if (after.length > before.length) return true
  if (after.join('\n') === before.join('\n')) return false
  if (
    after.length === before.length &&
    after.length > 0 &&
    isSttRevision(lineBody(before[before.length - 1]), lineBody(after[after.length - 1]))
  ) {
    return false
  }
  return true
}

function commitFinalSegment(segs, { speaker, channel, text, capturedAt, now, flags = {}, nextId }) {
  const t = String(text || '').trim()
  const list = Array.isArray(segs) ? segs : []
  if (!t) return list
  // A one-word scrap ("s .") is not a line. It must not become the text the detector treats as newest.
  if (isIgnorableScrap(t)) return list
  const interimIndex = list.findLastIndex((s) => s.channel === channel && s.interim)
  if (interimIndex >= 0) {
    return list.map((s, i) => (i === interimIndex ? { ...s, text: t, updatedAt: now, interim: false, ...flags } : s))
  }
  const lastIndex = list.findLastIndex((s) => s.channel === channel && !s.interim)
  const last = lastIndex >= 0 ? list[lastIndex] : null
  if (
    last &&
    !last.consumed &&
    !flags.consumed &&
    now - Number(last.updatedAt || 0) <= REVISION_WINDOW_MS &&
    isSttRevision(last.text, t)
  ) {
    return list.map((s, i) => (i === lastIndex ? { ...s, text: t, updatedAt: now, ...flags } : s))
  }
  return [
    ...list,
    { id: nextId(), speaker, channel, text: t, capturedAt: Number(capturedAt) || now, updatedAt: now, interim: false, ...flags },
  ]
}

/** Drop a line that is only a resend of the previous one, so the detector sees each utterance once. */
function collapseRepeatedTurns(lines) {
  const out = []
  for (const line of Array.isArray(lines) ? lines : []) {
    const text = String(line || '').trim()
    if (!text) continue
    if (isIgnorableScrap(lineBody(text))) continue
    const prev = out.length ? out[out.length - 1] : ''
    if (prev && isSttRevision(lineBody(prev), lineBody(text))) out[out.length - 1] = text
    else out.push(text)
  }
  return out
}

module.exports = {
  isSttRevision,
  isIgnorableScrap,
  isStaleDetectionTranscript,
  collapseRepeatedTurns,
  commitFinalSegment,
  REVISION_WINDOW_MS,
}
