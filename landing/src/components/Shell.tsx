import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Lenis from 'lenis'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { cn } from '@/components/ui/cn'
import { getDocPage } from '@/config/docsNav'

const MARKETING_PATHS = new Set(['/', '/how-it-works', '/built-for-live-work'])

/** Initial <title> from index.html — kept for the home page. */
const HOME_TITLE = 'VeilAssist — Undetectable AI for live meetings'

const ROUTE_TITLES: Record<string, string> = {
  '/download': 'Download',
  '/how-it-works': 'How it works',
  '/built-for-live-work': 'Built for live work',
  '/docs': 'Documentation',
  '/docs/getting-started': 'Getting started',
  '/docs/shipping': 'Shipping & releases',
  '/legal/terms': 'Terms of service',
  '/legal/privacy': 'Privacy policy',
}

/** One descriptive <title> per route (WCAG 2.4.2), built from each page's existing heading. */
function titleForPath(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/' || path === '') return HOME_TITLE
  const known = ROUTE_TITLES[path]
  if (known) return `${known} — VeilAssist`
  if (path.startsWith('/docs/')) {
    const page = getDocPage(path.slice('/docs/'.length))
    if (page) return `${page.title} — VeilAssist`
  }
  return HOME_TITLE
}

export function Shell() {
  const { pathname } = useLocation()
  const isMarketingSurface = MARKETING_PATHS.has(pathname)
  const isHome = pathname === '/' || pathname === ''

  useEffect(() => {
    document.title = titleForPath(pathname)
  }, [pathname])

  useEffect(() => {
    document.body.classList.toggle('light-marketing', isMarketingSurface)
    return () => {
      document.body.classList.remove('light-marketing')
    }
  }, [isMarketingSurface])

  useEffect(() => {
    // Smooth-scroll hijacking is skipped for visitors who asked the OS for reduced motion.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true })
    let raf = 0
    const tick = (t: number) => {
      lenis.raf(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [])

  return (
    <>
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        Skip to main content
      </a>
      <Header />
      <main id="main-content" tabIndex={-1} className={cn('main-shell min-w-0', isMarketingSurface && 'overflow-x-hidden')}>
        <Outlet />
      </main>
      {!isHome ? <Footer /> : null}
    </>
  )
}
