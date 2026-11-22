import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

type Props = { title: string; body: string; crumb: string }

export function LegalPage({ title, body, crumb }: Props) {
  return (
    <div className="page-doc">
      <motion.div
        className="doc-hero glass-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="doc-crumb">
          <Link to="/docs">Docs</Link> <span className="doc-crumb__sep" aria-hidden>/</span> {crumb}
        </p>
        <h1 className="doc-title">{title}</h1>
        <p className="doc-lede">Summary text as shipped in the app under <code>legal/</code>.</p>
      </motion.div>
      <motion.pre
        className="legal-pre glass-panel"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        {body.trim()}
      </motion.pre>
    </div>
  )
}
