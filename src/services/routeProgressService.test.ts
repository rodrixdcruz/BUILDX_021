import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getRouteStart,
  saveRouteStart,
  clearRouteStart,
  resetRouteProgressForTests,
  routeProgressKey,
} from './routeProgressService'

/**
 * Pure localStorage behavior: roundtrip, route-change invalidation, clearing,
 * cap-based pruning, and corrupt-JSON resilience. The hook integration is
 * covered indirectly by the dashboard flow.
 */

const KEY = 'nhg-route-progress'
const ROUTE_A = routeProgressKey(21.1146, 79.0944, 21.1907, 79.0685)
const ROUTE_B = routeProgressKey(21.15, 79.09, 21.1907, 79.0685)

beforeEach(() => {
  window.localStorage.clear()
})

describe('routeProgressService', () => {
  it('roundtrips a saved start time for the same route key', () => {
    saveRouteStart('NGP-1001', ROUTE_A, 1_000)
    expect(getRouteStart('NGP-1001', ROUTE_A)).toBe(1_000)
  })

  it('returns null for an unknown case', () => {
    expect(getRouteStart('NGP-404', ROUTE_A)).toBeNull()
  })

  it('invalidates progress when the route changed (different from/to)', () => {
    saveRouteStart('NGP-1001', ROUTE_A, 1_000)
    // Ambulance re-based → different route → old start must NOT resume.
    expect(getRouteStart('NGP-1001', ROUTE_B)).toBeNull()
    // Overwrite with the new route; resume works again.
    saveRouteStart('NGP-1001', ROUTE_B, 2_000)
    expect(getRouteStart('NGP-1001', ROUTE_B)).toBe(2_000)
    expect(getRouteStart('NGP-1001', ROUTE_A)).toBeNull()
  })

  it('clearRouteStart drops the entry (fresh animation on re-assignment)', () => {
    saveRouteStart('NGP-1002', ROUTE_A, 1_000)
    clearRouteStart('NGP-1002')
    expect(getRouteStart('NGP-1002', ROUTE_A)).toBeNull()
    // Clearing an unknown case is a harmless no-op.
    expect(() => clearRouteStart('NGP-404')).not.toThrow()
  })

  it('prunes to the cap, evicting the OLDEST entries first', () => {
    for (let i = 0; i < 25; i++) {
      saveRouteStart(`NGP-${1000 + i}`, ROUTE_A, i) // startedAt = i, so NGP-1000 oldest
    }
    const store = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    expect(Object.keys(store).length).toBe(20)
    expect(store['NGP-1000']).toBeUndefined() // oldest evicted
    expect(store['NGP-1004']).toBeUndefined() // 25 saves − 20 cap = 5 evictions
    expect(store['NGP-1005']).toBeDefined() // survivor boundary
    expect(store['NGP-1024']).toBeDefined() // newest kept
  })

  it('treats corrupt JSON as empty storage and recovers on next save', () => {
    window.localStorage.setItem(KEY, '{not json')
    expect(getRouteStart('NGP-1001', ROUTE_A)).toBeNull()
    saveRouteStart('NGP-1001', ROUTE_A, 5_000)
    expect(getRouteStart('NGP-1001', ROUTE_A)).toBe(5_000)
  })

  it('resetRouteProgressForTests wipes everything', () => {
    saveRouteStart('NGP-1003', ROUTE_A, 1)
    resetRouteProgressForTests()
    expect(getRouteStart('NGP-1003', ROUTE_A)).toBeNull()
  })

  it('rejects a stored entry whose startedAt is not a number', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ 'NGP-1009': { routeKey: ROUTE_A, startedAt: 'soon' } }))
    expect(getRouteStart('NGP-1009', ROUTE_A)).toBeNull()
  })

  it('routeProgressKey is stable and coordinate-sensitive at 5 decimals', () => {
    expect(routeProgressKey(21.1, 79.1, 21.2, 79.2)).toBe(routeProgressKey(21.1, 79.1, 21.2, 79.2))
    expect(routeProgressKey(21.1, 79.1, 21.2, 79.2)).not.toBe(routeProgressKey(21.10001, 79.1, 21.2, 79.2))
  })

  it('survives a throwing localStorage.setItem (quota) without crashing', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => saveRouteStart('NGP-1005', ROUTE_A, 1)).not.toThrow()
    spy.mockRestore()
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
