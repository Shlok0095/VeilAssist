import { useCallback, useEffect, useRef, useState, Component, type ErrorInfo, type ReactNode } from 'react'
import { hasRoutableChatKey, loadAppSettings, loadProfile, saveAppSettings, saveProfile } from './profileStorage'
import { profileIsReady, type AppSettings, type PersonalProfile } from './profileTypes'
import { sttKeyConfigured } from './sttRegistry'
import { useInterviewSession } from './useInterviewSession'
import { deriveInterviewTopic } from './deriveInterviewTopic'
import { requestLaunchPermissions } from './runtimePermissions'
import { HomeScreen } from './screens/HomeScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { AdvancedSettingsScreen } from './screens/AdvancedSettingsScreen'
import { PersonalInfoScreen } from './screens/PersonalInfoScreen'
import { FontSizeScreen } from './screens/FontSizeScreen'
import { InterviewScreen } from './screens/InterviewScreen'
import { micFromInterviewLanguage } from './settingsCatalog'
import './mobile-interview.css'

type AppScreen = 'home' | 'settings' | 'personal-info' | 'font-size' | 'advanced-settings'

function isSettingsChild(s: AppScreen | null) {
  return s === 'personal-info' || s === 'font-size' || s === 'advanced-settings'
}

function usableViewportHeight(): number {
  const vv = window.visualViewport?.height ?? 0
  const inner = window.innerHeight || 0
  const client = document.documentElement?.clientHeight || 0
  const screenH = window.screen?.availHeight || window.screen?.height || 0
  return Math.round([vv, inner, client, screenH].find((h) => h > 80) || 0)
}

function applyAppViewport() {
  const height = usableViewportHeight()
  if (height <= 80) return
  document.documentElement.style.setProperty('--app-height', `${height}px`)
}

class ScreenErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }
  static getDerivedStateFromError(error: Error) {
    return { message: error.message || 'Could not render this screen' }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }
  render() {
    if (this.state.message) {
      return <div className="mobile-interview-error">{this.state.message}</div>
    }
    return this.props.children
  }
}

