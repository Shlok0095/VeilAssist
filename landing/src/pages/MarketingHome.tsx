import { useState, type CSSProperties } from 'react'
import { LightFaq } from '@/components/marketing/LightFaq'
import { LightFooter } from '@/components/marketing/LightFooter'
import { CompatLogos, DockIcons, MacosCard } from '@/components/marketing/MacosCard'
import { StarfieldBg } from '@/components/marketing/StarfieldBg'
import { MEDIA } from '@/config/mediaManifest'
import { useRevealObserver } from '@/hooks/useReveal'
import { GlowCta } from '@/components/marketing/GlowCta'
import { SITE } from '@/config/site'

const STEPS = [
  {
    label: 'Step 01',
    heading: 'Listens in to the conversation',
    body: 'VeilAssist picks up mic and system audio in real time — so it understands context before you ask.',
    reverse: false,
    screenshot: MEDIA.meetingListenScreenshot,
  },
  {
    label: 'Step 02',
    heading: 'Assists you instantly',
    body: 'Press Ctrl+Enter and get streaming answers grounded in your screen and what was just said.',
    reverse: true,
    screenshot: MEDIA.meetingAssistScreenshot,
  },
  {
    label: 'Step 03',
    heading: 'Recaps when you are done',
    body: 'End Listen for a concise local summary — action items, decisions, and follow-ups without a bot in the room.',
    reverse: false,
    screenshot: MEDIA.notesScreenshot,
    tall: true,
  },
] as const

const BENTO = [
  {
    wide: true,
    purple: false,
    dark: false,
    title: "Doesn't join meetings",
    body: 'VeilAssist never joins your call — no bots on the guest list, ever.',
  },
  {
    wide: false,
    purple: true,
    dark: false,
    title: 'Invisible to screen share',
    body: 'Content protection keeps the overlay off recordings and shared screens.',
  },
  {
    wide: false,
    purple: false,
    dark: true,
    title: 'Ctrl+Enter to assist',
    body: 'Summon help without breaking flow.',
    code: 'Ctrl + Enter  →  instant AI assist',
  },
  {
    wide: true,
    purple: false,
    dark: false,
    title: 'Compatible with every tool',
    body: 'Works alongside the apps you already use for live calls.',
    compat: true,
  },
] as const

const STATS = [
  { n: '12+', label: 'Languages', body: 'English, Hindi, Hinglish, and cloud STT languages.' },
  { n: '300ms', label: 'Response time', body: 'Fast streaming to overlay and phone companion together.' },
  { n: '95%', label: 'Transcription accuracy', body: 'Dual-path mic + system audio with local or cloud STT.' },
] as const

const FAQ = [
  {
    q: 'Why real-time vs. a regular AI notetaker?',
    a: 'Most tools summarize after the meeting. VeilAssist helps while the conversation is still happening.',
  },
  { q: 'Who is VeilAssist for?', a: 'Live interviews, sales calls, standups, and any meeting where you need help in the moment.' },
  { q: 'Is VeilAssist free?', a: 'The app is free to download. You bring your own API keys — you pay your model provider directly.' },
  {
    q: 'How is it undetectable in meetings?',
    a: 'No bot join link. The overlay uses content protection and stays off shared screens until you summon it.',
  },
  { q: 'What languages and apps are supported?', a: '12+ STT languages. Works alongside Zoom, Meet, Teams, Webex, and more.' },
  { q: 'Can I talk to customer support?', a: 'Open an issue on GitHub or email from the repo — we respond on best effort.' },
] as const

