import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import App from './App'
import './styles/tailwind.css'
import './styles/design-system.css'
import './index.css'

function faviconHref(): string {
  const b = import.meta.env.BASE_URL || '/'
  return b.endsWith('/') ? `${b}favicon.png` : `${b}/favicon.png`
}

;(function injectFavicon() {
  const head = document.head
  if (head.querySelector('link[data-sa-brand-icon]')) return
  const href = faviconHref()
  const icon = document.createElement('link')
  icon.rel = 'icon'
  icon.type = 'image/png'
  icon.href = href
  icon.setAttribute('data-sa-brand-icon', '1')
  head.appendChild(icon)
  const apple = document.createElement('link')
  apple.rel = 'apple-touch-icon'
  apple.href = href
  head.appendChild(apple)
})()

function basename(): string {
  const b = import.meta.env.BASE_URL
  if (b === '/') return ''
  return b.replace(/\/$/, '')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter basename={basename()}>
        <App />
      </BrowserRouter>
    </MotionConfig>
  </React.StrictMode>
)
