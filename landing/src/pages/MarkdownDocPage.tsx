import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MarkdownBody } from '@/components/MarkdownBody'

type Props = {
  title: string
  lede?: string
  crumb: string
  markdown: string
}

/** Avoid duplicate page title (hero h1 + markdown #). */
function stripLeadingH1(md: string) {
  let s = md.replace(/^#[^\n]+\n+/, '')
  s = s.replace(/^---\s*\n+/, '')
  return s
}

export function MarkdownDocPage({ title, lede, crumb, markdown }: Props) {
  return (
    <>
      <motion.div
        className="doc-hero glass-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <p className="doc-crumb">
          <Link to="/docs">Docs</Link> <span className="doc-crumb__sep" aria-hidden>/</span> {crumb}
        </p>
        <h1 className="doc-title">{title}</h1>
        {lede ? <p className="doc-lede">{lede}</p> : null}
      </motion.div>
      <motion.div
        className="glass-panel doc-sheet"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <MarkdownBody markdown={stripLeadingH1(markdown)} />
      </motion.div>
    </>
  )
}
