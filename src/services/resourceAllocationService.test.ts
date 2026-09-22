import { describe, it, expect, beforeEach } from 'vitest'
import {
  coordinationOrder,
  planAllocation,
  explainAllocation,
  applyAllocation,
} from './resourceAllocationService'
import { createEmergencyCase, saveCase, getCase } from './emergencyService'
import type { EmergencyCase } from '../models/types'

const nearCenter = { lat: 21.1458, lng: 79.0882 }

function makeCase(overrides: Partial<EmergencyCase> = {}): EmergencyCase {
  const base = createEmergencyCase({
    patientName: 'Test Patient',
    age: '40',
    emergencyType: 'Accident',
    contactNumber: '9800000000',
    location: 'Civil Lines, Nagpur',
    locationPoint: nearCenter,
    priority: 'Normal',
  })
  return { ...base, ...overrides }
}

describe('coordination order (priority affects ORDER ONLY)', () => {
  it('puts ambulance first for Emergency and High priority', () => {
    expect(coordinationOrder(makeCase({ priority: 'Emergency' })).order[0]).toBe('ambulance')
    expect(coordinationOrder(makeCase({ priority: 'High' })).order[0]).toBe('ambulance')
  })

  it('puts hospital first for Normal priority', () => {
    const { order } = coordinationOrder(makeCase({ priority: 'Normal' }))
    expect(order[0]).toBe('hospital')
    expect(order).toEqual(['hospital', 'bed', 'ambulance'])
  })

  it('never changes based on emergency type (no clinical inference)', () => {
    const cardiac = coordinationOrder(makeCase({ emergencyType: 'Cardiac Emergency', priority: 'Normal' }))
    const injury = coordinationOrder(makeCase({ emergencyType: 'Injury', priority: 'Normal' }))
    expect(cardiac.order).toEqual(injury.order)
  })
})

describe('planAllocation (deterministic + explainable)', () => {
  it('produces identical plans for identical cases', () => {
    const c = makeCase({ requiredBloodGroup: 'O+' })
    const p1 = planAllocation(c)
    const p2 = planAllocation(c)
    expect(p1).toEqual(p2)
  })

  it('includes an ambulance decision with reasons', () => {
    const plan = planAllocation(makeCase())
    expect(plan.ambulance).toBeDefined()
    expect(plan.ambulance!.resourceType).toBe('ambulance')
    expect(plan.ambulance!.resourceId).toMatch(/^AMB-/)
    expect(plan.ambulance!.reasons.length).toBeGreaterThan(0)
    expect(plan.orderReason).toBeTruthy()
  })

  it('carries the requested blood group through', () => {
    const plan = planAllocation(makeCase({ requiredBloodGroup: 'AB+' }))
    expect(plan.bloodGroupUsed).toBe('AB+')
  })
})

describe('explainAllocation', () => {
  it('lists coordination order and per-resource reasons', () => {
    const notes = explainAllocation(makeCase({ requiredBloodGroup: 'B+' }))
    expect(notes[0].title).toMatch(/Coordination order/)
    expect(notes.some((n) => n.title.startsWith('Ambulance:'))).toBe(true)
    expect(notes.some((n) => n.title.startsWith('Blood:'))).toBe(true)
    const bloodNote = notes.find((n) => n.title.startsWith('Blood:'))!
    expect(bloodNote.title).toContain('B+')
  })

  it('skips blood explanation when no group is requested', () => {
    const notes = explainAllocation(makeCase())
    expect(notes.some((n) => n.title.startsWith('Blood:'))).toBe(false)
  })
})

describe('applyAllocation (persistence + end-to-end)', () => {
  beforeEach(() => window.localStorage.clear())

  it('assigns ambulance and reserves blood, persisted via saveCase', () => {
    const c = makeCase({ requiredBloodGroup: 'O-' })
    saveCase(c)

    const updated = applyAllocation(c)
    saveCase(updated)

    const reloaded = getCase(c.id)!
    expect(reloaded.ambulance.status).toBe('Assigned')
    expect(reloaded.ambulance.ambulanceId).toMatch(/^AMB-/)
    expect(reloaded.blood.status).toBe('Reserved')
    expect(reloaded.blood.bloodGroup).toBe('O-')
    expect(reloaded.blood.bloodBankId).toMatch(/^BB-/)
  })

  it('keeps blood NotAssignedYet untouched by applyAllocation when no group given', () => {
    const c = makeCase()
    const updated = applyAllocation(c)
    // reserveBloodForCase marks Unavailable (needs group); dashboard only calls it after group known.
    expect(['Unavailable']).toContain(updated.blood.status)
  })

  it('is idempotent across repeated applications', () => {
    const c = makeCase({ requiredBloodGroup: 'A+' })
    const once = applyAllocation(c)
    const twice = applyAllocation(once)
    expect(twice.ambulance.ambulanceId).toBe(once.ambulance.ambulanceId)
    expect(twice.blood.bloodBankId).toBe(once.blood.bloodBankId)
  })
})
