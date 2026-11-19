/** Ask for mic, camera, and notifications once at launch — skip any that are already granted. */

async function permissionState(name: PermissionName): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions.query({ name })
    return status.state
  } catch {
    return 'unknown'
  }
}

async function requestMedia(kind: 'audio' | 'video'): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) return
  const stream = await navigator.mediaDevices.getUserMedia(
    kind === 'audio' ? { audio: true } : { video: { facingMode: 'environment' } },
  )
  stream.getTracks().forEach((track) => track.stop())
}

export async function requestLaunchPermissions(): Promise<void> {
  const mic = await permissionState('microphone')
  if (mic !== 'granted') {
    try {
      await requestMedia('audio')
    } catch {
      /* user denied or no hardware */
    }
  }

  const cam = await permissionState('camera')
  if (cam !== 'granted') {
    try {
      await requestMedia('video')
    } catch {
      /* user denied or no hardware */
    }
  }

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const current = await LocalNotifications.checkPermissions()
    if (current.display !== 'granted') {
      await LocalNotifications.requestPermissions()
    }
  } catch {
    /* web / plugin missing */
  }
}

/** Confirm the mic can actually be opened — not only that we asked earlier. */
export async function ensureMicGranted(): Promise<{ ok: boolean; error?: string }> {
  const state = await permissionState('microphone')
  if (state === 'granted') return { ok: true }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: 'Microphone access is needed to start the session.' }
  }
  try {
    await requestMedia('audio')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Microphone access is needed to start the session.' }
  }
}
