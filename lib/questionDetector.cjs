// Copyright (c) 2026 VeilAssist. All rights reserved.
// Model-assisted question detection for hands-free auto-answer.
//
// Auto-answer used to decide *whether* to answer with regexes and a fixed silence timer, and it
// only remembered the single last question it had answered. This module asks a small model for a
// structured verdict instead:
//
//   { question, question_final, requires_personal_info }
//
// judged against every question already answered this session. It never *requires* the model: when
// the call fails, times out, or returns something unparseable it falls back to the deterministic
// gates (utteranceReady / transcriptQuestionSelector), so auto-answer keeps working offline.
//
// Pure CommonJS with the model call injected, so the main process, the renderer bundle and the
// unit tests can all share it.

const { normalizeQuestion } = require('./phoneAutoAnswer.cjs')
const { isUtteranceReadyForAutoAnswer } = require('./utteranceReady.cjs')
const { isMeaningfulTurn } = require('./transcriptQuestionSelector.cjs')
const {
  clipTranscriptTail,
  buildTranscriptUserTurn,
  normalizeTranscriptDurationSeconds,
  answeredQuestionLimit,
} = require('./autoAnswerTranscript.cjs')

const DETECTION_ENGINES = ['ai', 'rules']
const SENSITIVITIES = ['low', 'medium', 'high']

/**
 * How near-identical a new question must be to an answered one to be dropped as a repeat.
 * `strict` drops the most (0.85), `lenient` the fewest (0.95). The model still handles
 * same-meaning rewordings; this is the string-level backstop for STT re-emitting the same words.
 */
const REPEAT_SENSITIVITIES = ['strict', 'balanced', 'lenient']
const REPEAT_THRESHOLDS = { strict: 0.85, balanced: 0.9, lenient: 0.95 }
/** A queued transcript this similar to the one just checked is not worth a second model call. */
const QUEUED_IDENTICAL_THRESHOLD = 0.95
/** Similarity is computed on the tail only, so a long rolling buffer stays cheap to compare. */
const SIMILARITY_MAX_CHARS = 600

/** Answered questions remembered per session (older ones age out). */
const MAX_ANSWERED_QUESTIONS = 24
const MAX_QUESTION_CHARS = 300
/** Tail of the rolling transcript sent to the model. */
const MAX_TRANSCRIPT_CHARS = 4000
/** Room for the HIGH prompt's checklist and the JSON verdict. 400 cut the JSON off on reasoning models. */
const DETECT_MAX_TOKENS = 800
const DEFAULT_DETECT_TIMEOUT_MS = 4500

/**
 * After a failed AI check the overlay lets the rule gates work for a while. A single slow reply must
 * not switch the AI gate off for long (a real model timed out on ~1 check in 10), so the wait starts
 * short and doubles with each failure in a row, up to a cap; a successful model verdict resets it.
 */
const DETECT_BACKOFF_BASE_MS = 4000
const DETECT_BACKOFF_MAX_MS = 30000

/** @param {number} consecutiveFailures 1 for the first failure. */
function detectBackoffMs(consecutiveFailures) {
  const n = Math.max(1, Math.floor(Number(consecutiveFailures) || 1))
  return Math.min(DETECT_BACKOFF_MAX_MS, DETECT_BACKOFF_BASE_MS * 2 ** (n - 1))
}

/** Quiet gap before the AI gate may run — the model, not a long timer, judges completeness. */
const DETECTION_MIN_SILENCE_MS = 900
/** Past this much silence the same text is re-judged once with a stronger "speaker is done" hint. */
const DETECTION_LATE_SILENCE_MS = 3500

function normalizeDetectionEngine(value) {
  return String(value || '').trim().toLowerCase() === 'rules' ? 'rules' : 'ai'
}

function normalizeSensitivity(value) {
  const v = String(value || '').trim().toLowerCase()
  return SENSITIVITIES.includes(v) ? v : 'high'
}

