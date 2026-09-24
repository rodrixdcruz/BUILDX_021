import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  drivingRoute,
  drivingRouteGeometry,
  interpolateAlong,
  reverseGeocode,
  fetchDriveTimes,
  isInNagpurRegion,
  clearRoutingCache,
  setLiveGeoEnabledForTests,
  osrmUrls,
  routingStatus,
  lastOsrmInstanceUsed,
  resetOsrmInstanceHealth,
} from './routingService'

/**
 * Network is mocked; assertions cover response parsing, the estimate
 * fallback chain, cache hits (no second fetch), and out-of-region gating.
 */

const NAGPUR_SOUTH = { lat: 21.1146, lng: 79.0944 } // Manewada-ish
const NAGPUR_NORTH = { lat: 21.1907, lng: 79.0685 } // Koradi Road-ish

describe('isInNagpurRegion', () => {
  it('accepts Nagpur-area points and rejects far-away ones', () => {
    expect(isInNagpurRegion(NAGPUR_CENTER_POINT)).toBe(true)
    expect(isInNagpurRegion({ lat: 19.076, lng: 72.8777 })).toBe(false) // Mumbai
    expect(isInNagpurRegion({ lat: 28.61, lng: 77.21 })).toBe(false) // Delhi
  })
})

describe('osrmUrls (VITE_OSRM_BASE_URL resolution)', () => {
  const ENV = import.meta.env as Record<string, string | undefined>
  const original = ENV.VITE_OSRM_BASE_URL

  afterEach(() => {
    if (original === undefined) delete ENV.VITE_OSRM_BASE_URL
    else ENV.VITE_OSRM_BASE_URL = original
  })

  it('defaults to the public demo server when no env var is set', () => {
    delete ENV.VITE_OSRM_BASE_URL
    expect(osrmUrls()).toEqual(['https://router.project-osrm.org'])
  })

  it('puts configured instances first, public server last (safety net)', () => {
    ENV.VITE_OSRM_BASE_URL = 'http://localhost:5000'
    expect(osrmUrls()).toEqual(['http://localhost:5000', 'https://router.project-osrm.org'])
  })

  it('splits a comma-separated list, trims slashes and adds https scheme', () => {
    ENV.VITE_OSRM_BASE_URL = 'http://10.0.0.5:5000/, router.mydomain.org ,https://backup.osrm.dev'
    expect(osrmUrls()).toEqual([
      'http://10.0.0.5:5000',
      'https://router.mydomain.org',
      'https://backup.osrm.dev',
      'https://router.project-osrm.org',
    ])
  })

  it('does not duplicate the public server when listed explicitly', () => {
    ENV.VITE_OSRM_BASE_URL = 'https://router.project-osrm.org'
    expect(osrmUrls()).toEqual(['https://router.project-osrm.org'])
  })
})

