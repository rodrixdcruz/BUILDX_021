import type { GeoPoint } from '../models/types'
import { NAGPUR_CENTER, NAGPUR_AREAS } from '../constants/emergency'

export type LocationErrorCode = 'unsupported' | 'denied' | 'timeout' | 'error'

export interface LocateResult {
  point: GeoPoint
  label: string
  source: 'browser' | 'manual'
}

export class LocationError extends Error {
  code: LocationErrorCode
  constructor(code: LocationErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/** Wraps navigator.geolocation into a promise with typed failure reasons. */
export function locateBrowser(): Promise<LocateResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
      reject(new LocationError('unsupported', 'Geolocation is not supported by this browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        resolve({ point, label: describePoint(point), source: 'browser' })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new LocationError('denied', 'Location permission denied — enter your location manually.'))
        } else if (err.code === err.TIMEOUT) {
          reject(new LocationError('timeout', 'Could not get your location in time — try again or enter manually.'))
        } else {
          reject(new LocationError('error', 'Could not determine your location — enter it manually.'))
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  })
}

/** Nearest known Nagpur area label for a coordinate (demo reverse geocode). */
export function describePoint(point: GeoPoint): string {
  const area = nearestAreaName(point)
  return `${area}, Nagpur (approx.)`
}

/** Distance to the closest area centroid, used for the approximate label. */
export function nearestAreaName(point: GeoPoint): string {
  let best = NAGPUR_AREAS[0]
  let bestKm = Infinity
  for (const area of NAGPUR_AREAS) {
    const center = areaCenter(area)
    const dLat = (center.lat - point.lat) * 111
    const dLng = (center.lng - point.lng) * 104 // rough km per degree at Nagpur's latitude
    const km = Math.sqrt(dLat * dLat + dLng * dLng)
    if (km < bestKm) {
      bestKm = km
      best = area
    }
  }
  return best
}

/** Rough centroids for demo reverse-geocoding only. */
export function areaCenter(area: string): GeoPoint {
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
  return centers[area] ?? NAGPUR_CENTER
}
