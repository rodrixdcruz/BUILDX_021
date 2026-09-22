import { useEffect, useState } from 'react'
import {
  isOnline,
  getOutbox,
  syncOutbox,
  pendingOutboxCount,
  type OutboxAction,
} from '../services/connectivityService'

/**
 * Network Blackout Mode banner — Commit 3.
 *
 * Shows 🟢 ONLINE or 🔴 OFFLINE — EMERGENCY FALLBACK ACTIVE, lists queued
 * offline actions and syncs them when connectivity returns. All data stays
 * in this browser (demo); "sync" applies the outbox locally and says so.
 */
export function ConnectivityBanner() {
  const [online, setOnline] = useState<boolean>(() => isOnline())
  const [outbox, setOutbox] = useState<OutboxAction[]>(() => getOutbox())
  const [syncNote, setSyncNote] = useState<string | null>(null)

  useEffect(() => {
    const refresh = () => {
      setOnline(isOnline())
      setOutbox(getOutbox())
    }
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    // Instant reaction to the demo blackout toggle (Surge page).
    window.addEventListener('nhg-connectivity-changed', refresh)
    const interval = window.setInterval(refresh, 4000)
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
      window.removeEventListener('nhg-connectivity-changed', refresh)
      window.clearInterval(interval)
    }
  }, [])

  // Auto-sync when we come back online with pending actions.
  useEffect(() => {
    if (!online || outbox.length === 0) return
    const result = syncOutbox()
    setOutbox(getOutbox())
    setSyncNote(
      result.failed === 0
        ? `Synced ${result.processed} queued action(s) — offline data preserved locally.`
        : `Synced ${result.processed} action(s); ${result.failed} could not be applied.`,
    )
    const t = window.setTimeout(() => setSyncNote(null), 6000)
    return () => window.clearTimeout(t)
  }, [online, outbox.length])

  // Always visible: the spec requires the status to be readable at a glance
  // (🟢 ONLINE / 🔴 OFFLINE) so users never guess whether they are offline.
  return (
    <div className={`net-banner ${online ? 'net-banner--online' : 'net-banner--offline'}`} role="status" aria-live="polite">
      <span aria-hidden="true">{online ? '🟢' : '🔴'}</span>
      <strong>{online ? 'ONLINE' : 'OFFLINE — EMERGENCY FALLBACK ACTIVE'}</strong>
      {!online && (
        <span className="net-banner__detail">
          Case creation and updates keep working offline; actions are queued and sync automatically.
        </span>
      )}
      {outbox.length > 0 && (
        <span className="net-banner__detail">
          {outbox.length} queued action(s):{' '}
          {outbox.slice(0, 3).map((a) => (a.kind === 'create-case' ? 'new case' : `update ${a.caseRecord?.id ?? ''}`)).join(', ')}
        </span>
      )}
      {syncNote && <span className="net-banner__detail">{syncNote}</span>}
    </div>
  )
}

/** Standalone count hook for header badge use. */
export function usePendingOutboxCount(): number {
  const [count, setCount] = useState(() => pendingOutboxCount())
  useEffect(() => {
    const t = window.setInterval(() => setCount(pendingOutboxCount()), 2000)
    return () => window.clearInterval(t)
  }, [])
  return count
}
