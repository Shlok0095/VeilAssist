// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

/**
 * lib/store.js keeps an in-memory mirror of the encrypted config so `get` no longer re-reads/decrypts the
 * whole file and unchanged `set`s skip the disk. This test proves the mirror is observationally identical to
 * plain electron-store: same file format (read back by an independent reader), same error behaviour,
 * clone-on-read semantics, and no-op writes that leave the file untouched.
 *
 * Runs under plain Node: `electron` is stubbed (no safeStorage => encrypted keys are stored as-is).
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')
const assert = require('assert')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-store-cache-'))
const electronStub = {
  app: { getPath: () => tmp, getVersion: () => '0.0.0-test', getName: () => 'test' },
  ipcMain: { on() {} },
  ipcRenderer: undefined,
  shell: {},
  safeStorage: { isEncryptionAvailable: () => false },
}
const origLoad = Module._load
Module._load = function (request, ...rest) {
  if (request === 'electron') return electronStub
  return origLoad.call(this, request, ...rest)
}

const Conf = require('electron-store')
const storeModule = require('../lib/store.js')
const CONFIG = path.join(tmp, 'shadowassist-v2-config.json')

let failed = 0
function check(name, fn) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}\n      ${String(e && e.message).split('\n')[0]}`)
  }
}
/** A fresh, independent electron-store reading the same encrypted file (the pre-cache behaviour). */
const independent = () => new Conf({ name: 'shadowassist-v2-config', encryptionKey: 'shadowassist-v2' })
const bytes = () => fs.readFileSync(CONFIG)

check('defaults come from the schema when a key was never written', () => {
  assert.strictEqual(storeModule.get('overlayOpacity'), storeModule.schema.overlayOpacity.default)
})

check('set → get round-trips primitives, arrays and objects', () => {
  storeModule.set('provider', 'nvidia')
  storeModule.set('hotkeys', { a: 'Ctrl+A', nested: { n: [1, 2, 3] } })
  assert.strictEqual(storeModule.get('provider'), 'nvidia')
  assert.deepStrictEqual(storeModule.get('hotkeys'), { a: 'Ctrl+A', nested: { n: [1, 2, 3] } })
})

check('file on disk is readable by an independent electron-store (format unchanged)', () => {
  const raw = independent()
  assert.strictEqual(raw.get('provider'), 'nvidia')
  assert.deepStrictEqual(raw.get('hotkeys'), { a: 'Ctrl+A', nested: { n: [1, 2, 3] } })
})

check('objects are cloned on read: mutating a returned value does not corrupt the cache', () => {
  const a = storeModule.get('hotkeys')
  a.nested.n.push(99)
  a.extra = true
  assert.deepStrictEqual(storeModule.get('hotkeys'), { a: 'Ctrl+A', nested: { n: [1, 2, 3] } })
})

check('the value passed to set is copied: later mutation by the caller does not leak in', () => {
  const v = { list: [1] }
  storeModule.set('consentRecord', v)
  v.list.push(2)
  assert.deepStrictEqual(storeModule.get('consentRecord'), { list: [1] })
  assert.deepStrictEqual(independent().get('consentRecord'), { list: [1] })
})

check('setting an unchanged value does not touch the disk', () => {
  storeModule.set('provider', 'nvidia')
  const before = bytes()
  storeModule.set('provider', 'nvidia')
  storeModule.set('hotkeys', { a: 'Ctrl+A', nested: { n: [1, 2, 3] } })
  assert.ok(before.equals(bytes()), 'file changed on a no-op set')
})

check('setting a changed value writes the disk and the independent reader sees it', () => {
  const before = bytes()
  storeModule.set('provider', 'groq')
  assert.ok(!before.equals(bytes()), 'file did not change')
  assert.strictEqual(independent().get('provider'), 'groq')
  assert.strictEqual(storeModule.get('provider'), 'groq')
})

check('set(key, undefined) throws like electron-store and leaves state intact', () => {
  assert.throws(() => storeModule.set('provider', undefined), TypeError)
  assert.strictEqual(storeModule.get('provider'), 'groq')
})

check('non-JSON values (function) throw like electron-store and leave state intact', () => {
  assert.throws(() => storeModule.set('provider', () => {}), TypeError)
  assert.strictEqual(storeModule.get('provider'), 'groq')
})

check('values JSON would alter (NaN, nested undefined) take the original path, not the cache', () => {
  storeModule.set('overlayOpacity', NaN)
  // JSON stores NaN as null; the wrapper then applies its `?? schema default`, exactly as before the cache.
  const reread = independent().get('overlayOpacity')
  assert.strictEqual(reread, null)
  assert.strictEqual(storeModule.get('overlayOpacity'), storeModule.schema.overlayOpacity.default)
  storeModule.set('contextPrompts', [{ id: 'x', gone: undefined }])
  assert.deepStrictEqual(storeModule.get('contextPrompts'), independent().get('contextPrompts'))
})

