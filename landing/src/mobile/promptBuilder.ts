import type { AppSettings } from './profileTypes'
import { routeInterviewQuestion } from './answerRouting'
import type { SessionTurn } from './sessionLoopTypes'
import { isNvidiaFastChatModel } from './nvidiaChatModels'
import { nvidiaThinkBodyFields } from './nvidiaChatHelpers'
import { NORMAL_TEMPERATURE, THINKING_TEMPERATURE, THINKING_TOP_P } from './multimodalRouter'
import { formatPrompt, INTERVIEW_LANGUAGES, selectConversationMemory, structurePrompt } from './settingsCatalog'

export function buildInterviewSystemPrompt(input: {
  profileText: string
  jobDescription: string
  interviewTopic: string
  interviewLanguage: string
  customInstructions: string
  answerStructure: AppSettings['answerStructure']
  responseFormat: AppSettings['responseFormat']
  answerLength: AppSettings['answerLength']
  useResume: boolean
  useJd: boolean
  answerContract: string
  recentConversation?: string
  conversationMemorySec?: AppSettings['conversationMemorySec']
}): string {
  const parts = [
    'You are VeilAssist, a private interview copilot on the user\'s phone.',
    'The user is in a live job interview. Give the DIRECT ANSWER they should speak — first person, natural, confident.',
    'Do NOT introduce yourself as an AI. Do NOT coach from outside ("the interviewer asked...").',
  ]

  if (input.answerContract === 'coding_answer') {
    parts.push(
      'This is a coding/implementation question. Give clear technical steps or pseudocode.',
      'Do NOT invent personal work history — use general engineering knowledge.',
    )
  } else if (input.answerContract === 'general_assistant' || input.answerContract === 'technical_explanation') {
    parts.push(
      'This question is general knowledge or a technical concept — NOT about the candidate\'s personal résumé.',
      'Answer from world knowledge. Do not claim personal experience the user did not provide.',
    )
  } else {
    parts.push(
      'For questions about the candidate\'s background, experience, projects, or fit — ground answers ONLY in the profile below.',
      'Never invent employers, dates, or achievements not in the profile.',
      'For unrelated general questions, answer from expertise without fabricating personal history.',
    )
  }

  const structureLine = structurePrompt(input.answerStructure)
  if (structureLine) parts.push(structureLine)
  parts.push(formatPrompt(input.responseFormat))

  if (input.answerLength === 'short') parts.push('Target under 80 words.')
  else if (input.answerLength === 'long') parts.push('Up to 250 words if technical depth is needed.')
  else parts.push('Target under 180 words.')

  if (input.interviewTopic?.trim()) {
    parts.push(`Interview focus / role topic: ${input.interviewTopic.trim().slice(0, 500)}`)
  }

  const lang = INTERVIEW_LANGUAGES.find((l) => l.value === input.interviewLanguage)
  if (lang && lang.value !== 'en' && lang.value !== 'en-US') {
    parts.push(`The interview is in ${lang.label}. Answer in that language.`)
  }

  if (input.customInstructions?.trim()) {
    parts.push(`Custom instructions: ${input.customInstructions.trim().slice(0, 2000)}`)
  }

  const recent = input.recentConversation?.trim()
  if (recent) {
    const sec = input.conversationMemorySec || 30
    parts.push(
      `\n## RECENT CONVERSATION (last ${sec}s — use for follow-ups and context)\n${recent.slice(0, 4000)}`,
    )
  }

  if (input.useResume && input.profileText?.trim()) {
    parts.push(
      `\n## CANDIDATE PROFILE (use for personal/behavioral questions only)\n${input.profileText.trim().slice(0, 8000)}`,
    )
  }

  if (input.useJd && input.jobDescription?.trim()) {
    parts.push(`\n## JOB DESCRIPTION\n${input.jobDescription.trim().slice(0, 4000)}`)
  }

  return parts.join('\n')
}

export function buildChatPayload(input: {
  question: string
  profileText: string
  jobDescription: string
  settings: AppSettings
  think: boolean
  source?: 'manual_input' | 'transcript'
  model: string
  turnHistory?: SessionTurn[]
  stream?: boolean
  imageDataUrl?: string
  recentConversation?: string
}) {
  const hasProfile = input.profileText.trim().length > 40
  const hasJd = input.jobDescription.trim().length > 20
  const route = routeInterviewQuestion({
    question: input.question,
    hasProfile,
    hasJd,
    source: input.source || 'manual_input',
  })

  const systemPrompt = buildInterviewSystemPrompt({
    profileText: input.profileText,
    jobDescription: input.jobDescription,
    interviewTopic: input.settings.interviewTopic,
    interviewLanguage: input.settings.interviewLanguage,
    customInstructions: input.settings.customInstructions,
    answerStructure: input.settings.answerStructure,
    responseFormat: input.settings.responseFormat,
    answerLength: input.settings.answerLength,
    useResume: route.useResume,
    useJd: route.useJd,
    answerContract: route.answerContract,
    recentConversation: input.recentConversation,
    conversationMemorySec: input.settings.conversationMemorySec,
  })

  const historyMessages = selectConversationMemory(
    input.turnHistory || [],
    input.settings.conversationMemorySec,
  ).flatMap((turn) => [
    {
      role: 'user' as const,
      content: `Interview question:\n\n${turn.question}`,
    },
    { role: 'assistant' as const, content: turn.answer },
  ])

  const think = Boolean(input.think)
  const userText = think
    ? `Interview question (think briefly, then answer):\n\n${input.question}`
    : `Interview question:\n\n${input.question}`

  const userContent = input.imageDataUrl
    ? [
        {
          type: 'text',
          text: input.question?.trim()
            ? userText
            : 'Read the interview question in this photo and give the spoken answer.',
        },
        { type: 'image_url', image_url: { url: input.imageDataUrl } },
      ]
    : userText

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    {
      role: 'user',
      content: userContent,
    },
  ]

  const answerLength = input.settings.answerLength
  const payload: Record<string, unknown> = {
    model: input.model,
    messages,
    max_tokens: think ? 1600 : answerLength === 'long' ? 1800 : answerLength === 'short' ? 600 : 1400,
    temperature: think ? THINKING_TEMPERATURE : NORMAL_TEMPERATURE,
    stream: Boolean(input.stream),
  }
  if (think) payload.top_p = THINKING_TOP_P

  const model = String(input.model || '')
  const nvidiaFast = input.settings.provider === 'nvidia' && !think && isNvidiaFastChatModel(model)

  if (nvidiaFast) {
    payload.seed = 7
  }

  Object.assign(payload, nvidiaThinkBodyFields(model, think))

  if (input.settings.provider === 'groq' && /qwen3\.6/i.test(model)) {
    payload.reasoning_effort = think ? 'default' : 'none'
    payload.reasoning_format = 'hidden'
  }

  return { payload, route, systemPrompt }
}
