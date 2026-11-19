import {
  SESSION_SNAPSHOT_KEY,
  type SessionLoopPhase,
  type SessionSnapshot,
} from './sessionLoopTypes'

export function loadSessionSnapshot(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionSnapshot
    if (!parsed || typeof parsed !== 'object') return null
    return {
      sessionActive: Boolean(parsed.sessionActive),
      loopPhase: (parsed.loopPhase as SessionLoopPhase) || 'idle',
      transcript: String(parsed.transcript || ''),
      answer: String(parsed.answer || ''),
      turnHistory: Array.isArray(parsed.turnHistory)
        ? parsed.turnHistory.map((t) => ({
            question: String(t.question || ''),
            answer: String(t.answer || ''),
            at: Number(t.at) || Number(parsed.updatedAt) || Date.now(),
          }))
        : [],
      updatedAt: Number(parsed.updatedAt) || 0,
    }
  } catch {
    return null
  }
}

let persistAllowed = true

export function allowSessionPersist(): void {
  persistAllowed = true
}

export function blockSessionPersist(): void {
  persistAllowed = false
  clearSessionSnapshot()
}

export function saveSessionSnapshot(snapshot: SessionSnapshot): void {
  if (!persistAllowed) return
  try {
    localStorage.setItem(
      SESSION_SNAPSHOT_KEY,
      JSON.stringify({ ...snapshot, updatedAt: Date.now() }),
    )
  } catch {
    /* quota / private mode */
  }
}

export function clearSessionSnapshot(): void {
  try {
    localStorage.removeItem(SESSION_SNAPSHOT_KEY)
  } catch {
    /* ignore */
  }
}

export function persistSessionFields(fields: Partial<SessionSnapshot>): void {
  if (!persistAllowed) return
  const prev = loadSessionSnapshot()
  saveSessionSnapshot({
    sessionActive: fields.sessionActive ?? prev?.sessionActive ?? false,
    loopPhase: fields.loopPhase ?? prev?.loopPhase ?? 'idle',
    transcript: fields.transcript ?? prev?.transcript ?? '',
    answer: fields.answer ?? prev?.answer ?? '',
    turnHistory: fields.turnHistory ?? prev?.turnHistory ?? [],
    updatedAt: Date.now(),
  })
}
