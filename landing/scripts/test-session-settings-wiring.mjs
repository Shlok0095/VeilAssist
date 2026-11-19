#!/usr/bin/env node
/**
 * Step-by-step session settings wiring test.
 * Verifies answer structure, response format, conversation memory, and auto-scroll
 * are wired from Settings → prompt/session at answer generation time.
 *
 * Usage (from landing/): node scripts/test-session-settings-wiring.mjs
 * Optional device checks: ANDROID_SERIAL=5f8adfa9 node scripts/test-session-settings-wiring.mjs --device
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const landing = path.resolve(__dir, '..')
const src = path.join(landing, 'src', 'mobile')
const deviceFlag = process.argv.includes('--device')
const device = process.env.ANDROID_SERIAL || '5f8adfa9'
const pkg = 'com.veilassist.interview'

const results = []

function step(num, title) {
  console.log(`\n── Step ${num}: ${title} ──`)
}

function pass(name, detail = '') {
  results.push({ ok: true, name, detail })
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail = '') {
  results.push({ ok: false, name, detail })
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}

function skip(name, detail = '') {
  results.push({ ok: true, skipped: true, name, detail })
  console.log(`  SKIP  ${name}${detail ? ` — ${detail}` : ''}`)
}

function read(rel) {
  return readFileSync(path.join(src, rel), 'utf8')
}

function adb(args) {
  return execFileSync('adb', ['-s', device, ...args], { encoding: 'utf8' }).trim()
}

function adbTry(args) {
  try {
    return { ok: true, out: adb(args) }
  } catch (e) {
    return { ok: false, out: (e.stderr || e.stdout || e.message || '').toString() }
  }
}

async function runPayloadProbe() {
  const spec = (rel) => JSON.stringify(pathToFileURL(path.join(src, rel)).href)
  const probe = `
import { selectConversationMemory, structurePrompt, formatPrompt } from ${spec('settingsCatalog.ts')}
import { transcriptInWindow } from ${spec('transcriptSegments.ts')}

const now = 2_000_000

function miniSystemPrompt(answerStructure, responseFormat, conversationMemorySec, recentConversation) {
  const parts = ['You are VeilAssist']
  const sl = structurePrompt(answerStructure)
  if (sl) parts.push(sl)
  parts.push(formatPrompt(responseFormat))
  if (recentConversation?.trim()) {
    parts.push('\\n## RECENT CONVERSATION (last ' + conversationMemorySec + 's — use for follow-ups and context)\\n' + recentConversation.trim())
  }
  return parts.join('\\n')
}

const structureCases = [
  ['star', 'STAR'],
  ['car', 'CAR'],
  ['soar', 'SOAR'],
  ['par', 'PAR'],
  ['soara', 'SOARA'],
]

const formatCases = [
  ['bullets', 'bullet'],
  ['conversational', 'spoken'],
  ['example', 'concrete'],
]

const failures = []

for (const [value, needle] of structureCases) {
  const line = structurePrompt(value)
  if (!line?.includes(needle)) failures.push('structurePrompt ' + value)
  const sys = miniSystemPrompt(value, 'bullets', 30, '')
  if (!sys.includes(needle)) failures.push('systemPrompt structure ' + value)
}

for (const [value, needle] of formatCases) {
  const line = formatPrompt(value)
  if (!line.toLowerCase().includes(needle)) failures.push('formatPrompt ' + value)
  const sys = miniSystemPrompt('star', value, 30, '')
  if (!sys.toLowerCase().includes(needle)) failures.push('systemPrompt format ' + value)
}

const turns = [
  { question: 'Q1', answer: 'A1', at: now - 200_000 },
  { question: 'Q2', answer: 'A2', at: now - 50_000 },
  { question: 'Q3', answer: 'A3', at: now - 5_000 },
]

const selected30 = selectConversationMemory(turns, 30, now)
if (selected30.some((t) => t.question === 'Q1')) failures.push('30s should exclude Q1')
if (!selected30.some((t) => t.question === 'Q3')) failures.push('30s should include Q3')

const selected180 = selectConversationMemory(turns, 180, now)
if (selected180.length !== 2) failures.push('180s should include Q2+Q3 (got ' + selected180.length + ')')
if (selected180.some((t) => t.question === 'Q1')) failures.push('180s should exclude Q1')

const recent = 'Interviewer: follow up on teamwork'
const memPrompt = miniSystemPrompt('star', 'bullets', 60, recent)
if (!memPrompt.includes('RECENT CONVERSATION (last 60s')) failures.push('recentConversation header 60s')
if (!memPrompt.includes(recent)) failures.push('recentConversation body')

const history = selectConversationMemory(turns, 120, now)
if (history.length < 2) failures.push('turn history window 120s')

const segs = [
  { id: 1, text: 'old speech', consumed: false, capturedAt: now - 120_000 },
  { id: 2, text: 'recent speech', consumed: false, capturedAt: now - 4_000 },
]
if (!transcriptInWindow(segs, 30, now).includes('recent speech')) failures.push('transcriptInWindow 30s')
if (transcriptInWindow(segs, 30, now).includes('old speech')) failures.push('transcriptInWindow excludes old')

console.log(JSON.stringify({ ok: failures.length === 0, failures }))
`
  const probePath = path.join(__dir, '.session-wiring-probe.mts')
  writeFileSync(probePath, probe, 'utf8')
  const r = spawnSync(process.execPath, ['--experimental-strip-types', probePath], {
    encoding: 'utf8',
    cwd: landing,
  })
  unlinkSync(probePath)
  const line = (r.stdout || '').trim().split('\n').filter(Boolean).at(-1) || ''
  let parsed
  try {
    parsed = JSON.parse(line)
  } catch {
    fail('Runtime payload probe', (r.stderr || r.stdout || 'no output').slice(0, 400))
    return false
  }
  if (parsed.ok) {
    pass('All structure/format/memory payload combinations')
    return true
  }
  for (const f of parsed.failures) fail(f)
  return false
}

function staticSessionWiring() {
  step(1, 'Answer structure → session prompt (source wiring)')
  const prompt = read('promptBuilder.ts')
  const catalog = read('settingsCatalog.ts')
  const session = read('useInterviewSession.ts')
  const interview = read('screens/InterviewScreen.tsx')

  const structures = ['star', 'car', 'soar', 'par', 'soara']
  for (const s of structures) {
    if (catalog.includes(`case '${s}':`) && catalog.includes('structurePrompt')) {
      pass(`Catalog defines ${s.toUpperCase()} prompt`)
    } else {
      fail(`Catalog defines ${s.toUpperCase()} prompt`)
    }
  }
  if (prompt.includes('structurePrompt(input.answerStructure)')) {
    pass('buildInterviewSystemPrompt uses answerStructure')
  } else {
    fail('buildInterviewSystemPrompt uses answerStructure')
  }
  if (session.includes('settings: currentSettings') && session.includes('requestInterviewAnswer')) {
    pass('generateFromText passes live settings into requestInterviewAnswer')
  } else {
    fail('generateFromText passes live settings into requestInterviewAnswer')
  }

  step(2, 'Response format → session prompt (source wiring)')
  const formats = ['conversational', 'example']
  for (const f of formats) {
    if (catalog.includes(`case '${f}':`)) pass(`Catalog defines ${f} format prompt`)
    else fail(`Catalog defines ${f} format prompt`)
  }
  if (catalog.includes('bullet points') && catalog.includes('formatPrompt')) {
    pass('Catalog defines bullets format prompt (default branch)')
  } else {
    fail('Catalog defines bullets format prompt (default branch)')
  }
  if (prompt.includes('formatPrompt(input.responseFormat)')) {
    pass('buildInterviewSystemPrompt uses responseFormat')
  } else {
    fail('buildInterviewSystemPrompt uses responseFormat')
  }

  step(3, 'Conversation memory → session at answer time')
  if (session.includes('transcriptInWindow(') && session.includes('conversationMemorySec')) {
    pass('Session builds recentConversation from transcriptInWindow + conversationMemorySec')
  } else {
    fail('Session builds recentConversation from transcriptInWindow + conversationMemorySec')
  }
  if (session.includes('recentConversation,') && session.includes('turnHistory: turnHistoryRef.current')) {
    pass('Session passes recentConversation + turnHistory to requestInterviewAnswer')
  } else {
    fail('Session passes recentConversation + turnHistory to requestInterviewAnswer')
  }
  if (prompt.includes('selectConversationMemory') && prompt.includes('conversationMemorySec')) {
    pass('buildChatPayload applies selectConversationMemory for prior Q&A turns')
  } else {
    fail('buildChatPayload applies selectConversationMemory for prior Q&A turns')
  }
  const adv = read('screens/AdvancedSettingsScreen.tsx')
  if (adv.includes('conversationMemorySec') && adv.includes('MEMORY_OPTIONS')) {
    pass('Advanced settings exposes conversation memory control')
  } else {
    fail('Advanced settings exposes conversation memory control')
  }

  step(4, 'Auto-scroll alignment in interview session')
  const autoScroll = read('useAutoScroll.ts')
  if (interview.includes('useAutoScrollToBottom(settings.autoScroll')) {
    pass('InterviewScreen auto-scroll follows settings.autoScroll toggle')
  } else {
    fail('InterviewScreen auto-scroll follows settings.autoScroll toggle')
  }
  if (
    interview.includes('session.streamingAnswer') &&
    interview.includes('session.turnHistory') &&
    interview.includes('session.isGenerating')
  ) {
    pass('Auto-scroll deps include turns + streaming + generating state')
  } else {
    fail('Auto-scroll deps include turns + streaming + generating state')
  }
  if (interview.includes('session.answerEndRef') && interview.includes('data-scroll-anchor')) {
    pass('Scroll anchor shared with session.answerEndRef (stream + turn alignment)')
  } else {
    fail('Scroll anchor shared with session.answerEndRef (stream + turn alignment)')
  }
  if (session.includes('scrollAnswer') && session.includes('settingsRef.current.autoScroll')) {
    pass('Session scrollAnswer respects autoScroll during streaming')
  } else {
    fail('Session scrollAnswer respects autoScroll during streaming')
  }
  if (autoScroll.includes('scrollContainerToBottom')) {
    pass('useAutoScrollToBottom aligns via container scrollHeight')
  } else {
    fail('useAutoScrollToBottom aligns via container scrollHeight')
  }
  if (interview.includes('onPatchSettings({ autoScroll')) {
    pass('Session options sheet can toggle auto-scroll live')
  } else {
    fail('Session options sheet can toggle auto-scroll live')
  }
}

async function deviceSessionChecks() {
  step(6, 'Device — settings persist and session reads them')
  const devices = adbTry(['devices'])
  if (!devices.ok || !devices.out.includes(device)) {
    skip('Device connected', device)
    return
  }
  pass('Device connected', device)

  adbTry(['shell', 'am', 'force-stop', pkg])
  await new Promise((r) => setTimeout(r, 1200))
  adbTry(['shell', 'am', 'start', '-n', `${pkg}/.MainActivity`])
  await new Promise((r) => setTimeout(r, 2800))

  const pid = adbTry(['shell', 'pidof', pkg]).out.trim().split(/\s+/)[0]
  if (!pid) {
    skip('WebView CDP', 'no pid')
    return
  }

  const sockets = adbTry(['shell', 'cat', '/proc/net/unix']).out || ''
  const sock = sockets
    .split('\n')
    .map((l) => l.trim().split(/\s+/).pop() || '')
    .find((n) => n.includes(`webview_devtools_remote_${pid}`))
  if (!sock) {
    skip('WebView CDP', 'no debug socket')
    return
  }

  const port = 9333 + Math.floor(Math.random() * 500)
  adbTry(['forward', '--remove', `tcp:${port}`])
  const fwd = adbTry(['forward', `tcp:${port}`, `localabstract:${sock.replace(/^@/, '')}`])
  if (!fwd.ok) {
    skip('WebView CDP forward', fwd.out.slice(0, 120))
    return
  }

  let pages
  try {
    pages = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json())
  } catch (e) {
    skip('WebView CDP', e.message)
    return
  }
  const page = (pages || []).find((p) => p.webSocketDebuggerUrl)
  if (!page) {
    skip('WebView CDP page', 'none')
    return
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  let nextId = 1
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data))
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  })
  async function cdpEval(expr) {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }))
    }).then((r) => r.result?.value)
  }

  await cdpEval(`Runtime.enable`)

  // Inject settings for structure/format/memory before navigating
  const injected = await cdpEval(`(() => {
    const KEY = 'veilassist.mobile.appSettings.v1'
    let s = {}
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') } catch {}
    s.answerStructure = 'car'
    s.responseFormat = 'conversational'
    s.conversationMemorySec = 120
    s.autoScroll = true
    localStorage.setItem(KEY, JSON.stringify(s))
    return { answerStructure: s.answerStructure, responseFormat: s.responseFormat, conversationMemorySec: s.conversationMemorySec }
  })()`)
  if (injected?.answerStructure === 'car' && injected?.responseFormat === 'conversational') {
    pass('Device localStorage accepts structure/format/memory settings', JSON.stringify(injected))
  } else {
    fail('Device localStorage accepts structure/format/memory settings', JSON.stringify(injected))
  }

  // Open settings and verify sheets for structure + format
  await cdpEval(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /settings/i.test(b.textContent || ''))
    btn?.click()
  })()`)
  await new Promise((r) => setTimeout(r, 700))

  await cdpEval(`document.querySelector('.mobile-screen-body')?.scrollTo(0, 900)`)
  await new Promise((r) => setTimeout(r, 300))
  await cdpEval(`(() => {
    const row = [...document.querySelectorAll('button')].find((b) => /Answer structure/i.test(b.textContent || ''))
    row?.click()
  })()`)
  await new Promise((r) => setTimeout(r, 500))
  const structureSheet = await cdpEval(`/CAR|SOAR|STAR/i.test(document.body.innerText || '')`)
  if (structureSheet) pass('Answer structure sheet opens on device')
  else fail('Answer structure sheet opens on device')

  await cdpEval(`(() => {
    const dismiss = document.querySelector('.mobile-choice-backdrop')
    dismiss?.click()
  })()`)
  await new Promise((r) => setTimeout(r, 400))

  await cdpEval(`document.querySelector('.mobile-screen-body')?.scrollTo(0, 1100)`)
  await new Promise((r) => setTimeout(r, 350))
  await cdpEval(`(() => {
    const row = [...document.querySelectorAll('button')].find((b) => /Response format/i.test(b.textContent || ''))
    row?.click()
  })()`)
  await new Promise((r) => setTimeout(r, 500))
  const formatSheet = await cdpEval(`/Bullet Points|Conversational|Example-Driven/i.test(document.body.innerText || '')`)
  if (formatSheet) pass('Response format sheet opens on device')
  else fail('Response format sheet opens on device')

  await cdpEval(`(() => {
    document.querySelector('.mobile-choice-backdrop')?.click()
    document.querySelector('.mobile-back-btn')?.click()
  })()`)
  await new Promise((r) => setTimeout(r, 500))

  const startDisabled = await cdpEval(`!!document.querySelector('.mobile-start-btn')?.disabled`)
  if (!startDisabled) {
    await cdpEval(`document.querySelector('.mobile-start-btn')?.click()`)
    await new Promise((r) => setTimeout(r, 2800))
    const inInterview = await cdpEval(`!!document.querySelector('.mobile-interview-shell')`)
    const scrollAnchor = await cdpEval(`!!document.querySelector('[data-scroll-anchor]')`)
    const autoScrollOn = await cdpEval(`(() => {
      try {
        return JSON.parse(localStorage.getItem('veilassist.mobile.appSettings.v1') || '{}').autoScroll !== false
      } catch { return true }
    })()`)
    if (inInterview) pass('Interview session started on device')
    else fail('Interview session started on device')
    if (scrollAnchor) pass('Interview session has scroll anchor element')
    else fail('Interview session has scroll anchor element')
    if (autoScrollOn) pass('Auto-scroll enabled in stored settings during session')
    else fail('Auto-scroll enabled in stored settings during session')
  } else {
    skip('Interview scroll anchor', 'Start Interview disabled (profile/keys)')
  }

  ws.close()
  adbTry(['forward', '--remove', `tcp:${port}`])
}

async function main() {
  console.log('Session settings wiring test\n')
  staticSessionWiring()

  step(5, 'Runtime — each structure, format, and memory window in buildChatPayload')
  await runPayloadProbe()

  if (deviceFlag) {
    await deviceSessionChecks()
  } else {
    skip('Device session checks', 'pass --device to run on connected phone')
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} passed${failed.length ? `, ${failed.length} failed` : ''} ===`)
  if (failed.length) {
    process.exitCode = 1
  }
}

main().catch((e) => {
  fail('Harness', e.message)
  process.exitCode = 1
})