export default function MobileInterviewApp() {
  const [screen, setScreen] = useState<AppScreen>('home')
  const [profile, setProfile] = useState<PersonalProfile>(() => loadProfile())
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings())

  const session = useInterviewSession(profile, settings)
  useEffect(() => {
    void requestLaunchPermissions()
  }, [])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveAppSettings(next)
      return next
    })
  }, [])

  const updateProfile = useCallback((next: PersonalProfile) => {
    setProfile(next)
    saveProfile(next)
  }, [])

  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    if (settings.interviewTopicLocked) return
    const derived = deriveInterviewTopic(profile)
    if (!derived || derived === settings.interviewTopic) return
    updateSettings({ interviewTopic: derived })
  }, [profile, settings.interviewTopic, settings.interviewTopicLocked, updateSettings])

  useEffect(() => {
    const mic = micFromInterviewLanguage(settings.interviewLanguage)
    if (settings.micListenLanguage === mic) return
    updateSettings({ micListenLanguage: mic })
  }, [settings.interviewLanguage, settings.micListenLanguage, updateSettings])

  useEffect(() => {
    let remove: (() => void) | undefined
    void import('@capacitor/app')
      .then(async ({ App }) => {
        const handle = await App.addListener('backButton', () => {
          const s = sessionRef.current
          const sheetBack = new CustomEvent('veilassist:settings-back', { cancelable: true })
          window.dispatchEvent(sheetBack)
          if (sheetBack.defaultPrevented) return
          if (s.phase === 'interview') {
            window.dispatchEvent(new Event('veilassist:hardware-back'))
            return
          }
          if (screen !== 'home') {
            setScreen(isSettingsChild(screen) ? 'settings' : 'home')
            return
          }
          void App.exitApp()
        })
        remove = () => void handle.remove()
      })
      .catch(() => {
        /* web */
      })
    return () => remove?.()
  }, [screen])

  useEffect(() => {
    const bg = settings.colorScheme === 'light' ? '#f2f2f7' : '#0c0c0d'
    document.documentElement.style.background = bg
    document.documentElement.style.colorScheme = settings.colorScheme
    document.body.style.background = bg
    document.body.style.colorScheme = settings.colorScheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
    let viewportRaf = 0
    const applyViewport = () => {
      if (viewportRaf) return
      viewportRaf = requestAnimationFrame(() => {
        viewportRaf = 0
        applyAppViewport()
      })
    }
    const recoverVisible = () => {
      applyViewport()
      window.setTimeout(applyAppViewport, 80)
      window.setTimeout(applyAppViewport, 320)
    }
    applyViewport()
    window.visualViewport?.addEventListener('resize', applyViewport, { passive: true })
    window.visualViewport?.addEventListener('scroll', applyViewport, { passive: true })
    window.addEventListener('resize', applyViewport, { passive: true })
    window.addEventListener('pageshow', recoverVisible)
    document.addEventListener('visibilitychange', recoverVisible)
    let removeApp: (() => void) | undefined
    void import('@capacitor/app')
      .then(async ({ App }) => {
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) recoverVisible()
        })
        removeApp = () => void handle.remove()
      })
      .catch(() => {
        /* web */
      })
    return () => {
      if (viewportRaf) cancelAnimationFrame(viewportRaf)
      document.documentElement.style.background = ''
      document.body.style.background = ''
      window.visualViewport?.removeEventListener('resize', applyViewport)
      window.visualViewport?.removeEventListener('scroll', applyViewport)
      window.removeEventListener('resize', applyViewport)
      window.removeEventListener('pageshow', recoverVisible)
      document.removeEventListener('visibilitychange', recoverVisible)
      removeApp?.()
    }
  }, [settings.colorScheme])

  const fontClass =
    settings.fontSize === 'small'
      ? 'mobile-font-small'
      : settings.fontSize === 'large'
        ? 'mobile-font-large'
        : settings.fontSize === 'xlarge'
          ? 'mobile-font-xlarge'
          : 'mobile-font-standard'
  const themeClass = settings.colorScheme === 'light' ? 'mobile-theme-light' : 'mobile-theme-dark'
  const rootClass = `mobile-interview-root ${fontClass} ${themeClass}`

  if (session.phase === 'interview') {
    return (
      <div className={rootClass}>
        <ScreenErrorBoundary>
          <InterviewScreen session={session} settings={settings} onPatchSettings={updateSettings} />
        </ScreenErrorBoundary>
      </div>
    )
  }

  if (screen === 'personal-info') {
    return (
      <div className={rootClass}>
        <PersonalInfoScreen
          profile={profile}
          onChange={updateProfile}
          onBack={() => setScreen('settings')}
        />
      </div>
    )
  }

  if (screen === 'font-size') {
    return (
      <div className={rootClass}>
        <FontSizeScreen
          settings={settings}
          onChange={updateSettings}
          onBack={() => setScreen('settings')}
        />
      </div>
    )
  }

  if (screen === 'advanced-settings') {
    return (
      <div className={rootClass}>
        <AdvancedSettingsScreen
          settings={settings}
          onChange={updateSettings}
          onBack={() => setScreen('settings')}
        />
      </div>
    )
  }

  if (screen === 'settings') {
    return (
      <div className={rootClass}>
        <SettingsScreen
          settings={settings}
          onChange={updateSettings}
          onBack={() => setScreen('home')}
          onOpenPersonalInfo={() => setScreen('personal-info')}
          onOpenFontSize={() => setScreen('font-size')}
          onOpenAdvancedSettings={() => setScreen('advanced-settings')}
        />
      </div>
    )
  }

  return (
    <div className={rootClass}>
      <HomeScreen
        profileReady={profileIsReady(profile)}
        hasApiKey={hasRoutableChatKey(settings)}
        hasSttKey={settings.sttMode !== 'cloud' || sttKeyConfigured(settings, settings.sttProvider)}
        onOpenSettings={() => setScreen('settings')}
        onStart={session.startSession}
        starting={session.starting}
      />
      {session.error ? <div className="mobile-interview-error">{session.error}</div> : null}
    </div>
  )
}
