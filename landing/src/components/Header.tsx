import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { DownloadButton } from '@/components/marketing/DownloadButton'
import { SITE } from '@/config/site'
import brandLogo from '../../../logo.png'

function homeAnchor(id: string) {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${base}#${id}`
}

export function Header() {
  const { pathname } = useLocation()
  const isHome = pathname === '/' || pathname === ''
  const isMarketing = isHome || pathname === '/how-it-works' || pathname === '/built-for-live-work'
  const [scrolled, setScrolled] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const closeDrawer = useCallback((restoreFocus: boolean) => {
    setDrawerOpen(false)
    if (restoreFocus) menuBtnRef.current?.focus()
  }, [])

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Dialog behaviour for the mobile menu: focus moves in, Tab stays inside, Escape closes and returns focus.
  useEffect(() => {
    if (!drawerOpen) return undefined
    const focusables = () =>
      Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
    focusables()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDrawer(true)
        return
      }
      if (e.key !== 'Tab') return
      const nodes = focusables()
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      const outside = !drawerRef.current?.contains(active)
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen, closeDrawer])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!isMarketing) {
    return (
      <header className="site-header border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <NavLink to="/" className="font-bold text-zinc-900 no-underline">
            {SITE.name}
          </NavLink>
          <nav className="flex items-center gap-6 text-sm" aria-label="Main">
            <NavLink to="/docs" className="-my-1 py-1 text-zinc-600 no-underline hover:text-zinc-900">
              Docs
            </NavLink>
            <DownloadButton />
          </nav>
        </div>
      </header>
    )
  }

  return (
    <>
      <header className={`lm-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="lm-nav__inner">
          <NavLink to="/" end className="lm-nav__logo" aria-label={`${SITE.name} home`}>
            <img src={brandLogo} alt="" />
          </NavLink>

          <nav className="lm-nav__links" aria-label="Main">
            {isHome ? (
              <>
                <a href={homeAnchor('how-it-works')} className="lm-nav__link">
                  Features
                </a>
                <a href={homeAnchor('features')} className="lm-nav__link">
                  Undetectability
                </a>
                <a href={homeAnchor('faq')} className="lm-nav__link">
                  FAQ
                </a>
              </>
            ) : (
              <>
                <NavLink to="/how-it-works" className="lm-nav__link">
                  How it works
                </NavLink>
                <NavLink to="/built-for-live-work" className="lm-nav__link">
                  Built for live work
                </NavLink>
              </>
            )}
            <NavLink to="/docs" className="lm-nav__link">
              Docs
            </NavLink>
          </nav>

          <div className="lm-nav__actions">
            <DownloadButton className="lm-nav__download" />
            <button
              type="button"
              className="lm-nav__menu-btn"
              ref={menuBtnRef}
              aria-expanded={drawerOpen}
              aria-controls="mobile-menu"
              aria-haspopup="dialog"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {drawerOpen ? (
        <>
          <button
            type="button"
            className="lm-drawer-backdrop"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => closeDrawer(true)}
          />
          <div ref={drawerRef} id="mobile-menu" className="lm-drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <a href={homeAnchor('how-it-works')} className="lm-drawer__link" onClick={() => setDrawerOpen(false)}>
              How it works
            </a>
            <a href={homeAnchor('features')} className="lm-drawer__link" onClick={() => setDrawerOpen(false)}>
              Features
            </a>
            <a href={homeAnchor('faq')} className="lm-drawer__link" onClick={() => setDrawerOpen(false)}>
              FAQ
            </a>
            <NavLink to="/docs" className="lm-drawer__link" onClick={() => setDrawerOpen(false)}>
              Docs
            </NavLink>
            <DownloadButton className="lm-drawer__download" />
          </div>
        </>
      ) : null}
    </>
  )
}