/** 'early' | 'late' — part of the renderer's "already judged this text" cache key. */
function detectionSilenceBucket(silenceMs) {
  return Number(silenceMs) >= DETECTION_LATE_SILENCE_MS ? 'late' : 'early'
}

function cleanLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

/** Lowercase, single-spaced, trimmed — the shape the ledger and the model both use. */
function normalizeDetectedQuestion(text) {
  return cleanLine(text).toLowerCase().slice(0, MAX_QUESTION_CHARS)
}

/** Comparison form: normalized and with question marks removed. */
function comparable(text) {
  return normalizeQuestion(text).replace(/\?/g, '').replace(/\s+/g, ' ').trim()
}

function normalizeRepeatSensitivity(value) {
  const v = String(value || '').trim().toLowerCase()
  return REPEAT_SENSITIVITIES.includes(v) ? v : 'balanced'
}

function repeatThreshold(value) {
  return REPEAT_THRESHOLDS[normalizeRepeatSensitivity(value)]
}

/** Lowercase, punctuation stripped, single-spaced — so "What's max pooling?" ≈ "whats max pooling". */
function normalizeForSimilarity(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-SIMILARITY_MAX_CHARS)
}

function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = new Array(b.length + 1)
  let cur = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j += 1) prev[j] = j
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}

/** 0..1 string similarity (1 = identical after normalization): 1 − edit distance / longer length. */
function similarityRatio(a, b) {
  const na = normalizeForSimilarity(a)
  const nb = normalizeForSimilarity(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length)
}

/**
 * True when `candidate` is only the head or tail of `answered` ("when should we use it" after
 * "what is max pooling and when should we use it") — STT often re-emits half of a finished question.
 */
function isFragmentOf(candidate, answered) {
  const c = comparable(candidate)
  const a = comparable(answered)
  if (!c || !a || c === a) return false
  const cWords = c.split(' ').filter(Boolean)
  const aWords = a.split(' ').filter(Boolean)
  if (cWords.length < 3 || cWords.length >= aWords.length) return false
  return a.endsWith(` ${c}`) || a.startsWith(`${c} `)
}

/**
 * Deterministic duplicate check against the answered list: near-identical text (above the repeat
 * threshold) or a head/tail fragment of an answered question. A follow-up that expands the question
 * is NOT a duplicate — the model makes the semantic call; this is the backstop for STT re-emitting
 * the same words or a repeat the model let through.
 *
 * @param {string} question
 * @param {string[]} answeredQuestions
 * @param {{ threshold?: number }} [opts]  similarity above which text counts as a repeat
 */
function isDuplicateOfAnswered(question, answeredQuestions, { threshold = REPEAT_THRESHOLDS.balanced } = {}) {
  const q = cleanLine(question)
  if (!q) return false
  const list = Array.isArray(answeredQuestions) ? answeredQuestions : []
  return list.some((a) => {
    const prev = cleanLine(a)
    return prev && (similarityRatio(q, prev) > threshold || isFragmentOf(q, prev))
  })
}

/** InterviewMan's repeat check: the exact question, or text more similar than `threshold`. */
function isRepeatOfAnswered(question, answeredQuestions, threshold) {
  const q = normalizeDetectedQuestion(question)
  if (!q) return false
  return (Array.isArray(answeredQuestions) ? answeredQuestions : []).some(
    (a) => normalizeDetectedQuestion(a) === q || similarityRatio(q, a) > threshold,
  )
}

function sanitizeAnswered(list) {
  const out = []
  for (const item of Array.isArray(list) ? list : []) {
    const q = normalizeDetectedQuestion(item)
    if (q && !out.includes(q)) out.push(q)
  }
  return out.slice(-MAX_ANSWERED_QUESTIONS)
}

/**
 * Session ledger of questions already answered. Re-answering a reworded repeat is the failure the
 * old "last question only" check could not catch.
 */