check('dotted keys keep electron-store dot-notation semantics and the cache stays coherent', () => {
  storeModule.set('dotted.child', 5)
  assert.strictEqual(independent().get('dotted.child'), 5)
  assert.strictEqual(storeModule.get('dotted.child'), 5)
  assert.deepStrictEqual(storeModule.get('dotted'), { child: 5 })
  storeModule.set('provider', 'nvidia')
  assert.strictEqual(independent().get('provider'), 'nvidia')
  assert.strictEqual(independent().get('dotted.child'), 5, 'cache write must not drop keys written via the fallback path')
})

check('getAll matches an independent read for every schema key that is set', () => {
  const all = storeModule.getAll()
  const raw = independent()
  for (const k of Object.keys(storeModule.schema)) {
    const onDisk = raw.get(k)
    // The wrapper's contract is `stored ?? schema default` (null/undefined → default).
    if (onDisk !== undefined) assert.deepStrictEqual(all[k], onDisk ?? storeModule.schema[k]?.default, `mismatch for ${k}`)
  }
})

check('clear() empties both the file and the cache', () => {
  storeModule.clear()
  assert.strictEqual(storeModule.get('provider'), storeModule.schema.provider.default)
  assert.strictEqual(independent().get('provider'), undefined)
  storeModule.set('provider', 'nvidia')
  assert.strictEqual(independent().get('provider'), 'nvidia')
})

check('runDataMigration is idempotent and its repeat run performs no disk writes', () => {
  storeModule.runDataMigration()
  const afterFirst = bytes()
  const snapshot = storeModule.getAll()
  storeModule.runDataMigration()
  assert.ok(afterFirst.equals(bytes()), 'second migration run rewrote the file')
  assert.deepStrictEqual(storeModule.getAll(), snapshot)
})

// ── benchmark (informational; asserts only that the cache is not slower) ──────────────────────────────
{
  storeModule.clear()
  const sessions = Array.from({ length: 50 }, (_, i) => ({
    id: `s${i}`,
    title: `Meeting ${i}`,
    transcript: 'lorem ipsum dolor sit amet '.repeat(20),
    summary: 'summary '.repeat(10),
  }))
  storeModule.set('meetingSessions', sessions)
  storeModule.set('contextPrompts', Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, content: 'x'.repeat(400) })))
  const size = bytes().length
  const raw = independent()
  const N = 400
  let t = process.hrtime.bigint()
  for (let i = 0; i < N; i++) raw.get('provider')
  const rawGetMs = Number(process.hrtime.bigint() - t) / 1e6 / N
  t = process.hrtime.bigint()
  for (let i = 0; i < N; i++) storeModule.get('provider')
  const cachedGetMs = Number(process.hrtime.bigint() - t) / 1e6 / N
  const M = 40
  t = process.hrtime.bigint()
  for (let i = 0; i < M; i++) raw.set('overlayOpacity', 0.5 + i / 1000)
  const rawSetMs = Number(process.hrtime.bigint() - t) / 1e6 / M
  t = process.hrtime.bigint()
  for (let i = 0; i < M; i++) storeModule.set('overlayOpacity', 0.6 + i / 1000)
  const cachedSetMs = Number(process.hrtime.bigint() - t) / 1e6 / M
  t = process.hrtime.bigint()
  for (let i = 0; i < M; i++) storeModule.set('overlayOpacity', 0.9)
  const noopSetMs = Number(process.hrtime.bigint() - t) / 1e6 / M
  t = process.hrtime.bigint()
  storeModule.getAll()
  const getAllMs = Number(process.hrtime.bigint() - t) / 1e6
  console.log(
    `INFO  config ${(size / 1024).toFixed(1)} KB | get: raw ${rawGetMs.toFixed(3)} ms → cached ${cachedGetMs.toFixed(4)} ms` +
      ` | set(changed): raw ${rawSetMs.toFixed(2)} ms → cached ${cachedSetMs.toFixed(2)} ms | set(unchanged): ${noopSetMs.toFixed(4)} ms` +
      ` | getAll(): ${getAllMs.toFixed(2)} ms`,
  )
  check('cached get is faster than a raw electron-store get', () => assert.ok(cachedGetMs < rawGetMs))
  check('cached changed-set is not slower than a raw electron-store set', () => assert.ok(cachedSetMs <= rawSetMs * 1.15))
}

Module._load = origLoad
try {
  fs.rmSync(tmp, { recursive: true, force: true })
} catch {
  /* best effort */
}
if (failed) {
  console.log(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll store-cache checks passed')
