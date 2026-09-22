import type { EmergencyCase, EmergencyReportInput } from '../models/types'

const CASE_ID_KEY = 'nhg.caseCounter'
const CASES_KEY = 'nhg.cases'

/** Returns the next case id in the format NGP-1001, NGP-1002, ... */
export function nextCaseId(): string {
  const raw = window.localStorage.getItem(CASE_ID_KEY)
  const next = raw ? Number(raw) + 1 : 1001
  window.localStorage.setItem(CASE_ID_KEY, String(next))
  return `NGP-${next}`
}

/** Creates a new emergency case from a validated report. */
export function createEmergencyCase(input: EmergencyReportInput): EmergencyCase {
  const now = new Date().toISOString()

  return {
    id: nextCaseId(),
    patientName: input.patientName.trim(),
    age: Number(input.age),
    emergencyType: input.emergencyType as EmergencyCase['emergencyType'],
    contactNumber: input.contactNumber.trim(),
    location: input.location.trim(),
    locationPoint: input.locationPoint,
    description: input.description?.trim() || undefined,
    priority: input.priority,
    status: 'Submitted',
    createdAt: now,
    hospital: { status: 'Searching' },
    bed: { status: 'Checking' },
    ambulance: { status: 'NotAssignedYet', note: 'Coming in a later commit' },
    blood: { status: 'NotAssignedYet', note: 'Coming in a later commit' },
    navigation: { status: 'NotAssignedYet', note: 'Coming in a later commit' },
  }
}

/** Persists a case (called right after creation and after every update). */
export function saveCase(caseRecord: EmergencyCase): void {
  const cases = getAllCases()
  const idx = cases.findIndex((c) => c.id === caseRecord.id)
  if (idx >= 0) cases[idx] = caseRecord
  else cases.unshift(caseRecord)
  window.localStorage.setItem(CASES_KEY, JSON.stringify(cases))
}

/** All stored cases, newest first. */
export function getAllCases(): EmergencyCase[] {
  try {
    const raw = window.localStorage.getItem(CASES_KEY)
    const parsed = raw ? (JSON.parse(raw) as EmergencyCase[]) : []
    return parsed
  } catch {
    // Corrupt storage should never break the emergency flow.
    window.localStorage.removeItem(CASES_KEY)
    return []
  }
}

/** Fetch one case by id, or null. */
export function getCase(id: string): EmergencyCase | null {
  return getAllCases().find((c) => c.id === id) ?? null
}

/**
 * Simulated hospital matching: picks the best hospital for a case based on
 * priority, emergency availability, relevant ICU capacity and proximity.
 * Marked clearly as DEMO logic — a real dispatch integration replaces this.
 */
export function selectBestHospital(
  caseRecord: EmergencyCase,
  hospitals: import('../models/types').Hospital[],
): import('../models/types').Hospital | null {
  const scored = hospitals
    .filter((h) => h.emergencyAvailable && h.beds.ICU && h.beds.ICU.available > 0)
    .map((h) => {
      let score = 0
      if (caseRecord.priority === 'Emergency') score += 40
      score += h.beds.ICU!.available // safe: filtered above
      if (caseRecord.locationPoint && h.location) {
        const d = haversineKm(caseRecord.locationPoint, h.location)
        score += Math.max(0, 30 - d * 3) // closer is better
      }
      return { h, score }
    })
    .sort((a, b) => b.score - a.score)

  return scored.length > 0 ? scored[0].h : null
}

/** Great-circle distance between two points, in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/** Formats a distance for UI display. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}
