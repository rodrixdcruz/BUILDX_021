import type { Hospital, HospitalFilters, GeoPoint } from '../models/types'
import { haversineKm, formatDistance } from './emergencyService'
import { DEMO_HOSPITALS } from '../data/demoHospitals'

/**
 * Hospital service — currently serves DEMO data.
 * A real availability feed would be plugged in here later; the
 * UI depends only on these functions, not on the demo file.
 */
export function getHospitals(): Hospital[] {
  return DEMO_HOSPITALS
}

export function getHospitalById(id: string): Hospital | null {
  return DEMO_HOSPITALS.find((h) => h.id === id) ?? null
}

const hasFreeBeds = (h: Hospital, cat: 'ICU' | 'General' | 'Oxygen'): boolean =>
  h.beds[cat] !== null && h.beds[cat]!.available > 0

export function filterHospitals(hospitals: Hospital[], filters: HospitalFilters): Hospital[] {
  const q = filters.query.trim().toLowerCase()
  return hospitals.filter((h) => {
    if (filters.emergencyOnly && !h.emergencyAvailable) return false
    if (filters.emergencyOnly && !h.emergencyAvailable) return false
    if (filters.icuOnly && !hasFreeBeds(h, 'ICU')) return false
    if (filters.generalBedOnly && !hasFreeBeds(h, 'General')) return false
    if (filters.area !== 'All Areas' && h.area !== filters.area) return false
    if (q && !(`${h.name} ${h.area}`.toLowerCase().includes(q))) return false
    return true
  })
}

/**
 * Returns hospitals annotated with distance from the given point
 * (or null when patient location is unknown), sorted nearest-first.
 */
export function withDistances(
  hospitals: Hospital[],
  from: GeoPoint | null,
): Array<Hospital & { distanceText: string | null; distanceKm: number | null }> {
  if (!from) {
    return hospitals.map((h) => ({ ...h, distanceText: null, distanceKm: null }))
  }
  return hospitals
    .map((h) => {
      const km = haversineKm(from, h.location)
      return { ...h, distanceText: formatDistance(km), distanceKm: km }
    })
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
}
