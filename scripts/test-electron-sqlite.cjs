const { app } = require('electron')

app.whenReady().then(() => {
  try {
    const Database = require('better-sqlite3')
    const db = new Database(':memory:')
    db.exec('CREATE TABLE sessions (id TEXT)')
    db.close()
    console.log('ELECTRON_SQLITE_OK')
    app.exit(0)
  } catch (error) {
    console.error(error?.stack || error)
    app.exit(1)
  }
})