describe('drivingRouteGeometry (ambulance route line)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearRoutingCache()
    resetOsrmInstanceHealth()
    setLiveGeoEnabledForTests(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setLiveGeoEnabledForTests(null)
  })

  it('converts OSRM [lng, lat] overview coordinates into GeoPoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okJsonResponse({
          code: 'Ok',
          routes: [
            {
              distance: 13260,
              duration: 825,
              geometry: { coordinates: [[79.0944, 21.1146], [79.08, 21.13], [79.0685, 21.1907]] },
            },
          ],
        }),
      ),
    )

    const path = await drivingRouteGeometry(NAGPUR_SOUTH, NAGPUR_NORTH)
    expect(path).not.toBeNull()
    expect(path!.source).toBe('osrm')
    expect(path!.points).toHaveLength(3)
    expect(path!.points[0]).toEqual({ lat: 21.1146, lng: 79.0944 }) // lat/lng swapped
    expect(path!.points[2]).toEqual({ lat: 21.1907, lng: 79.0685 })
    // Numbers ride along with the geometry (route response has them too).
    expect(path!.distanceKm).toBe(13.3)
    expect(path!.durationMin).toBe(14)
  })

  it('returns null (map draws nothing) when OSRM is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const path = await drivingRouteGeometry(NAGPUR_SOUTH, NAGPUR_NORTH)
    expect(path).toBeNull()
  })

  it('returns null without network when live geo is gated off (blackout/tests)', async () => {
    setLiveGeoEnabledForTests(false)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const path = await drivingRouteGeometry(NAGPUR_SOUTH, NAGPUR_NORTH)
    expect(path).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('interpolateAlong (simulated ambulance progress)', () => {
  const line = [
    { lat: 21.0, lng: 79.0 },
    { lat: 21.1, lng: 79.1 },
    { lat: 21.2, lng: 79.2 },
  ]

  it('starts at the first vertex', () => {
    expect(interpolateAlong(line, 0)).toEqual(line[0])
  })

  it('ends at the last vertex', () => {
    expect(interpolateAlong(line, 1)).toEqual(line[2])
  })

  it('interpolates halfway between vertices at t=0.5', () => {
    const mid = interpolateAlong(line, 0.5)
    expect(mid.lat).toBeCloseTo(21.1, 5)
    expect(mid.lng).toBeCloseTo(79.1, 5)
  })

  it('clamps out-of-range progress values', () => {
    expect(interpolateAlong(line, -3)).toEqual(line[0])
    expect(interpolateAlong(line, 7)).toEqual(line[2])
  })

  it('handles degenerate inputs', () => {
    expect(interpolateAlong([], 0.5)).toEqual({ lat: 0, lng: 0 })
    expect(interpolateAlong([{ lat: 21, lng: 79 }], 0.7)).toEqual({ lat: 21, lng: 79 })
  })
})

describe('drivingRoute', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearRoutingCache()
    resetOsrmInstanceHealth() // failover health must not leak between tests
    setLiveGeoEnabledForTests(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('parses an OSRM response into km and minutes', async () => {
    stubFetchOnce({
      code: 'Ok',
      routes: [{ distance: 7250, duration: 840 }],
    })

    const r = await drivingRoute(NAGPUR_SOUTH, NAGPUR_NORTH)
    expect(r.source).toBe('osrm')
    expect(r.distanceKm).toBe(7.3)
    expect(r.durationMin).toBe(14)
  })

  it('falls back to a road-factor estimate when OSRM fails', async () => {
    stubFetchOnce(null) // network error / timeout

    const r = await drivingRoute(NAGPUR_SOUTH, NAGPUR_NORTH)
    expect(r.source).toBe('estimate')
    expect(r.distanceKm).toBeGreaterThan(0)
    expect(r.durationMin).toBeGreaterThanOrEqual(4)
  })

  it('fails over to the second instance when the first returns garbage', async () => {
    const ENV = import.meta.env as Record<string, string | undefined>
    ENV.VITE_OSRM_BASE_URL = 'http://osrm-primary.test'
    try {
      const fetchSpy = vi.fn((url: string | URL | Request) => {
        const u = String(url)
        if (u.startsWith('http://osrm-primary.test')) {
          return Promise.reject(new Error('self-hosted instance is down'))
        }
        return Promise.resolve(
          okJsonResponse({ code: 'Ok', routes: [{ distance: 7250, duration: 840 }] }),
        )
      })
      vi.stubGlobal('fetch', fetchSpy)

      const r = await drivingRoute(NAGPUR_SOUTH, NAGPUR_NORTH)
      expect(r.source).toBe('osrm')
      expect(r.durationMin).toBe(14)
      expect(String(fetchSpy.mock.calls[1][0])).toContain('router.project-osrm.org') // safety net served it
      expect(lastOsrmInstanceUsed()).toBe('https://router.project-osrm.org')
    } finally {
      delete ENV.VITE_OSRM_BASE_URL
    }
  })

  it('skips an instance that just failed until its cool-off expires', async () => {
    const ENV = import.meta.env as Record<string, string | undefined>
    ENV.VITE_OSRM_BASE_URL = 'http://osrm-flaky.test'
    try {
      let primaryUp = false
      const fetchSpy = vi.fn((url: string | URL | Request) => {
        const u = String(url)
        if (u.startsWith('http://osrm-flaky.test')) {
          return primaryUp
            ? Promise.resolve(okJsonResponse({ code: 'Ok', routes: [{ distance: 3000, duration: 420 }] }))
            : Promise.reject(new Error('down'))
        }
        // Public safety net stays healthy throughout.
        return Promise.resolve(okJsonResponse({ code: 'Ok', routes: [{ distance: 7250, duration: 840 }] }))
      })
      vi.stubGlobal('fetch', fetchSpy)

      // First call: primary down → public serves it, primary marked unhealthy.
      expect((await drivingRoute(NAGPUR_SOUTH, NAGPUR_NORTH)).source).toBe('osrm')
      expect(routingStatus().find((s) => s.url === 'http://osrm-flaky.test')?.down).toBe(true)
      expect(lastOsrmInstanceUsed()).toBe('https://router.project-osrm.org')

      // Second call: the primary has "recovered", but it is within the
      // cool-off window — no request may reach it; public serves again.
      primaryUp = true
      const flakyCallsBefore = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('osrm-flaky')).length
      expect((await drivingRoute(NAGPUR_SOUTH, { lat: 21.14, lng: 79.02 })).source).toBe('osrm')
      const flakyCallsAfter = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('osrm-flaky')).length
      expect(flakyCallsAfter).toBe(flakyCallsBefore) // skipped, not retried
    } finally {
      delete ENV.VITE_OSRM_BASE_URL
    }
  })

  it('falls back to an estimate on non-Ok OSRM codes', async () => {
    stubFetchOnce({ code: 'NoRoute' })

    const r = await drivingRoute(NAGPUR_SOUTH, NAGPUR_NORTH)
    expect(r.source).toBe('estimate')
  })

  it('never calls the network for out-of-region pairs', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const r = await drivingRoute({ lat: 48.8566, lng: 2.3522 }, NAGPUR_NORTH) // Paris → Nagpur
    expect(r.source).toBe('estimate')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('caches results — the second call does not refetch', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJsonResponse({
      code: 'Ok',
      routes: [{ distance: 5000, duration: 600 },
    ]}))
    vi.stubGlobal('fetch', fetchSpy)

    const first = await drivingRoute(NAGPUR_SOUTH, NAGPUR_NORTH)
    const second = await drivingRoute(NAGPUR_SOUTH, NAGPUR_NORTH)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    expect(second.source).toBe('osrm')
  })
})