function createAnsweredQuestionLedger({ max = MAX_ANSWERED_QUESTIONS } = {}) {
  const items = []
  return {
    add(question) {
      const q = normalizeDetectedQuestion(question)
      if (!q) return false
      // A reworded repeat replaces the older wording instead of piling up.
      const similar = items.findIndex((i) => similarityRatio(i, q) > REPEAT_THRESHOLDS.balanced || isFragmentOf(q, i))
      if (similar >= 0) items.splice(similar, 1)
      items.push(q)
      while (items.length > max) items.shift()
      return true
    },
    removeLast(question) {
      const q = normalizeDetectedQuestion(question)
      for (let i = items.length - 1; i >= 0; i -= 1) {
        if (items[i] === q || similarityRatio(items[i], q) > REPEAT_THRESHOLDS.balanced) {
          items.splice(i, 1)
          return true
        }
      }
      return false
    },
    has(question, opts) {
      return isDuplicateOfAnswered(question, items, opts)
    },
    list() {
      return [...items]
    },
    clear() {
      items.length = 0
    },
    get size() {
      return items.length
    },
  }
}

/** Default window at 30s. Longer Conversation Memory sends more; the repeat check still uses the full list. */
const MODEL_ANSWERED_QUESTIONS = 3

// InterviewMan's detector prompts, one per sensitivity (LOW / MEDIUM / HIGH).
const DETECTION_PROMPTS = {
  low: `You will receive a transcription of an interview.
The interview topic is: {{INTERVIEW_TOPIC}}

You will also receive the questions that were already answered in this interview, to avoid duplicates:
<answered_questions>
{{ANSWERED_QUESTIONS}}
</answered_questions>

Your task:
1. Identify the last explicit question asked in the transcription, if any.
2. Determine if this question is complete (final) or still in progress.
3. Determine if the question requires personal information about the interviewee.

Consider a question final if it is a complete, explicit question that ends with a question mark.
If it seems incomplete, interrupted, or doesn't end with a question mark, it is not final.

A proper question must end with a question mark and have a clear interrogative structure seeking a response. Exclude rhetorical questions, statements, or implicit questions.

Normalize questions to lowercase and trim whitespace.

If no explicit question is present, the "question" field should be an empty string.

Compare the last question found in the transcription to the answered questions.
If it means the same as any of them (including a partial repeat or reworded version of one), don't return it: set "question" to "".
If it expands on an answered question or asks for more or different information, it is a new question - return it.

You should respond in JSON in the following format:
{
  "question": string,
  "question_final": boolean,
  "requires_personal_info": boolean
}

Examples:

<example1>
Transcription:
Speaker 0: Good morning

Output:
{
  "question": "",
  "question_final": false,
  "requires_personal_info": false
}
</example1>

<example2>
Transcription:
Speaker 0: Please introduce yourself.

Output:
{
  "question": "",
  "question_final": false,
  "requires_personal_info": false
}
</example2>

<example3>
Transcription:
Speaker 0: Can you explain the biggest challenge you faced in your previous job?

Output:
{
  "question": "can you explain the biggest challenge you faced in your previous job?",
  "question_final": true,
  "requires_personal_info": true
}
</example3>
`,
  medium: `You will receive a transcription of an interview.
The interview topic is: {{INTERVIEW_TOPIC}}

You will also receive the questions that were already answered in this interview, to avoid duplicates:
<answered_questions>
{{ANSWERED_QUESTIONS}}
</answered_questions>

Your task:
1. Identify the last question asked in the transcription, if any.
2. Determine if this question is complete (final) or still in progress.
3. Determine if the question requires personal information about the interviewee.

Consider a question final if it logically makes sense as a complete question that could be asked by the interviewer in {{INTERVIEW_TOPIC}} interview.
If it seems incomplete or interrupted, it is not final.

A proper question should end with a question mark or have a clear interrogative structure seeking a response. Exclude rhetorical questions or statements.

Normalize questions to lowercase and trim whitespace.

If no question is present, the "question" field should be an empty string.

Compare the last question found in the transcription to the answered questions.
If it means the same as any of them, don't return it: set "question" to "".
It doesn't need to be an exact text match to be a duplicate - partial repeats and reworded versions of an answered question are duplicates too.
If it expands on an answered question or asks for more or different information, it is a new question - return it.

You should respond in JSON in the following format:
{
  "question": string,
  "question_final": boolean,
  "requires_personal_info": boolean
}

Examples:

<example1>
Transcription:
Speaker 0: Good morning

Output:
{
  "question": "",
  "question_final": false,
  "requires_personal_info": false
}
</example1>

<example2>
Transcription:
Speaker 0: Please introduce yourself

Output:
{
  "question": "please introduce yourself",
  "question_final": true,
  "requires_personal_info": true
}
</example2>

<example3>
Transcription:
Speaker 0: Can you explain the biggest challenge you faced in your previous job and how you
Speaker 1: Sure, the biggest challenge was

Output:
{
  "question": "can you explain the biggest challenge you faced in your previous job and how you",
  "question_final": false,
  "requires_personal_info": false
}
</example3>
`,
  high: `Developer: You will be provided with a transcription of an interview on the topic: {{INTERVIEW_TOPIC}}.

You will also receive the questions that were already answered in the interview so far, to help prevent duplicate answers:
<answered_questions>
{{ANSWERED_QUESTIONS}}
</answered_questions>

Begin with a concise checklist (3-7 bullets) of what you will do; keep items conceptual, not implementation-level.

Your tasks are:
1. Identify the most recent question (explicit or implicit) in the transcription.
2. Assess whether this question is final (i.e., fully formed and seeking specific information about {{INTERVIEW_TOPIC}}) or still in progress (e.g., trailing off or interrupted mid-sentence).
3. Determine whether answering the question would require personal information about the interviewee.

Definitions and guidelines:
- A final question requests specific information about {{INTERVIEW_TOPIC}}, regardless of grammar or formality. Technical questions, best practices, and conceptual inquiries all qualify.
- Consider a question not final only if it is obviously incomplete mid-sentence.
- Questions may be explicit (clearly structured or ending with a question mark) or implicit (statements that prompt a response). Include rhetorical questions if they solicit a reply in the interview context.
- Normalize questions by converting to lowercase and trimming whitespace.
- If there is no question (explicit or implicit) in the transcription, set the "question" value to "" (empty string).
- Compare the question you find to the answered questions. If it has the same meaning or intent as any of them (i.e., it would reasonably lead to the same response), do not return it: set "question" to "". Partial repeats, rewordings, and fragments of an answered question (for example only its tail half, like "when should we use it") count as duplicates.
- Exception: if the question expands on an answered question or asks for additional or different information (a follow-up), it is NOT a duplicate - return it.
- If the input is malformed (e.g., missing required fields or unreadable transcription), output must still be valid JSON, with "question" as an empty string and both boolean fields set to false.

After processing, validate that your output is well-formed JSON and matches the required schema.

Output Format:
Respond with a single JSON object in this format:
{
  "question": string,                // Normalized last question, or "" if none detected
  "question_final": boolean,         // True if the question is completed/final, false if in-progress
  "requires_personal_info": boolean  // True if answering requires personal details from the interviewee
}

Example:
{
  "question": "what are best practices for microservice architecture",
  "question_final": true,
  "requires_personal_info": false
}
`,
}

