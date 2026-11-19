const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const landingRoot = path.join(__dirname, '..')
const assetsDir = path.join(landingRoot, 'assets')
const logoSrc = path.join(landingRoot, 'public', 'logo.png')

if (!fs.existsSync(logoSrc)) {
  console.error('[generate-android-icons] Missing public/logo.png')
  process.exit(1)
}

fs.mkdirSync(assetsDir, { recursive: true })
fs.copyFileSync(logoSrc, path.join(assetsDir, 'icon.png'))
// Omit splash.png — full-logo splashes balloon the APK (multi-MB per density).
const splashAsset = path.join(assetsDir, 'splash.png')
if (fs.existsSync(splashAsset)) fs.unlinkSync(splashAsset)

console.log('[generate-android-icons] Generating Android launcher + splash from brand logo…')
execSync(
  'npx --yes @capacitor/assets generate --android --iconBackgroundColor "#0a0a0b" --splashBackgroundColor "#0a0a0b"',
  { cwd: landingRoot, stdio: 'inherit' },
)
console.log('[generate-android-icons] Done.')

const valuesDir = path.join(landingRoot, 'android', 'app', 'src', 'main', 'res', 'values')
fs.mkdirSync(valuesDir, { recursive: true })
fs.writeFileSync(
  path.join(valuesDir, 'colors.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#ECECEE</color>
    <color name="colorPrimaryDark">#0C0C0D</color>
    <color name="colorAccent">#ECECEE</color>
    <color name="splashBackground">#0C0C0D</color>
</resources>
`,
)
fs.writeFileSync(
  path.join(valuesDir, 'styles.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:windowBackground">@color/splashBackground</item>
        <item name="android:statusBarColor">@color/splashBackground</item>
        <item name="android:navigationBarColor">@color/splashBackground</item>
    </style>

    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/splashBackground</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:windowBackground">@color/splashBackground</item>
    </style>
</resources>
`,
)
console.log('[generate-android-icons] Restored splash theme (postSplashScreenTheme).')

