import { describe, it, expect } from 'vitest'
import { filterHospitals, withDistances, getHospitalById } from './hospitalService'
import { DEMO_HOSPITALS } from '../data/demoHospitals'

const base = { query: '', emergencyOnly: false, icuOnly: false, generalBedOnly: false, area: 'All Areas' }

describe('hospital filtering', () => {
  it('returns all demo hospitals unfiltered', () => {
    expect(filterHospitals(DEMO_HOSPITALS, base)).toHaveLength(DEMO_HOSPITALS.length)
  })

  it('filters by emergency availability', () => {
    const r = filterHospitals(DEMO_HOSPITALS, { ...base, emergencyOnly: true })
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((h) => h.emergencyAvailable)).toBe(true)
  })

  it('filters by ICU availability', () => {
    const r = filterHospitals(DEMO_HOSPITALS, { ...base, icuOnly: true })
    expect(r.every((h) => (h.beds.ICU?.available ?? 0) > 0)).toBe(true)
  })

  it('filters by general bed availability', () => {
    const r = filterHospitals(DEMO_HOSPITALS, { ...base, generalBedOnly: true })
    expect(r.every((h) => (h.beds.General?.available ?? 0) > 0)).toBe(true)
  })

  it('filters by area', () => {
    const r = filterHospitals(DEMO_HOSPITALS, { ...base, area: 'Dharampeth' })
    expect(r.length).toBeGreaterThanOrEqual(2)
    expect(r.every((h) => h.area === 'Dharampeth')).toBe(true)
  })

  it('searches by name and area case-insensitively', () => {
    const byName = filterHospitals(DEMO_HOSPITALS, { ...base, query: 'wockhardt' })
    expect(byName).toHaveLength(1)
    expect(byName[0].name).toContain('Wockhardt')

    const byArea = filterHospitals(DEMO_HOSPITALS, { ...base, query: 'manewada' })
    expect(byArea.every((h) => h.area === 'Manewada')).toBe(true)
  })

  it('combines multiple filters', () => {
    const r = filterHospitals(DEMO_HOSPITALS, {
      ...base,
      emergencyOnly: true,
      icuOnly: true,
      generalBedOnly: true,
    })
    expect(r.every((h) => h.emergencyAvailable && (h.beds.ICU?.available ?? 0) > 0 && (h.beds.General?.available ?? 0) > 0)).toBe(true)
  })
})

describe('withDistances', () => {
  it('sorts nearest-first when a point is given', () => {
    const r = withDistances(DEMO_HOSPITALS, { lat: 21.1458, lng: 79.0882 })
    const kms = r.map((h) => h.distanceKm!)
    expect([...kms].sort((a, b) => a - b)).toEqual(kms)
    expect(r[0].distanceText).toMatch(/km|m$/)
  })

  it('returns null distances when no point is set', () => {
    const r = withDistances(DEMO_HOSPITALS, null)
    expect(r.every((h) => h.distanceKm === null && h.distanceText === null)).toBe(true)
  })
})

describe('getHospitalById', () => {
  it('finds a hospital and returns null for unknown ids', () => {
    expect(getHospitalById('H001')?.name).toContain('GMCH')
    expect(getHospitalById('NOPE')).toBeNull()
  })
})
