// Copyright (c) 2026 VeilAssist. All rights reserved.

import React from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/app-fonts.css'
import App from './App'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
