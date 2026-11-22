import { ScrollReveal } from '@/components/marketing/ScrollReveal'
import { LightFooter } from '@/components/marketing/LightFooter'
import { formatBytes, formatDateTime } from '@/config/downloads'
import {
  detectLatestPlatform,
  LATEST_DOWNLOADS,
  type LatestDownload,
  type LatestPlatform,
} from '@/config/latestDownloads'
import { Link } from 'react-router-dom'
import { SITE_WINDOWS_BUILD_MANIFEST } from '@/config/windowsManifest.generated'

const ghostBtnClass =
  'inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-800 no-underline transition-colors hover:border-cyan-600 hover:text-zinc-950'

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  )
}

function WindowsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 5.5L10.5 4.5V11H3V5.5zm0 13L10.5 19.5V13H3v5.5zM12 4.2L21 3v8.8H12V4.2zm0 15.6V12H21v9l-9-1.2z" />
    </svg>
  )
}

function LinuxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C9.9 4.3 9.2 6.9 9.2 8.6c0 1.3.4 2.4.4 2.4H7.3c-.9 0-1.6.7-1.6 1.6s.7 1.6 1.6 1.6h2c-.3 1-.9 2.4-1.7 2.9-.8.6-1.9.7-3 .6-.2 1.9 1.9 3 1.9 3 3.4 0 6.9-1.4 7.9-3.1.7-1.1.7-2.4.7-3.5h2.4c.9 0 1.6-.7 1.6-1.6s-.7-1.6-1.6-1.6h-2.4s.4-1.1.4-2.4c0-1.7-.7-4.3-2.9-6.6zM8.6 5.6c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7zm6.8 0c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7z" />
    </svg>
  )
}

function AndroidIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 0 0-.83.22l-1.88 3.24a11.463 11.463 0 0 0-8.94 0L5.65 5.67a.643.643 0 0 0-.87-.2.566.566 0 0 0-.22.87l1.84 3.18C4.4 11.22 3 13.29 3 15.5V18h18v-2.5c0-2.21-1.4-4.28-3.4-5.02zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5S14.67 11 15.5 11s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
    </svg>
  )
}

function PlatformIcon({ platform }: { platform: LatestPlatform }) {
  if (platform === 'windows') return <WindowsIcon />
  if (platform === 'macos') return <AppleIcon />
  if (platform === 'android') return <AndroidIcon />
  return <LinuxIcon />
}

function DownloadCard({ item, recommended }: { item: LatestDownload; recommended: boolean }) {
  return (
    <div
      className={`relative rounded-2xl border p-6 text-left transition-colors ${
        recommended ? 'border-cyan-600/40 bg-cyan-400/[0.06]' : 'border-zinc-200 bg-white'
      }`}
    >
      {recommended ? (
        <span className="absolute -top-2.5 right-4 rounded-full border border-cyan-400/40 bg-[#0a0f1a] px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-cyan-300">
          Recommended
        </span>
      ) : null}
      <div className="flex items-center gap-2.5 text-zinc-900">
        <span className="text-cyan-700">
          <PlatformIcon platform={item.platform} />
        </span>
        <span className="font-display text-lg font-semibold tracking-[-0.01em]">{item.title}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.description}</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-zinc-600">
        <dt className="text-zinc-600">Version</dt>
        <dd className="text-right text-zinc-700">{item.version}</dd>
        {item.size ? (
          <>
            <dt className="text-zinc-600">Size</dt>
            <dd className="text-right text-zinc-700">{formatBytes(item.size)}</dd>
          </>
        ) : null}
        {item.builtAt ? (
          <>
            <dt className="text-zinc-600">Built</dt>
            <dd className="text-right text-zinc-700">{formatDateTime(item.builtAt)}</dd>
          </>
        ) : null}
        {item.platform === 'windows' && SITE_WINDOWS_BUILD_MANIFEST.installerSha256 ? (
          <>
            <dt className="text-zinc-600">SHA-256</dt>
            <dd className="break-all text-right text-[10px] text-zinc-600">
              {SITE_WINDOWS_BUILD_MANIFEST.installerSha256}
            </dd>
          </>
        ) : null}
      </dl>
      <a
        href={item.downloadUrl}
        className="lm-btn lm-btn--primary mt-5 w-full justify-center"
        download={item.fileName}
      >
        Download {item.title}
      </a>
    </div>
  )
}

export function DownloadsPage() {
  const recommended = detectLatestPlatform()

  return (
    <div className="relative min-w-0 font-sans text-zinc-900 antialiased">
      <section className="relative overflow-hidden px-4 pb-8 pt-12 sm:px-8 sm:pt-16 md:px-10 lg:px-14 xl:px-16">
        <div className="relative z-[1] mx-auto w-full max-w-5xl">
          <ScrollReveal>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.24em] text-cyan-700">
              Download
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              Get VeilAssist for your device
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed tracking-wide text-zinc-600">
              One latest build per platform — Windows desktop, macOS, Linux, and Android interview app.
              Bring your own API key. No bot joins your meeting.
            </p>
            <p className="mt-3 font-mono text-xs text-zinc-600">
              Windows release{' '}
              <strong className="text-zinc-900">{SITE_WINDOWS_BUILD_MANIFEST.version}</strong> ·{' '}
              {SITE_WINDOWS_BUILD_MANIFEST.releaseTag} ·{' '}
              {SITE_WINDOWS_BUILD_MANIFEST.installerSize.toLocaleString()} bytes
            </p>
          </ScrollReveal>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2">
          {LATEST_DOWNLOADS.map((item) => (
            <DownloadCard key={item.platform} item={item} recommended={recommended === item.platform} />
          ))}
        </div>

        <ScrollReveal className="mt-10">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center sm:p-8">
            <p className="text-sm text-zinc-600">
              Android: tap <strong className="text-zinc-900">Download Android</strong> on your phone, open the APK,
              and allow install from this source if prompted.
            </p>
            <Link to="/docs/getting-started" className={`${ghostBtnClass} mt-5 inline-flex`}>
              Install & setup guide →
            </Link>
          </div>
        </ScrollReveal>
      </section>

      <LightFooter />
    </div>
  )
}