/**
 * @param {{ transcript: string, topic?: string, answeredQuestions?: string[], sensitivity?: string }} input
 * @returns {{ role: 'system' | 'user', content: string }[]}
 */
function buildDetectionMessages({ transcript, topic, answeredQuestions, sensitivity, transcriptDurationSeconds } = {}) {
  const duration = normalizeTranscriptDurationSeconds(transcriptDurationSeconds)
  const answered = sanitizeAnswered(answeredQuestions).slice(-answeredQuestionLimit(duration))
  const answeredBlock = answered.length ? answered.map((q) => `- ${q}`).join('\n') : '(no questions answered yet)'
  const system = DETECTION_PROMPTS[normalizeSensitivity(sensitivity)]
    .split('{{INTERVIEW_TOPIC}}').join(cleanLine(topic) || 'Not specified')
    .split('{{ANSWERED_QUESTIONS}}').join(answeredBlock)
  return [
    { role: 'system', content: system },
    { role: 'user', content: buildTranscriptUserTurn(transcript, duration) },
  ]
}

/** First balanced {...} in `text` (models wrap JSON in prose or code fences). */
function extractJsonObject(text) {
  const s = String(text || '')
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function asBool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return /^(true|yes|1)$/i.test(value.trim())
  return false
}

/** Boolean when the model gave one, null when the field is missing ("unknown" — callers fall back to rules). */
function asOptionalBool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string' && /^(true|false|yes|no)$/i.test(value.trim())) return /^(true|yes)$/i.test(value.trim())
  return null
}

