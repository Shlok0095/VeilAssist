import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { DOC_GROUPS, DOC_PAGES } from '@/config/docsNav'

const extraCards = [
  {
    to: '/docs/getting-started',
    title: 'Getting started',
    desc: 'Download, installer vs portable, first launch, tray, uninstall.',
    group: 'Start here',
  },
  {
    to: '/docs/shipping',
    title: 'Shipping & releases',
    desc: 'Builds, tags, CI, GitHub Pages — for contributors.',
    group: 'Reference',
  },
  {
    to: '/legal/terms',
    title: 'Terms of service',
    desc: 'Same legal text bundled with the app and installer.',
    group: 'Legal',
  },
  {
    to: '/legal/privacy',
    title: 'Privacy policy',
    desc: 'BYOK, providers, and data on your device.',
    group: 'Legal',
  },
]

export function DocsHome() {
  return (
    <div className="docs-hub">
      <motion.div
        className="doc-hero glass-panel docs-hub__hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="doc-title">Documentation</h1>
        <p className="doc-lede">
          Complete guides for every VeilAssist feature — overlay, Listen, Ask AI, profile modes,
          intelligence, calendar, phone, keybinds, and troubleshooting. Same content as{' '}
          <strong>Settings → Help</strong> in the app.
        </p>
      </motion.div>

      {DOC_GROUPS.map((group, gi) => (
        <section key={group} className="docs-hub__section">
          <h2 className="docs-hub__section-title">{group}</h2>
          <div className="docs-grid">
            {DOC_PAGES.filter((p) => p.group === group).map((c, i) => (
              <motion.div
                key={c.slug}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * (gi * 4 + i) }}
              >
                <Link to={`/docs/${c.slug}`} className="docs-card glass-panel">
                  <h3>{c.title}</h3>
                  <p>{c.lede}</p>
                  <span className="docs-card__go">Open →</span>
                </Link>
              </motion.div>
            ))}
            {extraCards
              .filter((c) => c.group === group)
              .map((c, i) => (
                <motion.div
                  key={c.to}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * (gi * 4 + i + 1) }}
                >
                  <Link to={c.to} className="docs-card glass-panel">
                    <h3>{c.title}</h3>
                    <p>{c.desc}</p>
                    <span className="docs-card__go">Open →</span>
                  </Link>
                </motion.div>
              ))}
          </div>
        </section>
      ))}

      <section className="docs-hub__section">
        <h2 className="docs-hub__section-title">Legal</h2>
        <div className="docs-grid">
          {extraCards
            .filter((c) => c.group === 'Legal')
            .map((c, i) => (
              <motion.div
                key={c.to}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
              >
                <Link to={c.to} className="docs-card glass-panel">
                  <h3>{c.title}</h3>
                  <p>{c.desc}</p>
                  <span className="docs-card__go">Open →</span>
                </Link>
              </motion.div>
            ))}
        </div>
      </section>
    </div>
  )
}
