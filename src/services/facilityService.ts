import type { AllocationReason, Facility, GeoPoint } from '../models/types'
import { haversineKm, formatDistance } from './emergencyService'
import { getHospitals } from './hospitalService'
import { DEMO_FACILITIES, DEMO_FACILITY_HOSPITAL_IDS } from '../data/demoFacilities'

/**
 * Facility capacity & overflow service — DEMO / REPORTED data only.
 *
 * ⚠️ Capacity numbers are simulated snapshots for the hackathon demo.
 * Nothing here is real-time. A verified capacity feed would replace
 * `getFacilities()` / `hospitalReportedCapacity()` later without UI changes.
 *
 * Scope guard: capacity is a COORDINATION input (where to route a case),
 * never a clinical judgement about the patient.
 */
export function getFacilities(): Facility[] {
  return DEMO_FACILITIES
}

export function getFacilityById(id: string): Facility | null {
  return DEMO_FACILITIES.find((f) => f.id === id) ?? null
}

/** True when a demo facility can currently receive an emergency case. */
export function isReceiving(f: Facility): boolean {
  return f.emergencyCapability && f.reportedCapacity !== 'Full'
}

/** Demo partner-hospital ids backing the alternative pool. */
export function partnerHospitalIds(): string[] {
  return DEMO_FACILITY_HOSPITAL_IDS
}

/**
 * Reported capacity for a demo hospital, as a percent of beds free.
 * Backed by the SAME demo bed data as hospital discovery — one source of truth.
 */
export function hospitalReportedCapacity(hospitalId: string): {
  percentFree: number
  status: 'Available' | 'Limited' | 'Full'
  bedsAvailable: number
  bedsTotal: number
} {
  const h = getHospitals().find((x) => x.id === hospitalId) ?? null
  if (!h) return { percentFree: 0, status: 'Full', bedsAvailable: 0, bedsTotal: 0 }

  const cats = [h.beds.ICU, h.beds.General, h.beds.Oxygen]
  const total = cats.reduce((s, b) => s + (b?.total ?? 0), 0)
  const available = cats.reduce((s, b) => s + (b?.available ?? 0), 0)
  const percentFree = total > 0 ? Math.round((available / total) * 100) : 0
  const status: 'Available' | 'Limited' | 'Full' =
    available === 0 ? 'Full' : percentFree < 25 ? 'Limited' : 'Available'
  return { percentFree, status, bedsAvailable: available, bedsTotal: total }
}

/**
 * Deterministic overflow alternatives for a FULL hospital.
 * Excludes the full hospital and everything already reporting Full.
 * Scoring (coordination only): capacity +36 (Available), +14 (Limited),
 * emergency capability +12, proximity up to +30, lower load up to +12,
 * camp/centre boost +6, id tie-break.
 */
export function overflowAlternatives(
  fullHospitalId: string,
  from: GeoPoint | null,
): Array<{
  facility: Facility
  distanceText: string | null
  distanceKm: number | null
  score: number
  reasons: AllocationReason[]
}> {
  const hospital = getHospitals().find((h) => h.id === fullHospitalId) ?? null
  const origin: GeoPoint | null = from ?? hospital?.location ?? null

  return DEMO_FACILITIES.filter((f) => f.id !== fullHospitalId && isReceiving(f))
    .map((f) => {
      const reasons: AllocationReason[] = []
      let score = 0

      if (f.reportedCapacity === 'Available') {
        score += 36
        reasons.push({ key: 'reported-capacity', label: 'Reported capacity: Available (demo)' })
      } else if (f.reportedCapacity === 'Limited') {
        score += 14
        reasons.push({ key: 'reported-capacity', label: 'Reported capacity: Limited (demo)' })
      }

      if (f.emergencyCapability) {
        score += 12
        reasons.push({ key: 'emergency-capability', label: 'Emergency capability: supported' })
      }

      const km = origin ? haversineKm(origin, f.location) : null
      if (km !== null) {
        const proximity = Math.max(0, 30 - km * 3)
        score += proximity
        reasons.push({ key: 'distance', label: `Distance: ${formatDistance(km)} (estimated route)` })
      }

      const loadBonus = Math.round(Math.max(0, 12 - f.loadPercent / 10))
      if (f.loadPercent > 0) {
        score += loadBonus
        reasons.push({ key: 'load', label: `Current allocation load: ${f.loadPercent}% (demo)` })
      }

      if (f.kind !== 'hospital') {
        score += 6
        reasons.push({
          key: 'kind-boost',
          label: f.kind === 'emergency-camp' ? 'Temporary emergency camp with spare capacity' : 'Nearby healthcare centre',
        })
      }

      return { facility: f, distanceText: km !== null ? formatDistance(km) : null, distanceKm: km, score, reasons }
    })
    .sort((a, b) => b.score - a.score || a.facility.id.localeCompare(b.facility.id))
}
