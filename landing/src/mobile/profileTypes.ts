export type WorkExperience = {
  id: string
  title: string
  company: string
  dateRange: string
  bullets: string
}

export type Project = {
  id: string
  name: string
  tech: string
  description: string
}

export type Education = {
  id: string
  degree: string
  details: string
}

export type PersonalProfile = {
  name: string
  summary: string
  experience: WorkExperience[]
  skills: string[]
  projects: Project[]
  education: Education[]
  extraContext: string
  jobDescription: string
  sourceFileName?: string
  rawText?: string
  updatedAt?: number
}

export type AnswerStructure = 'star' | 'car' | 'soar' | 'par' | 'soara'
export type ResponseFormat = 'bullets' | 'conversational' | 'example'
export type AnswerLength = 'short' | 'medium' | 'long'
export type DetectionLevel = 'low' | 'medium' | 'high'
export type FontSize = 'small' | 'standard' | 'large' | 'xlarge' | 'system'
export type ConversationMemorySec = 30 | 60 | 120 | 180
export type ColorScheme = 'dark' | 'light'
export type AiProvider =
  | 'groq'
  | 'nvidia'
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'custom'
export type SttProvider = 'nvidia' | 'groq'
export type SttMode = 'device' | 'cloud'
export type MicSensitivity = 'standard' | 'boost'
export type MicListenLanguage = 'en' | 'hi' | 'en_hi_hinglish'

export type AppSettings = {
  interviewTopic: string
  interviewTopicLocked: boolean
  customInstructions: string
  interviewLanguage: string
  autoAnswer: boolean
  answerStructure: AnswerStructure
  responseFormat: ResponseFormat
  answerLength: AnswerLength
  questionDetection: DetectionLevel
  fontSize: FontSize
  conversationMemorySec: ConversationMemorySec
  colorScheme: ColorScheme
  showTranscription: boolean
  autoScroll: boolean
  provider: AiProvider
  nvidiaKey: string
  groqKey: string
  apiKey: string
  openrouterKey: string
  anthropicKey: string
  googleKey: string
  deepseekKey: string
  customOpenaiKey: string
  customOpenaiBaseUrl: string
  nvidiaModel: string
  groqModel: string
  selectedModel: string
  openrouterModel: string
  anthropicModel: string
  googleModel: string
  deepseekModel: string
  customOpenaiModel: string
  audioEnabled: boolean
  micSensitivity: MicSensitivity
  micListenLanguage: MicListenLanguage
  sttMode: SttMode
  sttProvider: SttProvider
  groqWhisperModel: string
  nvidiaWhisperModel: string
  nvidiaNimFunctionId: string
  /** Keep screen on during an active interview session (wake lock). */
  keepScreenAwake: boolean
}

export const DEFAULT_PROFILE: PersonalProfile = {
  name: '',
  summary: '',
  experience: [],
  skills: [],
  projects: [],
  education: [],
  extraContext: '',
  jobDescription: '',
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  interviewTopic: '',
  interviewTopicLocked: false,
  customInstructions: '',
  interviewLanguage: 'en',
  autoAnswer: true,
  answerStructure: 'star',
  responseFormat: 'bullets',
  answerLength: 'medium',
  questionDetection: 'high',
  fontSize: 'standard',
  conversationMemorySec: 30,
  colorScheme: 'dark',
  showTranscription: true,
  autoScroll: true,
  provider: 'nvidia',
  nvidiaKey: '',
  groqKey: '',
  apiKey: '',
  openrouterKey: '',
  anthropicKey: '',
  googleKey: '',
  deepseekKey: '',
  customOpenaiKey: '',
  customOpenaiBaseUrl: '',
  nvidiaModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  groqModel: 'qwen/qwen3.6-27b',
  selectedModel: 'gpt-4o-mini',
  openrouterModel: 'nvidia/nemotron-nano-12b-v2-vl:free',
  anthropicModel: 'claude-sonnet-4-20250514',
  googleModel: 'gemini-2.0-flash',
  deepseekModel: 'deepseek-chat',
  customOpenaiModel: 'gpt-4o',
  audioEnabled: true,
  micSensitivity: 'standard',
  micListenLanguage: 'en',
  sttMode: 'device',
  sttProvider: 'nvidia',
  groqWhisperModel: 'whisper-large-v3-turbo',
  nvidiaWhisperModel: 'nvidia/parakeet-1.1b-rnnt-multilingual-asr',
  nvidiaNimFunctionId: '71203149-d3b7-4460-8231-1be2543a1fca',
  keepScreenAwake: true,
}

export function profileIsReady(profile: PersonalProfile): boolean {
  const hasSummary = profile.summary.trim().length > 40
  const hasExperience = profile.experience.some(
    (e) => e.title.trim() || e.company.trim() || e.bullets.trim(),
  )
  const hasSkills = profile.skills.length >= 3
  const hasRaw = (profile.rawText || '').trim().length > 80
  return hasSummary || hasExperience || hasSkills || hasRaw
}

/** Apply CV extraction — updates resume fields only; keeps manual-only fields. */
export function mergeCvIntoProfile(current: PersonalProfile, fromCv: PersonalProfile): PersonalProfile {
  return {
    name: fromCv.name,
    summary: fromCv.summary,
    experience: fromCv.experience,
    skills: fromCv.skills,
    projects: fromCv.projects,
    education: fromCv.education,
    rawText: fromCv.rawText,
    sourceFileName: fromCv.sourceFileName,
    jobDescription: current.jobDescription,
    extraContext: current.extraContext,
    updatedAt: Date.now(),
  }
}

export function profileToContextText(profile: PersonalProfile): string {
  const parts: string[] = []
  if (profile.name.trim()) parts.push(`Name: ${profile.name.trim()}`)
  if (profile.summary.trim()) parts.push(`Professional Summary:\n${profile.summary.trim()}`)
  if (profile.experience.length) {
    const exp = profile.experience
      .filter((e) => e.title || e.company || e.bullets)
      .map((e) => {
        const head = [e.title, e.company].filter(Boolean).join(' at ')
        const dates = e.dateRange ? ` (${e.dateRange})` : ''
        const body = e.bullets.trim()
        return `${head}${dates}${body ? `\n${body}` : ''}`
      })
      .join('\n\n')
    if (exp) parts.push(`Work Experience:\n${exp}`)
  }
  if (profile.skills.length) parts.push(`Skills: ${profile.skills.join(', ')}`)
  if (profile.projects.length) {
    const proj = profile.projects
      .filter((p) => p.name || p.description)
      .map((p) => {
        const tech = p.tech ? ` (${p.tech})` : ''
        return `${p.name}${tech}${p.description ? `\n${p.description}` : ''}`
      })
      .join('\n\n')
    if (proj) parts.push(`Projects:\n${proj}`)
  }
  if (profile.education.length) {
    const edu = profile.education
      .filter((e) => e.degree || e.details)
      .map((e) => `${e.degree}${e.details ? `\n${e.details}` : ''}`)
      .join('\n\n')
    if (edu) parts.push(`Education:\n${edu}`)
  }
  if (profile.extraContext.trim()) parts.push(`Extra Context:\n${profile.extraContext.trim()}`)
  if (!parts.length && profile.rawText?.trim()) return profile.rawText.trim().slice(0, 12000)
  return parts.join('\n\n').slice(0, 12000)
}
