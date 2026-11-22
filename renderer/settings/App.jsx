// Copyright (c) 2026 VeilAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { createIpcShim } from '../shared/ipcShim'
import SettingsTabContent from './SettingsTabContent'
import { SettingsNav, normalizeSettingsTabId, parseSettingsQuery } from './settingsNav.jsx'
import { DEFAULT_HOTKEYS_MAP, HOTKEY_DEFS, OVERLAY_OPACITY_RANGE, OVERLAY_SIZE_LIMITS } from './settingsConstants'
import { describeAccelerator } from './hotkeyUtils'
import { trackSave } from './saveTracker'
import { emitSettingsToast, onSettingsToast } from './settingsToast'
import { focusSettingsAnchor } from './settingsFocus'
import { toDateKey, friendlyCalendarError } from './settingsFormatters'
import SettingsWindowFrame from './SettingsWindowFrame'
import { SettingsLoadingSkeleton } from './SettingsComponents'
import brandLogo from '../shared/brandLogo'
import { applyColorScheme, watchSystemColorScheme } from '../shared/colorScheme'

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

// Every store write goes through trackSave, which raises an error toast if the write fails (there is no
// "saved" indicator — settings apply immediately). It returns the original promise, so callers keep their
// own await / .then behaviour.
const save = (k, v) => trackSave(ipc?.invoke('set-store', k, v), k)

