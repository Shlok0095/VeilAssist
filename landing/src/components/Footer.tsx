import { Link } from 'react-router-dom'
import { SITE } from '@/config/site'

// Every page that renders this footer sits on a light background (the "marketing" routes switch the
// body to `light-marketing`), so the footer uses one light palette. The old dark-surface variant put
// near-white text on white (name 1.27:1) and a cyan hover that disappeared.
const linkCls =
  '-my-1 py-1 text-sm text-zinc-600 no-underline transition-colors duration-200 hover:text-zinc-900'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-200/80 px-4 py-10 sm:px-6 md:px-8 md:py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
        <span className="text-sm font-bold text-zinc-900">{SITE.name}</span>
        <span className="hidden text-zinc-300 sm:inline" aria-hidden>
          ·
        </span>
        <Link to="/legal/terms" className={linkCls}>
          Terms
        </Link>
        <Link to="/legal/privacy" className={linkCls}>
          Privacy
        </Link>
        <p className="text-xs leading-relaxed text-zinc-600 sm:ml-auto sm:max-w-md sm:text-right">
          Not affiliated with Groq, OpenAI, or NVIDIA.
        </p>
      </div>
    </footer>
  )
}
