// Copyright (c) 2026 VeilAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createIpcShim } from '../shared/ipcShim'
import SettingsTabContent from './SettingsTabContent'
import { SettingsNav, normalizeSettingsTabId, parseSettingsQuery } from './settingsNav.jsx'
import { DEFAULT_HOTKEYS_MAP } from './settingsConstants'
import { toDateKey, friendlyCalendarError } from './settingsFormatters'
import SettingsWindowFrame from './SettingsWindowFrame'
import { SettingsLoadingSkeleton } from './SettingsComponents'
import brandLogo from '../shared/brandLogo'
import { fontSizeFromAnswerLength } from '../shared/interviewSettings'

const ipc = createIpcShim()

const CONTENT_MAX = 12000
const NAME_MAX = 64
const REFERENCE_FILE_MAX_CHARS = 80000
const RESUME_MAX = 50000
const JD_MAX = 30000
const NOTE_TITLE_MAX = 80
const NOTE_INSTRUCTIONS_MAX = 400

function notesSectionsFromPrompt(p) {
  if (!p?.notesTemplate) return []
  const raw = p.notesTemplate
  const list = Array.isArray(raw) ? raw : raw.sections
  if (!Array.isArray(list)) return []
  return list.map((s) => ({
    id: s.id || `ns-${Date.now()}`,
    title: s.title || '',
    instructions: s.instructions || s.description || '',
  }))
}

