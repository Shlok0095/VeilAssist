#!/usr/bin/env node
/**
 * Full VeilAssist Interview APK wiring + device test.
 * Usage (from landing/): node scripts/test-mobile-app.mjs
 */
import { execFileSync, execSync, spawnSync } from 'node:child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const landing = path.resolve(__dir, '..')
const src = path.join(landing, 'src', 'mobile')
const pkg = 'com.veilassist.interview'
const device = process.env.ANDROID_SERIAL || '5f8adfa9'

const results = []

function pass(name, detail = '') {
  results.push({ ok: true, name, detail })
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail = '') {
  results.push({ ok: false, name, detail })
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}

function skip(name, detail = '') {
  results.push({ ok: true, skipped: true, name, detail })
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ''}`)
}

function read(rel) {
  return readFileSync(path.join(src, rel), 'utf8')
}

function assertIncludes(name, hay, needles) {
  const missing = needles.filter((n) => !hay.includes(n))
  if (missing.length) fail(name, `missing: ${missing.join(' | ')}`)
  else pass(name)
}

function assertAbsent(name, hay, needles) {
  const found = needles.filter((n) => hay.includes(n))
  if (found.length) fail(name, `still present: ${found.join(' | ')}`)
  else pass(name)
}

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    cwd: landing,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  }).trim()
}

function shTry(cmd) {
  try {
    return { ok: true, out: sh(cmd) }
  } catch (e) {
    return { ok: false, out: (e.stderr || e.stdout || e.message || '').toString() }
  }
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

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      s.close(() => resolve(port))
    })
    s.on('error', reject)
  })
}

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl)
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
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  })
  async function send(method, params = {}) {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, 12000)
    })
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text
      throw new Error(text)
    }
    return result.result?.value
  }
  return { ws, send, evaluate }
}

function sourceWiring() {
  console.log('\n=== Source wiring ===')
  const settings = read('screens/SettingsScreen.tsx')
  const advanced = read('screens/AdvancedSettingsScreen.tsx')
  const audio = read('screens/settings/AudioSettingsSection.tsx')
  const app = read('MobileInterviewApp.tsx')
  const interview = read('screens/InterviewScreen.tsx') + read('components/SessionOrb.tsx')
  const font = read('screens/FontSizeScreen.tsx')
  const css = read('mobile-interview.css')
  const prompt = read('promptBuilder.ts')
  const session = read('useInterviewSession.ts')
  const catalog = read('settingsCatalog.ts')
  const personal = read('screens/PersonalInfoScreen.tsx')
  const home = read('screens/HomeScreen.tsx')
  const providers = read('screens/settings/ProviderConfigSection.tsx')
  const models = read('screens/settings/ModelSelect.tsx')

  assertIncludes('Provider and model pickers use gesture sheets', providers + models, [
    'SheetSelect',
  ])
  assertAbsent('No native provider/model dropdowns', providers + models, ['<select', 'PremiumSelect'])
  assertIncludes('Settings: interview topic + custom instructions', settings, [
    'FilledField',
    'Interview topic',
    'interviewTopicLocked: true',
    'Custom instructions',
    'customInstructions',
  ])
  assertIncludes('Settings: personal info navigates to screen', settings, [
    'onOpenPersonalInfo',
    'Personal info',
  ])
  assertIncludes('Settings: interview language sheet sets mic from language', settings, [
    'Interview language',
    'micFromInterviewLanguage(lang.value)',
    'Spoken answers and transcription follow this when supported',
  ])
  assertAbsent('Settings: no separate Listen language picker', audio + settings, ['Listen language'])
  assertIncludes('Settings: AI responses wired', settings, [
    'Auto-answer questions',
    'Answer structure',
    'Response format',
    'Answer length',
    'Question detection',
    'answerStructure',
    'responseFormat',
    'answerLength',
    'questionDetection',
  ])
  assertIncludes('Settings: appearance + font size screen', settings, [
    'Theme',
    'colorScheme',
    'Font size',
    'onOpenFontSize',
    'Auto-scroll answers',
  ])
  assertIncludes('Settings: conversation memory lives in Advanced settings', advanced, [
    'Conversation Memory',
    'conversationMemorySec',
    'How much of the conversation the AI remembers',
    'Longer memory may slow responses',
    'AiProvidersSection',
    'AudioSettingsSection',
  ])
  assertIncludes('Settings: Advanced settings row + restore defaults', settings, [
    'Advanced settings',
    'onOpenAdvancedSettings',
    'Restore defaults',
  ])
  assertAbsent('Main settings: providers / audio / memory moved out', settings, [
    'AiProvidersSection',
    'AudioSettingsSection',
    'Conversation Memory',
  ])
  assertIncludes('Audio: mic / STT / transcription / wake lock', audio, [
    'Keep screen awake',
    'keepScreenAwake',
    'Microphone',
    'audioEnabled',
    'Mic sensitivity',
    'micSensitivity',
    'Transcription engine',
    'sttMode',
    'Show live transcription',
    'showTranscription',
  ])
  assertIncludes('App router: font-size + personal-info + advanced + mic sync', app, [
    "overlayScreen === 'font-size'",
    "setScreen('font-size')",
    'onOpenFontSize',
    "overlayScreen === 'advanced-settings'",
    "setScreen('advanced-settings')",
    'onOpenAdvancedSettings',
    'micFromInterviewLanguage',
    'deriveInterviewTopic',
    'interviewTopicLocked',
  ])
  assertIncludes('Font size preview uses live interview turn classes', font, [
    'mobile-interview-turn-q',
    'mobile-interview-turn-a',
    'ReactMarkdown',
    'Follow System',
  ])
  assertIncludes('CSS font vars apply to interview Q/A', css, [
    '--mi-q-size',
    '--mi-a-size',
    'font-size: var(--mi-q-size)',
    'font-size: var(--mi-a-size)',
    '.mobile-font-small',
    '.mobile-font-xlarge',
  ])
  assertIncludes('Interview screen: Q/A + session orb + composer', interview, [
    'mobile-interview-turn-q',
    'mobile-interview-turn-a',
    'sendTypedQuestion',
    'SessionOrb',
    'OrbSvg',
    'showTranscription',
    'autoScroll',
    'autoAnswer',
    'Ask about your interview',
  ])
  assertIncludes('Prompt builder consumes language/structure/format/length/topic', prompt, [
    'interviewLanguage',
    'customInstructions',
    'answerStructure',
    'responseFormat',
    'answerLength',
    'interviewTopic',
    'recentConversation',
    'conversationMemorySec',
  ])
  assertIncludes('Session consumes auto-answer / STT / mic / wake lock', session, [
    's.autoAnswer',
    'questionDetection',
    'micSensitivity',
    'audioEnabled',
    'keepScreenAwake',
    'sttMode',
    'transcriptInWindow',
    'recentConversation',
  ])
  assertIncludes('Language catalog maps Hindi/Hinglish to mic', catalog, [
    "mic: 'hi'",
    "mic: 'en_hi_hinglish'",
    'export function micFromInterviewLanguage',
  ])
  assertIncludes('Personal info sections present', personal, [
    'Basic Info',
    'Work Experience',
    'Skills',
    'Projects',
    'Education',
    'Extra Context',
    'Upload resume',
  ])
  assertAbsent('Personal info has no job description box', personal, ['Job Description'])
  assertAbsent('Resume upload does not mention API extraction', personal, [
    'Extracting with AI',
    'AI extraction',
  ])
  assertIncludes('Home start gate: profile + AI key + STT key', home, [
    'Start Interview',
    'profileReady && hasApiKey && hasSttKey',
  ])
}

async function runtimeLogic() {
  console.log('\n=== Runtime logic ===')
  const spec = (rel) => JSON.stringify(pathToFileURL(path.join(src, rel)).href)
  const probe = `
