/**
 * HealthGrid API client — talks to the Express API backed by Neon Postgres.
 *
 * Design rules:
 * - The base URL comes from VITE_API_URL. When unset, the app runs in the
 *   original all-local mode (localStorage only) — every caller must handle
 *   `null` results gracefully. This keeps the offline demo fully functional.
 * - Every call has a timeout and never throws into UI code paths; failures
 *   return null / false so services can fall back to local persistence.
 * - Network errors are EXPECTED during Network Blackout Mode; they are not
 *   logged as console errors.
 */

const BASE: string | null = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || null

export function apiConfigured(): boolean {
  return BASE !== null
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE) throw new ApiError('API not configured', 0)
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      signal: controller.signal,
    })
    if (!res.ok) throw new ApiError(`API ${res.status}`, res.status)
    return (await res.json()) as T
  } finally {
    window.clearTimeout(timer)
  }
}

export interface NextIdResponse {
  id: string
}

export async function fetchNextCaseId(): Promise<string | null> {
  if (!apiConfigured()) return null
  try {
    const r = await request<NextIdResponse>('/api/next-case-id')
    return r.id
  } catch {
    return null
  }
}

export async function pushCase(caseData: unknown): Promise<boolean> {
  if (!apiConfigured()) return false
  try {
    await request('/api/cases', { method: 'POST', body: JSON.stringify(caseData) })
    return true
  } catch {
    return false
  }
}

export async function fetchAllCases<T>(): Promise<T[] | null> {
  if (!apiConfigured()) return null
  try {
    return await request<T[]>('/api/cases')
  } catch {
    return null
  }
}

export async function fetchCase<T>(id: string): Promise<T | null> {
  if (!apiConfigured()) return null
  try {
    return await request<T>(`/api/cases/${encodeURIComponent(id)}`)
  } catch {
    return null
  }
}

export async function apiHealthy(): Promise<boolean> {
  if (!apiConfigured()) return false
  try {
    const r = await request<{ ok: boolean }>('/api/health')
    return r.ok
  } catch {
    return false
  }
}

// --- live updates (server-sent events) ---------------------------------------

export interface CaseChangedEvent {
  /** Case ID that changed, or '*' when the server could not determine it. */
  id: string
  /** Why the server announced it: 'notify' (LISTEN/NOTIFY) or 'poll'. */
  reason: string
  /** Server-side timestamp of the announcement. */
  at: string
}

export type Unsubscribe = () => void

/**
 * Subscribe to live case-change events from /api/events via EventSource.
 *
 * - EventSource reconnects automatically with the server-provided `retry`
 *   hint (4s); browser reconnects also fire `onopen` again, which callers
 *   use to re-pull a full snapshot after any dropped chunk.
 * - `onOpen` fires on every successful (re)connection — use it to trigger a
 *   catch-up refresh, not just the first connect.
 * - Returns an unsubscribe function; callers must call it on teardown.
 * - Same API-absent / offline rules as every other call here: when the API
 *   is not configured, the subscription is a no-op returning a no-op.
 */
export function subscribeCaseEvents(handlers: {
  onCaseChanged: (e: CaseChangedEvent) => void
  onOpen?: () => void
}): Unsubscribe {
  if (!apiConfigured() || typeof window === 'undefined' || typeof window.EventSource !== 'function') {
    return () => {}
  }
  const es = new EventSource(`${BASE}/api/events`)
  es.addEventListener('case', (ev) => {
    try {
      const data = JSON.parse((ev as MessageEvent).data) as CaseChangedEvent
      handlers.onCaseChanged(data)
    } catch {
      handlers.onCaseChanged({ id: '*', reason: 'unparsed', at: new Date().toISOString() })
    }
  })
  if (handlers.onOpen) es.onopen = () => handlers.onOpen?.()
  return () => {
    es.close()
  }
}
