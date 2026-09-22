import type { Ambulance, AmbulanceStatus, AllocationReason, EmergencyCase, GeoPoint, ResourceDecision } from '../models/types'
import { haversineKm, formatDistance } from './emergencyService'
import { DEMO_AMBULANCES } from '../data/demoAmbulances'

/**
 * Ambulance coordination service — currently serves DEMO fleet data.
 * A real dispatch/fleet API would plug in here later; the UI depends
 * only on these functions, not on the demo dataset.
 *
 * ⚠️ All availability/position data is SIMULATED, not live GPS.
 */
export function getAmbulances(): Ambulance[] {
  return DEMO_AMBULANCES
}

export function getAmbulanceById(id: string): Ambulance | null {
  return DEMO_AMBULANCES.find((a) => a.id === id) ?? null
}

export function filterAmbulances(ambulances: Ambulance[], status?: AmbulanceStatus): Ambulance[] {
  if (!status) return ambulances
  return ambulances.filter((a) => a.status === status)
}

/** Units that can legally take a new case right now. */
export function isDispatchable(a: Ambulance): boolean {
  return a.status === 'Available'
}

/** Distance from a point (or null when unknown), formatted for UI. */
export function ambulanceDistance(
  a: Ambulance,
  from: GeoPoint | null,
): { km: number | null; text: string | null } {
  if (!from) return { km: null, text: null }
  const km = haversineKm(from, a.location)
  return { km, text: formatDistance(km) }
}

/**
 * Deterministic ambulance matching for a case.
 * Scoring (coordination only, NOT clinical triage):
 *   +50 available unit, +18 ALS when priority is Emergency,
 *   +24 proximity bonus (decays with distance), +2 base-area match.
 * Ties break by unit id so the same case always yields the same unit.
 */
export function matchAmbulance(
  caseRecord: EmergencyCase,
  ambulances: Ambulance[] = DEMO_AMBULANCES,
): { decision: ResourceDecision | null; unit: Ambulance | null } {
  const candidates = ambulances.filter(isDispatchable)
  if (candidates.length === 0) return { decision: null, unit: null }

  const scored = candidates.map((a) => {
    const reasons: AllocationReason[] = []
    let score = 0
    score += 50
    reasons.push({ key: 'unit-available', label: `${a.callSign} is Available` })

    if (caseRecord.priority === 'Emergency' && a.vehicleType === 'ALS') {
      score += 18
      reasons.push({ key: 'als-for-emergency', label: 'ALS unit prioritised for Emergency-flagged cases' })
    }

    const { km } = ambulanceDistance(a, caseRecord.locationPoint ?? null)
    if (km !== null) {
      const proximity = Math.max(0, 24 - km * 2)
      score += proximity
      reasons.push({ key: 'nearest-unit', label: `Closest available units first (${formatDistance(km)} away)` })
    }

    const base = caseRecord.location ?? ''
    if (base && a.baseArea && base.toLowerCase().includes(a.baseArea.toLowerCase())) {
      score += 2
      reasons.push({ key: 'base-area', label: `Based in the patient's area (${a.baseArea})` })
    }

    return { a, score, reasons }
  })

  scored.sort((x, y) => (y.score - x.score) || x.a.id.localeCompare(y.a.id))
  const best = scored[0]
  return {
    decision: {
      resourceType: 'ambulance',
      resourceId: best.a.id,
      resourceName: best.a.callSign,
      score: Math.round(best.score * 100) / 100,
      reasons: best.reasons,
    },
    unit: best.a,
  }
}

/**
 * Assigns a unit to the case and updates the fleet + case records
 * using the existing localStorage persistence approach.
 * Returns the updated case, or null when no unit is dispatchable.
 */
export function assignAmbulanceToCase(caseRecord: EmergencyCase): EmergencyCase {
  if (caseRecord.ambulance.status === 'Assigned' && caseRecord.ambulance.ambulanceId) {
    return caseRecord // idempotent
  }

  const { decision, unit } = matchAmbulance(caseRecord)
  if (!unit || !decision) {
    return {
      ...caseRecord,
      ambulance: {
        ...caseRecord.ambulance,
        status: 'Unavailable',
        note: 'No dispatchable ambulance in the demo fleet right now.',
      },
    }
  }

  persistFleetAssignment(unit.id, caseRecord.id)

  return {
    ...caseRecord,
    ambulance: {
      status: 'Assigned',
      ambulanceId: unit.id,
      callSign: unit.callSign,
      vehicleType: unit.vehicleType,
      note: `ETA ~${estimateEtaMinutes(unit, caseRecord)} min (simulated).`,
    },
  }
}

/** Marks the unit Assigned in the persisted demo fleet. */
export function persistFleetAssignment(unitId: string, caseId: string): void {
  const fleet = loadFleetState()
  const unit = fleet.find((a) => a.id === unitId)
  if (unit) {
    unit.status = 'Assigned'
    unit.assignedCaseId = caseId
    window.localStorage.setItem(FLEET_KEY, JSON.stringify(fleet))
  }
}

const FLEET_KEY = 'nhg.ambulanceFleet'

/** Fleet state overlay: persisted assignments win over demo defaults. */
export function loadFleetState(): Ambulance[] {
  try {
    const raw = window.localStorage.getItem(FLEET_KEY)
    if (!raw) return DEMO_AMBULANCES
    const stored = JSON.parse(raw) as Ambulance[]
    // Merge: keep any newly added demo units, apply persisted status.
    return DEMO_AMBULANCES.map((demo) => stored.find((s) => s.id === demo.id) ?? demo)
  } catch {
    window.localStorage.removeItem(FLEET_KEY)
    return DEMO_AMBULANCES
  }
}

/** Rough demo ETA: ~2 min per km of straight-line distance, minimum 4. */
export function estimateEtaMinutes(unit: Ambulance, caseRecord: EmergencyCase): number {
  if (!caseRecord.locationPoint) return 12
  const km = haversineKm(unit.location, caseRecord.locationPoint)
  return Math.max(4, Math.round(km * 2 + 3))
}

/** Demo control: releases a unit back to Available (e.g. after handover). */
export function releaseAmbulance(unitId: string): void {
  const fleet = loadFleetState()
  const unit = fleet.find((a) => a.id === unitId)
  if (unit) {
    unit.status = 'Available'
    delete unit.assignedCaseId
    window.localStorage.setItem(FLEET_KEY, JSON.stringify(fleet))
  }
}