/**
 * @returns {{ ok: boolean, question: string, questionFinal: boolean, requiresPersonalInfo: boolean,
 *             isFollowUp: boolean | null }}
 */
function parseDetectionResponse(raw) {
  const empty = { ok: false, question: '', questionFinal: false, requiresPersonalInfo: false, isFollowUp: null }
  const json = extractJsonObject(String(raw || '').replace(/```(?:json)?/gi, ''))
  if (!json) return empty
  let parsed
  try {
    parsed = JSON.parse(json)
  } catch {
    // The HIGH prompt's schema carries `// …` comments, which models sometimes copy.
    try {
      parsed = JSON.parse(json.replace(/,?\s*\/\/[^\n]*/g, (m) => (m.trimStart().startsWith(',') ? ',' : '')))
    } catch {
      return empty
    }
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.question !== 'string') return empty
  const question = normalizeDetectedQuestion(parsed.question)
  return {
    ok: true,
    question,
    // An empty question can never be "final".
    questionFinal: question ? asBool(parsed.question_final ?? parsed.questionFinal) : false,
    requiresPersonalInfo: asBool(parsed.requires_personal_info ?? parsed.requiresPersonalInfo),
    isFollowUp: question ? asOptionalBool(parsed.is_follow_up ?? parsed.isFollowUp) : null,
  }
}

/** Parses "Participant: …" / "Me: …" (or [INTERVIEWER]/[ME]) lines into turns. */
function parseTranscriptTurns(transcript) {
  const turns = []
  for (const line of String(transcript || '').split('\n')) {
    const text = cleanLine(line)
    if (!text) continue
    const m = text.match(/^(?:\[(INTERVIEWER|ME)\]|(Participant|Interviewer|Other|Me|You)):\s*(.*)$/i)
    if (m) {
      const label = String(m[1] || m[2]).toLowerCase()
      const speaker = label === 'me' || label === 'you' ? 'me' : 'other'
      if (m[3]) turns.push({ speaker, text: cleanLine(m[3]) })
    } else {
      turns.push({ speaker: 'other', text })
    }
  }
  return turns
}

/**
 * Deterministic fallback with the same verdict shape. `requiresPersonalInfo` is null ("unknown") so
 * downstream routing keeps its own regex planner instead of acting on a guess.
 */
function heuristicDetect({ transcript } = {}) {
  // InterviewMan: the last question in the transcript, from any speaker. A trailing STT scrap
  // ("ing ?") after it does not hide it.
  const turns = parseTranscriptTurns(transcript).filter((t) => isMeaningfulTurn(t.text))
  const last = [...turns].reverse().find((t) => isUtteranceReadyForAutoAnswer(t.text)) || turns[turns.length - 1]
  if (!last) return { ok: true, question: '', questionFinal: false, requiresPersonalInfo: null, isFollowUp: null }
  const ready = isUtteranceReadyForAutoAnswer(last.text)
  return {
    ok: true,
    question: ready ? normalizeDetectedQuestion(last.text) : '',
    questionFinal: ready,
    requiresPersonalInfo: null,
    isFollowUp: null,
  }
}

/**
 * What the overlay does with a detector result. Kept pure so every branch is testable.
 *
 *  - 'fire'     → answer now.
 *  - 'wait'     → nothing to answer yet; keep the cached verdict so the 500ms tick does not re-ask
 *                 the model for unchanged text. The cache key also carries a silence bucket, so a
 *                 longer pause re-judges the same words once.
 *  - 'rejudge'  → verdict can't be used right now (stale / busy / cooldown); clear the cache so the
 *                 next tick asks again.
 *  - 'fallback' → detector unusable or only the rules answered; hand over to the rule-based gates,
 *                 which keep their own longer silence window (a degraded verdict must never fire early).
 *
 * @param {{ result: object | null | undefined, bufferAtRequest: string, currentBuffer: string,
 *           busy: boolean, sinceLastTriggerMs: number, cooldownMs: number }} input
 * @returns {{ action: 'fire' | 'wait' | 'rejudge' | 'fallback', reason: string }}
 */
function decideAutoAnswerAction({ result, bufferAtRequest, currentBuffer, busy, sinceLastTriggerMs, cooldownMs } = {}) {
  if (!result || result.ok !== true) return { action: 'fallback', reason: result?.reason || 'unavailable' }
  if (result.degraded) return { action: 'fallback', reason: 'degraded' }
  // The speaker kept talking while the model was thinking — judge the newer text instead.
  if (cleanLine(currentBuffer) !== cleanLine(bufferAtRequest)) return { action: 'rejudge', reason: 'stale' }
  if (!result.question) return { action: 'wait', reason: 'no_question' }
  if (result.duplicate) return { action: 'wait', reason: 'duplicate' }
  if (result.questionFinal !== true) return { action: 'wait', reason: 'in_progress' }
  if (busy) return { action: 'rejudge', reason: 'busy' }
  if (Number(sinceLastTriggerMs) < Number(cooldownMs)) return { action: 'rejudge', reason: 'cooldown' }
  return { action: 'fire', reason: 'final_question' }
}

/**
 * One question check at a time, with the newest transcript queued while a check runs.
 *
 * Transcript events arrive faster than a model call returns, so firing a check per event would pile
 * up stale requests. Instead the latest text waits in a single slot; when the running check ends it
 * is checked next — unless the running check acted on a question (the queued text is then part of
 * the next turn), or it is nearly identical to what was just checked (nothing new to learn).
 *
 * @param {{ run: (text: string) => Promise<boolean>,
 *           nearlyIdentical?: (a: string, b: string) => boolean }} opts
 *        `run` resolves true when it acted on a question (fired an answer).
 */
function createDetectionCoordinator({
  run,
  nearlyIdentical = (a, b) => similarityRatio(a, b) > QUEUED_IDENTICAL_THRESHOLD,
}) {
  let inFlight = false
  let queued = null
  return {
    get busy() {
      return inFlight
    },
    get queuedText() {
      return queued
    },
    /** @returns {Promise<'queued' | 'acted' | 'idle'>} */
    async submit(text) {
      if (inFlight) {
        queued = text
        return 'queued'
      }
      inFlight = true
      let current = text
      try {
        for (;;) {
          let acted = false
          try {
            acted = (await run(current)) === true
          } catch {
            acted = false
          }
          const next = queued
          queued = null
          if (acted) return 'acted'
          if (next == null || nearlyIdentical(next, current)) return 'idle'
          current = next
        }
      } finally {
        inFlight = false
        queued = null
      }
    },
    /** Drop any queued text (the running check, if any, still finishes). */
    reset() {
      queued = null
    },
  }
}

/**
 * Transcript text after the last place `question` was spoken, or '' when it cannot be located.
 * Matched on the question's last few words, so "x g boost … with shap?" is found even when the
 * model normalized the wording.
 */
function transcriptAfterQuestion(transcript, question) {
  const t = String(transcript || '')
  const words = String(question || '').toLowerCase().match(/[a-z0-9]+/g) || []
  if (words.length < 2) return ''
  const key = words.slice(-Math.min(4, words.length))
  const re = new RegExp(key.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-z0-9]+'), 'gi')
  let end = -1
  for (const m of t.matchAll(re)) end = m.index + m[0].length
  if (end < 0) return ''
  return t.slice(end).replace(/^[^a-z0-9\n]*/i, '').trim()
}

/**
 * Speech after the answered question that occurs latest in the transcript.
 * Used when the model blanks a duplicate instead of returning it, so a follow-up after it is not lost.
 */
function tailAfterLastAnswered(transcript, answeredQuestions) {
  const t = String(transcript || '')
  let bestAfter = ''
  let bestEnd = -1
  for (const q of Array.isArray(answeredQuestions) ? answeredQuestions : []) {
    const after = transcriptAfterQuestion(t, q)
    if (!after) continue
    const end = t.length - after.length
    if (end >= bestEnd) {
      bestEnd = end
      bestAfter = after
    }
  }
  return bestAfter
}

/** Enough new speech to hold a question: three words outside the speaker labels. */
function hasNewSpeech(text) {
  const words = String(text || '')
    .replace(/^\s*(?:\[[A-Z]+\]|[A-Za-z]+(?: \d+)?):\s*/gm, ' ')
    .match(/[a-z0-9']+/gi)
  return !!words && words.length >= 3
}

function emptyVerdict(extra = {}) {
  return {
    ok: true,
    question: '',
    questionFinal: false,
    requiresPersonalInfo: null,
    isFollowUp: null,
    duplicate: false,
    source: 'none',
    degraded: false,
    error: null,
    latencyMs: 0,
    ...extra,
  }
}

function withTimeout(promise, ms, onTimeout) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.()
      } catch {
        /* ignore */
      }
      reject(Object.assign(new Error('detection timed out'), { name: 'TimeoutError' }))
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Decide whether the transcript currently holds a final, not-yet-answered question.
 *
 * @param {{
 *   complete?: (messages: object[], opts: { maxTokens: number, signal: AbortSignal }) => Promise<string>,
 *   transcript: string,
 *   topic?: string,
 *   answeredQuestions?: string[],
 *   sensitivity?: string,
 *   silenceMs?: number,
 *   timeoutMs?: number,
 * }} input
 */
async function detectQuestion(input = {}) {
  const startedAt = Date.now()
  const duration = normalizeTranscriptDurationSeconds(input.transcriptDurationSeconds)
  const transcript = clipTranscriptTail(input.transcript, duration)
  if (!transcript) return emptyVerdict({ error: 'empty_transcript' })

  const answered = sanitizeAnswered(input.answeredQuestions)
  const sensitivity = normalizeSensitivity(input.sensitivity)
  const timeoutMs = Number(input.timeoutMs) > 0 ? Number(input.timeoutMs) : DEFAULT_DETECT_TIMEOUT_MS

  let verdict = null
  let error = null
  if (typeof input.complete === 'function') {
    const controller = new AbortController()
    try {
      const messages = buildDetectionMessages({
        transcript,
        topic: input.topic,
        answeredQuestions: answered,
        sensitivity,
        silenceMs: input.silenceMs,
        transcriptDurationSeconds: duration,
      })
      const raw = await withTimeout(
        input.complete(messages, { maxTokens: DETECT_MAX_TOKENS, signal: controller.signal }),
        timeoutMs,
        () => controller.abort(),
      )
      verdict = parseDetectionResponse(raw)
      if (!verdict.ok) error = 'unparseable_response'
    } catch (e) {
      error = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : String(e?.message || e || 'error')
    }
  } else {
    error = 'no_completion_fn'
  }

  let source = 'llm'
  if (!verdict?.ok) {
    verdict = heuristicDetect({ transcript, sensitivity })
    source = 'heuristic'
  }

  // HIGH tells the model to return nothing for a question it thinks was already answered. A follow-up
  // after that question is then invisible. Check the speech after the latest answered question once.
  if (!verdict.question && source === 'llm' && !input.afterAnsweredRetry) {
    const after = tailAfterLastAnswered(transcript, answered)
    if (after && hasNewSpeech(after)) {
      const retry = await detectQuestion({ ...input, transcript: after, afterAnsweredRetry: true })
      if (retry.source === 'llm' && retry.question && !retry.duplicate) {
        return { ...retry, latencyMs: Date.now() - startedAt }
      }
    }
  }

  // InterviewMan: drop a question already answered, or one too similar to an answered one.
  let duplicate = false
  if (verdict.question && isRepeatOfAnswered(verdict.question, answered, repeatThreshold(input.repeatSensitivity))) {
    // A weaker model re-returns the answered question when a newer one follows it; check once more
    // on only the speech after it so the newer question is not lost.
    const after = source === 'llm' && !input.afterAnsweredRetry ? transcriptAfterQuestion(transcript, verdict.question) : ''
    if (after && hasNewSpeech(after)) {
      const retry = await detectQuestion({ ...input, transcript: after, afterAnsweredRetry: true })
      if (retry.source === 'llm' && retry.question) {
        return { ...retry, latencyMs: Date.now() - startedAt }
      }
    }
    duplicate = true
    verdict = { ...verdict, question: '', questionFinal: false }
  }

  return {
    ok: true,
    question: verdict.question,
    questionFinal: verdict.questionFinal,
    requiresPersonalInfo: typeof verdict.requiresPersonalInfo === 'boolean' ? verdict.requiresPersonalInfo : null,
    isFollowUp: typeof verdict.isFollowUp === 'boolean' ? verdict.isFollowUp : null,
    duplicate,
    source,
    degraded: source === 'heuristic',
    error,
    latencyMs: Date.now() - startedAt,
  }
}

module.exports = {
  DETECTION_ENGINES,
  REPEAT_SENSITIVITIES,
  REPEAT_THRESHOLDS,
  QUEUED_IDENTICAL_THRESHOLD,
  DETECTION_MIN_SILENCE_MS,
  DETECTION_LATE_SILENCE_MS,
  DETECT_MAX_TOKENS,
  DEFAULT_DETECT_TIMEOUT_MS,
  DETECT_BACKOFF_BASE_MS,
  DETECT_BACKOFF_MAX_MS,
  MAX_ANSWERED_QUESTIONS,
  MODEL_ANSWERED_QUESTIONS,
  DETECTION_PROMPTS,
  isRepeatOfAnswered,
  transcriptAfterQuestion,
  tailAfterLastAnswered,
  normalizeDetectionEngine,
  normalizeSensitivity,
  normalizeRepeatSensitivity,
  repeatThreshold,
  similarityRatio,
  detectionSilenceBucket,
  normalizeDetectedQuestion,
  isFragmentOf,
  isDuplicateOfAnswered,
  createAnsweredQuestionLedger,
  buildDetectionMessages,
  extractJsonObject,
  parseDetectionResponse,
  parseTranscriptTurns,
  detectBackoffMs,
  heuristicDetect,
  decideAutoAnswerAction,
  createDetectionCoordinator,
  detectQuestion,
  clipTranscriptTail,
}