describe('fetchDriveTimes (hospital matching prefetch)', () => {
  const HOSPITALS = [
    { id: 'H001', location: NAGPUR_SOUTH },
    { id: 'H002', location: NAGPUR_NORTH },
  ]

  beforeEach(() => {
    window.localStorage.clear()
    clearRoutingCache()
    resetOsrmInstanceHealth()
    // fetchDriveTimes is gated off in the test env by default; flip the
    // seam on for these tests so the mock-fetch path is exercised.
    setLiveGeoEnabledForTests(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setLiveGeoEnabledForTests(null)
  })

  it('collects per-hospital OSRM minutes into a map', async () => {
    const fetchSpy = vi.fn((url: string | URL | Request) => {
      const u = String(url)
      // Two different OSRM requests → different durations.
      return Promise.resolve(
        okJsonResponse({
          code: 'Ok',
          routes: [{ distance: u.includes('79.0944') ? 4000 : 9000, duration: u.includes('79.0944') ? 300 : 900 }],
        }),
      )
    })
    vi.stubGlobal('fetch', fetchSpy)

    const map = await fetchDriveTimes(NAGPUR_CENTER_POINT, HOSPITALS)
    expect(map).not.toBeNull()
    expect(map!.get('H001')).toBe(5)
    expect(map!.get('H002')).toBe(15)
  })

  it('omits hospitals whose route fell back to an estimate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const map = await fetchDriveTimes(NAGPUR_CENTER_POINT, HOSPITALS)
    expect(map).toBeNull() // all estimates → null → caller uses straight-line
  })

  it('resolves null without network when the region gate excludes the origin', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const map = await fetchDriveTimes({ lat: 40.7128, lng: -74.006 }, HOSPITALS) // NYC
    expect(map).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('reverseGeocode', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearRoutingCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('builds a label from Nominatim address parts', async () => {
    stubFetchOnce({
      address: {
        road: 'West High Court Road',
        suburb: 'Dharampeth',
        city: 'Nagpur',
        state: 'Maharashtra',
      },
    })

    const r = await reverseGeocode(NAGPUR_SOUTH)
    expect(r.source).toBe('nominatim')
    expect(r.label).toContain('Dharampeth')
    expect(r.label).toContain('Nagpur')
    expect(r.suburb).toBe('Dharampeth')
  })

  it('falls back to the nearest demo area when Nominatim fails', async () => {
    stubFetchOnce(null)

    const r = await reverseGeocode(NAGPUR_SOUTH)
    expect(r.source).toBe('estimate')
    expect(r.label).toMatch(/Nagpur \(approx\.\)$/)
  })

  it('never calls the network for out-of-region points', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const r = await reverseGeocode({ lat: 51.5074, lng: -0.1278 }) // London
    expect(r.source).toBe('estimate')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('caches labels — the second call does not refetch', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      okJsonResponse({
        address: { suburb: 'Sadar', city: 'Nagpur' },
      }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    await reverseGeocode(NAGPUR_NORTH)
    await reverseGeocode(NAGPUR_NORTH)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

// --- helpers -----------------------------------------------------------------

const NAGPUR_CENTER_POINT = { lat: 21.1458, lng: 79.0882 }

function okJsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response
}

/** Stubs a single successful or failed fetch for the next call. */
function stubFetchOnce(body: unknown | null): void {
  const impl = body === null
    ? vi.fn().mockRejectedValue(new Error('network down'))
    : vi.fn().mockResolvedValue(okJsonResponse(body))
  vi.stubGlobal('fetch', impl)
}
