// Headless-ish Electron runner: register every default hotkey and invoke handlers.
const { app, BrowserWindow } = require('electron')
const path = require('path')

// Match production userData so we exercise the real store merge path.
app.setPath('userData', path.join(app.getPath('appData'), 'VeilAssist-v2'))

app.whenReady().then(async () => {
  // Need a window so the process stays alive long enough for registration.
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } })

  const hotkeys = require('../lib/hotkeys')
  const invoked = []

  for (const action of Object.keys(hotkeys.DEFAULT_HOTKEYS)) {
    hotkeys.register(action, () => {
      invoked.push(action)
    })
  }

  // Always start unsuspended.
  hotkeys.setSuspended(false)
  const reg = hotkeys.registerAll()
  const status = hotkeys.getStatus()

  const failed = []
  for (const action of Object.keys(hotkeys.DEFAULT_HOTKEYS)) {
    const row = reg[action] || status.registration[action]
    if (!row?.ok) failed.push(`${action}=${row?.accelerator || '?'} (${row?.error || 'not ok'})`)
  }

  // Invoke every handler through the public API (proves wiring, not OS delivery).
  const invokeFailed = []
  for (const action of Object.keys(hotkeys.DEFAULT_HOTKEYS)) {
    const r = hotkeys.invoke(action)
    if (!r.ok) invokeFailed.push(`${action}: ${r.error}`)
  }

  // Suspend / resume round-trip.
  hotkeys.setSuspended(true)
  if (!hotkeys.isSuspended()) failed.push('setSuspended(true) did not stick')
  hotkeys.setSuspended(false)
  const reg2 = hotkeys.registerAll()
  for (const action of Object.keys(hotkeys.DEFAULT_HOTKEYS)) {
    if (!reg2[action]?.ok) failed.push(`after-resume ${action}`)
  }

  console.log(JSON.stringify({
    suspended: status.suspended,
    registration: reg,
    invoked,
    failed,
    invokeFailed,
  }, null, 2))

  if (failed.length || invokeFailed.length || invoked.length !== Object.keys(hotkeys.DEFAULT_HOTKEYS).length) {
    console.error('LIVE_HOTKEYS_FAIL')
    app.exit(1)
    return
  }

  console.log('LIVE_HOTKEYS_OK')
  try { win.destroy() } catch (_) {}
  hotkeys.unregisterAll()
  app.exit(0)
}).catch((e) => {
  console.error(e)
  app.exit(1)
})
