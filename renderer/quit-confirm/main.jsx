// Copyright (c) 2026 VeilAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import '../shared/app-fonts.css'
import '../shared/designTokens.css'
import '../settings/index.css'
import './index.css'
import { applyColorScheme } from '../shared/colorScheme'
import App from './App'

// Main passes the resolved light/dark scheme in the URL. Apply it before the first render: the windows share the
// Settings stylesheet, whose light tokens are keyed on <body data-color-scheme>, so without this they stayed dark.
applyColorScheme(new URLSearchParams(window.location.search).get('theme'))

const root = ReactDOM.createRoot(document.getElementById('root'))
const app = <App />
root.render(import.meta.env.DEV ? <StrictMode>{app}</StrictMode> : app)
