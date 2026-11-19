import { IconPlay, IconRetry, IconStop } from './SessionIcons'

export function SessionOrb({
  mode,
  onPause,
  onResume,
  onRetry,
}: {
  mode: 'loading' | 'pause' | 'play' | 'error'
  onPause: () => void
  onResume: () => void
  onRetry?: () => void
}) {
  if (mode === 'loading') {
    return (
      <span className="mobile-session-orb is-loading" role="status" aria-label="Starting session">
        <span className="mobile-session-icon-btn">
          <OrbSvg mode="loading" />
        </span>
        <span className="mobile-session-orb-caption">Starting...</span>
      </span>
    )
  }

  if (mode === 'error') {
    return (
      <button type="button" className="mobile-session-orb is-error" aria-label="Retry start" onClick={onRetry}>
        <span className="mobile-session-icon-btn">
          <OrbSvg mode="error" />
        </span>
        <span className="mobile-session-orb-caption">Retry</span>
      </button>
    )
  }

  const paused = mode === 'play'
  return (
    <button
      type="button"
      className={`mobile-session-orb${paused ? ' is-paused' : ' is-live'}`}
      aria-label={paused ? 'Resume session' : 'Stop listening'}
      onClick={paused ? onResume : onPause}
    >
      <span className="mobile-session-icon-btn">
        <OrbSvg mode={paused ? 'play' : 'pause'} />
      </span>
      <span className="mobile-session-orb-caption">{paused ? 'Resume' : 'Stop'}</span>
    </button>
  )
}

function OrbSvg({ mode }: { mode: 'loading' | 'pause' | 'play' | 'error' }) {
  if (mode === 'pause') return <IconStop />
  if (mode === 'play') return <IconPlay />
  if (mode === 'error') return <IconRetry />
  return (
    <svg className="mobile-session-orb-svg" viewBox="0 0 24 24" aria-hidden>
      <g className="mobile-session-orb-loader" fill="none" stroke="currentColor" strokeLinecap="round">
        <circle cx="12" cy="12" r="7.4" strokeOpacity="0.22" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="7.4" strokeWidth="1.7" strokeDasharray="11 36" />
      </g>
    </svg>
  )
}
