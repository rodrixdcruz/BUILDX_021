import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  drivingRoute,
  drivingRouteGeometry,
  reverseGeocode,
  osrmUrls,
  NOMINATIM_BASE_URL,
  clearRoutingCache,
  setLiveGeoEnabledForTests,
} from './routingService'
import { NAGPUR_CENTER } from '../constants/emergency'

/**
 * LIVE-API CONTRACT SMOKE TESTS — these hit the real public OSRM and
 * Nominatim servers, once each, to catch upstream response-shape changes
 * before they can break the app (e.g. a renamed field in the OSRM route
 * object or a moved Nominatim address key).
 *
 * They are EXCLUDED from the normal unit suite (vitest.config.ts) and run
 * separately via `npm run test:smoke` (vitest.smoke.config.ts). Never wire
 * them into CI jobs that must stay hermetic, and don't extend this file
 * with per-hospital loops — one request per API keeps us a polite citizen
 * of community infrastructure.
 *
 * Failure semantics:
 * - Service UNREACHABLE (offline CI, server down): skipped, not failed —
 *   reachability is not what these tests guard.
 * - Service reachable but response SHAPE unexpected: hard failure — that
 *   is exactly the drift these tests exist to catch.
 */

// Real Nagpur endpoints with meaningful road distance between them
// (Manewada → Koradi Road, ~13 km by road).
const FROM = { lat: 21.1146, lng: 79.0944 }
const TO = { lat: 21.1907, lng: 79.0685 }

/** Probe reachability once per server with a raw fetch; null when down. */
async function reachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

beforeAll(() => {
  // Smoke runs must exercise the real network path, not a cached answer —
  // and they explicitly re-enable the live-geo gate that the normal test
  // environment disables.
  setLiveGeoEnabledForTests(true)
  clearRoutingCache()
})

afterAll(() => {
  setLiveGeoEnabledForTests(null)
})

describe('OSRM live contract (router.project-osrm.org)', () => {
  it('returns a drivable route with the fields the app reads', async () => {
    const up = await reachable(
      `${osrmUrls()[0]}/route/v1/driving/79.0882,21.1458;79.0882,21.1458`,
    )
    if (!up) {
      console.warn(`[smoke] OSRM unreachable — skipping contract check`)
      return
    }

    const route = await drivingRoute(FROM, TO)

    // The contract: drivingRoute returns real OSRM data (never the estimate
    // fallback while the server is up) with sane, app-compatible values.
    expect(route.source).toBe('osrm')
    expect(route.distanceKm).toBeGreaterThan(1) // Manewada → Koradi is a real trip
    expect(route.distanceKm).toBeLessThan(80) // but still within Nagpur region
    expect(route.durationMin).toBeGreaterThan(1)
    expect(route.durationMin).toBeLessThan(180)
    expect(Number.isFinite(route.distanceKm)).toBe(true)
    expect(Number.isFinite(route.durationMin)).toBe(true)
  })

  it('returns overview geometry with the fields the route polyline reads', async () => {
    const up = await reachable(
      `${osrmUrls()[0]}/route/v1/driving/79.0882,21.1458;79.0882,21.1458`,
    )
    if (!up) {
      console.warn(`[smoke] OSRM unreachable — skipping geometry contract check`)
      return
    }

    const path = await drivingRouteGeometry(FROM, TO)

    // The contract for the ambulance/directions polylines: real road
    // vertices (≥2 so a line can be drawn) with valid Nagpur-ish
    // coordinates, plus the distance/duration numbers the ETA panel reads.
    expect(path).not.toBeNull()
    expect(path!.source).toBe('osrm')
    expect(path!.points.length).toBeGreaterThanOrEqual(2)
    for (const p of path!.points.slice(0, 5)) {
      expect(p.lat).toBeGreaterThan(20.9)
      expect(p.lat).toBeLessThan(21.35)
      expect(p.lng).toBeGreaterThan(78.85)
      expect(p.lng).toBeLessThan(79.35)
    }
    expect(path!.distanceKm).toBeGreaterThan(1)
    expect(path!.distanceKm).toBeLessThan(80)
    expect(path!.durationMin).toBeGreaterThan(1)
    expect(path!.durationMin).toBeLessThan(180)
  })
})

describe('Nominatim live contract (nominatim.openstreetmap.org)', () => {
  it('reverse-geocodes a Nagpur point into address parts the app reads', async () => {
    const up = await reachable(`${NOMINATIM_BASE_URL}/status`)
    if (!up) {
      console.warn(`[smoke] Nominatim unreachable — skipping contract check`)
      return
    }

    const place = await reverseGeocode(NAGPUR_CENTER)

    // The contract: a Nominatim-sourced label built from real address
    // components — city (or state) present, not the offline fallback.
    expect(place.source).toBe('nominatim')
    expect(place.label.length).toBeGreaterThan(0)
    expect(place.label.toLowerCase()).toContain('nagpur')
    // The app reads `suburb` (area chips) and tolerates null `road`.
    expect(place.suburb === null || typeof place.suburb === 'string').toBe(true)
    expect(place.road === null || typeof place.road === 'string').toBe(true)
  })
})
