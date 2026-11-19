// Copyright (c) 2026 VeilAssist. All rights reserved.
// Browser-compatible WebSocket for Electron main process (Deepgram, ElevenLabs, Soniox).

// `ws` is loaded on first connection (not at app start): installMainWebSocket() runs during startup but no
// socket is opened until a cloud STT session begins.
let NodeWebSocket = null

class MainWebSocket {
  /**
   * @param {string} url
   * @param {string[] | { headers?: Record<string, string> }} [options]
   */
  constructor(url, options) {
    this._listeners = new Map()
    if (!NodeWebSocket) NodeWebSocket = require('ws')
    const protocols = Array.isArray(options) ? options : undefined
    const headers = !Array.isArray(options) ? options?.headers : undefined
    this._ws = new NodeWebSocket(url, protocols, headers ? { headers } : undefined)
    this.readyState = MainWebSocket.CONNECTING

    this._ws.on('open', () => {
      this.readyState = MainWebSocket.OPEN
      this._emit('open', {})
    })
    this._ws.on('message', (data) => {
      this._emit('message', { data: data?.toString?.() ?? data })
    })
    this._ws.on('error', (err) => {
      this._emit('error', err)
    })
    this._ws.on('close', (code, reason) => {
      this.readyState = MainWebSocket.CLOSED
      this._emit('close', { code, reason: String(reason || '') })
    })
  }

  _emit(type, evt) {
    const list = this._listeners.get(type)
    if (!list) return
    for (const fn of list) {
      try {
        fn(evt)
      } catch {}
    }
  }

  addEventListener(type, fn) {
    if (typeof fn !== 'function') return
    if (!this._listeners.has(type)) this._listeners.set(type, new Set())
    this._listeners.get(type).add(fn)
  }

  removeEventListener(type, fn) {
    this._listeners.get(type)?.delete(fn)
  }

  send(data) {
    this._ws.send(data)
  }

  close() {
    if (this.readyState === MainWebSocket.CLOSED) return
    this.readyState = MainWebSocket.CLOSING
    this._ws.close()
  }
}

MainWebSocket.CONNECTING = 0
MainWebSocket.OPEN = 1
MainWebSocket.CLOSING = 2
MainWebSocket.CLOSED = 3

function installMainWebSocket() {
  if (typeof globalThis.WebSocket === 'function') return false
  globalThis.WebSocket = MainWebSocket
  return true
}

module.exports = { MainWebSocket, installMainWebSocket }
