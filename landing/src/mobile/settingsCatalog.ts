import type {
  AnswerStructure,
  ConversationMemorySec,
  FontSize,
  MicListenLanguage,
  ResponseFormat,
} from './profileTypes'

export type ChoiceOption<T extends string> = {
  value: T
  label: string
  detail: string
}

export type LanguageOption = {
  value: string
  label: string
  flag: string
  mic?: MicListenLanguage
}

export const INTERVIEW_LANGUAGES: LanguageOption[] = [
  { value: 'en', label: 'English (Default)', flag: '🇺🇸', mic: 'en' },
  { value: 'en-US', label: 'English (United States)', flag: '🇺🇸', mic: 'en' },
  { value: 'en-IN', label: 'English (India)', flag: '🇮🇳', mic: 'en' },
  { value: 'hi', label: 'Hindi', flag: '🇮🇳', mic: 'hi' },
  { value: 'en_hi_hinglish', label: 'Hinglish', flag: '🇮🇳', mic: 'en_hi_hinglish' },
  { value: 'es', label: 'Spanish', flag: '🇪🇸' },
  { value: 'fr', label: 'French', flag: '🇫🇷' },
  { value: 'de', label: 'German', flag: '🇩🇪' },
  { value: 'pt', label: 'Portuguese', flag: '🇧🇷' },
  { value: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { value: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { value: 'ko', label: 'Korean', flag: '🇰🇷' },
  { value: 'ar', label: 'Arabic', flag: '🇸🇦' },
]

export const ANSWER_STRUCTURES: ChoiceOption<AnswerStructure>[] = [
  {
    value: 'star',
    label: 'STAR',
    detail: 'Situation, Task, Action, Result (default)',
  },
  { value: 'car', label: 'CAR', detail: 'Context, Action, Result' },
  { value: 'soar', label: 'SOAR', detail: 'Situation, Obstacle, Action, Result' },
  { value: 'par', label: 'PAR', detail: 'Problem, Action, Result' },
  {
    value: 'soara',
    label: 'SOARA',
    detail: 'Situation, Objective, Action, Result, Aftermath',
  },
]

export const RESPONSE_FORMATS: ChoiceOption<ResponseFormat>[] = [
  {
    value: 'bullets',
    label: 'Bullet Points',
    detail: 'Concise, easy-to-scan list of key points (default)',
  },
  {
    value: 'conversational',
    label: 'Conversational',
    detail: 'Natural, spoken-like response with filler words',
  },
  {
    value: 'example',
    label: 'Example-Driven',
    detail: 'Main points illustrated with specific examples',
  },
]

export const FONT_SIZES: ChoiceOption<Exclude<FontSize, 'system'>>[] = [
  { value: 'small', label: 'Small', detail: 'Compact answers' },
  { value: 'standard', label: 'Standard', detail: 'Default reading size' },
  { value: 'large', label: 'Large', detail: 'Easier to scan live' },
  { value: 'xlarge', label: 'Extra Large', detail: 'Maximum answer text' },
]

export const MEMORY_OPTIONS: { value: ConversationMemorySec; label: string }[] = [
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 120, label: '2m' },
  { value: 180, label: '3m' },
]

export function micFromInterviewLanguage(value: string): MicListenLanguage {
  return INTERVIEW_LANGUAGES.find((l) => l.value === value)?.mic || 'en'
}

export function languageLabel(value: string): string {
  return INTERVIEW_LANGUAGES.find((l) => l.value === value)?.label || 'English (Default)'
}

export function structureLabel(value: AnswerStructure): string {
  const opt = ANSWER_STRUCTURES.find((o) => o.value === value)
  return opt ? `${opt.label}: ${opt.detail}` : 'STAR: Situation, Task, Action, Result'
}

export function formatLabel(value: ResponseFormat): string {
  const opt = RESPONSE_FORMATS.find((o) => o.value === value)
  return opt ? `${opt.label}: ${opt.detail}` : 'Bullet Points'
}

export function structurePrompt(value: AnswerStructure): string | null {
  switch (value) {
    case 'star':
      return 'Use STAR (Situation, Task, Action, Result) for behavioral questions — keep it natural, max 4 short sentences.'
    case 'car':
      return 'Use CAR (Context, Action, Result) for behavioral questions — keep it natural and spoken.'
    case 'soar':
      return 'Use SOAR (Situation, Obstacle, Action, Result) for behavioral questions.'
    case 'par':
      return 'Use PAR (Problem, Action, Result) for behavioral questions.'
    case 'soara':
      return 'Use SOARA (Situation, Objective, Action, Result, Aftermath) for behavioral questions.'
    default:
      return null
  }
}

export function formatPrompt(value: ResponseFormat): string {
  switch (value) {
    case 'conversational':
      return (
        'Present the answer in a natural, spoken-like conversational tone, ' +
        'as if thinking it through out loud in real time. Start with a brief ' +
        'natural thinking sound or pause (e.g. "Hmm," "Uh," or "So,") before ' +
        'the main point, and use occasional light filler words through the ' +
        'answer (e.g. "basically", "I mean", "you know") — but don\'t overdo ' +
        'it. The substance underneath should stay clear and complete; the ' +
        'filler is texture, not padding.'
      )
    case 'example':
      return 'Lead with the point, then illustrate with a concrete example from the profile when one exists.'
    default:
      return 'Format the answer as short bullet points the candidate can scan quickly.'
  }
}

export function memoryTurnLimit(sec: ConversationMemorySec): number {
  if (sec <= 30) return 1
  if (sec <= 60) return 2
  if (sec <= 120) return 4
  return 6
}

/** Prior AI Q&A from the selected time window, newest last. Sent with the next interview chat call. */
export function selectConversationMemory<T extends { at?: number }>(
  turns: T[],
  memorySec: ConversationMemorySec,
  now = Date.now(),
): T[] {
  const windowMs = Math.max(30, memorySec) * 1000
  const cutoff = now - windowMs
  const inWindow = turns.filter((turn) => {
    const ts = typeof turn.at === 'number' && turn.at > 0 ? turn.at : now
    return ts >= cutoff
  })
  return inWindow.slice(-8)
}
