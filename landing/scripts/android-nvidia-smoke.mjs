#!/usr/bin/env node
/**
 * Real adb smoke test — waits for device, installs APK, verifies package,
 * tests NVIDIA NIM reachability FROM THE PHONE (adb shell curl if available).
 *
 * Usage: NVIDIA_API_KEY=nvapi-... node scripts/android-nvidia-smoke.mjs
 */
import { execSync, spawnSync } from 'child_process'
import { existsSync, writeFileSync, unlinkSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const apk = path.join(__dir, '..', 'public', 'downloads', 'VeilAssist-Interview.apk')
const pkg = 'com.veilassist.interview'
const key = process.env.NVIDIA_API_KEY?.trim()

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

function shTry(cmd) {
  try {
    return { ok: true, out: sh(cmd) }
  } catch (e) {
    return { ok: false, out: e.stderr?.toString() || e.message || '' }
  }
}

function adbShell(args, opts = {}) {
  const r = spawnSync('adb', ['shell', ...args], {
    encoding: 'utf8',
    ...opts,
  })
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || `exit ${r.status}`).trim()
    throw new Error(err)
  }
  return (r.stdout || '').trim()
}

function adbShellTry(args) {
  try {
    return { ok: true, out: adbShell(args) }
  } catch (e) {
    return { ok: false, out: e.message || '' }
  }
}

function waitForDevice(maxSec = 180) {
  console.log(`[adb] Waiting for device (max ${maxSec}s) — plug phone + enable USB debugging…`)
  const start = Date.now()
  while (Date.now() - start < maxSec * 1000) {
    const lines = sh('adb devices').split('\n').slice(1)
    const device = lines.find((l) => l.includes('\tdevice'))
    if (device) {
      const id = device.split('\t')[0]
      console.log(`[adb] Device connected: ${id}`)
      return id
    }
    spawnSync('sleep', ['2'], { shell: true })
  }
  return null
}

function main() {
  if (!existsSync(apk)) {
    console.error(`[adb] APK missing: ${apk}`)
    process.exit(1)
  }

  const adbCheck = shTry('adb version')
  if (!adbCheck.ok) {
    console.error('[adb] adb not found')
    process.exit(1)
  }

  const deviceId = waitForDevice(180)
  if (!deviceId) {
    console.error('[adb] FAIL — no device after wait. Connect phone via USB, enable USB debugging, accept RSA prompt.')
    process.exit(2)
  }

  console.log('[adb] Installing APK…')
  const install = shTry(`adb install -r "${apk}"`)
  if (!install.ok) {
    console.error('[adb] install failed:', install.out)
    process.exit(3)
  }
  console.log('[adb] install:', install.out || 'ok')

  const version = shTry(`adb shell dumpsys package ${pkg} | findstr versionName`)
  console.log('[adb] package version:', version.ok ? version.out : 'unknown')

  const manifest = shTry('type "' + path.join(__dir, '..', 'public', 'downloads', 'apk-manifest.json') + '"')
  if (manifest.ok) console.log('[adb] expected manifest:', manifest.out.trim())

  // Test network FROM DEVICE to NVIDIA (not from PC)
  if (!key) {
    console.warn('[adb] SKIP device NVIDIA curl — NVIDIA_API_KEY not set')
  } else {
    const body = JSON.stringify({
      model: 'meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: 'Reply with JSON: {"ok":true}' }],
      max_tokens: 32,
      temperature: 0,
      response_format: { type: 'json_object' },
    })
    const tmpBody = path.join(__dir, '.android-nvidia-body.json')
    writeFileSync(tmpBody, body, 'utf8')
    shTry(`adb push "${tmpBody}" /data/local/tmp/veil-nvidia-test.json`)
    try {
      unlinkSync(tmpBody)
    } catch {
      /* ignore */
    }

    const hasCurl = adbShellTry(['which', 'curl'])
    if (hasCurl.ok && hasCurl.out) {
      console.log('[adb] Device curl:', hasCurl.out)
      // Single shell string — array args split "Authorization: Bearer …" on spaces on device.
      const curlCmd = [
        'curl -sS -m 30',
        '-w " HTTP_CODE:%{http_code}"',
        '-X POST https://integrate.api.nvidia.com/v1/chat/completions',
        `-H "Authorization: Bearer ${key}"`,
        '-H "Content-Type: application/json"',
        '--data-binary @/data/local/tmp/veil-nvidia-test.json',
      ].join(' ')
      const curl = adbShellTry([curlCmd])
      if (curl.ok) {
        const out = curl.out
        const codeMatch = out.match(/HTTP_CODE:(\d+)/)
        const httpCode = codeMatch ? codeMatch[1] : 'unknown'
        const bodyPreview = out.replace(/\s*HTTP_CODE:\d+\s*$/, '').slice(0, 500)
        console.log('[adb] Device → NVIDIA HTTP', httpCode)
        console.log('[adb] Response preview:', bodyPreview)
        if (httpCode !== '200') {
          console.error('[adb] FAIL — device could not reach NVIDIA NIM')
          process.exit(4)
        }
        console.log('[adb] PASS — phone reaches integrate.api.nvidia.com')
      } else {
        console.error('[adb] device curl failed:', curl.out.slice(0, 400))
        process.exit(4)
      }
    } else {
      console.warn('[adb] No curl on device — ping test only')
      const ping = adbShellTry(['ping', '-c', '1', '-W', '3', 'integrate.api.nvidia.com'])
      console.log('[adb] ping:', ping.ok ? ping.out.slice(0, 200) : ping.out.slice(0, 200))
    }
  }

  console.log('[adb] Launching app…')
  shTry(`adb shell monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`)
  console.log('[adb] DONE — set NVIDIA key in Settings → AI Providers, then upload CV in Personal Info')
  console.log('[adb] Logcat: adb logcat -s "Capacitor/Console" "chromium" | findstr /i "cv nvidia"')
}

main()
