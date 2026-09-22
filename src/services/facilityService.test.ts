import { describe, it, expect } from 'vitest'
import {
  getFacilities,
  getFacilityById,
  isReceiving,
  partnerHospitalIds,
  hospitalReportedCapacity,
  overflowAlternatives,
} from './facilityService'
import { getHospitals } from './hospitalService'
import { DEMO_FACILITIES } from '../data/demoFacilities'

describe('demo facility inventory', () => {
  it('has partner hospitals, healthcare centres and emergency camps', () => {
    const kinds = new Set(DEMO_FACILITIES.map((f) => f.kind))
    expect(kinds.has('hospital')).toBe(true)
    expect(kinds.has('healthcare-centre')).toBe(true)
    expect(kinds.has('emergency-camp')).toBe(true)
    expect(getFacilities().length).toBeGreaterThanOrEqual(6)
  })

  it('looks facilities up by id and reports missing ones as null', () => {
    expect(getFacilityById('F-E001')?.kind).toBe('emergency-camp')
    expect(getFacilityById('NOPE')).toBeNull()
  })

  it('partner hospital ids reference real demo hospitals', () => {
    const hospitalIds = new Set(getHospitals().map((h) => h.id))
    for (const id of partnerHospitalIds()) expect(hospitalIds.has(id)).toBe(true)
  })

  it('flags receiving status only for capable, non-full facilities', () => {
    const full = DEMO_FACILITIES.find((f) => f.reportedCapacity === 'Full')
    if (full) expect(isReceiving(full)).toBe(false)
    for (const f of DEMO_FACILITIES.filter((x) => x.reportedCapacity !== 'Full' && x.emergencyCapability)) {
      expect(isReceiving(f)).toBe(true)
    }
  })
})

describe('hospitalReportedCapacity', () => {
  it('classifies demo hospitals from the same bed data used in discovery', () => {
    for (const h of getHospitals()) {
      const cap = hospitalReportedCapacity(h.id)
      const total = cap.bedsTotal
      expect(cap.bedsAvailable).toBeLessThanOrEqual(total)
      if (cap.bedsAvailable === 0) expect(cap.status).toBe('Full')
      else if (cap.percentFree < 25) expect(cap.status).toBe('Limited')
      else expect(cap.status).toBe('Available')
    }
  })

  it('returns Full with zero beds for unknown hospitals', () => {
    expect(hospitalReportedCapacity('NOPE')).toEqual({
      percentFree: 0,
      status: 'Full',
      bedsAvailable: 0,
      bedsTotal: 0,
    })
  })
})

describe('overflowAlternatives', () => {
  it('always excludes the full hospital itself', () => {
    const firstHospital = getHospitals()[0]
    const alts = overflowAlternatives(firstHospital.id, null)
    expect(alts.length).toBeGreaterThan(0)
    for (const a of alts) expect(a.facility.id).not.toBe(firstHospital.id)
  })

  it('only proposes receiving facilities', () => {
    const alts = overflowAlternatives('H001', null)
    for (const a of alts) expect(isReceiving(a.facility)).toBe(true)
  })

  it('ranks deterministically with identical inputs', () => {
    const a = overflowAlternatives('H001', { lat: 21.1458, lng: 79.0882 })
    const b = overflowAlternatives('H001', { lat: 21.1458, lng: 79.0882 })
    expect(a.map((x) => x.facility.id)).toEqual(b.map((x) => x.facility.id))
  })

  it('prefers available capacity over limited', () => {
    const alts = overflowAlternatives('H001', null)
    const availableIdx = alts.findIndex((a) => a.facility.reportedCapacity === 'Available')
    const limitedIdx = alts.findIndex((a) => a.facility.reportedCapacity === 'Limited')
    if (availableIdx >= 0 && limitedIdx >= 0) expect(availableIdx).toBeLessThan(limitedIdx)
  })

  it('explains every recommendation with capacity, distance and load reasons', () => {
    const alts = overflowAlternatives('H001', { lat: 21.1458, lng: 79.0882 })
    for (const a of alts) {
      const keys = a.reasons.map((r) => r.key)
      expect(keys).toContain('reported-capacity')
      expect(keys).toContain('distance')
      expect(a.distanceText).toMatch(/km|m/)
    }
  })

  it('includes camps and healthcare centres as alternatives (not just hospitals)', () => {
    const alts = overflowAlternatives('H001', null)
    const kinds = new Set(alts.map((a) => a.facility.kind))
    expect(kinds.size).toBeGreaterThan(1)
  })
})