function newNotesSectionId() {
  return `ns-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function basename(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/')
  return p.split('/').pop() || 'file'
}

const save = (k, v) => ipc?.invoke('set-store', k, v)

function useSettingsQuery() {
  return useMemo(() => parseSettingsQuery(window.location.search), [])
}

export default function Settings() {
  const settingsQuery = useSettingsQuery()
  const isFirstRunWindow = settingsQuery.firstRun

  const [providerMeta, setProviderMeta] = useState([])
  const [sttProviderMeta, setSttProviderMeta] = useState([])
  const [snap, setSnap] = useState(null)
  const [provider, setProvider] = useState('nvidia')
  const [sttProvider, setSttProvider] = useState('groq')
  const [secretByProvider, setSecretByProvider] = useState({})
  const [sttSecretInput, setSttSecretInput] = useState('')
  const [keySetMap, setKeySetMap] = useState({})
  const [testByProvider, setTestByProvider] = useState({})
  const [testingProvider, setTestingProvider] = useState(null)
  const [activeTab, setActiveTab] = useState(() => settingsQuery.tab)
  const [advanceOpenSection, setAdvanceOpenSection] = useState(() => settingsQuery.section)
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [micSensitivity, setMicSensitivity] = useState('standard')
  const [sttModeUi, setSttModeUi] = useState('local')
  const [contextPrompts, setContextPrompts] = useState([])
  const [activeContextPromptId, setActiveContextPromptId] = useState('')
  const [contextPromptHistory, setContextPromptHistory] = useState([])
  const [contextIndexing, setContextIndexing] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [showModeTemplates, setShowModeTemplates] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [draftNotesSections, setDraftNotesSections] = useState([])
  const [resumeContext, setResumeContext] = useState('')
  const [jdContext, setJdContext] = useState('')
  const [resumeSourceName, setResumeSourceName] = useState('')
  const [profileDocBusy, setProfileDocBusy] = useState(null)
  const resumeContextRef = useRef('')
  const jdContextRef = useRef('')
  const resumeSourceNameRef = useRef('')
  const resumeSaveTimerRef = useRef(null)
  const jdSaveTimerRef = useRef(null)
  resumeContextRef.current = resumeContext
  jdContextRef.current = jdContext
  resumeSourceNameRef.current = resumeSourceName

  useEffect(() => {
    return () => {
      if (resumeSaveTimerRef.current) clearTimeout(resumeSaveTimerRef.current)
      if (jdSaveTimerRef.current) clearTimeout(jdSaveTimerRef.current)
    }
  }, [])

  const [modelCatalog, setModelCatalog] = useState({})
  const [sttPolicy, setSttPolicy] = useState(null)
  const [remoteModelsByProvider, setRemoteModelsByProvider] = useState({})
  const [modelListSourceByProvider, setModelListSourceByProvider] = useState({})
  const [listModelsLoadingId, setListModelsLoadingId] = useState(null)
  const [listModelsErrByProvider, setListModelsErrByProvider] = useState({})

  const [overlayOpacityUi, setOverlayOpacityUi] = useState(0.92)
  const [overlayFontUi, setOverlayFontUi] = useState('medium')
  const [answerStructureUi, setAnswerStructureUi] = useState('star')
  const [responseFormatUi, setResponseFormatUi] = useState('bullets')
  const [answerLengthUi, setAnswerLengthUi] = useState('medium')
  const [questionDetectionUi, setQuestionDetectionUi] = useState('high')
  const [assistAutoTriggerUi, setAssistAutoTriggerUi] = useState(false)
  const [overlayAnswerAutoScrollUi, setOverlayAnswerAutoScrollUi] = useState(true)
  const [meetingListenLanguageUi, setMeetingListenLanguageUi] = useState('en')
  const [aiResponseLanguageUi, setAiResponseLanguageUi] = useState('')
  const [interviewCustomInstructionsUi, setInterviewCustomInstructionsUi] = useState('')
  const [conversationFollowUpsEnabled, setConversationFollowUpsEnabled] = useState(false)
  const [overlayAnswerViewUi, setOverlayAnswerViewUi] = useState('latest')
  const [overlayTeleprompterUi, setOverlayTeleprompterUi] = useState(false)
  const [overlayFocusModeUi, setOverlayFocusModeUi] = useState(false)
  const [overlayW, setOverlayW] = useState(400)
  const [overlayH, setOverlayH] = useState(540)
  const [hotkeysMap, setHotkeysMap] = useState(() => ({ ...DEFAULT_HOTKEYS_MAP }))
  const [stealthModeUi, setStealthModeUi] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [meetingSessions, setMeetingSessions] = useState([])
  const [expandedMeetingId, setExpandedMeetingId] = useState(null)
  const [googleCalendarClientId, setGoogleCalendarClientId] = useState('')
  const [googleCalendarClientSecret, setGoogleCalendarClientSecret] = useState('')
  const [googleCalendarConnectedEmail, setGoogleCalendarConnectedEmail] = useState('')
  const [googleCalendarOAuthReady, setGoogleCalendarOAuthReady] = useState(false)
  const [googleCalendarUsingEmbeddedOAuth, setGoogleCalendarUsingEmbeddedOAuth] = useState(false)
  const [calendarConnectBusy, setCalendarConnectBusy] = useState(false)
  const [calendarEventsLoading, setCalendarEventsLoading] = useState(false)
  const [calendarErr, setCalendarErr] = useState('')
  const [calendarMeetings, setCalendarMeetings] = useState([])
  const [selectedCalendarDate, setSelectedCalendarDate] = useState('')
  const [calendarRemindersEnabled, setCalendarRemindersEnabled] = useState(true)
  const [calendarReminderMinutes, setCalendarReminderMinutes] = useState(5)
  const [meetingForegroundDetectionEnabled, setMeetingForegroundDetectionEnabled] = useState(true)
  const [intelligenceFlagsMeta, setIntelligenceFlagsMeta] = useState({ flags: [], coreFlagKeys: [], advancedGroupOrder: [] })
  const [hindsightApiUrl, setHindsightApiUrl] = useState('')
  const [hindsightApiKey, setHindsightApiKey] = useState('')
  const [openAtLoginUi, setOpenAtLoginUi] = useState(false)
  const [verboseDebugLogging, setVerboseDebugLogging] = useState(false)
  const [doNotSaveMeetingsEnabled, setDoNotSaveMeetingsEnabled] = useState(false)
  const [overlayTranscriptAutoScrollUi, setOverlayTranscriptAutoScrollUi] = useState(true)
  const [overlayLiveTranscriptUi, setOverlayLiveTranscriptUi] = useState(true)
  const [overlayAnswerPinToTopUi, setOverlayAnswerPinToTopUi] = useState(true)
  const [overlayMousePassthroughUi, setOverlayMousePassthroughUi] = useState(false)
  const [hideFromTaskbarUi, setHideFromTaskbarUi] = useState(false)
  const [uiAccentThemeUi, setUiAccentThemeUi] = useState('blue')
  const [uiColorSchemeUi, setUiColorSchemeUi] = useState('system')
  const [settingsToast, setSettingsToast] = useState(null)
  const [profileSaveStatus, setProfileSaveStatus] = useState('idle')

  useEffect(() => {
    const pref = uiColorSchemeUi === 'light' || uiColorSchemeUi === 'dark' ? uiColorSchemeUi : 'system'
    const applyResolved = (resolved) => {
      document.body?.setAttribute('data-color-scheme', resolved)
      document.documentElement?.setAttribute('data-color-scheme', resolved)
    }
    if (pref !== 'system') {
      applyResolved(pref)
      return undefined
    }
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    const sync = () => applyResolved(mq?.matches ? 'light' : 'dark')
    sync()
    mq?.addEventListener?.('change', sync)
    return () => mq?.removeEventListener?.('change', sync)
  }, [uiColorSchemeUi])

  const sttCapableMeta = useMemo(() => {
    if (sttProviderMeta.length) return sttProviderMeta
    const ids = sttPolicy?.nativeSttProviderIds || ['groq', 'openai']
    return providerMeta.filter((p) => ids.includes(p.id))
  }, [sttProviderMeta, providerMeta, sttPolicy])
  const currentSttMeta = useMemo(
    () => sttCapableMeta.find((p) => p.id === sttProvider) || sttCapableMeta[0],
    [sttCapableMeta, sttProvider],
  )

  const meetingsByDate = useMemo(() => {
    const map = new Map()
    for (const m of calendarMeetings) {
      const key = toDateKey(m.start) || 'unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(m)
    }
    return map
  }, [calendarMeetings])
  const availableDateKeys = useMemo(
    () => [...meetingsByDate.keys()].filter((k) => k !== 'unknown').sort(),
    [meetingsByDate],
  )
  const effectiveDateKey = selectedCalendarDate || availableDateKeys[0] || ''
  const meetingsForSelectedDate = effectiveDateKey ? meetingsByDate.get(effectiveDateKey) || [] : []

  const refreshCalendarMeetings = async () => {
    if (!ipc) return
    setCalendarErr('')
    setCalendarEventsLoading(true)
    try {
      const status = await ipc.invoke('google-calendar:get-status')
      setGoogleCalendarConnectedEmail(status?.connectedEmail || '')
      setGoogleCalendarOAuthReady(status?.oauthReady === true)
      setGoogleCalendarUsingEmbeddedOAuth(status?.usingEmbeddedOAuth === true)
      if (!status?.connected) {
        setCalendarMeetings([])
        return
      }
      const res = await ipc.invoke('google-calendar:list-upcoming')
      if (!res?.ok) throw new Error(res?.error || 'Could not load meetings')
      const meetings = Array.isArray(res.meetings) ? res.meetings : []
      setCalendarMeetings(meetings)
      if (!selectedCalendarDate) {
        const firstDate = toDateKey(meetings[0]?.start)
        if (firstDate) setSelectedCalendarDate(firstDate)
      }
    } catch (e) {
      setCalendarErr(friendlyCalendarError(e?.message || 'Could not load meetings'))
    } finally {
      setCalendarEventsLoading(false)
    }
  }

  const connectGoogleCalendar = async () => {
    if (!ipc) return
    setCalendarErr('')
    setCalendarConnectBusy(true)
    try {
      if (!googleCalendarOAuthReady) {
        const id = String(googleCalendarClientId || '').trim()
        const secret = String(googleCalendarClientSecret || '').trim()
        if (!id || !secret || secret === '••••••••') {
          throw new Error('No OAuth credentials configured. Use Developer setup below or set env vars and rebuild.')
        }
        await save('googleCalendarClientId', id)
        await save('googleCalendarClientSecret', secret)
      }
      const res = await ipc.invoke('google-calendar:connect')
      setGoogleCalendarConnectedEmail(res?.connectedEmail || '')
      setGoogleCalendarOAuthReady(true)
      setGoogleCalendarClientSecret('••••••••')
      await refreshCalendarMeetings()
    } catch (e) {
      setCalendarErr(friendlyCalendarError(e?.message || 'Google Calendar connect failed'))
    } finally {
      setCalendarConnectBusy(false)
    }
  }

  const cancelGoogleCalendarConnect = async () => {
    if (!ipc) return
    try {
      await ipc.invoke('google-calendar:cancel-connect')
    } catch {}
    setCalendarConnectBusy(false)
    setCalendarErr('Google sign-in cancelled.')
  }

  const disconnectGoogleCalendar = async () => {
    if (!ipc) return
    setCalendarErr('')
    setCalendarConnectBusy(true)
    try {
      await ipc.invoke('google-calendar:disconnect')
      setGoogleCalendarConnectedEmail('')
      setCalendarMeetings([])
    } catch (e) {
      setCalendarErr(friendlyCalendarError(e?.message || 'Disconnect failed'))
    } finally {
      setCalendarConnectBusy(false)
    }
  }

  useEffect(() => {
    if (!ipc) return
    Promise.all([
      ipc.invoke('get-all-settings'),
      ipc.invoke('get-provider-metadata'),
      ipc.invoke('get-stt-provider-metadata'),
      ipc.invoke('get-hotkeys'),
    ])
      .then(([s, meta, sttMeta, hk]) => {
        setSnap(s)
        setProviderMeta(meta || [])
        setSttProviderMeta(sttMeta || [])
        const chatProv = s.provider || 'nvidia'
        setProvider(chatProv)
        setSttProvider(s.sttProvider || 'groq')
        setHasCompletedOnboarding(!!s.hasCompletedOnboarding)
        setAudioEnabled(s.audioEnabled !== false)
        setMicSensitivity(s.micSensitivity === 'boost' ? 'boost' : 'standard')
        setSttModeUi(s.sttMode === 'cloud' ? 'cloud' : 'local')
        setGoogleCalendarClientId(s.googleCalendarClientId || '')
        setGoogleCalendarClientSecret(s.googleCalendarClientSecret ? '••••••••' : '')
        setGoogleCalendarConnectedEmail(s.googleCalendarConnectedEmail || '')
        setCalendarRemindersEnabled(s.calendarRemindersEnabled !== false)
        setMeetingForegroundDetectionEnabled(s.meetingForegroundDetectionEnabled !== false)
        setHindsightApiUrl(String(s.hindsightApiUrl || ''))
        setHindsightApiKey(s.hindsightApiKey ? '••••••••' : '')
        setOpenAtLoginUi(s.openAtLogin === true)
        setVerboseDebugLogging(s.verboseDebugLogging === true)
        setDoNotSaveMeetingsEnabled(s.doNotSaveMeetingsEnabled === true)
        setOverlayTranscriptAutoScrollUi(s.overlayTranscriptAutoScroll !== false)
        setOverlayLiveTranscriptUi(s.overlayLiveTranscriptEnabled !== false)
        setOverlayAnswerPinToTopUi(s.overlayAnswerPinToTop !== false)
        setOverlayMousePassthroughUi(s.overlayMousePassthroughEnabled === true)
        setHideFromTaskbarUi(s.hideFromTaskbarEnabled === true)
        setUiAccentThemeUi(String(s.uiAccentTheme || 'blue'))
        setUiColorSchemeUi(
          s.uiColorScheme === 'light' || s.uiColorScheme === 'dark' ? s.uiColorScheme : 'system',
        )
        setCalendarReminderMinutes(
          Number.isFinite(Number(s.calendarReminderMinutes))
            ? Math.max(0, Number(s.calendarReminderMinutes))
            : 5,
        )
        setContextPrompts(Array.isArray(s.contextPrompts) ? s.contextPrompts : [])
        setActiveContextPromptId(s.activeContextPromptId || '')
        setContextPromptHistory(Array.isArray(s.contextPromptHistory) ? s.contextPromptHistory : [])
        setResumeContext(String(s.resumeContext || ''))
        setJdContext(String(s.jdContext || ''))
        setResumeSourceName(String(s.resumeSourceName || ''))
        const activeP = (Array.isArray(s.contextPrompts) ? s.contextPrompts : []).find(
          (p) => p.id === s.activeContextPromptId,
        )
        if (activeP) {
          setDraftName(activeP.name || '')
          const merged = String(activeP.content || '').trim()
            || [activeP.instructions, activeP.knowledge].map((s) => String(s || '').trim()).filter(Boolean).join('\n\n')
          setDraftContent(merged)
          setDraftNotesSections(notesSectionsFromPrompt(activeP))
        }
        const ob = s.overlayBounds || {}
        setOverlayOpacityUi(typeof s.overlayOpacity === 'number' ? s.overlayOpacity : 0.92)
        setOverlayFontUi(s.overlayFontSize || 'medium')
        setAnswerStructureUi(s.answerStructure === 'car' || s.answerStructure === 'soar' || s.answerStructure === 'par' || s.answerStructure === 'soara' ? s.answerStructure : 'star')
        setResponseFormatUi(s.responseFormat === 'conversational' || s.responseFormat === 'example' ? s.responseFormat : 'bullets')
        setAnswerLengthUi(s.answerLength === 'short' || s.answerLength === 'long' ? s.answerLength : 'medium')
        setQuestionDetectionUi(s.questionDetection === 'low' || s.questionDetection === 'medium' ? s.questionDetection : 'high')
        setAssistAutoTriggerUi(s.assistAutoTrigger === true)
        setOverlayAnswerAutoScrollUi(s.overlayAnswerAutoScroll !== false)
        setMeetingListenLanguageUi(String(s.meetingListenLanguage || s.micListenLanguage || 'en'))
        setAiResponseLanguageUi(String(s.aiResponseLanguage || ''))
        setInterviewCustomInstructionsUi(String(s.interviewCustomInstructions || ''))
        setConversationFollowUpsEnabled(s.conversationFollowUpsEnabled === true)
        setOverlayAnswerViewUi(s.overlayAnswerView === 'history' ? 'history' : 'latest')
        setOverlayTeleprompterUi(s.overlayTeleprompter === true)
        setOverlayFocusModeUi(s.overlayFocusMode === true)
        setOverlayW(ob.width || 480)
        setOverlayH(ob.height || 580)
        setStealthModeUi(s.stealth_mode === true)
        setKeySetMap({
          apiKey: !!s.apiKey,
          groqKey: !!s.groqKey,
          anthropicKey: !!s.anthropicKey,
          deepseekKey: !!s.deepseekKey,
          googleKey: !!s.googleKey,
          customOpenaiKey: !!s.customOpenaiKey,
          deepgramKey: !!s.deepgramKey,
          elevenLabsKey: !!s.elevenLabsKey,
          nvidiaKey: !!s.nvidiaKey,
          azureSpeechKey: !!s.azureSpeechKey,
          googleSttKey: !!s.googleSttKey,
          sonioxKey: !!s.sonioxKey,
          hindsightApiKey: !!s.hindsightApiKey,
        })
        if (hk && typeof hk === 'object') {
          setHotkeysMap((prev) => ({ ...prev, ...hk }))
        }
      })
      .catch(console.error)
    ipc.invoke('get-app-info')
      .then((info) => {
        if (info?.version) setAppVersion(String(info.version))
      })
      .catch(() => {})
    ipc.invoke('google-calendar:get-status')
      .then((status) => {
        if (!status) return
        setGoogleCalendarOAuthReady(status.oauthReady === true)
        setGoogleCalendarUsingEmbeddedOAuth(status.usingEmbeddedOAuth === true)
        if (status.connectedEmail) setGoogleCalendarConnectedEmail(status.connectedEmail)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!ipc) return
    const refreshMeetings = () => {
      ipc.invoke('meeting-sessions:list')
        .then((list) => setMeetingSessions(Array.isArray(list) ? list : []))
        .catch(() => setMeetingSessions([]))
    }
    const unsubSummary = ipc.on('meeting-summary-status', (_, payload) => {
      if (payload?.state === 'ready' || payload?.state === 'error') refreshMeetings()
    })
    return () => unsubSummary?.()
  }, [])

  useEffect(() => {
    if (!ipc || activeTab !== 'meetings') return
    ipc.invoke('meeting-sessions:list')
      .then((list) => setMeetingSessions(Array.isArray(list) ? list : []))
      .catch(() => setMeetingSessions([]))
    void refreshCalendarMeetings()
  }, [activeTab])

  useEffect(() => {
    if (!ipc) return
    Promise.all([ipc.invoke('get-chat-model-catalog'), ipc.invoke('get-stt-policy')])
      .then(([cat, pol]) => {
        setModelCatalog(cat && typeof cat === 'object' ? cat : {})
        setSttPolicy(pol)
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!ipc) return
    ipc.invoke('get-intelligence-flags')
      .then((meta) => {
        if (meta && typeof meta === 'object') setIntelligenceFlagsMeta(meta)
      })
      .catch(console.error)
  }, [])


  const selectSettingsTab = useCallback((tabId, section = '') => {
    const nextTab = normalizeSettingsTabId(tabId)
    setActiveTab(nextTab)
    if (section) setAdvanceOpenSection(String(section).toLowerCase())
  }, [])

  const selectIntelligenceTab = useCallback(() => {
    selectSettingsTab('advance', 'intelligence')
  }, [selectSettingsTab])

  useEffect(() => {
    if (!ipc) return
    const unsubNav = ipc.on('settings-navigate', (_, payload) => {
      if (!payload || typeof payload !== 'object') return
      if (payload.tab) selectSettingsTab(payload.tab, payload.section || '')
    })
    return () => {
      unsubNav?.()
    }
  }, [selectSettingsTab])

  useEffect(() => {
    if (isFirstRunWindow) setActiveTab('advance')
  }, [isFirstRunWindow])

  useEffect(() => {
    if (!ipc) return
    const onStealth = (_, v) => setStealthModeUi(!!v)
    const unsubStealth = ipc.on('stealth-mode-update', onStealth)
    // ipcShim listeners receive (event, ...args) — payload is the second argument.
    const unsubToast = ipc.on('settings-toast', (_, payload) => {
      if (!payload || typeof payload !== 'object') return
      setSettingsToast(payload)
      const ms = Number(payload.durationMs) || 8000
      window.setTimeout(() => {
        setSettingsToast((cur) => (cur === payload ? null : cur))
      }, ms)
    })
    return () => {
      unsubStealth?.()
      unsubToast?.()
    }
  }, [])

  useEffect(() => {
    if (isFirstRunWindow && snap && !hasCompletedOnboarding) {
      setActiveTab('advance')
    }
  }, [isFirstRunWindow, snap, hasCompletedOnboarding])

  const showSetupBanner = isFirstRunWindow && !hasCompletedOnboarding

  const saveKey = (storeKey, val, providerId) => {
    if (!val?.trim()) return
    save(storeKey, val.trim())
    if (providerId) {
      setSecretByProvider((m) => {
        const next = { ...m }
        delete next[providerId]
        return next
      })
    }
    setSttSecretInput('')
    setKeySetMap((k) => ({ ...k, [storeKey]: true }))
    if (providerId) void syncRemoteModelsFor(providerId)
  }

  const chatOptionsFor = (pId) => {
    const source = modelListSourceByProvider[pId]
    const fromApi = remoteModelsByProvider[pId]
    if (source === 'api' && fromApi?.length) return fromApi
    const curated = modelCatalog[pId]
    if ((pId === 'groq' || pId === 'nvidia') && curated?.length) return curated
    return []
  }

  const selectChatProvider = (pId) => {
    if (!pId || pId === provider) return
    setProvider(pId)
    save('provider', pId)
    setTestByProvider((t) => {
      const n = { ...t }
      delete n[pId]
      return n
    })
    const meta = providerMeta.find((p) => p.id === pId)
    if (meta?.keyField && keySetMap[meta.keyField]) {
      void syncRemoteModelsFor(pId)
    }
  }

  const patchSnap = (key, value) => {
    setSnap((s) => (s ? { ...s, [key]: value } : s))
  }

  const testApiFor = async (pId) => {
    const meta = providerMeta.find((p) => p.id === pId)
    const field = meta?.keyField
    const localKey = (secretByProvider[pId] || '').trim()
    const hasSavedKey = field ? !!keySetMap[field] : true

    if (field && !localKey && !hasSavedKey) {
      setTestByProvider((t) => ({
        ...t,
        [pId]: { success: false, error: 'Add an API key above, then choose Save key.' },
      }))
      return
    }

    setTestingProvider(pId)
    setTestByProvider((t) => {
      const n = { ...t }
      delete n[pId]
      return n
    })
    // Main process resolves persisted keys when the renderer passes an empty string.
    const r = await ipc.invoke('test-api', pId, localKey)
    setTestByProvider((t) => ({ ...t, [pId]: r }))
    setTestingProvider(null)
  }

  const withIndexing = async (fn) => {
    setContextIndexing(true)
    try {
      await fn()
    } finally {
      setContextIndexing(false)
    }
  }

  const saveContextPrompts = async (next) => {
    setContextPrompts(next)
    await withIndexing(() => save('contextPrompts', next))
  }

  const selectContextPrompt = async (id, promptOverride) => {
    const p = promptOverride || contextPrompts.find((x) => x.id === id)
    if (!p) return
    setShowModeTemplates(false)
    setActiveContextPromptId(id)
    setDraftName(p.name || '')
    const merged = String(p.content || '').trim()
      || [p.instructions, p.knowledge].map((s) => String(s || '').trim()).filter(Boolean).join('\n\n')
    setDraftContent(merged)
    setDraftNotesSections(notesSectionsFromPrompt(p))
    await save('activeContextPromptId', id)
    const nextHist = [id, ...(contextPromptHistory || []).filter((h) => h !== id)].slice(0, 20)
    setContextPromptHistory(nextHist)
    await save('contextPromptHistory', nextHist)
  }

  const addContextPrompt = async (requestedName = 'New mode') => {
    const now = Date.now()
    const p = {
      id: `cp-${now}-${Math.random().toString(36).slice(2, 9)}`,
      name: String(requestedName || 'New mode').trim().slice(0, NAME_MAX) || 'New mode',
      content: '',
      referenceFiles: [],
      notesTemplate: { sections: [] },
      createdAt: now,
      updatedAt: now,
    }
    const next = [...contextPrompts, p]
    await saveContextPrompts(next)
    setShowModeTemplates(false)
    setDraftNotesSections([])
    await selectContextPrompt(p.id, p)
  }

  const addModeFromTemplate = async (template) => {
    if (!template) return
    const now = Date.now()
    const noteSections = (template.notesTemplate || []).map((s, i) => ({
      id: `ns-${now}-${i}`,
      title: String(s.title || 'Section').slice(0, NOTE_TITLE_MAX),
      instructions: String(s.instructions || '').slice(0, NOTE_INSTRUCTIONS_MAX),
    }))
    const p = {
      id: `cp-${now}-${Math.random().toString(36).slice(2, 9)}`,
      name: String(template.name || 'New mode').slice(0, NAME_MAX),
      content: String(template.content || '').slice(0, CONTENT_MAX),
      referenceFiles: [],
      notesTemplate: { sections: noteSections },
      createdAt: now,
      updatedAt: now,
    }
    const next = [...contextPrompts, p]
    await saveContextPrompts(next)
    setShowModeTemplates(false)
    await selectContextPrompt(p.id, p)
  }

  const saveActivePrompt = async () => {
    if (!activeContextPromptId) return
    const name = String(draftName || 'New prompt').trim().slice(0, NAME_MAX) || 'New prompt'
    const content = String(draftContent || '').slice(0, CONTENT_MAX)
    const sections = draftNotesSections
      .map((s) => ({
        id: String(s.id || newNotesSectionId()).slice(0, 64),
        title: String(s.title || '').trim().slice(0, NOTE_TITLE_MAX) || 'Section',
        instructions: String(s.instructions || '').trim().slice(0, NOTE_INSTRUCTIONS_MAX),
      }))
      .filter((s) => s.title || s.instructions)
    const next = contextPrompts.map((p) =>
      p.id === activeContextPromptId
        ? { ...p, name, content, notesTemplate: { sections }, updatedAt: Date.now() }
        : p,
    )
    setDraftName(name)
    await saveContextPrompts(next)
  }

  const saveResumeContext = async (text, sourceName) => {
    const v = String(text || '').slice(0, RESUME_MAX)
    resumeContextRef.current = v
    setResumeContext(v)
    await save('resumeContext', v)
    if (sourceName !== undefined) {
      const n = String(sourceName || '').slice(0, 200)
      resumeSourceNameRef.current = n
      setResumeSourceName(n)
      await save('resumeSourceName', n)
    }
  }

  const saveJdContext = async (text) => {
    const v = String(text || '').slice(0, JD_MAX)
    jdContextRef.current = v
    setJdContext(v)
    await save('jdContext', v)
  }

  const onResumeChange = (value) => {
    const v = String(value || '').slice(0, RESUME_MAX)
    resumeContextRef.current = v
    setResumeContext(v)
    setProfileSaveStatus('saving')
    if (resumeSaveTimerRef.current) clearTimeout(resumeSaveTimerRef.current)
    resumeSaveTimerRef.current = setTimeout(() => {
      resumeSaveTimerRef.current = null
      void save('resumeContext', resumeContextRef.current).then(() => {
        setProfileSaveStatus('saved')
        window.setTimeout(() => setProfileSaveStatus('idle'), 2000)
      })
    }, 400)
  }

  const onJdChange = (value) => {
    const v = String(value || '').slice(0, JD_MAX)
    jdContextRef.current = v
    setJdContext(v)
    setProfileSaveStatus('saving')
    if (jdSaveTimerRef.current) clearTimeout(jdSaveTimerRef.current)
    jdSaveTimerRef.current = setTimeout(() => {
      jdSaveTimerRef.current = null
      void save('jdContext', jdContextRef.current).then(() => {
        setProfileSaveStatus('saved')
        window.setTimeout(() => setProfileSaveStatus('idle'), 2000)
      })
    }, 400)
  }

  const uploadProfileDoc = async (kind) => {
    if (!ipc) return
    const { canceled, filePaths } = await ipc.invoke('show-open-dialog', {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['pdf', 'txt', 'md'] }],
    })
    if (canceled || !filePaths?.[0]) return
    setProfileDocBusy(kind)
    try {
      const text = await ipc.invoke('parse-playbook', filePaths[0])
      if (!String(text || '').trim()) {
        window.alert('Could not extract text from that file (empty or unsupported).')
        return
      }
      if (kind === 'resume') {
        await saveResumeContext(text, basename(filePaths[0]))
      } else {
        await saveJdContext(text)
      }
    } catch (e) {
      console.error('[profile] doc upload:', e)
      window.alert(`Upload failed: ${e?.message || e}`)
    } finally {
      setProfileDocBusy(null)
    }
  }

  const uploadReferenceFile = async () => {
    if (!activeContextPromptId || !ipc) return
    const { canceled, filePaths } = await ipc.invoke('show-open-dialog', {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['pdf', 'txt', 'md'] }],
    })
    if (canceled || !filePaths?.[0]) return
    setUploadBusy(true)
    try {
      const text = await ipc.invoke('parse-playbook', filePaths[0])
      if (!String(text || '').trim()) {
        window.alert('Could not extract text from that file (empty or unsupported).')
        return
      }
      const file = {
        id: `rf-${Date.now()}`,
        name: basename(filePaths[0]),
        text: String(text).slice(0, REFERENCE_FILE_MAX_CHARS),
      }
      const next = contextPrompts.map((p) =>
        p.id === activeContextPromptId
          ? { ...p, referenceFiles: [...(p.referenceFiles || []), file], updatedAt: Date.now() }
          : p,
      )
      await saveContextPrompts(next)
    } catch (e) {
      console.error('[profile] upload reference file:', e)
      window.alert(`Upload failed: ${e?.message || e}`)
    } finally {
      setUploadBusy(false)
    }
  }

  const removeReferenceFile = async (fileId) => {
    if (!activeContextPromptId) return
    const next = contextPrompts.map((p) =>
      p.id === activeContextPromptId
        ? {
            ...p,
            referenceFiles: (p.referenceFiles || []).filter((f) => f.id !== fileId),
            updatedAt: Date.now(),
          }
        : p,
    )
    await saveContextPrompts(next)
  }

  const deletePromptById = async (id) => {
    if (!id) return
    const next = contextPrompts.filter((p) => p.id !== id)
    const nextHist = (contextPromptHistory || []).filter((h) => h !== id)
    setContextPromptHistory(nextHist)
    await save('contextPromptHistory', nextHist)
    await saveContextPrompts(next)
    if (activeContextPromptId === id) {
      if (next[0]) {
        await selectContextPrompt(next[0].id)
      } else {
        setActiveContextPromptId('')
        setDraftName('')
        setDraftContent('')
        setDraftNotesSections([])
        await save('activeContextPromptId', '')
      }
    }
  }

  const activePrompt = contextPrompts.find((p) => p.id === activeContextPromptId) || null

  const launchFromSetup = async () => {
    try {
      await save('contextPrompts', contextPrompts)
      await save('hasCompletedOnboarding', true)
      setHasCompletedOnboarding(true)
    } catch (e) {
      console.error(e)
    }
    ipc?.send('complete-onboarding')
  }

  const syncRemoteModelsFor = async (pId) => {
    if (!ipc) return
    setListModelsLoadingId(pId)
    setListModelsErrByProvider((e) => ({ ...e, [pId]: '' }))
    try {
      const res = await ipc.invoke('list-remote-models', pId)
      if (res.ok && res.source === 'api' && res.models?.length) {
        setRemoteModelsByProvider((m) => ({ ...m, [pId]: res.models }))
        setModelListSourceByProvider((m) => ({ ...m, [pId]: 'api' }))
      } else {
        setRemoteModelsByProvider((m) => ({ ...m, [pId]: [] }))
        setModelListSourceByProvider((m) => ({ ...m, [pId]: 'static' }))
      }
      setListModelsErrByProvider((e) => ({
        ...e,
        [pId]: res.error || (res.ok ? '' : 'No models returned'),
      }))
    } catch (err) {
      setListModelsErrByProvider((e) => ({ ...e, [pId]: err.message || 'Sync failed' }))
    } finally {
      setListModelsLoadingId(null)
    }
  }

  useEffect(() => {
    if (!snap || !providerMeta.length) return
    const meta = providerMeta.find((p) => p.id === provider)
    if (meta?.keyField && keySetMap[meta.keyField]) {
      void syncRemoteModelsFor(provider)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate model list when provider/key ready
  }, [snap, provider, providerMeta.length])

  useEffect(() => {
    if (!ipc) return
    const onIndex = () => setContextIndexing(false)
    const onPrompt = (_, payload) => {
      if (payload?.activeContextPromptId != null) {
        setActiveContextPromptId(payload.activeContextPromptId)
      }
    }
    ipc.on('context-index-update', onIndex)
    ipc.on('context-prompt-update', onPrompt)
    return () => {
      ipc.removeAllListeners('context-index-update')
      ipc.removeAllListeners('context-prompt-update')
    }
  }, [])

  const applyOverlayOpacity = async (raw) => {
    const v = Math.min(1, Math.max(0.35, Number(raw)))
    setOverlayOpacityUi(v)
    patchSnap('overlayOpacity', v)
    await save('overlayOpacity', v)
    await ipc?.invoke('apply-overlay-display', { overlayOpacity: v })
  }

  const applyOverlayFont = async (v) => {
    if (!['small', 'medium', 'large'].includes(v)) return
    setOverlayFontUi(v)
    patchSnap('overlayFontSize', v)
    await save('overlayFontSize', v)
    await ipc?.invoke('apply-overlay-display', { overlayFontSize: v })
  }

  const applyAnswerStructure = async (v) => {
    const next = ['star', 'car', 'soar', 'par', 'soara'].includes(v) ? v : 'star'
    setAnswerStructureUi(next)
    patchSnap('answerStructure', next)
    await save('answerStructure', next)
  }

  const applyResponseFormat = async (v) => {
    const next = v === 'conversational' || v === 'example' ? v : 'bullets'
    setResponseFormatUi(next)
    patchSnap('responseFormat', next)
    await save('responseFormat', next)
    const displayStyle = next === 'bullets' ? 'brief' : 'detailed'
    patchSnap('answerStyle', displayStyle)
    await save('answerStyle', displayStyle)
    await ipc?.invoke('apply-overlay-display', { responseFormat: next, answerStyle: displayStyle })
  }

  const applyAnswerLength = async (v) => {
    const next = v === 'short' || v === 'long' ? v : 'medium'
    setAnswerLengthUi(next)
    patchSnap('answerLength', next)
    await save('answerLength', next)
    if (overlayAnswerAutoScrollUi) {
      const fs = fontSizeFromAnswerLength(next)
      setOverlayFontUi(fs)
      patchSnap('overlayFontSize', fs)
      await save('overlayFontSize', fs)
    }
    await ipc?.invoke('apply-overlay-display', { answerLength: next })
  }

  const applyQuestionDetection = async (v) => {
    const next = v === 'low' || v === 'medium' ? v : 'high'
    setQuestionDetectionUi(next)
    patchSnap('questionDetection', next)
    await save('questionDetection', next)
    await ipc?.invoke('apply-overlay-display', { questionDetection: next })
  }

  const applyAssistAutoTrigger = async (v) => {
    const enabled = !!v
    setAssistAutoTriggerUi(enabled)
    patchSnap('assistAutoTrigger', enabled)
    await save('assistAutoTrigger', enabled)
    await ipc?.invoke('apply-overlay-display', { assistAutoTrigger: enabled })
  }

  const applyOverlayAnswerAutoScroll = async (v) => {
    const enabled = !!v
    setOverlayAnswerAutoScrollUi(enabled)
    patchSnap('overlayAnswerAutoScroll', enabled)
    await save('overlayAnswerAutoScroll', enabled)
    if (enabled) {
      const fs = fontSizeFromAnswerLength(answerLengthUi)
      setOverlayFontUi(fs)
      patchSnap('overlayFontSize', fs)
      await save('overlayFontSize', fs)
    }
    await ipc?.invoke('apply-overlay-display', { overlayAnswerAutoScroll: enabled })
  }

  const applyMeetingListenLanguage = async (v) => {
    const next = String(v || 'en')
    setMeetingListenLanguageUi(next)
    patchSnap('meetingListenLanguage', next)
    await save('meetingListenLanguage', next)
  }

  const applyAiResponseLanguage = async (v) => {
    const lang = String(v || '').trim()
    setAiResponseLanguageUi(lang)
    patchSnap('aiResponseLanguage', lang)
    await save('aiResponseLanguage', lang)
  }

  const applyInterviewCustomInstructions = async () => {
    const text = String(interviewCustomInstructionsUi || '').trim().slice(0, 2000)
    setInterviewCustomInstructionsUi(text)
    patchSnap('interviewCustomInstructions', text)
    await save('interviewCustomInstructions', text)
  }

  const onInterviewCustomInstructionsChange = (v) => {
    setInterviewCustomInstructionsUi(String(v || '').slice(0, 2000))
  }

  const onInterviewCustomInstructionsBlur = () => {
    void applyInterviewCustomInstructions()
  }

  const applyConversationFollowUps = async (v) => {
    const enabled = !!v
    setConversationFollowUpsEnabled(enabled)
    patchSnap('conversationFollowUpsEnabled', enabled)
    await save('conversationFollowUpsEnabled', enabled)
  }

  const applyOverlayAnswerView = async (v) => {
    const next = v === 'history' ? 'history' : 'latest'
    setOverlayAnswerViewUi(next)
    patchSnap('overlayAnswerView', next)
    await save('overlayAnswerView', next)
    await ipc?.invoke('apply-overlay-display', { overlayAnswerView: next })
  }

  const applyOverlayTeleprompter = async (v) => {
    setOverlayTeleprompterUi(!!v)
    patchSnap('overlayTeleprompter', !!v)
    await save('overlayTeleprompter', !!v)
    await ipc?.invoke('apply-overlay-display', { overlayTeleprompter: !!v })
  }

  const applyOverlayFocusMode = async (v) => {
    setOverlayFocusModeUi(!!v)
    patchSnap('overlayFocusMode', !!v)
    await save('overlayFocusMode', !!v)
    await ipc?.invoke('apply-overlay-display', { overlayFocusMode: !!v })
  }

  const applyStealthMode = async (v) => {
    const requested = !!v
    setStealthModeUi(requested)
    patchSnap('stealth_mode', requested)
    try {
      const applied = !!(await ipc?.invoke('protection:set', requested))
      setStealthModeUi(applied)
      patchSnap('stealth_mode', applied)
    } catch (error) {
      const applied = !!(await ipc?.invoke('protection:get').catch(() => !requested))
      setStealthModeUi(applied)
      patchSnap('stealth_mode', applied)
      console.error('Unable to update capture protection:', error)
    }
  }

  const applyOpenAtLogin = async (v) => {
    setOpenAtLoginUi(!!v)
    patchSnap('openAtLogin', !!v)
    await save('openAtLogin', !!v)
  }

  const applyOverlayMousePassthrough = async (v) => {
    setOverlayMousePassthroughUi(!!v)
    patchSnap('overlayMousePassthroughEnabled', !!v)
    await save('overlayMousePassthroughEnabled', !!v)
  }

  const applyHideFromTaskbar = async (v) => {
    setHideFromTaskbarUi(!!v)
    patchSnap('hideFromTaskbarEnabled', !!v)
    await save('hideFromTaskbarEnabled', !!v)
  }

  const applyUiAccentTheme = async (id) => {
    setUiAccentThemeUi(id)
    patchSnap('uiAccentTheme', id)
    await save('uiAccentTheme', id)
  }

  const applyUiColorScheme = async (id) => {
    const next = id === 'light' || id === 'dark' ? id : 'system'
    setUiColorSchemeUi(next)
    patchSnap('uiColorScheme', next)
    await save('uiColorScheme', next)
  }

  const applyHindsightAutoStart = async (v) => {
    const enabled = !!v
    patchSnap('hindsightAutoStartEnabled', enabled)
    if (enabled) patchSnap('hindsightProvider', 'gateway')
    await save('hindsightAutoStartEnabled', enabled)
  }

  const applyPhoneLinkEnabled = async (v) => {
    patchSnap('phoneLinkEnabled', !!v)
    await save('phoneLinkEnabled', !!v)
  }

  const applyPhoneLinkRemoteMic = async (v) => {
    patchSnap('phoneLinkRemoteMicEnabled', !!v)
    await save('phoneLinkRemoteMicEnabled', !!v)
  }

  const applyPhoneMirrorDeviceId = async (v) => {
    const id = String(v || '').trim()
    patchSnap('phoneMirrorDeviceId', id)
    await save('phoneMirrorDeviceId', id)
  }

  const applyPhoneMirrorMaxSize = async (v) => {
    const n = Math.max(480, Math.min(2560, Math.floor(Number(v) || 1080)))
    patchSnap('phoneMirrorMaxSize', n)
    await save('phoneMirrorMaxSize', n)
  }

  const applyPhoneMirrorIncludeInAsk = async (v) => {
    patchSnap('phoneMirrorIncludeInAsk', !!v)
    await save('phoneMirrorIncludeInAsk', !!v)
  }

  const applyVerboseDebugLogging = async (v) => {
    setVerboseDebugLogging(!!v)
    patchSnap('verboseDebugLogging', !!v)
    await save('verboseDebugLogging', !!v)
  }

  const applyDoNotSaveMeetings = async (v) => {
    setDoNotSaveMeetingsEnabled(!!v)
    patchSnap('doNotSaveMeetingsEnabled', !!v)
    await save('doNotSaveMeetingsEnabled', !!v)
  }

  const applyTranscriptAutoScroll = async (v) => {
    setOverlayTranscriptAutoScrollUi(!!v)
    patchSnap('overlayTranscriptAutoScroll', !!v)
    await save('overlayTranscriptAutoScroll', !!v)
    await ipc?.invoke('apply-overlay-display', { overlayTranscriptAutoScroll: !!v })
  }

  const applyLiveTranscriptPanel = async (v) => {
    setOverlayLiveTranscriptUi(!!v)
    patchSnap('overlayLiveTranscriptEnabled', !!v)
    await save('overlayLiveTranscriptEnabled', !!v)
    await ipc?.invoke('apply-overlay-display', { overlayLiveTranscriptEnabled: !!v })
  }

  const applyAnswerPinToTop = async (v) => {
    setOverlayAnswerPinToTopUi(!!v)
    patchSnap('overlayAnswerPinToTop', !!v)
    await save('overlayAnswerPinToTop', !!v)
    await ipc?.invoke('apply-overlay-display', { overlayAnswerPinToTop: !!v })
  }

  const openDebugLogFile = async () => {
    await ipc?.invoke('debug-log:open-file')
  }

  const applyOpacityPreset = async (pct) => {
    const v = Math.min(1, Math.max(0.35, pct / 100))
    await applyOverlayOpacity(v)
  }

  const applyOverlaySize = async () => {
    const w = Math.min(860, Math.max(280, Math.round(overlayW)))
    const h = Math.min(940, Math.max(180, Math.round(overlayH)))
    setOverlayW(w)
    setOverlayH(h)
    const prev = snap?.overlayBounds || {}
    const next = { ...prev, width: w, height: h }
    patchSnap('overlayBounds', next)
    await save('overlayBounds', next)
    await ipc?.invoke('apply-overlay-display', { width: w, height: h })
  }

  const snapOverlayToPreset = async (preset) => {
    if (!ipc) return
    await ipc.invoke('set-overlay-position-preset', preset)
    const b = await ipc.invoke('get-window-bounds')
    if (b) {
      patchSnap('overlayBounds', b)
      setOverlayW(b.width)
      setOverlayH(b.height)
    }
  }

  const commitHotkey = async (action, raw) => {
    if (!ipc) return
    const fallback = DEFAULT_HOTKEYS_MAP[action]
    if (!fallback) return
    let v = String(raw ?? '').trim()
    if (!v) v = fallback
    try {
      await ipc.invoke('update-hotkey', action, v)
      setHotkeysMap((m) => ({ ...m, [action]: v }))
    } catch (e) {
      console.warn('update-hotkey', e)
    }
  }

  const resetOneHotkey = async (action) => {
    const d = DEFAULT_HOTKEYS_MAP[action]
    if (!ipc || !d) return
    await ipc.invoke('update-hotkey', action, d)
    setHotkeysMap((m) => ({ ...m, [action]: d }))
  }

  const resetAllHotkeys = async () => {
    if (!ipc) return
    for (const action of Object.keys(DEFAULT_HOTKEYS_MAP)) {
      await ipc.invoke('update-hotkey', action, DEFAULT_HOTKEYS_MAP[action])
    }
    setHotkeysMap({ ...DEFAULT_HOTKEYS_MAP })
  }

  const saveGoogleCalendarOAuth = async () => {
    const id = String(googleCalendarClientId || '').trim()
    const secret = String(googleCalendarClientSecret || '').trim()
    if (!id) return
    await save('googleCalendarClientId', id)
    if (secret && secret !== '••••••••') {
      await save('googleCalendarClientSecret', secret)
      setGoogleCalendarClientSecret('••••••••')
    }
    setGoogleCalendarOAuthReady(true)
  }

  const sttKeyField = currentSttMeta?.keyField
  const sttKeySaved = sttKeyField ? !!keySetMap[sttKeyField] : false

  const chatVendor = providerMeta.find((p) => p.id === provider) || null
  const chatKf = chatVendor?.keyField
  const chatMf = chatVendor?.modelField
  const chatKeySaved = chatKf ? !!keySetMap[chatKf] : false
  const chatOpts = chatVendor ? chatOptionsFor(chatVendor.id) : []
  const chatModel =
    chatMf && snap ? String(snap[chatMf] ?? chatVendor?.defaultModel ?? '') : ''
  const chatTest = chatVendor ? testByProvider[chatVendor.id] : null
  const chatListErr = chatVendor ? listModelsErrByProvider[chatVendor.id] : ''
  const chatTesting = chatVendor ? testingProvider === chatVendor.id : false
  const chatListLoading = chatVendor ? listModelsLoadingId === chatVendor.id : false

  return (
    <SettingsWindowFrame>
      <div className="settings-root flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {showSetupBanner && (
          <div className="settings-setup-banner shrink-0">
            <p>
              First run: open <strong className="font-semibold text-white">AI Providers</strong>, add your API key and model, then launch.
            </p>
          </div>
        )}

        {settingsToast ? (
          <div className="settings-toast shrink-0" role="status">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-zinc-100">{settingsToast.message}</p>
              {settingsToast.detail ? (
                <p className="mt-1 truncate font-mono text-[10px] text-zinc-500">{settingsToast.detail}</p>
              ) : null}
            </div>
            {settingsToast.action === 'open-log' ? (
              <button
                type="button"
                className="settings-toast-action shrink-0"
                onClick={() => void openDebugLogFile()}
              >
                Open
              </button>
            ) : null}
            <button
              type="button"
              className="settings-toast-dismiss shrink-0"
              onClick={() => setSettingsToast(null)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ) : null}

        <div className="settings-flex-body flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <SettingsNav activeTab={activeTab} onSelectTab={selectSettingsTab} />

          <main className="settings-scroll-outer px-6 pt-6">
          {!snap ? (
            <SettingsLoadingSkeleton />
          ) : (
          <SettingsTabContent
            activeTab={normalizeSettingsTabId(activeTab)}
            onSelectTab={selectSettingsTab}
            onSelectIntelligenceTab={selectIntelligenceTab}
            advanceOpenSection={advanceOpenSection}
            snap={snap}
            providerMeta={providerMeta}
            provider={provider}
            onSelectProvider={selectChatProvider}
            keySetMap={keySetMap}
            secretByProvider={secretByProvider}
            setSecretByProvider={setSecretByProvider}
            onSaveKey={saveKey}
            chatVendor={chatVendor}
            chatKf={chatKf}
            chatKeySaved={chatKeySaved}
            chatMf={chatMf}
            chatModel={chatModel}
            onPatchSnap={patchSnap}
            onSave={save}
            chatOpts={chatOpts}
            onSyncModels={syncRemoteModelsFor}
            chatListLoading={chatListLoading}
            chatListErr={chatListErr}
            modelCatalog={modelCatalog}
            chatTest={chatTest}
            chatTesting={chatTesting}
            onTestConnection={testApiFor}
            answerStructureUi={answerStructureUi}
            onAnswerStructureChange={applyAnswerStructure}
            responseFormatUi={responseFormatUi}
            onResponseFormatChange={applyResponseFormat}
            answerLengthUi={answerLengthUi}
            onAnswerLengthChange={applyAnswerLength}
            aiResponseLanguageUi={aiResponseLanguageUi}
            onAiResponseLanguageChange={applyAiResponseLanguage}
            interviewCustomInstructionsUi={interviewCustomInstructionsUi}
            onInterviewCustomInstructionsChange={onInterviewCustomInstructionsChange}
            onInterviewCustomInstructionsBlur={onInterviewCustomInstructionsBlur}
            conversationFollowUpsEnabled={conversationFollowUpsEnabled}
            onConversationFollowUpsChange={applyConversationFollowUps}
            showSetupBanner={showSetupBanner}
            onLaunchFromSetup={launchFromSetup}
            audioEnabled={audioEnabled}
            onAudioEnabledChange={(v) => { setAudioEnabled(v); save('audioEnabled', v) }}
            micSensitivity={micSensitivity}
            onMicSensitivityChange={async (v) => {
              setMicSensitivity(v)
              await save('micSensitivity', v)
              await ipc?.invoke('apply-overlay-display', { micSensitivity: v })
            }}
            sttModeUi={sttModeUi}
            onSttModeChange={(id) => { setSttModeUi(id); save('sttMode', id) }}
            sttCapableMeta={sttCapableMeta}
            sttProvider={sttProvider}
            onSttProviderChange={(id) => {
              setSttProvider(id)
              save('sttProvider', id)
              const needsCloud = ['deepgram', 'elevenlabs', 'azure', 'google', 'soniox', 'nvidia'].includes(id)
              if (needsCloud && sttModeUi !== 'cloud') {
                setSttModeUi('cloud')
                save('sttMode', 'cloud')
              }
            }}
            currentSttMeta={currentSttMeta}
            sttKeyField={sttKeyField}
            sttKeySaved={sttKeySaved}
            sttSecretInput={sttSecretInput}
            onSttSecretInputChange={setSttSecretInput}
            onSaveSttKey={() => { if (sttKeyField && sttSecretInput.trim()) { saveKey(sttKeyField, sttSecretInput); setSttSecretInput('') } }}
            meetingListenLanguageUi={meetingListenLanguageUi}
            onMeetingListenLanguageChange={applyMeetingListenLanguage}
            overlayOpacityUi={overlayOpacityUi}
            onOverlayOpacityChange={applyOverlayOpacity}
            onOpacityPreset={applyOpacityPreset}
            overlayFontUi={overlayFontUi}
            onOverlayFontChange={applyOverlayFont}
            overlayTeleprompterUi={overlayTeleprompterUi}
            onTeleprompterChange={applyOverlayTeleprompter}
            overlayFocusModeUi={overlayFocusModeUi}
            onFocusModeChange={applyOverlayFocusMode}
            overlayAnswerViewUi={overlayAnswerViewUi}
            onAnswerViewChange={applyOverlayAnswerView}
            overlayLiveTranscriptUi={overlayLiveTranscriptUi}
            onLiveTranscriptChange={applyLiveTranscriptPanel}
            overlayTranscriptAutoScrollUi={overlayTranscriptAutoScrollUi}
            onTranscriptAutoScrollChange={applyTranscriptAutoScroll}
            overlayAnswerPinToTopUi={overlayAnswerPinToTopUi}
            onAnswerPinToTopChange={applyAnswerPinToTop}
            assistAutoTriggerUi={assistAutoTriggerUi}
            onAssistAutoTriggerChange={applyAssistAutoTrigger}
            questionDetectionUi={questionDetectionUi}
            onQuestionDetectionChange={applyQuestionDetection}
            overlayAnswerAutoScrollUi={overlayAnswerAutoScrollUi}
            onOverlayAnswerAutoScrollChange={applyOverlayAnswerAutoScroll}
            openAtLoginUi={openAtLoginUi}
            onOpenAtLoginChange={applyOpenAtLogin}
            uiColorSchemeUi={uiColorSchemeUi}
            onUiColorSchemeChange={applyUiColorScheme}
            overlayMousePassthroughUi={overlayMousePassthroughUi}
            onOverlayMousePassthroughChange={applyOverlayMousePassthrough}
            hideFromTaskbarUi={hideFromTaskbarUi}
            onHideFromTaskbarChange={applyHideFromTaskbar}
            uiAccentThemeUi={uiAccentThemeUi}
            onUiAccentThemeChange={applyUiAccentTheme}
            doNotSaveMeetingsEnabled={doNotSaveMeetingsEnabled}
            onDoNotSaveMeetingsChange={applyDoNotSaveMeetings}
            verboseDebugLogging={verboseDebugLogging}
            onVerboseDebugLoggingChange={applyVerboseDebugLogging}
            onOpenLogFile={() => void openDebugLogFile()}
            stealthModeUi={stealthModeUi}
            onStealthModeChange={applyStealthMode}
            overlayW={overlayW}
            overlayH={overlayH}
            onOverlayWChange={setOverlayW}
            onOverlayHChange={setOverlayH}
            onApplyOverlaySize={applyOverlaySize}
            onSnapOverlayPreset={snapOverlayToPreset}
            hotkeysMap={hotkeysMap}
            onHotkeyChange={(action, v) => setHotkeysMap((m) => ({ ...m, [action]: v }))}
            onHotkeyCommit={commitHotkey}
            onResetOneHotkey={resetOneHotkey}
            onResetAllHotkeys={resetAllHotkeys}
            googleCalendarConnectedEmail={googleCalendarConnectedEmail}
            googleCalendarOAuthReady={googleCalendarOAuthReady}
            googleCalendarUsingEmbeddedOAuth={googleCalendarUsingEmbeddedOAuth}
            googleCalendarClientId={googleCalendarClientId}
            googleCalendarClientSecret={googleCalendarClientSecret}
            onGoogleCalendarClientIdChange={setGoogleCalendarClientId}
            onGoogleCalendarClientSecretChange={setGoogleCalendarClientSecret}
            onSaveGoogleCalendarOAuth={saveGoogleCalendarOAuth}
            calendarConnectBusy={calendarConnectBusy}
            calendarErr={calendarErr}
            onConnectGoogleCalendar={connectGoogleCalendar}
            onCancelGoogleCalendarConnect={cancelGoogleCalendarConnect}
            onDisconnectGoogleCalendar={disconnectGoogleCalendar}
            onRefreshCalendarMeetings={refreshCalendarMeetings}
            calendarEventsLoading={calendarEventsLoading}
            calendarRemindersEnabled={calendarRemindersEnabled}
            onCalendarRemindersEnabledChange={(v) => { setCalendarRemindersEnabled(v); save('calendarRemindersEnabled', v) }}
            calendarReminderMinutes={calendarReminderMinutes}
            onCalendarReminderMinutesChange={(v) => { setCalendarReminderMinutes(v); save('calendarReminderMinutes', v) }}
            meetingForegroundDetectionEnabled={meetingForegroundDetectionEnabled}
            onMeetingForegroundDetectionChange={(v) => { setMeetingForegroundDetectionEnabled(v); save('meetingForegroundDetectionEnabled', v) }}
            intelligenceFlags={intelligenceFlagsMeta.flags}
            advancedGroupOrder={intelligenceFlagsMeta.advancedGroupOrder}
            hindsightApiUrl={hindsightApiUrl}
            onHindsightApiUrlChange={setHindsightApiUrl}
            onHindsightApiUrlBlur={() => save('hindsightApiUrl', hindsightApiUrl.trim())}
            hindsightApiKey={hindsightApiKey}
            onHindsightApiKeyChange={setHindsightApiKey}
            onSaveHindsightApiKey={() => {
              if (hindsightApiKey.trim() && hindsightApiKey !== '••••••••') {
                saveKey('hindsightApiKey', hindsightApiKey)
                setHindsightApiKey('••••••••')
              }
            }}
            hindsightKeySaved={!!keySetMap.hindsightApiKey}
            onHindsightAutoStartChange={applyHindsightAutoStart}
            phoneLinkEnabled={snap?.phoneLinkEnabled === true}
            onPhoneLinkEnabledChange={applyPhoneLinkEnabled}
            phoneLinkRemoteMicEnabled={snap?.phoneLinkRemoteMicEnabled === true}
            onPhoneLinkRemoteMicChange={applyPhoneLinkRemoteMic}
            phoneMirrorDeviceId={String(snap?.phoneMirrorDeviceId || '')}
            onPhoneMirrorDeviceIdChange={applyPhoneMirrorDeviceId}
            phoneMirrorMaxSize={
              Number.isFinite(Number(snap?.phoneMirrorMaxSize)) ? Number(snap.phoneMirrorMaxSize) : 1080
            }
            onPhoneMirrorMaxSizeChange={applyPhoneMirrorMaxSize}
            phoneMirrorIncludeInAsk={snap?.phoneMirrorIncludeInAsk === true}
            onPhoneMirrorIncludeInAskChange={applyPhoneMirrorIncludeInAsk}
            calendarMeetings={calendarMeetings}
            availableDateKeys={availableDateKeys}
            effectiveDateKey={effectiveDateKey}
            selectedCalendarDate={selectedCalendarDate}
            onSelectedCalendarDateChange={setSelectedCalendarDate}
            meetingsForSelectedDate={meetingsForSelectedDate}
            meetingSessions={meetingSessions}
            expandedMeetingId={expandedMeetingId}
            onExpandedMeetingIdChange={setExpandedMeetingId}
            onMeetingSessionsChange={setMeetingSessions}
            followUpDraftEnabled={snap?.followUpDraftEnabled === true}
            onFollowUpDraftEnabledChange={(v) => { patchSnap('followUpDraftEnabled', !!v); save('followUpDraftEnabled', !!v) }}
            logoSrc={brandLogo}
            appVersion={appVersion}
            profilePanel={{
              contextPrompts,
              activeContextPromptId,
              activePrompt,
              draftName,
              draftContent,
              draftNotesSections,
              onDraftNotesSectionsChange: setDraftNotesSections,
              contextIndexing,
              uploadBusy,
              showTemplates: showModeTemplates,
              resumeContext,
              jdContext,
              resumeSourceName,
              profileDocBusy,
              onDraftNameChange: setDraftName,
              onDraftContentChange: setDraftContent,
              onSelectPrompt: selectContextPrompt,
              onAddEmptyMode: addContextPrompt,
              onAddFromTemplate: addModeFromTemplate,
              onDeletePrompt: deletePromptById,
              onSavePrompt: saveActivePrompt,
              onUploadFile: uploadReferenceFile,
              onRemoveFile: removeReferenceFile,
              onToggleTemplates: () => setShowModeTemplates((v) => !v),
              onResumeChange,
              onResumeBlur: () => {
                if (resumeSaveTimerRef.current) {
                  clearTimeout(resumeSaveTimerRef.current)
                  resumeSaveTimerRef.current = null
                }
                void saveResumeContext(resumeContextRef.current, resumeSourceNameRef.current)
              },
              onJdChange,
              onJdBlur: () => {
                if (jdSaveTimerRef.current) {
                  clearTimeout(jdSaveTimerRef.current)
                  jdSaveTimerRef.current = null
                }
                void saveJdContext(jdContextRef.current)
              },
              onUploadResume: () => void uploadProfileDoc('resume'),
              onUploadJd: () => void uploadProfileDoc('jd'),
              onClearResume: () => void saveResumeContext('', ''),
              onClearJd: () => void saveJdContext(''),
              profileSaveStatus,
            }}
          />
          )}
        </main>
      </div>
      </div>
    </SettingsWindowFrame>
  )
}
