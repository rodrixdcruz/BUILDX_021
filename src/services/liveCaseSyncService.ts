/**
 * Live case sync — server-sent events for the shared case store.
 *
 * Replaces the 10-second `useCloudCases` polling with push updates:
 * - The API announces every case INSERT/UPDATE on /api/events (SSE), sourced
 *   from a Postgres LISTEN/NOTIFY trigger (or a 5s server-side fallback poll).
 * - This service holds ONE subscription for the whole app; every hook simply
 *   subscribes/unsubscribes, so two mounted pages never open two streams.
 * - On every `case` event the service re-pulls the shared list and merges it
 *   locally via refreshFromApi() — the same merge rule the poll used — then
 *   dispatches `nhg-cases-changed` for the UI to re-read localStorage.
 * - Rapid duplicate events (a case walks through several stages in seconds)
 *   are coalesced into one in-flight refresh; `onOpen` catch-ups after
 *   reconnects are deduped against recent event traffic.
 * - Everything is best-effort and offline-safe: with the API unconfigured or
 *   the network down, there is no stream and the app behaves as before.
 */

import type { EmergencyCase } from '../models/types'
import { subscribeCaseEvents, type Unsubscribe } from './apiClient'
import { refreshFromApi, cloudEnabled } from './syncService'

export const CASES_CHANGED_EVENT = 'nhg-cases-changed'

/** Consumers of the live stream (hooks, pages) — notified after each refresh. */
type Listener = (cases: EmergencyCase[]) => void

let unsubscribe: Unsubscribe | null = null
let refCount = 0
const listeners = new Set<Listener>()
let refreshInFlight = false
let refreshQueued = false
// Ring of recent event ids — dedupes catch-up refreshes against live traffic.
const recentEventIds: string[] = []
const RECENT_LIMIT = 32

function noteRecent(id: string): void {
  recentEventIds.push(id)
  if (recentEventIds.length > RECENT_LIMIT) recentEventIds.shift()
}

function isRecent(id: string): boolean {
  return recentEventIds.includes(id)
}

/** Merge remote cases into local storage (same rule as the poll path). */
async function pullAndStore(): Promise<EmergencyCase[]> {
  await refreshFromApi()
  return readLocalCases()
}

function readLocalCases(): EmergencyCase[] {
  try {
    const raw = localStorage.getItem('nhg.cases')
    const parsed = raw ? (JSON.parse(raw) as EmergencyCase[]) : []
    return parsed.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  } catch {
    localStorage.removeItem('nhg.cases')
    return []
  }
}

/**
 * Coalesced refresh: collapses rapid event bursts (multi-stage cases emit
 * several `case` events in quick succession) into a single network pull.
 * Safe to call from anywhere; never throws into callers.
 */
export function requestLiveRefresh(reason: string): void {
  if (!cloudEnabled()) return
  if (refreshInFlight) {
    refreshQueued = true
    return
  }
  refreshInFlight = true
  void pullAndStore()
    .then((cases) => {
      notifyListeners(cases, reason)
    })
    .catch(() => {
      /* network hiccups are expected; the stream or poll will retry */
    })
    .finally(() => {
      refreshInFlight = false
      if (refreshQueued) {
        refreshQueued = false
        requestLiveRefresh(reason)
      }
    })
}

function notifyListeners(cases: EmergencyCase[], reason: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CASES_CHANGED_EVENT, { detail: { reason } }))
  }
  for (const l of listeners) {
    try {
      l(cases)
    } catch {
      listeners.delete(l) // broken consumer; never break the fanout loop
    }
  }
}

/**
 * Opens the shared SSE subscription (once) and registers a listener.
 * Returns an unsubscribe function that also closes the stream when the
 * last listener goes away.
 */
export function subscribeLiveCases(listener: Listener): Unsubscribe {
  listeners.add(listener)
  refCount += 1
  ensureStream()

  // Initial catch-up pull so a freshly mounted page converges immediately
  // instead of waiting for the next push event.
  requestLiveRefresh('initial')

  return () => {
    listeners.delete(listener)
    refCount -= 1
    if (refCount <= 0 && unsubscribe) {
      unsubscribe()
      unsubscribe = null
      refCount = 0
      listeners.clear()
      recentEventIds.length = 0
    }
  }
}

function ensureStream(): void {
  if (unsubscribe) return
  if (!cloudEnabled()) return

  unsubscribe = subscribeCaseEvents({
    onCaseChanged: (e) => {
      // '*' means the server could not attribute the change — always refresh.
      if (e.id === '*') {
        requestLiveRefresh(`event:${e.reason}`)
        return
      }
      if (isRecent(e.id)) {
        // Catch-up (`onOpen`) duplicates a live event we already handled.
        noteRecent(e.id)
        return
      }
      noteRecent(e.id)
      requestLiveRefresh(`event:${e.reason}`)
    },
    onOpen: () => {
      // Reconnect after a drop or server restart: pull a full snapshot.
      // requestLiveRefresh coalesces this with any concurrent event.
      requestLiveRefresh('reconnect')
    },
  })

  // Stream refused (503 while Neon cold-starts, EventSource unsupported):
  // give up for this mount; the hook's safety-net poll still refreshes.
  if (!unsubscribe) {
    /* subscribeCaseEvents returned a no-op — nothing else to do */
  }
}

/** Status probe for UI badges / tests. */
export function liveSyncSupported(): boolean {
  return cloudEnabled() && typeof window !== 'undefined' && typeof window.EventSource === 'function'
}
