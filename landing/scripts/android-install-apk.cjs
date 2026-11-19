#!/usr/bin/env node
/** Install debug APK to connected Android device via adb. */
const { execSync } = require('child_process')
const path = require('path')

const apk = path.join(__dirname, '..', 'public', 'downloads', 'VeilAssist-Interview.apk')

try {
  const devices = execSync('adb devices', { encoding: 'utf8' })
  console.log(devices)
  if (!/\tdevice\s*$/m.test(devices)) {
    console.error('No Android device connected. Enable USB debugging and run: adb devices')
    process.exit(1)
  }
  execSync(`adb install -r "${apk}"`, { stdio: 'inherit' })
  console.log('[android-install-apk] Installed. Open app → Personal Info → paste NVIDIA key → upload CV.')
  console.log('[android-install-apk] Watch logs: adb logcat | findstr /i "cv nvidia Capacitor"')
} catch (e) {
  console.error(e.message || e)
  process.exit(1)
}
