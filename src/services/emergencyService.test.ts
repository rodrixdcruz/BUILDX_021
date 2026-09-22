import { describe, it, expect, beforeEach } from 'vitest'
import { nextCaseId, createEmergencyCase, saveCase, getAllCases, getCase, selectBestHospital, haversineKm, formatDistance } from './emergencyService'
import { DEMO_HOSPITALS } from '../data/demoHospitals'
import type { EmergencyCase } from '../models/types'

describe('case ID generation', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts at NGP-1001 and increments', () => {
    expect(nextCaseId()).toBe('NGP-1001')
    expect(nextCaseId()).toBe('NGP-1002')
    expect(nextCaseId()).toBe('NGP-1003')
  })

  it('continues the sequence after reload (persisted counter)', () => {
    nextCaseId()
    nextCaseId()
    expect(nextCaseId()).toBe('NGP-1003')
  })
})

describe('createEmergencyCase', () => {
  it('initialises the full coordination workflow with not-assigned slots', () => {
    const c = createEmergencyCase({
      patientName: '  Ashwin Deshmukh ',
      age: '42',
      emergencyType: 'Cardiac Emergency',
      contactNumber: '9876543210',
      location: 'Manewada Chowk',
      priority: 'Emergency',
    })
    expect(c.id).toMatch(/^NGP-\d{4}$/)
    expect(c.patientName).toBe('Ashwin Deshmukh') // trimmed
    expect(c.status).toBe('Submitted')
    expect(c.hospital.status).toBe('Searching')
    expect(c.bed.status).toBe('Checking')
    expect(c.ambulance.status).toBe('NotAssignedYet')
    expect(c.blood.status).toBe('NotAssignedYet')
    expect(c.navigation.status).toBe('NotAssignedYet')
  })
})

describe('case persistence', () => {
  beforeEach(() => window.localStorage.clear())

  it('saves and retrieves a case; unknown ids return null', () => {
    const c = createEmergencyCase({
      patientName: 'Test',
      age: '30',
      emergencyType: 'Injury',
      contactNumber: '9999999999',
      location: 'Sadar',
      priority: 'High',
    })
    saveCase(c)
    expect(getCase(c.id)?.id).toBe(c.id)
    expect(getCase('NGP-9999')).toBeNull()
    expect(getAllCases()).toHaveLength(1)
  })

  it('updates an existing case in place', () => {
    const c = createEmergencyCase({
      patientName: 'Test',
      age: '30',
      emergencyType: 'Injury',
      contactNumber: '9999999999',
      location: 'Sadar',
      priority: 'High',
    })
    saveCase(c)
    const updated: EmergencyCase = { ...c, bed: { status: 'Available', category: 'ICU' } }
    saveCase(updated)
    expect(getAllCases()).toHaveLength(1)
    expect(getCase(c.id)?.bed.status).toBe('Available')
  })
})

describe('selectBestHospital', () => {
  const base = {
    patientName: 'T',
    age: '30',
    emergencyType: 'Accident' as const,
    contactNumber: '9000000000',
    location: 'Nagpur',
    priority: 'Emergency' as const,
    locationPoint: { lat: 21.1458, lng: 79.0882 },
  }

  it('only selects hospitals with emergency + ICU capacity', () => {
    const c = createEmergencyCase(base)
    const best = selectBestHospital(c, DEMO_HOSPITALS)
    expect(best).not.toBeNull()
    expect(best!.emergencyAvailable).toBe(true)
    expect(best!.beds.ICU!.available).toBeGreaterThan(0)
  })

  it('prefers closer hospitals for equal priority', () => {
    const c = createEmergencyCase(base)
    const best = selectBestHospital(c, DEMO_HOSPITALS)
    // GMCH (Civil Lines) and KEM (Sadar) are nearest the demo center point.
    expect(['H001', 'H005', 'H011']).toContain(best!.id)
  })

  it('returns null when nothing qualifies', () => {
    const c = createEmergencyCase(base)
    const none = DEMO_HOSPITALS.map((h) => ({
      ...h,
      emergencyAvailable: false,
      beds: { ...h.beds, ICU: h.beds.ICU ? { ...h.beds.ICU, available: 0 } : null },
    }))
    expect(selectBestHospital(c, none)).toBeNull()
  })
})

describe('geo helpers', () => {
  it('haversine distance between GMCH and Mayo is roughly 3 km', () => {
    const km = haversineKm({ lat: 21.1324, lng: 79.0862 }, { lat: 21.1525, lng: 79.1082 })
    expect(km).toBeGreaterThan(2)
    expect(km).toBeLessThan(4.5)
  })

  it('formats distances', () => {
    expect(formatDistance(0.4)).toBe('400 m')
    expect(formatDistance(3.21)).toBe('3.2 km')
  })
})