export function MarketingHome() {
  const [deviceTab, setDeviceTab] = useState<'mobile' | 'tablet' | 'desktop'>('desktop')
  useRevealObserver()

  return (
    <div className="lm-page">
      <section className="lm-hero">
        <StarfieldBg />
        <span className="lm-blob lm-blob--purple" aria-hidden />
        <span className="lm-blob lm-blob--cyan" aria-hidden />
        <span className="lm-blob lm-blob--pink" aria-hidden />

        <div className="lm-container">
          <div className="lm-hero__content reveal">
            <div className="sp-welcome-box">
              <span className="lm-eyebrow__dot" aria-hidden />
              <span>Undetectable AI for live meetings</span>
            </div>

            <h1 className="lm-hero__title">AI meeting assistant</h1>

            <p className="lm-hero__sub">
              VeilAssist gives real-time answers and meeting notes — completely undetectable on your screen. No bots.
              No waiting until after the call.
            </p>

            <div className="lm-hero__ctas">
              <GlowCta href={SITE.downloadPageUrl} size="md" external={false}>
                Download the app
              </GlowCta>
              <a href="#how-it-works" className="sp-btn-glow">
                See how it works
              </a>
            </div>

            <p className="lm-hero__platform">Windows · macOS · Linux · Android — one latest build per platform</p>
          </div>

          <div className="lm-hero-product reveal">
            <div className="lm-hero-product__stage">
              <DockIcons />
              <MacosCard src={MEDIA.heroOverlayScreenshot || undefined} />
            </div>
            <div className="lm-hero-shimmer" aria-hidden />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="lm-band scroll-mt-nav">
        <div className="lm-container reveal">
          <h2 className="lm-band__title">How VeilAssist helps during a meeting</h2>
          <p className="lm-band__sub">Real-time context, instant assist, and local recaps — all without joining your call.</p>
        </div>
      </section>

      <section className="lm-steps">
        <div className="lm-container">
          {STEPS.map((step) => (
            <div
              key={step.label}
              className={`lm-step-row reveal${step.reverse ? ' lm-step-row--reverse' : ''}`}
            >
              <div>
                <p className="lm-step-label">{step.label}</p>
                <h3 className="lm-step-heading">{step.heading}</h3>
                <p className="lm-step-body">{step.body}</p>
              </div>
              <div className="lm-step-row__visual">
                <MacosCard tall={'tall' in step && step.tall} src={step.screenshot || undefined} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="lm-feature-wide">
        <div className="lm-container">
          <h2 className="lm-feature-wide__title reveal">Instant meeting notes</h2>
          <p className="lm-feature-wide__sub reveal">
            The easiest way to get concise, local session recaps after Listen.
          </p>

          <div className="lm-device-tabs reveal" role="tablist" aria-label="Device preview">
            {(['mobile', 'tablet', 'desktop'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={deviceTab === tab}
                className={`lm-device-tab${deviceTab === tab ? ' active' : ''}`}
                onClick={() => setDeviceTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="lm-wide-card reveal" aria-label="Meeting notes preview">
            <div className="lm-wide-card__bar" aria-hidden>
              <span className="macos-card__dot macos-card__dot--red" />
              <span className="macos-card__dot macos-card__dot--yellow" />
              <span className="macos-card__dot macos-card__dot--green" />
            </div>
            {MEDIA.wideNotesScreenshot ? (
              <img src={MEDIA.wideNotesScreenshot} alt="" className="lm-wide-card__img" loading="lazy" />
            ) : null}
          </div>
        </div>
      </section>

      <section id="features" className="lm-bento-section scroll-mt-nav">
        <div className="lm-container">
          <div className="lm-bento-section__head reveal">
            <h2 className="lm-band__title">Undetectable in every way</h2>
            <p className="lm-band__sub">Suite of features to use VeilAssist without a trace.</p>
          </div>

          <div className="lm-bento-grid reveal-group">
            {BENTO.map((card, i) => (
              <article
                key={card.title}
                className={`reveal lm-bento-card${card.wide ? ' lm-bento-card--wide' : ''}${card.purple ? ' lm-bento-card--purple' : ''}${card.dark ? ' lm-bento-card--dark' : ''}`}
                style={{ '--i': i } as CSSProperties}
              >
                <h3 className="lm-bento-card__title">{card.title}</h3>
                <p className="lm-bento-card__body">{card.body}</p>
                {'code' in card && card.code ? <p className="lm-bento-code">{card.code}</p> : null}
                {'compat' in card && card.compat ? <CompatLogos /> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lm-stats">
        <div className="lm-container">
          <div className="lm-stats__head reveal">
            <h2 className="lm-band__title">Real-time transcription</h2>
          </div>
          <div className="lm-stats__grid reveal">
            {STATS.map((s) => (
              <div key={s.label} className="lm-stats__cell">
                <p className="lm-stats__num">{s.n}</p>
                <p className="lm-stats__label">{s.label}</p>
                <p className="lm-stats__body">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lm-screenshot-section">
        <div className="lm-container reveal">
          <p className="lm-screenshot-label">Live transcript</p>
          <div className="lm-screenshot-card" aria-label="Transcript preview">
            {MEDIA.transcriptionScreenshot ? (
              <img src={MEDIA.transcriptionScreenshot} alt="" loading="lazy" />
            ) : null}
          </div>
        </div>
      </section>

      <section id="faq" className="lm-faq-section scroll-mt-nav">
        <div className="lm-container">
          <h2 className="lm-faq-section__title reveal">Frequently asked questions</h2>
          <LightFaq items={[...FAQ]} />
        </div>
      </section>

      <section id="download" className="lm-final-cta scroll-mt-nav">
        <div className="lm-container reveal">
          <div className="lm-kbd-row" aria-hidden>
            <span className="lm-kbd">Ctrl</span>
            <span className="lm-kbd-plus">+</span>
            <span className="lm-kbd">↵</span>
          </div>
          <h2 className="lm-final-cta__title">Meeting AI that helps during the call, not after.</h2>
          <p className="lm-final-cta__sub">Try VeilAssist on your next meeting today.</p>
          <div className="lm-final-cta__btns">
            <GlowCta href={SITE.downloadPageUrl} size="md" external={false}>
              Download the desktop app
            </GlowCta>
          </div>
          <p className="lm-final-cta__hint">
            Windows, macOS, Linux, and Android — one download each on the <strong>Download</strong> page.
          </p>
        </div>
      </section>

      <LightFooter />
    </div>
  )
}
