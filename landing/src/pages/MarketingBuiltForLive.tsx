import { Link } from 'react-router-dom'
import { GlowCta } from '@/components/marketing/GlowCta'
import { ScrollReveal } from '@/components/marketing/ScrollReveal'
import { SITE } from '@/config/site'

const bullets = [
  {
    title: 'Always-on-top without hijacking focus',
    body: 'The overlay floats above decks, terminals, and CRM tabs so you can read model output without alt-tabbing out of the narrative—or losing your place in a dense spreadsheet.',
  },
  {
    title: 'Grounding that cites the viewport',
    body: 'Screen capture is opt-in and scoped: structured text from what you actually have open informs completions, reducing confabulation compared to “memory-only” chat UIs.',
  },
  {
    title: 'BYOK as a control plane',
    body: 'Wire Groq, OpenAI, Anthropic, OpenRouter, Gemini, NVIDIA NIM, or any OpenAI-compatible endpoint. Swap latency-optimized vs. reasoning-heavy models per workload without reinstalling.',
  },
  {
    title: 'Calendar and session recaps (optional)',
    body: 'Optional Google Calendar for accepted meetings and simple reminders, plus post-session bullet recaps from Listen. Stored on device; a short text fallback still appears if a provider call is not available.',
  },
  {
    title: 'Operational discretion',
    body: 'Hotkey-driven visibility, compact chrome, and local-first settings—built for environments where subtlety matters as much as throughput.',
  },
] as const

const ghostBtnClass =
  'inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-800 no-underline transition-colors hover:border-cyan-600 hover:text-zinc-950'

export function MarketingBuiltForLive() {
  return (
    <div className="relative min-w-0 font-sans text-zinc-900 antialiased">
      <section className="relative overflow-hidden px-4 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16 md:px-10 lg:px-14 xl:px-16">
        <div className="relative z-[1] mx-auto w-full max-w-3xl">
          <ScrollReveal>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.24em] text-cyan-700">Product</p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">Built for live work</h1>
            <p className="mt-3 font-mono text-sm leading-relaxed tracking-wide text-zinc-600">
              VeilAssist is a Windows-native co-pilot layer: synchronous meetings, live document reviews, and any session
              where latency and situational awareness beat batch chat.
            </p>
          </ScrollReveal>

          <ul className="mt-12 space-y-4">
            {bullets.map((b, i) => (
              <ScrollReveal key={b.title} delay={i * 0.05}>
                <li className="futura-card list-none p-6 sm:p-7">
                  <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-zinc-900">{b.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed tracking-wide text-zinc-600">{b.body}</p>
                </li>
              </ScrollReveal>
            ))}
          </ul>

          <ScrollReveal delay={0.15}>
            <p className="mt-10 font-mono text-sm tracking-wide text-zinc-700">
              Provider matrix, env vars, and security notes live in{' '}
              <Link
                to="/docs/getting-started"
                className="text-zinc-900 underline underline-offset-2 transition-colors hover:text-cyan-700"
              >
                Getting started
              </Link>
              .
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2} className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
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
