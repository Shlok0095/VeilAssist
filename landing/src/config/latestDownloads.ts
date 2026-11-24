import { SITE_ANDROID_APK_MANIFEST } from './apkManifest.generated'
import { SITE_WINDOWS_BUILD_MANIFEST } from './windowsManifest.generated'
import { SITE } from './site'

export type LatestPlatform = 'windows' | 'macos' | 'linux' | 'android'

export type LatestDownload = {
  platform: LatestPlatform
  title: string
  description: string
  fileName: string
  downloadUrl: string
  version: string
  size: number | null
  builtAt: string | null
}

const GITHUB_RELEASE = `https://github.com/${SITE.repoOwner}/${SITE.repoName}/releases/download`
const STAG = `${GITHUB_RELEASE}/latest-stag`

/** One canonical download per platform — no duplicate installers or archives. */
export const LATEST_DOWNLOADS: LatestDownload[] = [
  {
    platform: 'windows',
    title: 'Windows',
    description: 'NSIS installer for Windows 10 or later.',
    fileName: 'VeilAssistSetup1.0.0.exe',
    downloadUrl: SITE_WINDOWS_BUILD_MANIFEST.installerDownloadUrl,
    version: SITE_WINDOWS_BUILD_MANIFEST.version,
    size: SITE_WINDOWS_BUILD_MANIFEST.installerSize || null,
    builtAt: SITE_WINDOWS_BUILD_MANIFEST.builtAt,
  },
  {
    platform: 'macos',
    title: 'macOS',
    description: 'Apple Silicon or Intel — drag to Applications.',
    fileName: 'VeilAssist-mac.dmg',
    downloadUrl: `${STAG}/VeilAssist-mac.dmg`,
    version: '2026.08.22.10.01',
    size: 209_879_762,
    builtAt: '2026-08-22T10:01:00.000Z',
  },
  {
    platform: 'linux',
    title: 'Linux',
    description: 'AppImage for most distros — no install required.',
    fileName: 'VeilAssist-linux.AppImage',
    downloadUrl: `${STAG}/VeilAssist-linux.AppImage`,
    version: '2026.08.22.10.01',
    size: 218_220_917,
    builtAt: '2026-08-22T10:01:00.000Z',
  },
  {
    platform: 'android',
    title: 'Android',
    description: 'Interview companion APK — install on your phone.',
    fileName: SITE_ANDROID_APK_MANIFEST.fileName,
    downloadUrl: SITE.downloadAndroidApkSiteUrl,
    version: SITE_ANDROID_APK_MANIFEST.version,
    size: SITE_ANDROID_APK_MANIFEST.size > 0 ? SITE_ANDROID_APK_MANIFEST.size : null,
    builtAt: SITE_ANDROID_APK_MANIFEST.builtAt,
  },
]

export function detectLatestPlatform(): LatestPlatform | null {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/android/i.test(ua)) return 'android'
  if (/windows/i.test(ua) || /win32/i.test(ua)) return 'windows'
  if (/macintosh|mac os x|macintel/i.test(ua)) return 'macos'
  if (/linux|xf86|x11/i.test(ua)) return 'linux'
  return null
}
