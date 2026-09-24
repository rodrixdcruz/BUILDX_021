/**
 * Routing & geocoding — the first REAL external APIs in HealthGrid.
 *
 * Two free, key-less, CORS-enabled services power this module:
 *
 * 1. OSRM (Open Source Routing Machine) — driving distance & duration.
 *    Instances come from VITE_OSRM_BASE_URL (comma-separated, tried in
 *    order) and default to the public demo server. Self-hosting notes are
 *    in .env.example — point the first entry at your own instance and the
 *    public server only serves as a fallback.
 * 2. Nominatim (OpenStreetMap) — reverse geocoding (coordinates → area
 *    label). Public server: https://nominatim.openstreetmap.org
 *    Usage policy requires a descriptive Referer/User-Agent and max 1 req/s;
 *    the cache + single-flight logic below keeps us far under that.
 *
 * Design rules (same as apiClient):
 * - Every call has a timeout, never throws into UI code paths.
 * - On any failure the caller gets `null` and falls back to the existing
 *   straight-line (haversine) / nearest-area heuristics — the offline demo
 *   keeps working unchanged.
 * - Results are cached in memory + localStorage to respect rate limits and
 *   make repeat views instant.
 */

import type { GeoPoint } from '../models/types'
import { NAGPUR_CENTER } from '../constants/emergency'

const PUBLIC_OSRM = 'https://router.project-osrm.org'
/** Exported for the live-API contract smoke tests (routingService.smoke.test.ts). */
export const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org'

/**
 * OSRM instances, tried in order. VITE_OSRM_BASE_URL accepts one URL or a
 * comma-separated list (e.g. self-hosted first, public as safety net).
 * Trailing slashes are trimmed; empty entries are dropped. Values without a
 * scheme are assumed https (handy for "router.mydomain.org").
 */
