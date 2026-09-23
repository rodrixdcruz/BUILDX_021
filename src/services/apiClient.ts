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