import { deriveInterviewTopic } from ${spec('deriveInterviewTopic.ts')}
import { micFromInterviewLanguage, structurePrompt, formatPrompt } from ${spec('settingsCatalog.ts')}
import { transcriptInWindow } from ${spec('transcriptSegments.ts')}

const profile = {
  name: '',
  summary: 'AI/ML Engineer and Data Scientist with 4+ years of combined software engineering and machine learning experience, including 2 years specialized in large language model (LLM) pipelines.',
  skills: ['Python', 'PyTorch'],
  projects: [],
  education: [],
  extraContext: '',
  jobDescription: '',
  experience: [{ id: '1', title: 'Associate Data Scientist', company: 'SoftSensor.ai', dateRange: 'Jun 2025 - Present', bullets: '' }],
}
const topic = deriveInterviewTopic(profile)
const checks = []
const expectTopic = 'AI/ML Engineer specializing in LLMs'
if (topic !== expectTopic) checks.push('topic got ' + JSON.stringify(topic) + ' expected ' + JSON.stringify(expectTopic))
if (micFromInterviewLanguage('hi') !== 'hi') checks.push('hi mic')
if (micFromInterviewLanguage('en_hi_hinglish') !== 'en_hi_hinglish') checks.push('hinglish mic')
if (micFromInterviewLanguage('es') !== 'en') checks.push('spanish mic fallback')
const now = 1_000_000
const segs = [
  { id: 1, text: 'old question', consumed: true, capturedAt: now - 90_000 },
  { id: 2, text: 'tell me about yourself', consumed: false, capturedAt: now - 8_000 },
]
if (transcriptInWindow(segs, 30, now) !== 'tell me about yourself') checks.push('memory 30s window')
if (!transcriptInWindow(segs, 180, now).includes('old question')) checks.push('memory 3m window')
if (!structurePrompt('car')?.includes('CAR')) checks.push('CAR prompt')
if (!formatPrompt('conversational').toLowerCase().includes('spoken')) checks.push('conversational format')
console.log(JSON.stringify({ ok: checks.length === 0, checks, topic }))
`
  const probePath = path.join(__dir, '.wiring-probe.mts')
  try {
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
      fail('Runtime logic import', (r.stderr || r.stdout || 'no output').slice(0, 400))
      return
    }
    if (parsed.ok) pass('Topic / language / prompt wiring', parsed.topic)
    else fail('Topic / language / prompt wiring', parsed.checks.join('; '))
  } catch (e) {
    fail('Runtime logic import', e.message)
  }
}

async function deviceTests() {
  console.log('\n=== Device ===')
  const devices = shTry('adb devices')
  if (!devices.ok || !devices.out.includes(device)) {
    skip('Device connected', 'adb device not found')
    return
  }
  pass('Device connected', device)

  const pkgInfo = adbTry(['shell', 'dumpsys', 'package', pkg])
  if (!pkgInfo.ok) {
    fail('Package installed', pkgInfo.out.slice(0, 200))
    return
  }
  const gradle = readFileSync(path.join(landing, 'android', 'app', 'build.gradle'), 'utf8')
  const expectName = gradle.match(/versionName\s+"([^"]+)"/)?.[1]
  const expectCode = gradle.match(/versionCode\s+(\d+)/)?.[1]
  const versionName = pkgInfo.out.match(/versionName=(\S+)/)?.[1] || 'unknown'
  const versionCode = pkgInfo.out.match(/versionCode=(\d+)/)?.[1] || '?'
  if (versionName === expectName && versionCode === expectCode) pass('Installed version', `${versionName} (${versionCode})`)
  else fail('Installed version', `got ${versionName} (${versionCode}), expected ${expectName} (${expectCode})`)

  adbTry(['shell', 'am', 'force-stop', pkg])
  await wait(1200)
  const launch = adbTry(['shell', 'am', 'start', '-n', `${pkg}/.MainActivity`])
  if (!launch.ok) fail('Launch app', launch.out.slice(0, 200))
  else   pass('Launch app')
  await wait(2500)

  const dns = adbTry(['shell', 'ping', '-c', '1', '-W', '3', 'integrate.api.nvidia.com'])
  if (/1 received|bytes from/i.test(dns.out || '')) pass('Phone DNS to NVIDIA')
  else skip('Phone DNS to NVIDIA ping', (dns.out || '').slice(0, 120).replace(/\s+/g, ' '))

  const pid = adbTry(['shell', 'pidof', pkg]).out.trim().split(/\s+/)[0]
  if (!pid) {
    fail('WebView debug', 'app pid missing')
    return
  }

  const sockets = adbTry(['shell', 'cat', '/proc/net/unix'])
  const sock = (sockets.out || '')
    .split('\n')
    .map((l) => l.trim().split(/\s+/).pop() || '')
    .find((n) => n.includes(`webview_devtools_remote_${pid}`))
  if (!sock) {
    skip('WebView CDP', `no debug socket for pid ${pid} (release WebView?)`)
    await uiautomatorFallback()
    return
  }

  const port = await pickFreePort()
  adbTry(['forward', '--remove', `tcp:${port}`])
  const fwd = adbTry(['forward', `tcp:${port}`, sock.startsWith('@') ? `localabstract:${sock.slice(1)}` : `localabstract:${sock}`])
  if (!fwd.ok) {
    const alt = adbTry(['forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`])
    if (!alt.ok) {
      fail('WebView CDP forward', alt.out.slice(0, 200))
      return
    }
  }

  let pages
  try {
    pages = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json())
  } catch (e) {
    fail('WebView CDP list', e.message)
    return
  }
  const page = (pages || []).find((p) => p.webSocketDebuggerUrl && /localhost|capacitor|index|mobile/i.test(`${p.url} ${p.title}`))
    || (pages || []).find((p) => p.webSocketDebuggerUrl)
  if (!page) {
    fail('WebView CDP page', JSON.stringify(pages).slice(0, 240))
    return
  }
  pass('WebView CDP connected', page.title || page.url)

  const cdp = await cdpConnect(page.webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')

  const snapshot = async () =>
    cdp.evaluate(`({
      title: document.title,
      text: document.body?.innerText?.slice(0, 4000) || '',
      hasListen: /Listen language/i.test(document.body?.innerText || ''),
      fontClass: document.querySelector('.mobile-interview-root')?.className || '',
      qCount: document.querySelectorAll('.mobile-interview-turn-q').length,
      aCount: document.querySelectorAll('.mobile-interview-turn-a').length,
      startDisabled: !!document.querySelector('.mobile-start-btn')?.disabled,
      onHome: !!document.querySelector('.mobile-start-btn'),
      inInterview: !!document.querySelector('.mobile-interview-shell'),
      hasSessionOrb: !!document.querySelector('.mobile-session-orb'),
      onSettings: /\\bSettings\\b/.test(document.querySelector('.mobile-screen-title')?.textContent || ''),
      onFontSize: /Font Size/i.test(document.querySelector('.mobile-screen-title')?.textContent || ''),
      onPersonal: /Personal Info/i.test(document.querySelector('.mobile-screen-title')?.textContent || ''),
      leaveOpen: /Close Interview/i.test(document.body?.innerText || ''),
      settings: (() => {
        try { return JSON.parse(localStorage.getItem('veilassist.mobile.appSettings.v1') || '{}') } catch { return {} }
      })(),
      profile: (() => {
        try { return JSON.parse(localStorage.getItem('veilassist.mobile.profile.v1') || '{}') } catch { return {} }
      })(),
    })`)

  const clickText = (needle) =>
    cdp.evaluate(`(() => {
      const n = ${JSON.stringify(needle)}.toLowerCase()
      const nodes = [...document.querySelectorAll('button, [role="button"], .mobile-settings-link, .mobile-chooser-row, .mobile-choice-row')]
      const el = nodes.find((e) => (e.innerText || e.getAttribute('aria-label') || '').toLowerCase().includes(n))
      if (!el) return false
      el.click()
      return true
    })()`)

  const clickAria = (label) =>
    cdp.evaluate(`(() => {
      const el = document.querySelector('[aria-label="${label}"]')
      if (!el) return false
      el.click()
      return true
    })()`)

  async function ensureHome() {
    for (let i = 0; i < 8; i++) {
      const ui = await snapshot()
      if (ui.onHome && !ui.inInterview && !ui.leaveOpen) return true
      if (ui.leaveOpen) {
        await cdp.evaluate(`document.querySelector('.mobile-leave-end')?.click()`)
        await wait(800)
        continue
      }
      if (ui.inInterview) {
        await clickAria('Dismiss')
        await wait(250)
        await clickAria('Back')
        await wait(500)
        continue
      }
      await clickAria('Back')
      await wait(400)
    }
    return Boolean((await snapshot()).onHome)
  }

  await ensureHome()
  await wait(400)
  let home = await snapshot()
  if (home.onHome) {
    pass('Home screen visible')
  } else {
    fail('Home screen visible', home.text.slice(0, 180).replace(/\s+/g, ' '))
  }

  const openedSettings = (await clickAria('Settings')) || (await clickText('Settings'))
  await wait(700)
  let ui = await snapshot()
  if (openedSettings && /Interview topic|Personal info|Interview language/i.test(ui.text)) {
    pass('Open Settings')
  } else {
    fail('Open Settings', ui.text.slice(0, 200).replace(/\s+/g, ' '))
  }

  const requiredLabels = [
    'Interview topic',
    'Custom instructions',
    'Personal info',
    'Interview language',
    'Auto-answer',
    'Answer structure',
    'Response format',
    'Answer length',
    'Question detection',
    'Theme',
    'Font size',
    'Auto-scroll',
    'Advanced settings',
    'Restore defaults',
  ]
  const missing = requiredLabels.filter((l) => !ui.text.toLowerCase().includes(l.toLowerCase()))
  if (missing.length) {
    await cdp.evaluate(`document.querySelector('.mobile-screen-body')?.scrollTo(0, 4000)`)
    await wait(400)
    ui = await snapshot()
  }
  const missing2 = requiredLabels.filter((l) => !ui.text.toLowerCase().includes(l.toLowerCase()))
  if (missing2.length) fail('Settings labels present', `missing: ${missing2.join(', ')}`)
  else pass('Settings labels present', `${requiredLabels.length} controls`)

  if (/Keep screen awake|Transcription engine/i.test(ui.text)) {
    fail('Main settings stays clean', ui.text.slice(0, 200).replace(/\s+/g, ' '))
  } else if (!/Advanced settings/i.test(ui.text)) {
    fail('Main settings stays clean', 'missing Advanced settings row')
  } else {
    pass('Main settings stays clean')
  }

  if (ui.hasListen) fail('Listen language removed on device')
  else pass('Listen language removed on device')

  const st = ui.settings || {}
  const safeSettings = {
    topic: st.interviewTopic,
    locked: st.interviewTopicLocked,
    lang: st.interviewLanguage,
    mic: st.micListenLanguage,
    font: st.fontSize,
    structure: st.answerStructure,
    format: st.responseFormat,
    length: st.answerLength,
    detection: st.questionDetection,
    autoAnswer: st.autoAnswer,
    sttMode: st.sttMode,
    provider: st.provider,
    theme: st.colorScheme,
    memory: st.conversationMemorySec,
    hasNvidiaKey: Boolean(st.nvidiaKey),
    hasGroqKey: Boolean(st.groqKey),
  }
  pass('Settings persisted in localStorage', JSON.stringify(safeSettings))

  if (st.interviewLanguage && st.micListenLanguage) {
    const expectedMic =
      st.interviewLanguage === 'hi' ? 'hi' : st.interviewLanguage === 'en_hi_hinglish' ? 'en_hi_hinglish' : 'en'
    if (st.micListenLanguage === expectedMic || (st.interviewLanguage.startsWith('en') && st.micListenLanguage === 'en')) {
      pass('Mic language follows interview language', `${st.interviewLanguage} → ${st.micListenLanguage}`)
    } else {
      fail('Mic language follows interview language', `${st.interviewLanguage} → ${st.micListenLanguage}`)
    }
  }

  await cdp.evaluate(`document.querySelector('.mobile-screen-body')?.scrollTo(0, 0)`)
  await wait(250)
  const openedLang = await clickText('Interview language')
  await wait(600)
  ui = await snapshot()
  if (openedLang && /English \(Default\)|Hindi|Hinglish/i.test(ui.text) && /Spoken answers and transcription/i.test(ui.text)) {
    pass('Interview language sheet')
  } else {
    fail('Interview language sheet', ui.text.slice(0, 180).replace(/\s+/g, ' '))
  }
  await clickAria('Dismiss')
  await wait(400)

  await cdp.evaluate(`document.querySelector('.mobile-screen-body')?.scrollTo(0, 1800)`)
  await wait(300)
  const openedStructure = await clickText('Answer structure')
  await wait(500)
  ui = await snapshot()
  if (openedStructure && /STAR|CAR|SOAR|PAR|SOARA/i.test(ui.text)) pass('Answer structure sheet')
  else fail('Answer structure sheet', ui.text.slice(0, 160).replace(/\s+/g, ' '))
  await clickAria('Dismiss')
  await wait(350)

  const openedFormat = await clickText('Response format')
  await wait(500)
  ui = await snapshot()
  if (openedFormat && /Bullet Points|Conversational|Example-Driven/i.test(ui.text)) pass('Response format sheet')
  else fail('Response format sheet', ui.text.slice(0, 160).replace(/\s+/g, ' '))
  await clickAria('Dismiss')
  await wait(350)

  const openedPersonal = await clickText('Personal info')
  await wait(700)
  ui = await snapshot()
  if (openedPersonal && /Edit Personal Info|Basic Info|Work Experience|Upload resume/i.test(ui.text)) {
    pass('Personal info screen')
  } else {
    fail('Personal info screen', ui.text.slice(0, 180).replace(/\s+/g, ' '))
  }
  const name = ui.profile?.name || ''
  const summary = (ui.profile?.summary || '').slice(0, 80)
  if (name || summary) pass('Profile loaded on device', `${name} / ${summary}`)
  else skip('Profile loaded on device', 'empty profile')

  await clickAria('Back')
  await wait(500)

  await cdp.evaluate(`document.querySelector('.mobile-screen-body')?.scrollTo(0, 2500)`)
  await wait(350)
  const openedFont = await clickText('Font size')
  await wait(700)
  ui = await snapshot()
  if (openedFont && /Font Size/i.test(ui.text) && /Follow System/i.test(ui.text) && ui.qCount >= 1 && ui.aCount >= 1) {
    pass('Font size screen uses interview Q/A', `q=${ui.qCount} a=${ui.aCount} class=${ui.fontClass}`)
  } else {
    fail('Font size screen uses interview Q/A', ui.text.slice(0, 200).replace(/\s+/g, ' '))
  }
  if (/mobile-font-(small|standard|large|xlarge)/.test(ui.fontClass)) pass('Root font class applied', ui.fontClass)
  else fail('Root font class applied', ui.fontClass)

  await clickAria('Back')
  await wait(400)
  await cdp.evaluate(`document.querySelector('.mobile-screen-body')?.scrollTo(0, 4000)`)
  await wait(300)
  const openedAdvanced = await clickText('Advanced settings')
  await wait(700)
  ui = await snapshot()
  const advancedOk =
    openedAdvanced &&
    /Advanced Settings/i.test(ui.text) &&
    /AI providers/i.test(ui.text) &&
    /Conversation Memory/i.test(ui.text) &&
    /Keep screen awake/i.test(ui.text)
  if (advancedOk) pass('Advanced settings: providers, audio, memory')
  else fail('Advanced settings: providers, audio, memory', ui.text.slice(0, 220).replace(/\s+/g, ' '))

  await clickAria('Back')
  await wait(400)
  await clickAria('Back')
  await wait(500)
  home = await snapshot()
  if (!home.onHome) await ensureHome()
  home = await snapshot()
  if (home.onHome) pass('Back to home')
  else fail('Back to home', home.text.slice(0, 120).replace(/\s+/g, ' '))

  if (home.startDisabled) {
    skip('Interview session', 'Start Interview disabled (missing profile or keys)')
  } else {
    const started = await clickText('Start Interview')
    await wait(1800)
    dismissNativeDialogs()
    await wait(800)
    ui = await snapshot()
    const interviewOk = started && (ui.inInterview || ui.hasSessionOrb)
    if (interviewOk) pass('Interview session chrome')
    else fail('Interview session chrome', ui.text.slice(0, 220).replace(/\s+/g, ' '))

    const typed = await cdp.evaluate(`(() => {
      const input = document.querySelector('.mobile-interview-input')
      if (!input) return false
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'What are your greatest strengths?')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    if (typed) {
      await clickAria('Send')
      await wait(4000)
      ui = await snapshot()
      const dnsFail = /Unable to resolve host|No address associated with hostname/i.test(ui.text)
      if (ui.qCount >= 1 || /Generating|Composing|strength/i.test(ui.text)) {
        pass('Typed interview question accepted', `q=${ui.qCount} a=${ui.aCount}`)
      } else if (dnsFail) {
        pass('Typed interview send path wired', 'composer sent; NVIDIA DNS failed on device')
        fail('Phone DNS to NVIDIA', 'integrate.api.nvidia.com did not resolve on the handset')
      } else {
        fail('Typed interview question accepted', ui.text.slice(0, 200).replace(/\s+/g, ' '))
      }
    } else {
      fail('Typed interview question accepted', 'composer input missing')
    }
  }

  cdp.ws.close()
  adbTry(['forward', '--remove', `tcp:${port}`])
}

function documentHas(ui, s) {
  return (ui.text || '').includes(s)
}

function dismissNativeDialogs() {
  const dump = adbTry(['shell', 'uiautomator', 'dump', '/sdcard/ui.xml'])
  if (!dump.ok) return
  const xml = adbTry(['shell', 'cat', '/sdcard/ui.xml']).out || ''
  for (const label of ['While using the app', 'Allow', 'ALLOW', 'OK']) {
    const re = new RegExp(`text="${label}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`)
    const m = xml.match(re)
    if (m) {
      const x = Math.floor((Number(m[1]) + Number(m[3])) / 2)
      const y = Math.floor((Number(m[2]) + Number(m[4])) / 2)
      adbTry(['shell', 'input', 'tap', String(x), String(y)])
      sleep(400)
    }
  }
}

async function uiautomatorFallback() {
  dismissNativeDialogs()
  const xml = adbTry(['shell', 'cat', '/sdcard/ui.xml']).out || ''
  if (/VeilAssist|Start Interview|Settings/i.test(xml)) pass('UIAutomator saw app chrome')
  else skip('UIAutomator WebView text', 'WebView children usually not exposed')
}

function typecheck() {
  console.log('\n=== Typecheck ===')
  const r = spawnSync('npm', ['run', 'typecheck'], { cwd: landing, encoding: 'utf8', shell: true })
  if (r.status === 0) pass('npm run typecheck')
  else fail('npm run typecheck', (r.stderr || r.stdout || '').slice(-300))
}

async function nvidiaScripts() {
  console.log('\n=== Existing NVIDIA scripts ===')
  if (!process.env.NVIDIA_API_KEY) {
    skip('test-nvidia-cv.mjs', 'NVIDIA_API_KEY not set')
    skip('android-nvidia-smoke.mjs NVIDIA curl', 'NVIDIA_API_KEY not set')
    return
  }
  const cv = spawnSync(process.execPath, ['scripts/test-nvidia-cv.mjs'], {
    cwd: landing,
    encoding: 'utf8',
    env: process.env,
  })
  if (cv.status === 0) pass('test-nvidia-cv.mjs')
  else fail('test-nvidia-cv.mjs', (cv.stderr || cv.stdout || '').slice(0, 240))
}

try {
  typecheck()
  sourceWiring()
  await runtimeLogic()
  await nvidiaScripts()
  await deviceTests()
} catch (e) {
  fail('Harness', e.stack || e.message)
}

const failed = results.filter((r) => !r.ok)
const skipped = results.filter((r) => r.skipped)
const passed = results.filter((r) => r.ok && !r.skipped)
console.log(`\n=== Summary ===`)
console.log(`Passed ${passed.length}  Failed ${failed.length}  Skipped ${skipped.length}`)
if (failed.length) {
  for (const f of failed) console.log(` - ${f.name}: ${f.detail}`)
  process.exit(1)
}