const CALENDAR_CACHE_MS = 5 * 60 * 1000

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
  // Which row to scroll to / focus after a tab change (deep link or search result). nonce re-triggers it.
  const [focusTarget, setFocusTarget] = useState(() => ({ section: settingsQuery.section, nonce: 0 }))
  const mainRef = useRef(null)
  const firstFocusPassRef = useRef(true)
  const calendarCacheRef = useRef({ statusAt: 0, status: null, meetingsAt: 0 })
  const toastTimerRef = useRef(null)
  const [hotkeyFailures, setHotkeyFailures] = useState({})
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
  const [resumeLibrary, setResumeLibrary] = useState([])
  const [activeResumeId, setActiveResumeId] = useState('')
  const [resumeBusy, setResumeBusy] = useState(false)
  const [resumeError, setResumeError] = useState('')
  const [meetingPrompt, setMeetingPrompt] = useState('')
  const [meetingDocuments, setMeetingDocuments] = useState([])
  const [activeMeetingDocumentId, setActiveMeetingDocumentId] = useState('')
  const [generalPurposes, setGeneralPurposes] = useState([])
  const [activeGeneralPurposeId, setActiveGeneralPurposeId] = useState('')
  const [documentBusy, setDocumentBusy] = useState(false)
  const [documentError, setDocumentError] = useState('')
  const [resumeContext, setResumeContext] = useState('')
  const [jdContext, setJdContext] = useState('')
  const [resumeSourceName, setResumeSourceName] = useState('')
  const [profileDocBusy, setProfileDocBusy] = useState(null)
  const resumeContextRef = useRef('')
  const jdContextRef = useRef('')
  const resumeSourceNameRef = useRef('')
  const resumeSaveTimerRef = useRef(null)
  const jdSaveTimerRef = useRef(null)
  const customInstructionsSaveTimerRef = useRef(null)
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

  const [overlayOpacityUi, setOverlayOpacityUi] = useState(0.5)
  const [overlayFontUi, setOverlayFontUi] = useState('medium')
  const [answerStructureUi, setAnswerStructureUi] = useState('star')
  const [responseFormatUi, setResponseFormatUi] = useState('bullets')
  const [answerLengthUi, setAnswerLengthUi] = useState('medium')
  const [meetingListenLanguageUi, setMeetingListenLanguageUi] = useState('en')
  const [aiResponseLanguageUi, setAiResponseLanguageUi] = useState('')
  const [interviewCustomInstructionsUi, setInterviewCustomInstructionsUi] = useState('')
  const [transcriptDurationSeconds, setTranscriptDurationSeconds] = useState(30)
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
  const [openAtLoginUi, setOpenAtLoginUi] = useState(false)
  const [doNotSaveMeetingsEnabled, setDoNotSaveMeetingsEnabled] = useState(false)
  const [overlayTranscriptAutoScrollUi, setOverlayTranscriptAutoScrollUi] = useState(true)
  const [overlayLiveTranscriptUi, setOverlayLiveTranscriptUi] = useState(true)
  const [overlayAnswerPinToTopUi, setOverlayAnswerPinToTopUi] = useState(true)
  const [overlayMousePassthroughUi, setOverlayMousePassthroughUi] = useState(false)
  const [hideFromTaskbarUi, setHideFromTaskbarUi] = useState(false)
  // null = "preference not loaded yet". The inline theme-init.js <head> script already
  // applied the correct data-color-scheme for first paint (main resolved it from the same
  // store, synchronously, before this window was even shown) — leave it untouched until the
  // real preference arrives from get-all-settings, so this effect never overwrites a correct
  // first paint with a guess (that guess-then-correct sequence was the settings-window flash).
  const [uiColorSchemeUi, setUiColorSchemeUi] = useState(null)
  const [settingsToast, setSettingsToast] = useState(null)
  const [profileSaveStatus, setProfileSaveStatus] = useState('idle')

  const showToast = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') return
    setSettingsToast(payload)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    const ms = Number(payload.durationMs) || (payload.tone === 'error' ? 10000 : payload.tone === 'success' ? 4000 : 8000)
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null
      setSettingsToast((cur) => (cur === payload ? null : cur))
    }, ms)
  }, [])

  useEffect(() => {
    if (uiColorSchemeUi == null) return undefined
    const pref = uiColorSchemeUi === 'light' || uiColorSchemeUi === 'dark' ? uiColorSchemeUi : 'system'
    if (pref !== 'system') {
      applyColorScheme(pref)
      return undefined
    }
    applyColorScheme(window.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark')
    return watchSystemColorScheme(pref, applyColorScheme)
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

  const applyCalendarStatus = (status) => {
    setGoogleCalendarConnectedEmail(status?.connectedEmail || '')
    setGoogleCalendarOAuthReady(status?.oauthReady === true)
    setGoogleCalendarUsingEmbeddedOAuth(status?.usingEmbeddedOAuth === true)
  }

  /**
   * Loads calendar status and upcoming meetings. Results are cached for a few minutes, so revisiting the
   * Meetings tab does not hit Google again; pass { force: true } (Refresh button, connect, disconnect) to bypass.
   */
  const refreshCalendarMeetings = async (opts) => {
    if (!ipc) return
    const force = opts?.force === true
    const cache = calendarCacheRef.current
    const fresh = (at) => !force && at > 0 && Date.now() - at < CALENDAR_CACHE_MS
    if (fresh(cache.statusAt) && (!cache.status?.connected || fresh(cache.meetingsAt))) return
    setCalendarErr('')
    setCalendarEventsLoading(true)
    try {
      let status = fresh(cache.statusAt) ? cache.status : null
      if (!status) {
        status = await ipc.invoke('google-calendar:get-status')
        cache.status = status
        cache.statusAt = Date.now()
      }
      applyCalendarStatus(status)
      if (!status?.connected) {
        setCalendarMeetings([])
        return
      }
      const res = await ipc.invoke('google-calendar:list-upcoming')
      if (!res?.ok) throw new Error(res?.error || 'Could not load meetings')
      const meetings = Array.isArray(res.meetings) ? res.meetings : []
      cache.meetingsAt = Date.now()
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
          throw new Error('Google Calendar is not set up in this build. Open Developer setup below and add your OAuth credentials.')
        }
        await save('googleCalendarClientId', id)
        await save('googleCalendarClientSecret', secret)
      }
      const res = await ipc.invoke('google-calendar:connect')
      setGoogleCalendarConnectedEmail(res?.connectedEmail || '')
      setGoogleCalendarOAuthReady(true)
      setGoogleCalendarClientSecret('••••••••')
      await refreshCalendarMeetings({ force: true })
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
      calendarCacheRef.current = { statusAt: 0, status: null, meetingsAt: 0 }
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
    // One batch: the three non-critical lookups swallow their own errors so they can never block the window.
    Promise.all([
      ipc.invoke('get-all-settings'),
      ipc.invoke('get-provider-metadata'),
      ipc.invoke('get-stt-provider-metadata'),
      ipc.invoke('get-hotkeys'),
      ipc.invoke('get-chat-model-catalog').catch(() => null),
      ipc.invoke('get-stt-policy').catch(() => null),
      ipc.invoke('get-app-info').catch(() => null),
    ])
      .then(([s, meta, sttMeta, hk, cat, pol, info]) => {
        setModelCatalog(cat && typeof cat === 'object' ? cat : {})
        setSttPolicy(pol)
        if (info?.version) setAppVersion(String(info.version))
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
        setOpenAtLoginUi(s.openAtLogin === true)
        setDoNotSaveMeetingsEnabled(s.doNotSaveMeetingsEnabled === true)
        setOverlayTranscriptAutoScrollUi(s.overlayTranscriptAutoScroll !== false)
        setOverlayLiveTranscriptUi(s.overlayLiveTranscriptEnabled !== false)
        setOverlayAnswerPinToTopUi(s.overlayAnswerPinToTop !== false)
        setOverlayMousePassthroughUi(s.overlayMousePassthroughEnabled === true)
        setHideFromTaskbarUi(s.hideFromTaskbarEnabled === true)
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
        setResumeLibrary(Array.isArray(s.resumeLibrary) ? s.resumeLibrary : [])
        setActiveResumeId(String(s.activeResumeId || ''))
        setMeetingPrompt(String(s.meetingPrompt || ''))
        setMeetingDocuments(Array.isArray(s.meetingDocuments) ? s.meetingDocuments : [])
        setActiveMeetingDocumentId(String(s.activeMeetingDocumentId || ''))
        setGeneralPurposes(Array.isArray(s.generalPurposes) ? s.generalPurposes : [])
        setActiveGeneralPurposeId(String(s.activeGeneralPurposeId || ''))
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
        setOverlayOpacityUi(typeof s.overlayOpacity === 'number' ? s.overlayOpacity : 0.5)
        setOverlayFontUi(s.overlayFontSize || 'medium')
        setAnswerStructureUi(s.answerStructure === 'car' || s.answerStructure === 'soar' || s.answerStructure === 'par' || s.answerStructure === 'soara' ? s.answerStructure : 'star')
        setResponseFormatUi(s.responseFormat === 'conversational' || s.responseFormat === 'example' ? s.responseFormat : 'bullets')
        setAnswerLengthUi(s.answerLength === 'short' || s.answerLength === 'long' ? s.answerLength : 'medium')
        setMeetingListenLanguageUi(String(s.meetingListenLanguage || s.micListenLanguage || 'en'))
        setAiResponseLanguageUi(String(s.aiResponseLanguage || ''))
        setInterviewCustomInstructionsUi(String(s.interviewCustomInstructions || ''))
        setTranscriptDurationSeconds([30, 60, 120, 180].includes(Number(s.transcriptDurationSeconds)) ? Number(s.transcriptDurationSeconds) : 30)
        setOverlayAnswerViewUi(s.overlayAnswerView === 'history' ? 'history' : 'latest')
        setOverlayTeleprompterUi(s.overlayTeleprompter === true)
        setOverlayFocusModeUi(s.overlayFocusMode === true)
        setOverlayW(ob.width || 480)
        // A saved height at or under the collapsed notch is a leftover of an old bug; show the real default.
        setOverlayH(ob.height > 48 ? Math.max(OVERLAY_SIZE_LIMITS.minH, ob.height) : 580)
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

  const selectSettingsTab = useCallback((tabId, section = '') => {
    const nextSection = String(section || '').trim().toLowerCase()
    setActiveTab(normalizeSettingsTabId(tabId, nextSection))
    setFocusTarget({ section: nextSection, nonce: Date.now() })
  }, [])

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
    if (isFirstRunWindow) setActiveTab('ai')
  }, [isFirstRunWindow])

  useEffect(() => {
    if (!ipc) return
    const onStealth = (_, v) => setStealthModeUi(!!v)
    const unsubStealth = ipc.on('stealth-mode-update', onStealth)
    // Main reports changes made outside this window (Ctrl+Shift+P, dragging the overlay's edge) so the open page
    // never shows a stale toggle or size.
    const unsubDisplay = ipc.on('overlay-display-update', (_, p) => {
      if (!p || typeof p !== 'object') return
      if (typeof p.overlayMousePassthroughEnabled === 'boolean') {
        setOverlayMousePassthroughUi(p.overlayMousePassthroughEnabled)
        patchSnap('overlayMousePassthroughEnabled', p.overlayMousePassthroughEnabled)
      }
      const b = p.overlayBounds
      if (b && Number.isFinite(b.width) && b.height > 48) {
        setOverlayW(Math.round(b.width))
        setOverlayH(Math.round(b.height))
        setSnap((s) => (s ? { ...s, overlayBounds: { ...(s.overlayBounds || {}), width: b.width, height: b.height } } : s))
      }
    })
    // ipcShim listeners receive (event, ...args) — payload is the second argument.
    // ipcShim listeners receive (event, ...args): the payload is the SECOND argument. (Verified against
    // preload.js `on` + ipcShim `on` + main's sendToSettingsWindow('settings-toast', payload).)
    const unsubToast = ipc.on('settings-toast', (_, payload) => showToast(payload))
    return () => {
      unsubStealth?.()
      unsubDisplay?.()
      unsubToast?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showToast is stable
  }, [])

  // In-window feedback (save errors, export results, resets) shares the same toast.
  useEffect(() => {
    const off = onSettingsToast(showToast)
    return () => {
      off()
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showToast is stable
  }, [])

  useEffect(() => {
    if (isFirstRunWindow && snap && !hasCompletedOnboarding) {
      setActiveTab('ai')
    }
  }, [isFirstRunWindow, snap, hasCompletedOnboarding])

  const showSetupBanner = isFirstRunWindow && !hasCompletedOnboarding

  const activeTabId = normalizeSettingsTabId(activeTab)

  // After a tab change: scroll to the requested row (search / deep link) or to the top and move focus to the
  // page heading, so keyboard and screen-reader users land on the new page instead of the old nav button.
  useEffect(() => {
    if (!snap) return undefined
    const root = mainRef.current
    if (!root) return undefined
    const initialPass = firstFocusPassRef.current
    firstFocusPassRef.current = false
    const section = focusTarget.section
    let tries = 0
    let raf = 0
    const attempt = () => {
      // Lazy tabs (Meetings, Phone) mount a frame or two later.
      if (!root.querySelector('[data-settings-page]')) {
        if (tries++ < 40) raf = requestAnimationFrame(attempt)
        return
      }
      if (section && focusSettingsAnchor(root, section)) return
      root.scrollTop = 0
      if (!initialPass) root.querySelector('.settings-page-title')?.focus({ preventScroll: true })
    }
    raf = requestAnimationFrame(attempt)
    return () => cancelAnimationFrame(raf)
  }, [activeTabId, focusTarget, !!snap])

  // Shortcuts tab: surface shortcuts that are saved but not actually registered with Windows.
  useEffect(() => {
    if (!ipc || activeTabId !== 'keybinds') return undefined
    let cancelled = false
    ipc
      .invoke('hotkeys:status')
      .then((status) => {
        if (cancelled) return
        const failures = {}
        for (const [action, reg] of Object.entries(status?.registration || {})) {
          if (reg && reg.ok === false && reg.error !== 'suspended') failures[action] = reg.error || 'not registered'
        }
        setHotkeyFailures(failures)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeTabId, hotkeysMap])

  /**
   * Saves an API key. Resolves true only after the store write succeeded (the field clears and the
   * "Saved" badge appears then, not before); false on an empty key or a failed write (the save error
   * itself is already surfaced by the tracked `save`).
   */
  const saveKey = async (storeKey, val, providerId) => {
    const key = String(val || '').trim()
    if (!key) return false
    try {
      await save(storeKey, key)
    } catch {
      return false
    }
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
    return true
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
    try {
      // Main process resolves persisted keys when the renderer passes an empty string.
      const r = await ipc.invoke('test-api', pId, localKey)
      setTestByProvider((t) => ({
        ...t,
        [pId]: r && typeof r === 'object' ? r : { success: false, error: 'The test returned no result. Try again.' },
      }))
    } catch (e) {
      setTestByProvider((t) => ({
        ...t,
        [pId]: { success: false, error: e?.message || 'The connection test failed. Try again.' },
      }))
    } finally {
      setTestingProvider((cur) => (cur === pId ? null : cur))
    }
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
    if (ipc) {
      try {
        await ipc.invoke('resume-profile:parse', { text: v })
      } catch (e) {
        console.warn('[profile] resume parse:', e?.message || e)
      }
    }
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

  const saveResumeLibrary = (next, activeId = activeResumeId) => {
    setResumeLibrary(next)
    const stillSelected = next.some((resume) => resume.id === activeId)
    const nextActive = stillSelected ? activeId : next[0]?.id || ''
    setActiveResumeId(nextActive)
    void save('resumeLibrary', next)
    if (nextActive !== activeId) void save('activeResumeId', nextActive)
  }

  const parseInterviewResumePath = async (filePath, sourceName) => {
    setResumeBusy(true)
    setResumeError('')
    try {
      const result = await ipc.invoke('resume-profile:parse', {
        filePath,
        sourceName: sourceName || basename(filePath),
      })
      if (!result?.ok) {
        setResumeError(result?.error || 'Could not extract that resume.')
        return
      }
      setResumeLibrary(Array.isArray(result.library) ? result.library : [])
      setActiveResumeId(String(result.activeResumeId || ''))
    } catch (e) {
      console.error('[profile] resume upload:', e)
      setResumeError(e?.message || 'Upload failed.')
    } finally {
      setResumeBusy(false)
    }
  }

  const uploadInterviewResume = async () => {
    if (!ipc) return
    setResumeError('')
    const { canceled, filePaths } = await ipc.invoke('show-open-dialog', {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['pdf', 'txt', 'md'] }],
    })
    if (canceled || !filePaths?.[0]) return
    await parseInterviewResumePath(filePaths[0], basename(filePaths[0]))
  }

  const parseModeDocumentPath = async (filePath, sourceName, kind, purposeId) => {
    setDocumentBusy(true)
    setDocumentError('')
    try {
      const result = await ipc.invoke('mode-document:parse', {
        filePath,
        sourceName: sourceName || basename(filePath),
        kind,
        purposeId,
      })
      if (!result?.ok) {
        setDocumentError(result?.error || 'Could not structure that document.')
        return
      }
      if (kind === 'meeting') {
        setMeetingDocuments(Array.isArray(result.documents) ? result.documents : [])
        setActiveMeetingDocumentId(String(result.activeId || ''))
      } else {
        setGeneralPurposes(Array.isArray(result.purposes) ? result.purposes : [])
        setActiveGeneralPurposeId(String(result.activeId || ''))
      }
    } catch (e) {
      console.error('[profile] document upload:', e)
      setDocumentError(e?.message || 'Upload failed.')
    } finally {
      setDocumentBusy(false)
    }
  }

  const uploadModeDocument = async (kind, purposeId) => {
    if (!ipc) return
    setDocumentError('')
    const { canceled, filePaths } = await ipc.invoke('show-open-dialog', {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['pdf', 'txt', 'md'] }],
    })
    if (canceled || !filePaths?.[0]) return
    await parseModeDocumentPath(filePaths[0], basename(filePaths[0]), kind, purposeId)
  }

  const saveMeetingDocuments = async (next, activeId = activeMeetingDocumentId) => {
    setMeetingDocuments(next)
    const nextActive = next.some((doc) => doc.id === activeId) ? activeId : ''
    setActiveMeetingDocumentId(nextActive)
    await save('meetingDocuments', next)
    if (nextActive !== activeId) await save('activeMeetingDocumentId', nextActive)
  }

  const saveGeneralPurposes = async (next, activeId = activeGeneralPurposeId) => {
    setGeneralPurposes(next)
    const nextActive = next.some((purpose) => purpose.id === activeId) ? activeId : ''
    setActiveGeneralPurposeId(nextActive)
    await save('generalPurposes', next)
    if (nextActive !== activeId) await save('activeGeneralPurposeId', nextActive)
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
        showToast({ tone: 'error', message: 'Could not read that file', detail: 'It is empty or not a supported document.' })
        return
      }
      if (kind === 'resume') {
        await saveResumeContext(text, basename(filePaths[0]))
      } else {
        await saveJdContext(text)
      }
    } catch (e) {
      console.error('[profile] doc upload:', e)
      showToast({ tone: 'error', message: 'Upload failed', detail: String(e?.message || e) })
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
        showToast({ tone: 'error', message: 'Could not read that file', detail: 'It is empty or not a supported document.' })
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
      showToast({ tone: 'error', message: 'Upload failed', detail: String(e?.message || e) })
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

  // The list-remote-models call goes to the vendor over HTTP, so it only runs while the AI Provider tab is
  // open, and only once per provider per session (Sync models / saving a key still refresh it on demand).
  useEffect(() => {
    if (activeTabId !== 'ai' || !snap || !providerMeta.length) return
    const meta = providerMeta.find((p) => p.id === provider)
    if (!(meta?.keyField && keySetMap[meta.keyField])) return
    if (modelListSourceByProvider[provider]) return
    void syncRemoteModelsFor(provider)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate model list when the tab / provider / key is ready
  }, [activeTabId, snap, provider, providerMeta.length, keySetMap])

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
    const v = Math.min(OVERLAY_OPACITY_RANGE.max, Math.max(OVERLAY_OPACITY_RANGE.min, Number(raw)))
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
    // Response Format → Ask prompt only (InterviewMan). Panel always renders markdown.
    await ipc?.invoke('apply-overlay-display', { responseFormat: next })
  }

  const applyAnswerLength = async (v) => {
    const next = v === 'short' || v === 'long' ? v : 'medium'
    setAnswerLengthUi(next)
    patchSnap('answerLength', next)
    await save('answerLength', next)
    // Answer Length → prompt/tokens only. Font Size is a separate Overlay control (InterviewMan).
    await ipc?.invoke('apply-overlay-display', { answerLength: next })
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

  const applyInterviewCustomInstructions = async (raw) => {
    const source = raw !== undefined ? raw : interviewCustomInstructionsUi
    const text = String(source || '').trim().slice(0, 2000)
    setInterviewCustomInstructionsUi(text)
    patchSnap('interviewCustomInstructions', text)
    await save('interviewCustomInstructions', text)
  }

  // Persist while typing (debounced). Blur-only save missed Ask if the user never left the field.
  const onInterviewCustomInstructionsChange = (v) => {
    const text = String(v || '').slice(0, 2000)
    setInterviewCustomInstructionsUi(text)
    if (customInstructionsSaveTimerRef.current) clearTimeout(customInstructionsSaveTimerRef.current)
    customInstructionsSaveTimerRef.current = setTimeout(() => {
      customInstructionsSaveTimerRef.current = null
      void applyInterviewCustomInstructions(text)
    }, 350)
  }

  const onInterviewCustomInstructionsBlur = () => {
    if (customInstructionsSaveTimerRef.current) {
      clearTimeout(customInstructionsSaveTimerRef.current)
      customInstructionsSaveTimerRef.current = null
    }
    void applyInterviewCustomInstructions()
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

  const applyUiColorScheme = async (id) => {
    const next = id === 'light' || id === 'dark' ? id : 'system'
    setUiColorSchemeUi(next)
    patchSnap('uiColorScheme', next)
    await save('uiColorScheme', next)
  }

  const applyTranscriptDuration = async (seconds) => {
    const next = [30, 60, 120, 180].includes(Number(seconds)) ? Number(seconds) : 30
    setTranscriptDurationSeconds(next)
    patchSnap('transcriptDurationSeconds', next)
    await save('transcriptDurationSeconds', next)
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

  const applyOpacityPreset = async (pct) => {
    const v = Math.min(OVERLAY_OPACITY_RANGE.max, Math.max(OVERLAY_OPACITY_RANGE.min, pct / 100))
    await applyOverlayOpacity(v)
  }

  const applyOverlaySize = async (wArg, hArg) => {
    const { minW, maxW, minH, maxH } = OVERLAY_SIZE_LIMITS
    const wIn = typeof wArg === 'number' && Number.isFinite(wArg) ? wArg : overlayW
    const hIn = typeof hArg === 'number' && Number.isFinite(hArg) ? hArg : overlayH
    const w = Math.min(maxW, Math.max(minW, Math.round(wIn)))
    const h = Math.min(maxH, Math.max(minH, Math.round(hIn)))
    setOverlayW(w)
    setOverlayH(h)
    const prev = snap?.overlayBounds || {}
    patchSnap('overlayBounds', { ...prev, width: w, height: h })
    // Main persists the size itself, merged into the CURRENT bounds. Saving this snapshot too would write back the
    // x/y Settings read when it opened, undoing any move made since (nudge, drag, snap).
    await ipc?.invoke('apply-overlay-display', { width: w, height: h })
  }

  const snapOverlayToPreset = async (preset) => {
    if (!ipc) return
    await ipc.invoke('set-overlay-position-preset', preset)
    const b = await ipc.invoke('get-window-bounds')
    if (b) {
      // The live window is usually the collapsed notch (~43px): never show that as the panel height.
      const expandedH = b.height > 48 ? b.height : snap?.overlayBounds?.height > 48 ? snap.overlayBounds.height : overlayH
      patchSnap('overlayBounds', { ...b, height: expandedH })
      setOverlayW(b.width)
      setOverlayH(expandedH)
    }
  }

  /** Registration state main reports for one action, or null when it is registered (or unknown). */
  const hotkeyRegistrationFailure = async (action) => {
    try {
      const status = await ipc.invoke('hotkeys:status')
      const reg = status?.registration?.[action]
      if (reg && reg.ok === false && reg.error !== 'suspended') return reg
    } catch {
      /* status is advisory */
    }
    return null
  }

  /** @returns {Promise<{ ok: true } | { ok: false, error: string }>} */
  const commitHotkey = async (action, raw) => {
    if (!ipc) return { ok: false, error: 'Shortcuts are not available right now.' }
    const fallback = DEFAULT_HOTKEYS_MAP[action]
    if (!fallback) return { ok: false, error: 'That shortcut is not recognised.' }
    let v = String(raw ?? '').trim()
    if (!v) v = fallback
    const previous = hotkeysMap[action] || fallback
    try {
      // The Shortcuts page pauses global shortcuts while recording. Resume them first, otherwise nothing
      // is registered and a refused combination could not be detected.
      await ipc.invoke('hotkeys:set-suspended', false)
      const applied = await ipc.invoke('update-hotkey', action, v)
      if (applied === false) return { ok: false, error: 'That shortcut is not recognised.' }
      const refused = await hotkeyRegistrationFailure(action)
      if (refused) {
        // Windows or another app owns this combination. Put the working shortcut back instead of keeping a dead one.
        try {
          await ipc.invoke('update-hotkey', action, previous)
        } catch {
          /* best effort */
        }
        return {
          ok: false,
          error: `${describeAccelerator(v)} could not be registered. Another app may already use it. Pick a different combination.`,
        }
      }
      setHotkeysMap((m) => ({ ...m, [action]: v }))
      return { ok: true }
    } catch (e) {
      console.warn('update-hotkey', e)
      return { ok: false, error: e?.message || 'Could not save that shortcut.' }
    }
  }

  const resetAllHotkeys = async () => {
    if (!ipc) return { ok: false }
    try {
      await ipc.invoke('hotkeys:set-suspended', false)
      for (const action of Object.keys(DEFAULT_HOTKEYS_MAP)) {
        await ipc.invoke('update-hotkey', action, DEFAULT_HOTKEYS_MAP[action])
      }
      setHotkeysMap({ ...DEFAULT_HOTKEYS_MAP })
      let status = null
      try {
        status = await ipc.invoke('hotkeys:status')
      } catch {
        /* advisory */
      }
      const failed = Object.entries(status?.registration || {}).filter(
        ([, reg]) => reg && reg.ok === false && reg.error !== 'suspended',
      )
      if (failed.length) {
        const names = failed.map(([a]) => HOTKEY_DEFS.find((d) => d.action === a)?.label || a)
        showToast({
          tone: 'error',
          message: `Defaults restored, but ${failed.length} shortcut${failed.length === 1 ? '' : 's'} could not be registered`,
          detail: names.join(', '),
        })
        // ok:false = "already reported": the page's Reset button then skips its own success toast.
        return { ok: false, reported: true }
      }
      // Success is announced by the Shortcuts page's Reset to default button.
      return { ok: true }
    } catch (e) {
      showToast({ tone: 'error', message: 'Could not restore the default shortcuts', detail: e?.message || String(e) })
      return { ok: false, error: e?.message }
    }
  }

  /** @returns {Promise<{ ok: true } | { ok: false, error: string }>} */
  const saveGoogleCalendarOAuth = async () => {
    const id = String(googleCalendarClientId || '').trim()
    const secret = String(googleCalendarClientSecret || '').trim()
    // The mask means a secret is already stored on this device; an empty field means there is none.
    const hasStoredSecret = secret === '••••••••'
    if (!id) return { ok: false, error: 'Enter the OAuth client ID.' }
    if (!secret) return { ok: false, error: 'Enter the OAuth client secret too. Both are required.' }
    try {
      await save('googleCalendarClientId', id)
      if (!hasStoredSecret) {
        await save('googleCalendarClientSecret', secret)
        setGoogleCalendarClientSecret('••••••••')
      }
    } catch (e) {
      return { ok: false, error: e?.message || 'Could not save the credentials.' }
    }
    calendarCacheRef.current = { statusAt: 0, status: null, meetingsAt: 0 }
    setGoogleCalendarOAuthReady(true)
    return { ok: true }
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

  // Latest-callback ref: handlers below keep a stable identity but always call the freshest closures, so the
  // memoized Profile page only re-renders when its own data changes (not on save status, toasts or other tabs).
  const profileApi = useRef({})
  profileApi.current = {
    uploadInterviewResume,
    saveResumeLibrary,
    activeResumeId,
    resumeLibrary,
    uploadModeDocument,
    saveMeetingDocuments,
    activeMeetingDocumentId,
    meetingDocuments,
    saveGeneralPurposes,
    generalPurposes,
    activeGeneralPurposeId,
    selectContextPrompt,
    addContextPrompt,
    addModeFromTemplate,
    deletePromptById,
    saveActivePrompt,
    uploadReferenceFile,
    removeReferenceFile,
  }
  const profileHandlers = useMemo(() => {
    const api = () => profileApi.current
    return {
      onUploadResume: () => void api().uploadInterviewResume(),
      onSelectResume: (id) => {
        setActiveResumeId(id)
        void save('activeResumeId', id)
      },
      onChangeResumes: (next) => api().saveResumeLibrary(next, api().activeResumeId),
      onDeleteResume: (id) =>
        api().saveResumeLibrary(api().resumeLibrary.filter((resume) => resume.id !== id), api().activeResumeId),
      onMeetingPromptChange: (text) => {
        setMeetingPrompt(text)
        void save('meetingPrompt', text)
      },
      onUploadMeetingDocument: () => void api().uploadModeDocument('meeting'),
      onSelectMeetingDocument: (id) => {
        setActiveMeetingDocumentId(id)
        void save('activeMeetingDocumentId', id)
      },
      onChangeMeetingDocuments: (next) => api().saveMeetingDocuments(next, api().activeMeetingDocumentId),
      onDeleteMeetingDocument: (id) =>
        api().saveMeetingDocuments(
          api().meetingDocuments.filter((doc) => doc.id !== id),
          api().activeMeetingDocumentId,
        ),
      onCreatePurpose: ({ name, prompt }) => {
        const id = `purpose-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
        const next = [
          { id, name, prompt, documents: [], activeDocumentId: '', document: null, createdAt: Date.now(), updatedAt: Date.now() },
          ...api().generalPurposes,
        ].slice(0, 20)
        void api().saveGeneralPurposes(next, id)
      },
      onUploadPurposeDocument: (id) => void api().uploadModeDocument('general', id),
      onSelectPurpose: (id) => {
        setActiveGeneralPurposeId(id)
        void save('activeGeneralPurposeId', id)
      },
      onChangePurpose: (purpose) =>
        api().saveGeneralPurposes(
          api().generalPurposes.map((item) => (item.id === purpose.id ? { ...item, ...purpose, updatedAt: Date.now() } : item)),
          api().activeGeneralPurposeId,
        ),
      onDeletePurpose: (id) =>
        api().saveGeneralPurposes(
          api().generalPurposes.filter((purpose) => purpose.id !== id),
          api().activeGeneralPurposeId,
        ),
      onDraftNotesSectionsChange: setDraftNotesSections,
      onDraftNameChange: setDraftName,
      onDraftContentChange: setDraftContent,
      onSelectPrompt: (id, override) => api().selectContextPrompt(id, override),
      onAddEmptyMode: (name) => api().addContextPrompt(name),
      onAddFromTemplate: (template) => api().addModeFromTemplate(template),
      onDeletePrompt: (id) => api().deletePromptById(id),
      onSavePrompt: () => api().saveActivePrompt(),
      onUploadFile: () => api().uploadReferenceFile(),
      onRemoveFile: (id) => api().removeReferenceFile(id),
      onToggleTemplates: () => setShowModeTemplates((v) => !v),
    }
  }, [])
  const profilePanel = useMemo(
    () => ({
      ...profileHandlers,
      resumeLibrary,
      activeResumeId,
      resumeBusy,
      resumeError,
      meetingPrompt,
      meetingDocuments,
      activeMeetingDocumentId,
      generalPurposes,
      activeGeneralPurposeId,
      documentBusy,
      documentError,
      contextPrompts,
      activeContextPromptId,
      activePrompt,
      draftName,
      draftContent,
      draftNotesSections,
      contextIndexing,
      uploadBusy,
      showTemplates: showModeTemplates,
      resumeContext,
      jdContext,
      resumeSourceName,
      profileDocBusy,
    }),
    [
      profileHandlers,
      resumeLibrary,
      activeResumeId,
      resumeBusy,
      resumeError,
      meetingPrompt,
      meetingDocuments,
      activeMeetingDocumentId,
      generalPurposes,
      activeGeneralPurposeId,
      documentBusy,
      documentError,
      contextPrompts,
      activeContextPromptId,
      activePrompt,
      draftName,
      draftContent,
      draftNotesSections,
      contextIndexing,
      uploadBusy,
      showModeTemplates,
      resumeContext,
      jdContext,
      resumeSourceName,
      profileDocBusy,
    ],
  )

  return (
    <SettingsWindowFrame>
      <div className="settings-root flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {/* First Tab stop (hidden until focused): jump past the navigation straight to the page. */}
        <button
          type="button"
          className="settings-skip-link"
          onClick={() => document.querySelector('[data-settings-page] .settings-page-title')?.focus()}
        >
          Skip to content
        </button>
        {showSetupBanner && (
          <div className="settings-setup-banner shrink-0">
            <p>
              First run: open <strong className="font-semibold text-white">AI Provider</strong>, add your API key and model, then launch.
            </p>
          </div>
        )}

        {settingsToast ? (
          <div
            className={`settings-toast settings-toast-${settingsToast.tone || 'info'}`}
            role={settingsToast.tone === 'error' ? 'alert' : 'status'}
          >
            <span className="settings-toast-icon" aria-hidden>
              {settingsToast.tone === 'success' ? (
                <CheckCircle2 size={18} strokeWidth={2} />
              ) : settingsToast.tone === 'error' ? (
                <AlertCircle size={18} strokeWidth={2} />
              ) : (
                <Info size={18} strokeWidth={2} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="settings-toast-message">{settingsToast.message}</p>
              {settingsToast.detail ? (
                <p className="settings-toast-detail" title={settingsToast.detail}>
                  {settingsToast.detail}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="settings-toast-dismiss"
              onClick={() => setSettingsToast(null)}
              aria-label="Dismiss"
            >
              <X size={14} strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        ) : null}

        <div className="settings-flex-body flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <SettingsNav activeTab={activeTab} onSelectTab={selectSettingsTab} />

          <main ref={mainRef} className="settings-scroll-outer px-6 pt-6" aria-label="Settings content">
          {!snap ? (
            <SettingsLoadingSkeleton />
          ) : (
          <SettingsTabContent
            activeTab={activeTabId}
            onSelectTab={selectSettingsTab}
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
            transcriptDurationSeconds={transcriptDurationSeconds}
            onTranscriptDurationChange={applyTranscriptDuration}
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
            onSaveSttKey={(text) => (sttKeyField ? saveKey(sttKeyField, text) : false)}
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
            openAtLoginUi={openAtLoginUi}
            onOpenAtLoginChange={applyOpenAtLogin}
            uiColorSchemeUi={uiColorSchemeUi}
            onUiColorSchemeChange={applyUiColorScheme}
            overlayMousePassthroughUi={overlayMousePassthroughUi}
            onOverlayMousePassthroughChange={applyOverlayMousePassthrough}
            hideFromTaskbarUi={hideFromTaskbarUi}
            onHideFromTaskbarChange={applyHideFromTaskbar}
            doNotSaveMeetingsEnabled={doNotSaveMeetingsEnabled}
            onDoNotSaveMeetingsChange={applyDoNotSaveMeetings}
            stealthModeUi={stealthModeUi}
            onStealthModeChange={applyStealthMode}
            overlayW={overlayW}
            overlayH={overlayH}
            onOverlayWChange={setOverlayW}
            onOverlayHChange={setOverlayH}
            onApplyOverlaySize={applyOverlaySize}
            onSnapOverlayPreset={snapOverlayToPreset}
            hotkeysMap={hotkeysMap}
            hotkeyFailures={hotkeyFailures}
            onHotkeyCommit={commitHotkey}
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
            profilePanel={profilePanel}
          />
          )}
        </main>
      </div>
      </div>
    </SettingsWindowFrame>
  )
}
