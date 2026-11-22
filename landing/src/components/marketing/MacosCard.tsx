type Props = {
  wide?: boolean
  tall?: boolean
  /** Image screenshot only — body stays empty when unset */
  src?: string
  className?: string
}

export function MacosCard({ wide, tall, src, className = '' }: Props) {
  const isImage = src && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(src)

  return (
    <div
      className={`macos-card${wide ? ' macos-card--wide' : ''}${tall ? ' macos-card--tall' : ''} ${className}`.trim()}
      aria-label="Product UI preview"
    >
      <div className="macos-card__titlebar" aria-hidden>
        <span className="macos-card__dot macos-card__dot--red" />
        <span className="macos-card__dot macos-card__dot--yellow" />
        <span className="macos-card__dot macos-card__dot--green" />
      </div>
      <div className="macos-card__body">{isImage && src ? <img src={src} alt="" loading="lazy" /> : null}</div>
    </div>
  )
}

const DOCK_APPS = [
  { label: 'Zoom', color: '#2D8CFF', letter: 'Z' },
  { label: 'Meet', color: '#00897B', letter: 'G' },
  { label: 'Teams', color: '#6264A7', letter: 'T' },
  { label: 'Safari', color: '#0A84FF', letter: 'S' },
] as const

export function DockIcons() {
  return (
    <>
      {DOCK_APPS.map((app) => (
        <span
          key={app.label}
          className="dock-icon"
          aria-hidden
          style={{ background: `linear-gradient(145deg, ${app.color}, ${app.color}cc)` }}
        >
          <span className="dock-icon__letter">{app.letter}</span>
        </span>
      ))}
    </>
  )
}

const COMPAT_BRANDS = [
  { label: 'Zoom', color: '#2D8CFF' },
  { label: 'Meet', color: '#34A853' },
  { label: 'Teams', color: '#6264A7' },
  { label: 'Webex', color: '#00BCF2' },
  { label: 'Slack', color: '#E01E5A' },
] as const

export function CompatLogos() {
  return (
    <div className="lm-compat-logos">
      {COMPAT_BRANDS.map((b) => (
        <div key={b.label} className="lm-compat-item">
          <span className="lm-compat-icon" style={{ background: b.color }} aria-hidden>
            {b.label.charAt(0)}
          </span>
          <span className="lm-compat-label">{b.label}</span>
        </div>
      ))}
    </div>
  )
}
