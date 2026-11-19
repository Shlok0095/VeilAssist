/**
 * Smoke test — overlay bounded chrome + mouse passthrough policies.
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const root = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.join(root, '..')
const require = createRequire(import.meta.url)

const {
  isPointInBounds,
  pointInRegions,
  isInChromeGutter,
  isNotchOnlyLayout,
  resolveBoundedChromeCapture,
  resolveOverlayHitCapture,
  resolveOverlayMouseCapture,
} = require(path.join(appRoot, 'lib/overlayMousePolicy.js'))
const storeSchema = require(path.join(appRoot, 'lib/store.js')).schema

if (!storeSchema.overlayMousePassthroughEnabled) {
  throw new Error('store missing overlayMousePassthroughEnabled')
}
if (storeSchema.overlayMousePassthroughEnabled.default !== false) {
  throw new Error('overlayMousePassthroughEnabled should default to false')
}

if (!isPointInBounds({ x: 5, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })) {
  throw new Error('expected cursor inside bounds')
}
if (isPointInBounds({ x: 10, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })) {
  throw new Error('expected cursor outside bounds (right edge exclusive)')
}

if (!pointInRegions(5, 5, [{ x: 0, y: 0, width: 10, height: 10 }], { captureWhenEmpty: false })) {
  throw new Error('expected point inside region')
}
if (pointInRegions(5, 5, [], { captureWhenEmpty: false })) {
  throw new Error('empty regions should not capture when captureWhenEmpty=false')
}
if (!pointInRegions(5, 5, [], { captureWhenEmpty: true })) {
  throw new Error('empty regions should capture when captureWhenEmpty=true')
}

if (!isInChromeGutter(0, 5, [{ x: 10, y: 0, width: 100, height: 10 }])) {
  throw new Error('expected gutter left of chrome row')
}
if (!isInChromeGutter(120, 5, [{ x: 10, y: 0, width: 100, height: 10 }])) {
  throw new Error('expected gutter right of chrome row')
}
if (isInChromeGutter(50, 5, [{ x: 10, y: 0, width: 100, height: 10 }])) {
  throw new Error('expected inside chrome row not to be gutter')
}

const notchOnly = [{ x: 100, y: 0, width: 252, height: 42 }]
if (!isNotchOnlyLayout(notchOnly)) {
  throw new Error('expected notch-only layout')
}
if (isNotchOnlyLayout([...notchOnly, { x: 0, y: 200, width: 400, height: 300 }])) {
  throw new Error('panel + notch should not be notch-only layout')
}

{
  const r = resolveBoundedChromeCapture({ inChrome: false, inGutter: false })
  if (r.capture) {
    throw new Error('bounded chrome should forward below notch/panel')
  }
}

{
  const r = resolveBoundedChromeCapture({ inChrome: true, inGutter: false })
  if (!r.capture) {
    throw new Error('bounded chrome should capture inside chrome rects')
  }
}

{
  const r = resolveBoundedChromeCapture({ inChrome: false, inGutter: true })
  if (r.capture) {
    throw new Error('bounded chrome should forward in gutter beside notch')
  }
}

{
  const r = resolveOverlayHitCapture({
    passthroughEnabled: false,
    inChrome: false,
    inGutter: false,
    regions: notchOnly,
  })
  if (!r.capture) {
    throw new Error('legacy passthrough-off policy still captures below notch when panel hidden')
  }
}

{
  const r = resolveOverlayMouseCapture({ overlayVisible: false, passthroughEnabled: true })
  if (!r.ignore || r.forward || r.useRendererPassthrough) {
    throw new Error('hidden overlay should ignore without renderer passthrough')
  }
}

{
  const r = resolveOverlayMouseCapture({ overlayVisible: true, passthroughEnabled: true })
  if (!r.ignore || !r.forward || !r.useRendererPassthrough) {
    throw new Error('mouse passthrough setting should use renderer hover capture')
  }
}

{
  const r = resolveOverlayMouseCapture({ overlayVisible: true, passthroughEnabled: false })
  if (r.useRendererPassthrough) {
    throw new Error('passthrough off should use bounded poll, not renderer passthrough')
  }
}

const mainSrc = fs.readFileSync(path.join(appRoot, 'main/index.js'), 'utf8')
for (const needle of [
  'overlayMousePolicy',
  'overlay:update-hit-regions',
  'syncOverlayBoundedCaptureFromCursor',
  'startOverlayBoundedPoll',
  'overlayMousePassthroughEnabled',
]) {
  if (!mainSrc.includes(needle)) {
    throw new Error(`main/index.js missing ${needle}`)
  }
}

const boundedSrc = fs.readFileSync(
  path.join(appRoot, 'renderer/overlay/useOverlayBoundedRegions.js'),
  'utf8',
)
if (!boundedSrc.includes('overlay:update-hit-regions')) {
  throw new Error('bounded regions hook should push regions to main')
}

const passthroughSrc = fs.readFileSync(
  path.join(appRoot, 'renderer/overlay/useOverlayMousePassthrough.js'),
  'utf8',
)
if (!passthroughSrc.includes('data-overlay-hit')) {
  throw new Error('mouse passthrough hook should bind data-overlay-hit targets')
}

const overlaySrc = fs.readFileSync(path.join(appRoot, 'renderer/overlay/App.jsx'), 'utf8')
if (!overlaySrc.includes('useOverlayBoundedRegions')) {
  throw new Error('overlay App.jsx missing useOverlayBoundedRegions hook')
}
if (!overlaySrc.includes('useOverlayMousePassthrough')) {
  throw new Error('overlay App.jsx missing useOverlayMousePassthrough hook')
}
if (!overlaySrc.includes('data-overlay-hit')) {
  throw new Error('overlay App.jsx missing data-overlay-hit chrome markers')
}

console.log('OK overlay mouse capture policy')
