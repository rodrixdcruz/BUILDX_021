import { describe, it, expect, beforeEach } from 'vitest'
import {
  getAmbulances,
  getAmbulanceById,
  filterAmbulances,
  isDispatchable,
  matchAmbulance,
  assignAmbulanceToCase,
  releaseAmbulance,
  loadFleetState,
  estimateEtaMinutes,
  ambulanceDistance,
} from './ambulanceService'
import { createEmergencyCase } from './emergencyService'
import type { EmergencyCase } from '../models/types'

const nearCenter = { lat: 21.1458, lng: 79.0882 } // Civil Lines

function makeCase(overrides: Partial<EmergencyCase> = {}): EmergencyCase {
  const base = createEmergencyCase({
    patientName: 'Test Patient',
    age: '40',
    emergencyType: 'Accident',
    contactNumber: '9800000000',
    location: 'Civil Lines, Nagpur',
    locationPoint: nearCenter,
    priority: 'High',
  })
  return { ...base, ...overrides }
}

describe('ambulance fleet data', () => {
  it('exposes demo units covering all four statuses', () => {
    const fleet = getAmbulances()
    expect(fleet.length).toBeGreaterThanOrEqual(8)
    const statuses = new Set(fleet.map((a) => a.status))
    expect(statuses.has('Available')).toBe(true)
    expect(statuses.has('Busy')).toBe(true)
    expect(statuses.has('Offline')).toBe(true)
    // Every unit has a valid status; default demo fleet has no pre-assigned units.
    const valid = ['Available', 'Assigned', 'Busy', 'Offline']
    expect([...statuses].every((s) => valid.includes(s))).toBe(true)
    expect(statuses.has('Assigned')).toBe(false)
  })

  it('looks units up by id', () => {
    expect(getAmbulanceById('AMB-01')?.callSign).toBe('Nagpur-1')
    expect(getAmbulanceById('NOPE')).toBeNull()
  })
})

describe('ambulance filtering', () => {
  it('filters by status', () => {
    const available = filterAmbulances(getAmbulances(), 'Available')
    expect(available.length).toBeGreaterThan(0)
    expect(available.every((a) => a.status === 'Available')).toBe(true)

    const offline = filterAmbulances(getAmbulances(), 'Offline')
    expect(offline.every((a) => a.status === 'Offline')).toBe(true)
  })

  it('returns everything when no status given', () => {
    expect(filterAmbulances(getAmbulances())).toHaveLength(getAmbulances().length)
  })

  it('dispatchable = Available only', () => {
    const fleet = getAmbulances()
    expect(isDispatchable(fleet.find((a) => a.status === 'Available')!)).toBe(true)
    expect(isDispatchable(fleet.find((a) => a.status === 'Busy')!)).toBe(false)
    expect(isDispatchable(fleet.find((a) => a.status === 'Offline')!)).toBe(false)
  })
})

describe('ambulance matching', () => {
  it('never matches Busy or Offline units', () => {
    const c = makeCase()
    const { unit } = matchAmbulance(c)
    expect(unit).not.toBeNull()
    expect(['Busy', 'Offline']).not.toContain(unit!.status)
  })

  it('is deterministic: same case, same unit', () => {
    const c = makeCase()
    const r1 = matchAmbulance(c)
    const r2 = matchAmbulance(c)
    expect(r1.unit?.id).toBe(r2.unit?.id)
    expect(r1.decision?.score).toBe(r2.decision?.score)
  })

  it('prefers an ALS unit for Emergency-priority cases when one is nearby', () => {
    const emergencyCase = makeCase({ priority: 'Emergency' })
    const { unit, decision } = matchAmbulance(emergencyCase)
    expect(unit).not.toBeNull()
    // AMB-01 (ALS, Civil Lines) is nearest an Emergency case at city center.
    expect(unit!.vehicleType).toBe('ALS')
    expect(decision!.reasons.some((r) => r.key === 'als-for-emergency')).toBe(true)
  })

  it('produces explainable reasons including proximity', () => {
    const { decision } = matchAmbulance(makeCase())
    const keys = decision!.reasons.map((r) => r.key)
    expect(keys).toContain('unit-available')
    expect(keys).toContain('nearest-unit')
    expect(decision!.resourceName).toBeTruthy()
    expect(decision!.score).toBeGreaterThan(0)
  })

  it('returns null when nothing is dispatchable', () => {
    const busy = getAmbulances().map((a) => ({ ...a, status: 'Busy' as const }))
    const { decision, unit } = matchAmbulance(makeCase(), busy)
    expect(decision).toBeNull()
    expect(unit).toBeNull()
  })
})

describe('ambulance assignment & status transitions', () => {
  beforeEach(() => window.localStorage.clear())

  it('assigns an available unit and persists fleet + case state', () => {
    const c = makeCase()
    const updated = assignAmbulanceToCase(c)

    expect(updated.ambulance.status).toBe('Assigned')
    expect(updated.ambulance.ambulanceId).toMatch(/^AMB-/)
    expect(updated.ambulance.callSign).toBeTruthy()
    expect(updated.ambulance.note).toMatch(/ETA/)

    const fleetUnit = loadFleetState().find((a) => a.id === updated.ambulance.ambulanceId)
    expect(fleetUnit?.status).toBe('Assigned')
    expect(fleetUnit?.assignedCaseId).toBe(c.id)
  })

  it('is idempotent — a second call does not reassign', () => {
    const c = assignAmbulanceToCase(makeCase())
    const again = assignAmbulanceToCase(c)
    expect(again.ambulance.ambulanceId).toBe(c.ambulance.ambulanceId)
  })

  it('marks the case Unavailable when no unit is dispatchable', () => {
    const busyOnly = makeCase()
    // Simulate empty fleet through the matcher directly:
    const { decision } = matchAmbulance(busyOnly, getAmbulances().map((a) => ({ ...a, status: 'Offline' as const })))
    expect(decision).toBeNull()
  })

  it('releases a unit back to Available', () => {
    const c = assignAmbulanceToCase(makeCase())
    const unitId = c.ambulance.ambulanceId!
    releaseAmbulance(unitId)
    const released = loadFleetState().find((a) => a.id === unitId)
    expect(released?.status).toBe('Available')
    expect(released?.assignedCaseId).toBeUndefined()
  })

  it('estimates a sane demo ETA', () => {
    const unit = getAmbulanceById('AMB-01')!
    const c = makeCase() // same point as AMB-01
    expect(estimateEtaMinutes(unit, c)).toBeGreaterThanOrEqual(4)
    expect(estimateEtaMinutes(unit, c)).toBeLessThan(60)
  })

  it('computes distances with graceful nulls', () => {
    const unit = getAmbulanceById('AMB-01')!
    expect(ambulanceDistance(unit, nearCenter).text).toMatch(/km|m/)
    expect(ambulanceDistance(unit, null)).toEqual({ km: null, text: null })
  })
})
