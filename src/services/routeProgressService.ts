/**
 * Persists ambulance-route animation progress per case id, so re-opening a
 * case dashboard RESUMES the simulated drive instead of restarting it.
 *
 * This is deliberately VIEW state, not case data: it never enters the case
 * record (and therefore never syncs to other devices via the live-case
 * channel). One entry per case — the current animation's route key and the
 * wall-clock time its traversal started.
 *
 * Storage shape (localStorage `nhg-route-progress`):
 *   { [caseId]: { routeKey: string, startedAt: number } }
 *
 * `routeKey` encodes from>to coordinates, so a changed route (different
 * ambulance base or hospital) invalidates the old progress instead of
 * resuming into the wrong place. Entries are pruned to the most recent
 * MAX_ENTRIES cases to keep storage bounded.
 */

const STORAGE_KEY = 'nhg-route-progress'
const MAX_ENTRIES = 20

export interface RouteProgressEntry {
  /** Route identity: "fromLat,fromLng>toLat,toLng" (5-decimal rounding). */
  routeKey: string
  /** Epoch ms when the traversal began (or was last (re)started). */
  startedAt: number
}

type ProgressStore = Record<string, RouteProgressEntry>

function readStore(): ProgressStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ProgressStore
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {} // corrupt JSON → behave as if empty
  }
}

function writeStore(store: ProgressStore): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Storage full/unavailable — progress persistence is best-effort.
  }
}

/** Stable identity for a route spec; a changed route invalidates progress. */
export function routeProgressKey(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  return `${fromLat.toFixed(5)},${fromLng.toFixed(5)}>${toLat.toFixed(5)},${toLng.toFixed(5)}`
}

/**
 * Returns the persisted start time for this case's CURRENT route, or null
 * when there is none (first open) or when the route changed since it was
 * saved (must not resume into the wrong geometry).
 */
export function getRouteStart(caseId: string, routeKey: string): number | null {
  const entry = readStore()[caseId]
  if (!entry || entry.routeKey !== routeKey) return null
  return typeof entry.startedAt === 'number' ? entry.startedAt : null
}

/** Records (or overwrites) the traversal start for a case's route. */
export function saveRouteStart(caseId: string, routeKey: string, startedAt: number): void {
  const store = readStore()
  store[caseId] = { routeKey, startedAt }
  // Prune oldest entries beyond the cap (insertion order ≈ recency here,
  // but sort defensively by startedAt so overwrites can't evict the wrong one).
  const ids = Object.keys(store)
  if (ids.length > MAX_ENTRIES) {
    ids
      .sort((a, b) => (store[a]?.startedAt ?? 0) - (store[b]?.startedAt ?? 0))
      .slice(0, ids.length - MAX_ENTRIES)
      .forEach((old) => delete store[old])
  }
  writeStore(store)
}

/** Drops a case's entry — used when its route animation ends (unassigned). */
export function clearRouteStart(caseId: string): void {
  const store = readStore()
  if (!(caseId in store)) return
  delete store[caseId]
  writeStore(store)
}

/** Test seam: wipe all persisted progress. */
export function resetRouteProgressForTests(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
