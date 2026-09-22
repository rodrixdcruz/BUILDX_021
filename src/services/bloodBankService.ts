import type { AllocationReason, BloodBank, BloodGroup, EmergencyCase, GeoPoint, ResourceDecision } from '../models/types'
import { haversineKm, formatDistance } from './emergencyService'
import { DEMO_BLOOD_BANKS } from '../data/demoBloodBanks'

/**
 * Blood-bank availability service — currently serves DEMO inventory data.
 * A real blood-bank network API would plug in here later; the UI depends
 * only on these functions, not on the demo dataset.
 *
 * ⚠️ All stock counts are SIMULATED, not live inventory.
 */
export function getBloodBanks(): BloodBank[] {
  return DEMO_BLOOD_BANKS
}

export function getBloodBankById(id: string): BloodBank | null {
  return DEMO_BLOOD_BANKS.find((b) => b.id === id) ?? null
}

/** Units in stock for a group at a bank (0 when the group is absent). */
export function unitsForGroup(bank: BloodBank, group: BloodGroup): number {
  return bank.stock.find((s) => s.group === group)?.units ?? 0
}

export const ALL_BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

/** Banks having ≥ minUnits of the given group, optionally within maxKm of a point. */
export function searchBloodBanks(options: {
  group?: BloodGroup | null
  minUnits?: number
  from?: GeoPoint | null
  maxKm?: number
  banks?: BloodBank[]
}): Array<BloodBank & { unitsAvailable: number; distanceKm: number | null; distanceText: string | null }> {
  const { group, minUnits = 1, from, maxKm, banks = DEMO_BLOOD_BANKS } = options

  return banks
    .map((b) => {
      const unitsAvailable = group ? unitsForGroup(b, group) : b.stock.reduce((s, g) => s + g.units, 0)
      const distanceKm = from ? haversineKm(from, b.location) : null
      return { ...b, unitsAvailable, distanceKm, distanceText: distanceKm !== null ? formatDistance(distanceKm) : null }
    })
    .filter((b) => {
      if (group && b.unitsAvailable < minUnits) return false
      if (!group && minUnits > 0 && b.unitsAvailable === 0) return false
      if (from && maxKm !== undefined && (b.distanceKm ?? Infinity) > maxKm) return false
      return true
    })
    .sort((a, b) => {
      // Fewer units first? No — more stock first, then closer first.
      if (b.unitsAvailable !== a.unitsAvailable) return b.unitsAvailable - a.unitsAvailable
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    })
}

/**
 * Deterministic blood-resource selection for a case.
 * Scoring (coordination only, NOT clinical recommendation):
 *   +4 per available unit (capped at 16), +20 proximity bonus,
 *   +6 for 24x7 availability. Ties break by bank id.
 */
export function matchBloodBank(
  caseRecord: EmergencyCase,
  banks: BloodBank[] = DEMO_BLOOD_BANKS,
): { decision: ResourceDecision | null; bank: BloodBank | null; units: number } {
  const group = caseRecord.requiredBloodGroup
  const from = caseRecord.locationPoint ?? null

  const candidates = banks
    .map((b) => {
      const units = group ? unitsForGroup(b, group) : b.stock.reduce((s, g) => s + g.units, 0)
      const km = from ? haversineKm(from, b.location) : null
      return { b, units, km }
    })
    .filter((c) => (group ? c.units > 0 : true))

  if (candidates.length === 0) return { decision: null, bank: null, units: 0 }

  const scored = candidates.map(({ b, units, km }) => {
    const reasons: AllocationReason[] = []
    let score = 0

    const unitScore = Math.min(16, units * 4)
    score += unitScore
    reasons.push({
      key: 'stock-available',
      label: group
        ? `${units} unit(s) of ${group} in stock (demo)`
        : `${units} total units across groups (demo)`,
    })

    if (km !== null) {
      const proximity = Math.max(0, 20 - km * 2)
      score += proximity
      reasons.push({ key: 'nearest-bank', label: `Closer to the patient (${formatDistance(km)})` })
    }

    if (b.hours === '24x7') {
      score += 6
      reasons.push({ key: 'open-24x7', label: 'Open 24x7' })
    }

    return { b, units, score, reasons }
  })

  scored.sort((x, y) => y.score - x.score || x.b.id.localeCompare(y.b.id))
  const best = scored[0]

  return {
    decision: {
      resourceType: 'bloodBank',
      resourceId: best.b.id,
      resourceName: best.b.name,
      score: Math.round(best.score * 100) / 100,
      reasons: best.reasons,
    },
    bank: best.b,
    units: best.units,
  }
}

/**
 * Reserves blood at the matched bank for the case (demo reservation —
 * marks the case; does NOT decrement real inventory).
 */
export function reserveBloodForCase(caseRecord: EmergencyCase): EmergencyCase {
  if (caseRecord.blood.status === 'Reserved' && caseRecord.blood.bloodBankId) {
    return caseRecord // idempotent
  }

  const group = caseRecord.requiredBloodGroup
  if (!group) {
    return {
      ...caseRecord,
      blood: {
        status: 'Unavailable',
        note: 'No blood group specified — add one to check availability (demo).',
      },
    }
  }

  const { bank, units } = matchBloodBank(caseRecord)
  if (!bank || units === 0) {
    return {
      ...caseRecord,
      blood: {
        status: 'Unavailable',
        bloodGroup: group,
        note: `No ${group} stock found in the demo blood-bank network.`,
      },
    }
  }

  return {
    ...caseRecord,
    blood: {
      status: 'Reserved',
      bloodBankId: bank.id,
      bloodBankName: bank.name,
      bloodGroup: group,
      units: Math.min(2, units),
      note: `${Math.min(2, units)} unit(s) of ${group} reserved at ${bank.name} (simulated).`,
    },
  }
}
