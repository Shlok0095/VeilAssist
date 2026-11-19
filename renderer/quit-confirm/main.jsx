// Copyright (c) 2026 VeilAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import '../shared/app-fonts.css'
import '../shared/designTokens.css'
import '../settings/index.css'
import './index.css'
import App from './App'

const root = ReactDOM.createRoot(document.getElementById('root'))
const app = <App />
root.render(import.meta.env.DEV ? <StrictMode>{app}</StrictMode> : app)
