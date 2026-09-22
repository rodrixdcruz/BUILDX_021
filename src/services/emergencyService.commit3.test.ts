import { describe, it, expect } from 'vitest'
import {
  triageFor,
  LIFECYCLE_STAGES,
  deriveLifecycle,
  addTimelineEntry,
  buildSmsFallback,
  createEmergencyCase,
  saveCase,
  getAllCases,
  getCase,
} from './emergencyService'
import type { EmergencyCase, EmergencyPriority } from '../models/types'

describe('triageFor — transparent priority mapping', () => {
  it('maps the three priorities to demo triage categories', () => {
    expect(triageFor('Emergency')).toBe('CRITICAL')
    expect(triageFor('High')).toBe('URGENT')
    expect(triageFor('Normal')).toBe('NON_URGENT')
  })

  it('covers every priority the form can submit', () => {
    const priorities: EmergencyPriority[] = ['Emergency', 'High', 'Normal']
    for (const p of priorities) {
      expect(['CRITICAL', 'URGENT', 'NON_URGENT']).toContain(triageFor(p))
    }
  })
})

describe('lifecycle', () => {
  it('exposes the seven ordered stages', () => {
    expect(LIFECYCLE_STAGES).toEqual([
      'Emergency Reported',
      'Ambulance Requested',
      'Ambulance Assigned',
      'Hospital Selected',
      'Hospital Notified',
      'Patient En Route',
      'Arrived',
    ])
  })

  it('stamps new cases as Emergency Reported with a timeline entry', () => {
    const c = createEmergencyCase({
      patientName: 'Asha',
      age: '33',
      emergencyType: 'Injury',
      contactNumber: '9876543210',
      location: 'Dharampeth',
      priority: 'High',
    })
    expect(c.lifecycle).toBe('Emergency Reported')
    expect(c.triage).toBe('URGENT')
    expect(c.timeline?.length).toBe(1)
    expect(c.timeline?.[0].key).toBe('reported')
  })

  it('derives Hospital Notified once the bed is confirmed', () => {
    const c = createEmergencyCase({
      patientName: 'Asha',
      age: '33',
      emergencyType: 'Injury',
      contactNumber: '9876543210',
      location: 'Dharampeth',
      priority: 'High',
    })
    const advanced: EmergencyCase = {
      ...c,
      ambulance: { ...c.ambulance, status: 'Assigned' },
      hospital: { ...c.hospital, status: 'Selected', hospitalId: 'H001', hospitalName: 'Alexis' },
      bed: { ...c.bed, status: 'Available' },
    }
    expect(deriveLifecycle(advanced)).toBe('Hospital Notified')
  })

  it('preserves explicit coordinator stages (En Route / Arrived)', () => {
    const base = createEmergencyCase({
      patientName: 'Asha',
      age: '33',
      emergencyType: 'Injury',
      contactNumber: '9876543210',
      location: 'Dharampeth',
      priority: 'Normal',
    })
    expect(deriveLifecycle({ ...base, lifecycle: 'Patient En Route' })).toBe('Patient En Route')
    expect(deriveLifecycle({ ...base, lifecycle: 'Arrived' })).toBe('Arrived')
  })
})

describe('addTimelineEntry', () => {
  it('appends without mutating the original case', () => {
    const c = createEmergencyCase({
      patientName: 'Asha',
      age: '33',
      emergencyType: 'Injury',
      contactNumber: '9876543210',
      location: 'Dharampeth',
      priority: 'High',
    })
    const next = addTimelineEntry(c, 'ambulance-assigned', 'Ambulance assigned', 'Nagpur-1')
    expect(next.timeline?.length).toBe(2)
    expect(c.timeline?.length).toBe(1)
    expect(next.timeline?.[1].label).toBe('Ambulance assigned')
  })
})

describe('buildSmsFallback — demo channel, never transmitted', () => {
  it('formats the case into the SMS fallback template', () => {
    const c = createEmergencyCase({
      patientName: 'Ravi',
      age: '51',
      emergencyType: 'Accident',
      contactNumber: '9876543210',
      location: 'Sitabuldi',
      priority: 'Emergency',
    })
    const sms = buildSmsFallback(c)
    expect(sms.text).toBe(`CASE ${c.id} | CRITICAL | Accident | Location: Sitabuldi | Ambulance Required`)
    expect(sms.channel).toBe('demo')
    expect(sms.caseId).toBe(c.id)
  })

  it('uses the stored triage category when present', () => {
    const c = createEmergencyCase({
      patientName: 'Ravi',
      age: '51',
      emergencyType: 'Other',
      contactNumber: '9876543210',
      location: 'Sadar',
      priority: 'Normal',
    })
    expect(buildSmsFallback(c).text).toContain('NON_URGENT')
  })
})

describe('Commit-3 persistence compatibility', () => {
  it('round-trips triage, lifecycle and timeline through storage', () => {
    const c = createEmergencyCase({
      patientName: 'Mina',
      age: '29',
      emergencyType: 'Breathing Problem',
      contactNumber: '9876543210',
      location: 'Itwari',
      priority: 'Emergency',
    })
    saveCase(c)
    const loaded = getCase(c.id)
    expect(loaded?.triage).toBe('CRITICAL')
    expect(loaded?.lifecycle).toBe('Emergency Reported')
    expect(loaded?.timeline?.length).toBe(1)
  })

  it('keeps legacy Commit-1/2 cases working (no triage/timeline fields)', () => {
    const legacy = {
      id: 'NGP-9001',
      patientName: 'Old Case',
      age: 70,
      emergencyType: 'Injury',
      contactNumber: '9876543210',
      location: 'Sadar',
      priority: 'High',
      status: 'Submitted',
      createdAt: new Date().toISOString(),
      hospital: { status: 'Searching' },
      bed: { status: 'Checking' },
      ambulance: { status: 'NotAssignedYet', note: 'x' },
      blood: { status: 'NotAssignedYet', note: 'x' },
      navigation: { status: 'NotAssignedYet', note: 'x' },
    } as unknown as EmergencyCase
    saveCase(legacy)
    const loaded = getCase('NGP-9001')
    expect(loaded?.id).toBe('NGP-9001')
    expect(deriveLifecycle(loaded as EmergencyCase)).toBe('Emergency Reported')
  })

  it('lists stored cases newest first', () => {
    const a = createEmergencyCase({
      patientName: 'A',
      age: '30',
      emergencyType: 'Injury',
      contactNumber: '9876543210',
      location: 'Sadar',
      priority: 'Normal',
    })
    const b = createEmergencyCase({
      patientName: 'B',
      age: '30',
      emergencyType: 'Injury',
      contactNumber: '9876543210',
      location: 'Sadar',
      priority: 'Normal',
    })
    saveCase(a)
    saveCase(b)
    expect(getAllCases()[0].id).toBe(b.id)
  })
})
