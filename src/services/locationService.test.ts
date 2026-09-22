import { describe, it, expect } from 'vitest'
import { locateBrowser, LocationError, nearestAreaName, areaCenter, describePoint } from './locationService'

describe('manual / approximate geography', () => {
  it('maps known areas to Nagpur-ish coordinates', () => {
    const c = areaCenter('Dharampeth')
    expect(c.lat).toBeGreaterThan(21.0)
    expect(c.lat).toBeLessThan(21.3)
    expect(c.lng).toBeGreaterThan(78.9)
    expect(c.lng).toBeLessThan(79.3)
  })

  it('names the nearest area for a point', () => {
    expect(nearestAreaName(areaCenter('Sadar'))).toBe('Sadar')
    expect(nearestAreaName(areaCenter('Manewada'))).toBe('Manewada')
  })

  it('describes a point with an approximate label', () => {
    expect(describePoint(areaCenter('Itwari'))).toContain('Nagpur')
  })
})

describe('browser geolocation wrapper', () => {
  it('rejects with a typed error when geolocation is unavailable', async () => {
    const original = navigator.geolocation
    // Simulate unsupported browser
    Object.defineProperty(window.navigator, 'geolocation', { value: undefined, configurable: true })
    await expect(locateBrowser()).rejects.toMatchObject({ code: 'unsupported' })
    Object.defineProperty(window.navigator, 'geolocation', { value: original, configurable: true })
  })

  it('rejects with typed permission-denied error', async () => {
    Object.defineProperty(window.navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_ok: (p: unknown) => void, err: (e: { code: number }) => void) =>
          err({ code: 1 }), // PERMISSION_DENIED
      },
      configurable: true,
    })
    await expect(locateBrowser()).rejects.toBeInstanceOf(LocationError)
  })
})
