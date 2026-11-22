import { Link } from 'react-router-dom'
import { GlowCta } from '@/components/marketing/GlowCta'
import { ScrollReveal } from '@/components/marketing/ScrollReveal'
import { SITE } from '@/config/site'

const steps = [
  {
    title: 'Install',
    body: 'Run the Windows installer. VeilAssist lives in the system tray with a standard uninstall entry.',
  },
  {
    title: 'Add your API key and model',
    body: 'In Settings, paste API credentials and pick a chat model. Keys stay on your device; traffic goes to the provider you choose.',
  },
  {
    title: 'Use the overlay',
    body: 'Open the panel with a hotkey over slides, IDEs, or the browser. Type questions or enable listening and screen context when you need them.',
  },
  {
    title: 'Calendar and session recaps (optional)',
    body: 'Connect Google Calendar for upcoming meetings and reminders. Ending a listen session can save a short bullet recap locally.',
  },
] as const

const ghostBtnClass =
  'inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-800 no-underline transition-colors hover:border-cyan-600 hover:text-zinc-950'

export function MarketingHowItWorks() {
  return (
    <div className="relative min-w-0 font-sans text-zinc-900 antialiased">
      <section className="relative overflow-hidden px-4 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16 md:px-10 lg:px-14 xl:px-16">
        <div className="relative z-[1] mx-auto w-full max-w-3xl">
          <ScrollReveal>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.24em] text-cyan-700">Guide</p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">How it works</h1>
            <p className="mt-3 font-mono text-sm leading-relaxed tracking-wide text-zinc-600">
              Download, connect your provider, and start using the overlay.
            </p>
          </ScrollReveal>

          <ol className="mt-12 space-y-4">
            {steps.map((s, i) => (
              <ScrollReveal key={s.title} delay={i * 0.06}>
                <li className="futura-card list-none p-6 sm:p-7">
                  <div className="flex items-start gap-4">
                    <span className="font-display text-2xl font-bold leading-none text-cyan-600">{i + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-zinc-900">{s.title}</h2>
                      <p className="mt-2 text-sm leading-relaxed tracking-wide text-zinc-600">{s.body}</p>
                    </div>
                  </div>
                </li>
              </ScrollReveal>
            ))}
          </ol>

          <ScrollReveal delay={0.2} className="mt-12 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            <Link to="/" className={ghostBtnClass}>
              ← Home
            </Link>
            <GlowCta href={SITE.downloadPageUrl} size="md" external={false}>
              Download the desktop app
            </GlowCta>
          </ScrollReveal>
        </div>
      </section>
    </div>
  )
}
