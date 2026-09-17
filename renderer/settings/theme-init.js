// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

// Synchronous first-paint theme resolution — see ../shared/colorScheme.js.
// Runs before <body> parses so the correct light/dark scheme is already applied
// when this window is first shown; main resolves it synchronously and passes it
// in the `theme` URL param (see resolveUiColorScheme() in main/index.js).
(function () {
  try {
    var theme = new URLSearchParams(window.location.search).get('theme')
    var resolved = theme === 'light' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-color-scheme', resolved)
  } catch (_) {}
})()
