// Copyright (c) 2026 VeilAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.
//
// Natively-style screenshot queue:
//   - Captures screen on demand (hotkey / explicit ask)
//   - Saves PNGs to userData/screenshots/ with UUID names
//   - Maintains a rolling queue of up to MAX_SCREENSHOTS paths
//   - clearQueue() removes files and empties the list
//   - getBase64Preview() returns data-url for overlay thumbnails

const { desktopCapturer, nativeImage, screen, app } = require('electron')
const path = require('path')
const fs = require('fs')
const fsPromises = require('fs').promises
const crypto = require('crypto')

function uuidv4() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
}

const MAX_SCREENSHOTS = 5

let screenshotDir = null
let queue = [] // array of absolute PNG paths

function ensureDir() {
  if (!screenshotDir) {
    screenshotDir = path.join(app.getPath('userData'), 'screenshots')
  }
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true })
  }
  return screenshotDir
}

/**
 * Pick the best screen source — cursor's display first, then primary, then first.
 */
function pickSource(sources) {
  if (!sources?.length) return null
  const tryMatch = (d) => {
    if (!d) return null
    const idStr = String(d.id)
    return sources.find((s) => s.display_id != null && String(s.display_id) === idStr) || null
  }
  return (
    tryMatch(screen.getDisplayNearestPoint(screen.getCursorScreenPoint())) ||
    tryMatch(screen.getPrimaryDisplay()) ||
    sources[0]
  )
}

/**
 * Take a full-screen screenshot, save as PNG to the queue directory.
 * Returns the saved file path.
 * @returns {Promise<string>} absolute path to the saved PNG
 */
async function takeScreenshot() {
  const dir = ensureDir()
  const primary = screen.getPrimaryDisplay()
  const { width, height } = primary.bounds

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  })

  if (!sources?.length) throw new Error('No screen sources available')

  const src = pickSource(sources)
  if (!src) throw new Error('Could not select screen source')

  const dataUrl = src.thumbnail?.toDataURL('image/png')
  if (!dataUrl || dataUrl.length < 80) throw new Error('Empty thumbnail from desktopCapturer')

  const img = nativeImage.createFromDataURL(dataUrl)
  if (img.isEmpty()) throw new Error('NativeImage is empty')

  const png = img.toPNG()
  if (!png || png.length < 80) throw new Error('PNG buffer is empty')

  const filePath = path.join(dir, `${uuidv4()}.png`)
  await fsPromises.writeFile(filePath, png)

  queue.push(filePath)

  // Enforce max queue size — delete oldest
  while (queue.length > MAX_SCREENSHOTS) {
    const oldest = queue.shift()
    fsPromises.unlink(oldest).catch(() => {})
  }

  console.log(`[screenshotQueue] queued: ${filePath} (queue size: ${queue.length})`)
  return filePath
}

/**
 * Small JPEG preview (max 480px wide) for the overlay thumbnail UI.
 * The full-resolution PNG stays on disk and is only sent to the LLM.
 * @param {string} filePath
 * @returns {Promise<string>} data URL (image/jpeg)
 */
async function getBase64Preview(filePath) {
  const img = nativeImage.createFromPath(filePath)
  if (img.isEmpty()) return ''
  const resized = img.getSize().width > 480 ? img.resize({ width: 480 }) : img
  return resized.toDataURL('image/jpeg', 75)
}

/**
 * Returns all queued screenshot paths (oldest→newest).
 */
function getQueue() {
  return [...queue]
}

/**
 * Clears the queue and deletes the PNG files.
 */
async function clearQueue() {
  const toDelete = [...queue]
  queue = []
  await Promise.all(toDelete.map((p) => fsPromises.unlink(p).catch(() => {})))
  console.log(`[screenshotQueue] cleared ${toDelete.length} screenshot(s)`)
}

/**
 * Remove a single screenshot from the queue and delete the file.
 * Only paths currently tracked in the queue are ever unlinked — a caller
 * cannot use this to delete arbitrary files on disk.
 */
async function deleteScreenshot(filePath) {
  if (!queue.includes(filePath)) {
    throw new Error('Not a queued screenshot path')
  }
  queue = queue.filter((p) => p !== filePath)
  await fsPromises.unlink(filePath).catch(() => {})
}

module.exports = {
  takeScreenshot,
  getBase64Preview,
  getQueue,
  clearQueue,
  deleteScreenshot,
}
