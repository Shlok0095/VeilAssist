// Copyright (c) 2026 VeilAssist. All rights reserved.
// Optional verbose file logging — developer-only.
//
// Packaged (release) builds never write a debug log: the file can hold transcript snippets, and end users
// have no Diagnostics UI to see it or switch it off. Developers get it from an unpackaged run
// (`npm run dev`) by setting VEILASSIST_DEBUG_LOG=1 or the `verboseDebugLogging` store key.

const fs = require('fs')
const path = require('path')
const { app } = require('electron')

let logDir = null
let logPath = null
let enabled = false
let writeQueue = Promise.resolve()

/** True only for unpackaged runs. Fails closed (false) if Electron's `app` is unavailable. */
function isDebugLoggingAllowed() {
  try {
    return app.isPackaged === false
  } catch {
    return false
  }
}

function ensureLogDir() {
  if (logDir) return logDir
  logDir = path.join(app.getPath('userData'), 'logs')
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
  logPath = path.join(logDir, 'veilassist.log')
  return logDir
}

function getLogPath() {
  ensureLogDir()
  return logPath
}

function getLogDir() {
  return ensureLogDir()
}

function setVerboseDebugLogging(on) {
  // The one choke point: every writer below checks `enabled`, so a release build can never turn it on
  // (not from the store, not from an IPC message).
  enabled = !!on && isDebugLoggingAllowed()
}

function isVerboseDebugLogging() {
  return enabled
}

function appendLine(level, parts) {
  if (!enabled) return
  ensureLogDir()
  const ts = new Date().toISOString()
  const msg = parts
    .map((p) => {
      if (p instanceof Error) return p.stack || p.message
      if (typeof p === 'object') {
        try {
          return JSON.stringify(p)
        } catch {
          return String(p)
        }
      }
      return String(p)
    })
    .join(' ')
  const line = `[${ts}] [${level}] ${msg}\n`
  writeQueue = writeQueue
    .then(() => fs.promises.appendFile(logPath, line, 'utf8'))
    .catch(() => {})
}

/** @param {string} level @param {string} message */
function appendMessage(level, message) {
  if (!enabled || !message) return
  appendLine(level, [message])
}

function installConsoleTap() {
  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }
  console.log = (...args) => {
    orig.log(...args)
    appendLine('LOG', args)
  }
  console.warn = (...args) => {
    orig.warn(...args)
    appendLine('WARN', args)
  }
  console.error = (...args) => {
    orig.error(...args)
    appendLine('ERROR', args)
  }
}

module.exports = {
  getLogPath,
  getLogDir,
  isDebugLoggingAllowed,
  setVerboseDebugLogging,
  isVerboseDebugLogging,
  installConsoleTap,
  appendMessage,
}
