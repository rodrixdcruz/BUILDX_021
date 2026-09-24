import type {
  EmergencyCase,
  EmergencyReportInput,
  LifecycleStage,
  SmsFallbackMessage,
  TriageCategory,
  TimelineEntry,
} from '../models/types'
import { allocateCaseId, bumpLocalCounter, mirrorCase } from './syncService'

/**
 * Demo triage mapping — COORDINATION AID ONLY, never clinical triage.
 * Transparent rule derived from the reporter's chosen priority:
 *   Emergency → CRITICAL, High → URGENT, Normal → NON_URGENT.
 */
export function triageFor(priority: EmergencyCase['priority']): TriageCategory {
  if (priority === 'Emergency') return 'CRITICAL'
  if (priority === 'High') return 'URGENT'
  return 'NON_URGENT'
}

/** Ordered lifecycle stages for the coordination view. */
export const LIFECYCLE_STAGES: LifecycleStage[] = [
  'Emergency Reported',
  'Ambulance Requested',
  'Ambulance Assigned',
  'Hospital Selected',
  'Hospital Notified',
  'Patient En Route',
  'Arrived',
]

/**
 * Derives the furthest lifecycle stage reached from case state.
 * 'Patient En Route' and 'Arrived' are explicit coordinator actions
 * stored on `caseRecord.lifecycle` and are preserved here.
 */
export function deriveLifecycle(c: EmergencyCase): LifecycleStage {
  if (c.lifecycle === 'Patient En Route' || c.lifecycle === 'Arrived') return c.lifecycle
  if (c.status === 'Closed') return 'Arrived'

  let stage: LifecycleStage = 'Emergency Reported'
  const advance = (s: LifecycleStage) => {
    if (LIFECYCLE_STAGES.indexOf(s) > LIFECYCLE_STAGES.indexOf(stage)) stage = s
  }
  if (c.hospital.status !== 'Searching' || c.ambulance.status !== 'NotAssignedYet') advance('Ambulance Requested')
  if (c.ambulance.status === 'Assigned') advance('Ambulance Assigned')
  if (c.hospital.status === 'Selected') advance('Hospital Selected')
  if (c.bed.status === 'Available') advance('Hospital Notified') // bed confirmed ⇒ hospital informed (demo)
  return stage
}

/** Appends a timeline entry (pure — returns a new case object). */
export function addTimelineEntry(
  c: EmergencyCase,
  key: string,
  label: string,
  detail?: string,
): EmergencyCase {
  const entry: TimelineEntry = { key, label, at: new Date().toISOString(), detail } // eslint-disable-line
  return { ...c, timeline: [...(c.timeline ?? []), entry] }
}

/**
 * Builds the SMS FALLBACK message for a case. DEMO ONLY — no SMS provider
 * is integrated; this drafts text (e.g. for manual relay) and never claims
 * a message was actually transmitted.
 */
export function buildSmsFallback(c: EmergencyCase): SmsFallbackMessage {
  const triage = c.triage ?? triageFor(c.priority)
  const text = `CASE ${c.id} | ${triage} | ${c.emergencyType} | Location: ${c.location} | Ambulance Required`
  return { caseId: c.id, text, to: '108', channel: 'demo' }
}

const CASE_ID_KEY = 'nhg.caseCounter'
const CASES_KEY = 'nhg.cases'

/** Returns the next case id in the format NGP-1001, NGP-1002, ... */
export function nextCaseId(): string {
  const raw = window.localStorage.getItem(CASE_ID_KEY)
  const next = raw ? Number(raw) + 1 : 1001
  window.localStorage.setItem(CASE_ID_KEY, String(next))
  return `NGP-${next}`
}

/**
 * Allocates the next case id — server-side when the shared API is reachable
 * (atomic counter in Neon Postgres, collision-free across devices), falling
 * back to the local counter offline / when no API is configured.
 */
export async function nextCaseIdSmart(): Promise<string> {
  const serverId = await allocateCaseId()
  if (serverId) {
    bumpLocalCounter(serverId)
    return serverId
  }
  return nextCaseId()
}

/** Creates a new emergency case from a validated report. */
export function createEmergencyCaseWithId(id: string, input: EmergencyReportInput): EmergencyCase {
  const created = createEmergencyCase(input)
  created.id = id
  return created
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
    requiredBloodGroup: input.requiredBloodGroup || undefined,
    status: 'Submitted',
    createdAt: now,
    triage: triageFor(input.priority),
    lifecycle: 'Emergency Reported',
    timeline: [
      { key: 'reported', label: 'Emergency reported', at: now, detail: input.location.trim() },
    ],
    hospital: { status: 'Searching' },
    bed: { status: 'Checking' },
    ambulance: { status: 'NotAssignedYet', note: 'Awaiting dispatch (demo fleet).' },
    blood: { status: 'NotAssignedYet', note: 'Blood coordination begins after hospital matching.' },
    navigation: { status: 'NotAssignedYet', note: 'Coming in a later commit' },
  }
}

/** Persists a case locally AND mirrors it to the shared API when online. */
export function saveCaseAndSync(caseRecord: EmergencyCase): void {
  saveCase(caseRecord)
  mirrorCase(caseRecord)
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
 * Hospital matching: picks the best hospital for a case based on priority,
 * emergency availability, ICU capacity and proximity.
 *
 * Proximity is REAL driving time when drive-time data is supplied (the
 * dashboard prefetches OSRM durations during the search stage); otherwise it
 * falls back to straight-line distance — offline, in tests, and whenever
 * coordinates are missing. Deterministic in both modes: same inputs, same
 * winner. Still a COORDINATION aid, not clinical advice — a real dispatch
 * integration replaces this.
 *
 * Drive-time scoring: bonus = 30 − minutes, floored at 0 (like the distance
 * bonus it replaces, so bed/priority weights keep their meaning). A hospital
 * within ~2 minutes of the patient gets the full +30; beyond 30 minutes the
 * drive no longer helps. Without coordinates or drive times the bonus is 0.
 */
export function selectBestHospital(
  caseRecord: EmergencyCase,
  hospitals: import('../models/types').Hospital[],
  driveMinutes?: Map<string, number> | null,
): import('../models/types').Hospital | null {
  const scored = hospitals
    .filter((h) => h.emergencyAvailable && h.beds.ICU && h.beds.ICU.available > 0)
    .map((h) => {
      let score = 0
      if (caseRecord.priority === 'Emergency') score += 40
      score += h.beds.ICU!.available // safe: filtered above
      if (caseRecord.locationPoint && h.location) {
        const minutes = driveMinutes?.get(h.id)
        if (minutes !== undefined) {
          score += Math.max(0, 30 - minutes) // closer BY ROAD is better
        } else {
          const d = haversineKm(caseRecord.locationPoint, h.location)
          score += Math.max(0, 30 - d * 3) // straight-line fallback
        }
      }
      return { h, score }
    })
    .sort((a, b) => b.score - a.score || a.h.id.localeCompare(b.h.id)) // deterministic ties

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
