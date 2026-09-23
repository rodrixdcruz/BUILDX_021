/**
 * Sync layer — one place where local persistence meets the Neon-backed API.
 *
 * Model (keeps the Network Blackout demo honest):
 * - localStorage stays the fast local source used by every existing service.
 * - When VITE_API_URL is configured AND the app is online, every local save
 *   is mirrored to the API (fire-and-forget, never blocks the UI).
 * - Case IDs are allocated server-side when the API is reachable, so two
 *   devices can never collide; local counter is the fallback when offline
 *   or when the API is not configured.
 * - `refreshFromApi()` pulls shared cases and merges them locally (newest
 *   updated wins by timeline length then createdAt) so devices converge.
 * - If the API is not configured or unreachable, everything silently falls
 *   back to pure local mode — the offline demo keeps working unchanged.
 */

import type { EmergencyCase } from '../models/types'
import { fetchAllCases, pushCase, fetchNextCaseId, apiConfigured } from './apiClient'

/**
 * Online check kept inline (not imported from connectivityService) so this
 * module has no import cycle with the persistence services it supports.
 * The demo blackout toggle hides connectivity via localStorage, mirrored here.
 */
function netOnline(): boolean {
  if (typeof window !== 'undefined' && window.localStorage.getItem('nhg.forceOffline') === '1') return false
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

/** True when the app should treat the API as part of its storage tier. */
export function cloudEnabled(): boolean {
  return apiConfigured() && netOnline()
}

/** Fire-and-forget mirror of one case to the API. */
export function mirrorCase(c: EmergencyCase): void {
  if (!cloudEnabled()) return
  void pushCase(c)
}

/**
 * Pull the shared case list and merge into local storage.
 * Merge rule: for each id keep the record with the longer timeline
 * (more coordination progress), tie-break by newer createdAt.
 */
export async function refreshFromApi(): Promise<{ pulled: number; merged: number } | null> {
  if (!cloudEnabled()) return null
  const remote = await fetchAllCases<EmergencyCase>()
  if (!remote) return null

  const local = getAllCasesLocal()
  const byId = new Map(local.map((c) => [c.id, c]))
  let merged = 0

  for (const r of remote) {
    const l = byId.get(r.id)
    if (!l) {
      byId.set(r.id, r)
      merged++
      continue
    }
    const lProgress = l.timeline?.length ?? 0
    const rProgress = r.timeline?.length ?? 0
    if (rProgress > lProgress || (rProgress === lProgress && r.createdAt > l.createdAt)) {
      byId.set(r.id, r)
      merged++
    }
  }

  const next = [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  localStorage.setItem('nhg.cases', JSON.stringify(next))
  return { pulled: remote.length, merged }
}

// Local-only helpers kept here to avoid circular imports with emergencyService.
function getAllCasesLocal(): EmergencyCase[] {
  try {
    const raw = localStorage.getItem('nhg.cases')
    return raw ? (JSON.parse(raw) as EmergencyCase[]) : []
  } catch {
    localStorage.removeItem('nhg.cases')
    return []
  }
}

/**
 * Allocates the next case id. Server-side when the cloud is reachable
 * (atomic SQL counter — collision-free across devices); local counter
 * otherwise. Returns null when only the local counter can be used.
 */
export async function allocateCaseId(): Promise<string | null> {
  if (!cloudEnabled()) return null
  return fetchNextCaseId()
}

/** Best-effort local bump so ids never regress offline. */
export function bumpLocalCounter(id: string): void {
  const n = Number(id.replace('NGP-', ''))
  if (!Number.isFinite(n)) return
  const key = 'nhg.caseCounter'
  const current = Number(localStorage.getItem(key) ?? '1000')
  if (n > current) localStorage.setItem(key, String(n))
}
