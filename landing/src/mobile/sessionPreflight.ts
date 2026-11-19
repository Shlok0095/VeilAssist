import { probeSttHealth } from './cloudStt'
import { validateProviderKey, speechRecognitionAvailable } from './interviewTypes'
import { nvidiaNativeSttAvailable } from './nvidiaNativeStt'
import { nvidiaStreamingAvailable } from './nvidiaStreamingStt'
import { buildChatPayload } from './promptBuilder'
import type { AppSettings, PersonalProfile } from './profileTypes'
import { profileToContextText } from './profileTypes'
import { getActiveModel, settingsForChatPing } from './profileStorage'
import { ensureMicGranted } from './runtimePermissions'
import { formatPrompt, selectConversationMemory, structurePrompt } from './settingsCatalog'
import { transcriptInWindow } from './transcriptSegments'

export const SESSION_PREFLIGHT_FAIL =
  'Something went wrong. Please check your settings and try again.'

export type PreflightProgress = (message: string) => void

function checkSessionWiring(settings: AppSettings, profile: PersonalProfile): boolean {
  try {
    structurePrompt(settings.answerStructure)
    formatPrompt(settings.responseFormat)
    selectConversationMemory([], settings.conversationMemorySec)
    transcriptInWindow([], settings.conversationMemorySec)

    const profileText = profileToContextText(profile)
    const jobDescription = profile.jobDescription || settings.interviewTopic
    const payload = buildChatPayload({
      question: 'ping',
      profileText,
      jobDescription,
      settings,
      think: false,
      model: getActiveModel(settings),
      turnHistory: [],
      recentConversation: '',
    })
    if (!payload.systemPrompt?.trim() || !payload.payload) return false

    if (settings.sttMode === 'device' && !speechRecognitionAvailable()) return false
    if (
      settings.sttMode === 'cloud' &&
      settings.sttProvider === 'nvidia' &&
      !nvidiaNativeSttAvailable() &&
      !nvidiaStreamingAvailable()
    ) {
      return false
    }

    return true
  } catch {
    return false
  }
}

/** Background readiness checks — runs before the session goes live. */
export async function runSessionPreflight(
  settings: AppSettings,
  profile: PersonalProfile,
  onProgress?: PreflightProgress,
): Promise<{ ok: true } | { ok: false; error: string }> {
  onProgress?.('Checking setup…')
  if (!checkSessionWiring(settings, profile)) {
    return { ok: false, error: SESSION_PREFLIGHT_FAIL }
  }

  onProgress?.('Checking microphone…')
  const mic = await ensureMicGranted()
  if (!mic.ok) {
    return { ok: false, error: mic.error || SESSION_PREFLIGHT_FAIL }
  }

  onProgress?.('Verifying AI provider…')
  const ai = await validateProviderKey(settingsForChatPing(settings))
  if (!ai.ok) {
    return { ok: false, error: ai.error || SESSION_PREFLIGHT_FAIL }
  }

  onProgress?.('Verifying speech service…')
  const stt = await probeSttHealth(settings)
  if (!stt.ok) {
    return { ok: false, error: stt.error || SESSION_PREFLIGHT_FAIL }
  }

  onProgress?.('Starting session…')
  return { ok: true }
}
