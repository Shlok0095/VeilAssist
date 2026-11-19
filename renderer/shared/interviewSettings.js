// Copyright (c) 2026 VeilAssist. Overlay/renderer helpers — parity with lib/interviewSettingsCatalog.cjs

export function minCharsForDetection(level) {
  const l = String(level || 'high').toLowerCase()
  if (l === 'low') return 24
  if (l === 'medium') return 14
  return 6
}

export function effectiveMinSpeechChars(questionDetection, micSensitivity) {
  const base = minCharsForDetection(questionDetection)
  if (micSensitivity === 'boost') return Math.max(8, Math.floor(base * 0.65))
  return base
}

/** @deprecated Answer Length must not change Font Size (InterviewMan). */
export function fontSizeFromAnswerLength(_length) {
  return null
}

/** InterviewMan: Response Format does not switch panel layout. */
export function overlayDisplayStyleFromFormat(_format) {
  return 'detailed'
}

export const ANSWER_STRUCTURES = [
  { value: 'star', label: 'STAR', detail: 'Situation, Task, Action, Result (default)' },
  { value: 'car', label: 'CAR', detail: 'Context, Action, Result' },
  { value: 'soar', label: 'SOAR', detail: 'Situation, Obstacle, Action, Result' },
  { value: 'par', label: 'PAR', detail: 'Problem, Action, Result' },
  { value: 'soara', label: 'SOARA', detail: 'Situation, Objective, Action, Result, Aftermath' },
]

export const RESPONSE_FORMATS = [
  { value: 'bullets', label: 'Bullet Points', detail: 'Concise, easy-to-scan list of key points (default)' },
  {
    value: 'conversational',
    label: 'Conversational',
    detail: 'Natural spoken tone with hmm/uh fillers',
  },
  { value: 'example', label: 'Example-Driven', detail: 'Main points illustrated with specific examples' },
]

export const ANSWER_LENGTHS = [
  { value: 'short', label: 'Short', detail: '1–3 sentences (default brief)' },
  { value: 'medium', label: 'Medium', detail: 'About a paragraph (default)' },
  { value: 'long', label: 'Long', detail: 'Multiple paragraphs with more detail' },
]

export const QUESTION_DETECTION_LEVELS = [
  { value: 'low', label: 'Low', detail: 'Wait for longer utterances (~24 chars)' },
  { value: 'medium', label: 'Medium', detail: 'Balanced (~14 chars)' },
  { value: 'high', label: 'High', detail: 'Fast trigger (~6 chars)' },
]

/** How auto-answer decides a question is ready (lib/questionDetector.cjs). */
export const QUESTION_DETECTION_ENGINES = [
  { value: 'ai', label: 'AI-assisted', detail: 'Your chat model judges when a question is complete and new. Falls back to rules if unreachable.' },
  { value: 'rules', label: 'Rules only', detail: 'On-device checks and a fixed silence delay. No extra model calls.' },
]

/** How near-identical a new question must be to an answered one to be dropped as a repeat. */
export const QUESTION_REPEAT_SENSITIVITIES = [
  { value: 'strict', label: 'Strict', detail: 'Drop more repeats (85% similar)' },
  { value: 'balanced', label: 'Balanced', detail: 'Default (90% similar)' },
  { value: 'lenient', label: 'Lenient', detail: 'Drop only near-identical repeats (95% similar)' },
]

export const MEETING_LANGUAGES = [
  { value: 'en', label: 'English (Default)' },
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'hi', label: 'Hindi' },
  { value: 'en_hi_hinglish', label: 'Hinglish' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ar', label: 'Arabic' },
]