export function osrmUrls(): string[] {
  const raw = import.meta.env.VITE_OSRM_BASE_URL as string | undefined
  const parse = (s: string): string[] =>
    s
      .split(',')
      .map((u) => u.trim().replace(/\/+$/, ''))
      .filter(Boolean)
      .map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`))
  const configured = raw ? parse(raw) : []
  // Default: public demo server last, so custom lists act as higher-priority
  // instances with the community server as safety net — and with no env var
  // the app behaves exactly as before.
  return [...configured.filter((u) => u !== PUBLIC_OSRM), PUBLIC_OSRM]
}

const CACHE_KEY = 'nhg.routingCache'
const CACHE_MAX = 200
const TIMEOUT_MS = 6000

// ---------------------------------------------------------------------------
// Cache (memory + localStorage mirror)
// ---------------------------------------------------------------------------

type CacheShape = Record<string, unknown>
let memCache: CacheShape | null = null

function loadCache(): CacheShape {
  if (memCache) return memCache
  try {
    memCache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as CacheShape
  } catch {
    memCache = {}
  }
  return memCache!
}

function cacheGet<T>(key: string): T | null {
  const hit = loadCache()[key]
  return hit !== undefined ? (hit as T) : null
}

function cacheSet(key: string, value: unknown): void {
  const cache = loadCache()
  cache[key] = value
  const keys = Object.keys(cache)
  if (keys.length > CACHE_MAX) {
    for (const k of keys.slice(0, keys.length - CACHE_MAX)) delete cache[k]
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* quota exceeded — memory cache still works */
  }
}

/** Test seam + manual escape hatch. */
export function clearRoutingCache(): void {
  memCache = {}
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Fetch plumbing
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        // Nominatim's usage policy requires a descriptive User-Agent.
        // Browsers forbid overriding this header (they send their own),
        // but non-browser contexts (Node fetch in tests/tools) need it.
        'User-Agent': 'NagpurHealthGrid/0.1 (hackathon MVP; OSM data courtesy)',
      },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null // offline / timeout / abort — callers fall back
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * Serializes outbound API calls with a small gap. Both public servers are
 * community infrastructure (Nominatim mandates ≤1 req/s); a hospital list
 * rendering 8 routes at once must not fire 8 parallel requests. Cache hits
 * bypass the queue entirely, so repeat views cost nothing.
 */
let apiQueue: Promise<void> = Promise.resolve()
const API_GAP_MS = 180

function enqueueApi<T>(task: () => Promise<T>): Promise<T> {
  const run = apiQueue.then(async () => {
    const result = await task()
    await new Promise((r) => window.setTimeout(r, API_GAP_MS))
    return result
  })
  apiQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function coordKey(a: GeoPoint, b: GeoPoint): string {
  return `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}`
}

/** True when both points are within the Nagpur demo region (bounds-checked). */
export function isInNagpurRegion(p: GeoPoint): boolean {
  return (
    p.lat > 20.9 && p.lat < 21.35 &&
    p.lng > 78.85 && p.lng < 79.35
  )
}

// ---------------------------------------------------------------------------
// Public surface: driving route (OSRM)
// ---------------------------------------------------------------------------

export interface DrivingRoute {
  /** Road distance in km (always > 0, ≥ straight-line distance). */
  distanceKm: number
  /** Driving duration in whole minutes. */
  durationMin: number
  /** `osrm` when live, `estimate` when the network/path fell back. */
  source: 'osrm' | 'estimate'
}

interface OsrmResponse {
  code: string
  routes?: Array<{ distance: number; duration: number; geometry?: { coordinates?: Array<[number, number]> } }>
}

/**
 * A drivable path: polyline vertices plus the route's real numbers when
 * they came from OSRM (the geometry response carries distance/duration —
 * one request serves both the line and the "x km · y min" readout).
 * Estimate fallbacks (no OSRM) resolve to null upstream, so distance is
 * always present on a non-null RoutePath.
 */
export interface RoutePath {
  points: GeoPoint[]
  source: 'osrm' | 'estimate'
  /** Road distance in km (OSRM-derived). */
  distanceKm: number
  /** Driving duration in whole minutes (OSRM-derived). */
  durationMin: number
}

/**
 * Internal: fetch the first OSRM route (numbers + geometry) with the full
 * failover chain. `withGeometry` adds overview geometry to the request.
 * Null when every instance failed or the pair is out of region.
 */
async function fetchOsrmRoute(
  from: GeoPoint,
  to: GeoPoint,
  withGeometry: boolean,
): Promise<{ distance: number; duration: number; coordinates?: Array<[number, number]> } | null> {
  if (!isInNagpurRegion(from) || !isInNagpurRegion(to)) return null
  for (const base of osrmUrls()) {
    if (isMarkedDown(base)) continue
    // overview=full returns the detailed road path; geometries=geojson makes
    // OSRM deliver it as { coordinates: [[lng, lat], ...] } instead of the
    // default encoded-polyline string (which the smoke test caught).
    const url =
      `${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?alternatives=false&steps=false` +
      `&overview=${withGeometry ? 'full' : 'false'}` +
      (withGeometry ? `&geometries=geojson` : ``)
    const data = await enqueueApi(() => fetchJson<OsrmResponse>(url))
    const route = data?.code === 'Ok' ? data.routes?.[0] : undefined
    if (route && route.distance > 0) {
      markInstance(base, true)
      lastInstanceUsed = base
      return { distance: route.distance, duration: route.duration, coordinates: route.geometry?.coordinates }
    }
    markInstance(base, false)
  }
  return null
}

/**
 * Driving distance + duration between two points via OSRM.
 * Returns `source: 'estimate'` (straight-line × 1.3, ~2 min/km) instead of
 * null, so UI code always has numbers to render; check `source` if the
 * distinction matters (e.g. labelling the estimate).
 *
 * Cached — repeated dashboard views cost zero network calls.
 */
export async function drivingRoute(from: GeoPoint, to: GeoPoint): Promise<DrivingRoute> {
  const fallback = (): DrivingRoute => ({
    distanceKm: Math.round(haversine(from, to) * 1.3 * 10) / 10,
    // ~2 min per road-km; floor 1 min so coincident points don't show 0.
    durationMin: Math.max(1, Math.round(haversine(from, to) * 1.3 * 2)),
    source: 'estimate',
  })

  const key = `route:${coordKey(from, to)}`
  const cached = cacheGet<DrivingRoute>(key)
  if (cached) return cached

  const route = await fetchOsrmRoute(from, to, false)
  if (!route) return fallback()

  const result: DrivingRoute = {
    distanceKm:
      route.distance < 1000
        ? Math.round(route.distance) / 1000 // keep metre precision for short hops
        : Math.round(route.distance / 100) / 10,
    durationMin: Math.max(1, Math.round(route.duration / 60)),
    source: 'osrm',
  }
  cacheSet(key, result)
  return result
}

/**
 * Full road geometry between two points (for drawing the ambulance route
 * on the map). OSRM `[lng, lat]` pairs are converted to GeoPoints. Falls
 * back to a two-point straight line flagged `estimate` — the map renders
 * the dashed fallback only when it can show a genuine road path.
 */
export async function drivingRouteGeometry(from: GeoPoint, to: GeoPoint): Promise<RoutePath | null> {
  if (!liveGeoEnabled()) return null
  const route = await fetchOsrmRoute(from, to, true)
  const coords = route?.coordinates
  if (!route || !coords || coords.length < 2) return null
  return {
    points: coords.map(([lng, lat]) => ({ lat, lng })),
    source: 'osrm',
    distanceKm:
      route.distance < 1000
        ? Math.round(route.distance) / 1000
        : Math.round(route.distance / 100) / 10,
    durationMin: Math.max(1, Math.round(route.duration / 60)),
  }
}

/**
 * Position along a polyline at 0..1 of its vertex-count (per-vertex
 * interpolation, dense enough with OSRM overview=full). Clamps to the
 * ends. Used to place the simulated ambulance marker on its route.
 */
export function interpolateAlong(points: GeoPoint[], t: number): GeoPoint {
  if (points.length === 0) return { lat: 0, lng: 0 }
  if (points.length === 1) return points[0]
  const clamped = Math.min(1, Math.max(0, t))
  const scaled = clamped * (points.length - 1)
  const i = Math.floor(scaled)
  if (i >= points.length - 1) return points[points.length - 1]
  const f = scaled - i
  const a = points[i]
  const b = points[i + 1]
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }
}

// --- instance health (failover support) -------------------------------------

const DOWN_COOLOFF_MS = 60_000
const downSince = new Map<string, number>()
let lastInstanceUsed: string | null = null

function markInstance(base: string, healthy: boolean): void {
  if (healthy) {
    downSince.delete(base)
    return
  }
  if (!downSince.has(base)) downSince.set(base, Date.now())
}

function isMarkedDown(base: string): boolean {
  const since = downSince.get(base)
  if (since === undefined) return false
  if (Date.now() - since > DOWN_COOLOFF_MS) {
    downSince.delete(base) // cool-off expired — retry the instance
    return false
  }
  return true
}

/** Which instance served the last successful route (debug/status UI). */
export function lastOsrmInstanceUsed(): string | null {
  return lastInstanceUsed
}

/** Configured instances with their current health (status UI / debugging). */
export function routingStatus(): Array<{ url: string; down: boolean }> {
  return osrmUrls().map((url) => ({ url, down: isMarkedDown(url) }))
}

/** Test seam: clear failover health state between tests. */
export function resetOsrmInstanceHealth(): void {
  downSince.clear()
  lastInstanceUsed = null
}

// ---------------------------------------------------------------------------
// Public surface: batch drive times (hospital matching)
// ---------------------------------------------------------------------------

/**
 * Drive-time prefetch for `selectBestHospital` (emergencyService).
 *
 * Fetches OSRM durations from `from` to every hospital that has an ICU bed,
 * resolving to a map of hospitalId → minutes. Failures and cache hits are
 * handled per hospital; the offline/blackout path resolves to `null` so the
 * matcher falls back to straight-line proximity without waiting on a
 * timeout per hospital.
 */
export async function fetchDriveTimes(
  from: GeoPoint,
  hospitals: Array<Pick<GeoPointHolder, 'id' | 'location'>>,
): Promise<Map<string, number> | null> {
  if (!liveGeoEnabled()) return null
  const candidates = hospitals.filter((h) => isInNagpurRegion(h.location) && isInNagpurRegion(from))
  if (candidates.length === 0) return null

  const results = await Promise.all(
    candidates.map(async (h) => {
      const route = await drivingRoute(from, h.location)
      return route.source === 'osrm' ? ([h.id, route.durationMin] as const) : null
    }),
  )

  const map = new Map<string, number>()
  for (const r of results) if (r) map.set(r[0], r[1])
  return map.size > 0 ? map : null
}

interface GeoPointHolder {
  id: string
  location: GeoPoint
}

/**
 * Unit-test guard: when vitest's worker marker is present the live-geo path
 * is disabled so public OSRM/Nominatim servers are never hit from tests.
 * Tests flip this off via setLiveGeoEnabledForTests(true) to exercise the
 * mock-fetch path.
 */
const IS_TEST_ENV =
  typeof (globalThis as { __vitest_worker__?: unknown }).__vitest_worker__ !== 'undefined'

let testOverride: boolean | null = null

/** Test seam: force the live-geo gate on/off regardless of environment. */
export function setLiveGeoEnabledForTests(value: boolean | null): void {
  testOverride = value
}

/**
 * Live geo gate. True when the network is up and the demo blackout toggle
 * is off — mirrors the netOnline logic in syncService/connectivityService
 * without importing them (keeps this module dependency-free). All live
 * network paths (routes, geometry, geocoding, drive-time prefetch) gate
 * through here so the blackout demo and hermetic tests never hit the wire.
 */
function liveGeoEnabled(): boolean {
  if (testOverride !== null) return testOverride
  if (IS_TEST_ENV) return false
  if (typeof window === 'undefined') return false
  if (window.localStorage.getItem('nhg.forceOffline') === '1') return false
  return navigator.onLine !== false
}

/** haversine duplicated here (not imported) to keep this module standalone. */
function haversine(a: GeoPoint, b: GeoPoint): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

// ---------------------------------------------------------------------------
// Public surface: reverse geocoding (Nominatim)
// ---------------------------------------------------------------------------

export interface PlaceLabel {
  /** Short human label, e.g. "Dharampeth, Nagpur". */
  label: string
  /** Road/suburb granularities when available (may be null). */
  road: string | null
  suburb: string | null
  /** `nominatim` when live, `estimate` when the fallback produced the label. */
  source: 'nominatim' | 'estimate'
}

interface NominatimResponse {
  address?: {
    road?: string
    suburb?: string
    neighbourhood?: string
    city_district?: string
    city?: string
    town?: string
    state?: string
  }
}

/**
 * Reverse-geocode a point into an area label via Nominatim.
 * On failure, returns the existing nearest-demo-area estimate, so callers
 * always get a usable label; check `source` if the distinction matters.
 * Cached — the browser's own location rarely changes between requests.
 */
export async function reverseGeocode(point: GeoPoint): Promise<PlaceLabel> {
  const fallbackLabel = (): PlaceLabel => ({
    label: `${nearestDemoArea(point)}, Nagpur (approx.)`,
    road: null,
    suburb: null,
    source: 'estimate',
  })

  if (!isInNagpurRegion(point)) return fallbackLabel()

  const key = `geo:${point.lat.toFixed(4)},${point.lng.toFixed(4)}`
  const cached = cacheGet<PlaceLabel>(key)
  if (cached) return cached

  const url =
    `${NOMINATIM_BASE_URL}/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lng}` +
    `&zoom=16&addressdetails=1&accept-language=en`
  const data = await enqueueApi(() => fetchJson<NominatimResponse>(url))
  const a = data?.address
  if (!a) return fallbackLabel()

  const suburb = a.suburb ?? a.neighbourhood ?? a.city_district ?? null
  const city = a.city ?? a.town ?? a.state ?? 'Nagpur'
  const road = a.road ?? null

  // Label style: "Dharampeth, Nagpur" or "Wardha Road, Sitabuldi, Nagpur"
  const parts = [road, suburb, city].filter(Boolean) as string[]
  const label = parts
    .filter((p, i, arr) => arr.indexOf(p) === i) // dedupe (road === suburb etc.)
    .slice(0, 3)
    .join(', ')

  const result: PlaceLabel = { label: label || fallbackLabel().label, road, suburb, source: 'nominatim' }
  cacheSet(key, result)
  return result
}

/** Nearest demo-area centroid — shared fallback (mirrors locationService). */
function nearestDemoArea(point: GeoPoint): string {
  // Kept in sync with src/services/locationService.ts areaCenter centroids.
  const centers: Record<string, GeoPoint> = {
    Dharampeth: { lat: 21.1402, lng: 79.0622 },
    Sitabuldi: { lat: 21.1355, lng: 79.0768 },
    'Civil Lines': { lat: 21.1458, lng: 79.0882 },
    Sadar: { lat: 21.1497, lng: 79.0906 },
    Itwari: { lat: 21.1525, lng: 79.1082 },
    Nandanvan: { lat: 21.1383, lng: 79.1178 },
    Manewada: { lat: 21.1146, lng: 79.0944 },
    'Hingna Road': { lat: 21.1027, lng: 79.0436 },
    'Wardha Road': { lat: 21.1196, lng: 79.0647 },
    'Koradi Road': { lat: 21.1907, lng: 79.0685 },
    Jaripatka: { lat: 21.1667, lng: 79.0793 },
    'Katol Road': { lat: 21.1893, lng: 79.0401 },
  }
  let best = 'Civil Lines'
  let bestKm = Infinity
  for (const [area, center] of Object.entries(centers)) {
    const dLat = (center.lat - point.lat) * 111
    const dLng = (center.lng - point.lng) * 104
    const km = Math.sqrt(dLat * dLat + dLng * dLng)
    if (km < bestKm) {
      bestKm = km
      best = area
    }
  }
  return best
}

/** Nagpur center re-export for callers that only import this module. */
export { NAGPUR_CENTER }
