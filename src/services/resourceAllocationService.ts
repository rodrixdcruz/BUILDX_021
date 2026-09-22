import type { AllocationReason, EmergencyCase, ResourceDecision } from '../models/types'
import { matchAmbulance, loadFleetState, assignAmbulanceToCase, getAmbulanceById } from './ambulanceService'
import { matchBloodBank, reserveBloodForCase } from './bloodBankService'

/**
 * Emergency resource allocation — DETERMINISTIC and EXPLAINABLE.
 *
 * ⚠️ Scope guard: this is coordination logic ONLY. Priority affects the
 * ORDER in which resources are coordinated (ambulance before blood, etc.)
 * — it never implies clinical urgency, diagnosis or treatment advice.
 * No medical measurements are modified and no clinical claims are made.
 */
export interface AllocationResult {
  order: Array<'ambulance' | 'hospital' | 'bed'>
  orderReason: string
  ambulance?: ResourceDecision
  bloodGroupUsed?: EmergencyCase['requiredBloodGroup']
}

/** Priority → coordination order (not clinical urgency). */
export function coordinationOrder(c: EmergencyCase): {
  order: Array<'ambulance' | 'hospital' | 'bed'>
  reason: string
} {
  if (c.priority === 'Emergency') {
    return {
      order: ['ambulance', 'hospital', 'bed'],
      reason: 'Emergency priority: ambulance dispatched first, hospital matched in parallel.',
    }
  }
  if (c.priority === 'High') {
    return {
      order: ['ambulance', 'hospital', 'bed'],
      reason: 'High priority: ambulance and hospital matched together, bed confirmed at the hospital.',
    }
  }
  return {
    order: ['hospital', 'bed', 'ambulance'],
    reason: 'Normal priority: hospital and bed secured first, then transport is arranged.',
  }
}

/**
 * Produce an explainable allocation plan for a case without mutating it.
 * Same inputs always produce the same plan (deterministic scoring + stable tie-breaks).
 */
export function planAllocation(caseRecord: EmergencyCase): AllocationResult {
  const { order, reason } = coordinationOrder(caseRecord)

  const fleet = loadFleetState()
  const { decision } = matchAmbulance(caseRecord, fleet)

  return {
    order,
    orderReason: reason,
    ambulance: decision ?? undefined,
    bloodGroupUsed: caseRecord.requiredBloodGroup || undefined,
  }
}

/** Human-readable allocation explanation for UI display. */
export function explainAllocation(caseRecord: EmergencyCase): Array<{ title: string; reasons: AllocationReason[] }> {
  const notes: Array<{ title: string; reasons: AllocationReason[] }> = []
  const { order, reason } = coordinationOrder(caseRecord)

  notes.push({
    title: `Coordination order: ${order.join(' → ')} — ${reason}`,
    reasons: [],
  })

  const fleet = loadFleetState()
  // If a unit is already assigned, explain THAT choice, not a fresh re-match
  // (the live fleet no longer contains it as dispatchable).
  if (caseRecord.ambulance.status === 'Assigned' && caseRecord.ambulance.ambulanceId) {
    const unit = getAmbulanceById(caseRecord.ambulance.ambulanceId)
    if (unit) {
      notes.push({
        title: `Ambulance: ${unit.callSign}`,
        reasons: [
          { key: 'assigned-unit', label: `Dispatched ${unit.callSign} (${unit.vehicleType}) from ${unit.baseArea}` },
          { key: 'was-best-available', label: 'Best available unit at dispatch time (deterministic match)' },
        ],
      })
    }
  } else {
    const { decision: amb } = matchAmbulance(caseRecord, fleet)
    if (amb) notes.push({ title: `Ambulance: ${amb.resourceName}`, reasons: amb.reasons })
  }

  if (caseRecord.requiredBloodGroup) {
    const { decision: bb } = matchBloodBank(caseRecord)
    if (bb) notes.push({ title: `Blood: ${bb.resourceName} (${caseRecord.requiredBloodGroup})`, reasons: bb.reasons })
  }

  return notes
}

/**
 * One-shot convenience used by the dashboard: assigns the ambulance and
 * reserves blood on the case (idempotent, persisted by the callers).
 */
export function applyAllocation(caseRecord: EmergencyCase): EmergencyCase {
  const updated = assignAmbulanceToCase(caseRecord)
  return reserveBloodForCase(updated)
}
