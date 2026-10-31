// Copyright (c) 2026 VeilAssist. All rights reserved.
// Parity with landing/src/mobile/transcriptSegments.ts — ignore mic text overlapping a generated answer.

function normalizeForCompare(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenOverlapRatio(candidate, reference) {
  const candTokens = normalizeForCompare(candidate)
    .split(' ')
    .filter((t) => t.length > 2)
  const refTokens = new Set(
    normalizeForCompare(reference)
      .split(' ')
      .filter((t) => t.length > 2),
  )
  if (!candTokens.length || !refTokens.size) return 0
  const matched = candTokens.filter((t) => refTokens.has(t)).length
  return matched / candTokens.length
}

const READBACK_OVERLAP = 0.6
const SHORT_QUESTION_MAX_WORDS = 18

/** A short interrogative is a new question, not the user reading the answer aloud. */
function looksLikeShortSpokenQuestion(text) {
  const t = String(text || '').trim()
  if (!t) return false
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > SHORT_QUESTION_MAX_WORDS) return false
  if (/\?/.test(t)) return true
  return /^(?:(?:so|and|but|well|also|then|ok(?:ay)?|now)[\s,]*)*(?:what|how|why|who|when|where|can|could|would|will|do|does|did|is|are|tell|explain|describe)\b/i.test(t)
}

/** A spoken question of any normal length, not only the short ones. */
function looksLikeSpokenQuestion(text) {
  const t = String(text || '').trim()
  if (!t) return false
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 80) return false
  if (/\?/.test(t)) return true
  return /^(?:(?:so|and|but|well|also|then|ok(?:ay)?|now)[\s,]*)*(?:what|how|why|who|when|where|can|could|would|will|do|does|did|is|are|tell|explain|describe)\b/i.test(t)
}

/**
 * The question sentences inside a mic chunk, or '' when the chunk is the panel answer being read.
 * A question that shares topic words with the answer is kept. A near-copy of the answer is not.
 */
function spokenQuestionRemainder(chunk, answer) {
  const cand = String(chunk || '').trim()
  const last = String(answer || '').trim()
  if (!cand) return ''
  if (!last) return looksLikeSpokenQuestion(cand) ? cand : ''
  const sentences = splitUtteranceSentences(cand)
  const parts = sentences.length ? sentences : [cand]
  return parts
    .filter((s) => looksLikeSpokenQuestion(s) && tokenOverlapRatio(s, last) <= 0.92)
    .join(' ')
    .trim()
}

function isLikelySelfReadback(candidateText, lastAnswer) {
  const last = String(lastAnswer || '').trim()
  const cand = String(candidateText || '').trim()
  if (!last || cand.length < 15) return false
  // "what is machine learning?" shares content words with a deep-learning answer.
  if (looksLikeShortSpokenQuestion(cand)) return false
  return tokenOverlapRatio(cand, last) > READBACK_OVERLAP
}

function splitUtteranceSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function stripSelfReadback(candidateText, lastAnswer) {
  const cand = String(candidateText || '').trim()
  const last = String(lastAnswer || '').trim()
  if (!last || cand.length < 15) return cand
  if (looksLikeShortSpokenQuestion(cand)) return cand
  if (tokenOverlapRatio(cand, last) <= READBACK_OVERLAP) return cand
  const sentences = splitUtteranceSentences(cand)
  if (sentences.length <= 1) return ''
  return sentences
    .filter((s) => looksLikeShortSpokenQuestion(s) || tokenOverlapRatio(s, last) <= READBACK_OVERLAP)
    .join(' ')
    .trim()
}

module.exports = {
  tokenOverlapRatio,
  looksLikeShortSpokenQuestion,
  looksLikeSpokenQuestion,
  spokenQuestionRemainder,
  isLikelySelfReadback,
  stripSelfReadback,
  READBACK_OVERLAP,
}
