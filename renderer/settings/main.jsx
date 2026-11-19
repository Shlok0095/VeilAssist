// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import '../shared/app-fonts.css'
import '../shared/designTokens.css'
import App from './App'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root'))
const app = (
  <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
    <App />
  </div>
)
/** StrictMode double-invokes in dev only; skip wrapper in production for slightly less mount work. */
root.render(import.meta.env.DEV ? <StrictMode>{app}</StrictMode> : app)
