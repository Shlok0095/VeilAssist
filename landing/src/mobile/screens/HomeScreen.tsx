import { brandLogo } from '../brandAssets'

function SettingsGearIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 13.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.86 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HomeScreen({
  onStart,
  onOpenSettings,
  profileReady,
  hasApiKey,
  hasSttKey,
  starting,
}: {
  onStart: () => void
  onOpenSettings: () => void
  profileReady: boolean
  hasApiKey: boolean
  hasSttKey: boolean
  starting?: boolean
}) {
  const ready = profileReady && hasApiKey && hasSttKey
  const setupHint = !profileReady
    ? 'Add resume in Settings'
    : !hasApiKey
      ? 'Add AI key in Settings'
      : !hasSttKey
        ? 'Add STT key in Settings'
        : null

  return (
    <div className="mobile-home">
      <header className="mobile-home-header">
        <div className="mobile-home-brand">
          <img src={brandLogo} alt="VeilAssist" className="mobile-interview-logo" width={32} height={32} />
          <span className="mobile-home-brand-name">VeilAssist</span>
        </div>
        <button
          type="button"
          className="mobile-home-settings"
          aria-label="Settings"
          onClick={onOpenSettings}
          disabled={starting}
        >
          <SettingsGearIcon />
        </button>
      </header>

      <div className="mobile-home-content">
        <div className="mobile-home-center">
          <h2 className="mobile-home-ready">{starting ? 'Starting…' : ready ? 'Ready when you are' : 'Almost ready'}</h2>
          <button
            type="button"
            className="mobile-start-btn"
            onClick={onStart}
            disabled={!ready || starting}
          >
            {starting ? <span className="mobile-interview-spinner" aria-hidden /> : 'Start Interview'}
          </button>
          {setupHint && !starting ? <p className="mobile-home-hint">{setupHint}</p> : null}
        </div>

        <div className="mobile-home-tip">
          <p className="mobile-home-tip-title">Interview tips</p>
          <p className="mobile-home-tip-line">Use a second device for the video call.</p>
          <p className="mobile-home-tip-line">Camera can capture on-screen questions.</p>
        </div>
      </div>
    </div>
  )
}
