import { NavLink, Outlet } from 'react-router-dom'
import { DOC_GROUPS, DOC_PAGES } from '@/config/docsNav'

const linkCls = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'docs-side__a docs-side__a--active' : 'docs-side__a'

const topItems = [
  { to: '/docs', end: true, label: 'Overview' },
  { to: '/docs/getting-started', label: 'Getting started' },
] as const

export function DocsLayout() {
  return (
    <div className="docs-shell">
      <aside className="docs-side glass-panel" aria-label="Documentation">
        <p className="docs-side__title">Documentation</p>
        <nav className="docs-side__nav" aria-label="Documentation pages">
          {topItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={linkCls}
            >
              {item.label}
            </NavLink>
          ))}
          {DOC_GROUPS.map((group) => (
            <div key={group} className="docs-side__group">
              <p className="docs-side__group-title">{group}</p>
              {DOC_PAGES.filter((p) => p.group === group).map((page) => (
                <NavLink key={page.slug} to={`/docs/${page.slug}`} className={linkCls}>
                  {page.title}
                </NavLink>
              ))}
            </div>
          ))}
          <NavLink to="/docs/shipping" className={linkCls}>
            Shipping & releases
          </NavLink>
        </nav>
        <div className="docs-side__meta">
          <NavLink to="/legal/terms" className="docs-side__link-muted">
            Terms
          </NavLink>
          <span className="docs-side__dot" aria-hidden>·</span>
          <NavLink to="/legal/privacy" className="docs-side__link-muted">
            Privacy
          </NavLink>
        </div>
      </aside>
      <div className="docs-main">
        <Outlet />
      </div>
    </div>
  )
}
