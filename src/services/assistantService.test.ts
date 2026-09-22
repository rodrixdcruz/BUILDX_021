import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseEmergencyReport,
  draftFromText,
  createCaseFromDraft,
  answerQuestion,
  QUICK_ACTIONS,
  ASSISTANT_DISCLAIMER,
} from './assistantService'
import { createEmergencyCase, saveCase, getCase } from './emergencyService'
import type { EmergencyReportInput } from '../models/types'

const report = (over: Partial<EmergencyReportInput> = {}): EmergencyReportInput => ({
  patientName: 'Surge Test',
  age: '35',
  emergencyType: 'Accident',
  contactNumber: '9876543210',
  location: 'Sitabuldi',
  priority: 'Emergency',
  ...over,
})

beforeEach(() => window.localStorage.clear())

describe('QUICK_ACTIONS', () => {
  it('exposes the seven coordinator quick actions', () => {
    expect(QUICK_ACTIONS.map((q) => q.id)).toEqual([
      'report',
      'ambulance',
      'hospital',
      'blood',
      'status',
      'why',
      'surge',
    ])
  })
})

describe('parseEmergencyReport — natural-language reporting', () => {
  it('extracts type, location and assistance from the Sitabuldi scenario', () => {
    const e = parseEmergencyReport('There has been an accident near Sitabuldi. My father is injured and we need an ambulance.')
    expect(e.emergencyType).toBe('Accident')
    expect(e.location).toBe('Sitabuldi')
    expect(e.assistance).toContain('Ambulance')
    expect(['Emergency', 'High']).toContain(e.priority)
    expect(['CRITICAL', 'URGENT']).toContain(e.triage)
  })

  it('detects cardiac emergencies and blood groups', () => {
    const e = parseEmergencyReport('My mother has severe chest pain near Dharampeth, she needs O- blood')
    expect(e.emergencyType).toBe('Cardiac Emergency')
    expect(e.bloodGroup).toBe('O-')
    expect(e.priority).toBe('Emergency')
  })

  it('defaults unknown reports to Other with High priority (never silently downgraded)', () => {
    const e = parseEmergencyReport('something happened on the highway')
    expect(e.emergencyType).toBe('Other')
    expect(e.priority).toBe('High')
  })

  it('respects an explicitly normal report', () => {
    const e = parseEmergencyReport('minor cut on the hand, not urgent, Dharampeth')
    expect(e.priority).toBe('Normal')
    expect(e.triage).toBe('NON_URGENT')
  })

  it('returns null location when no area matches', () => {
    expect(parseEmergencyReport('accident somewhere unknown').location).toBeNull()
  })
})

describe('draftFromText / createCaseFromDraft — confirmation flow', () => {
  it('fills a confirmation draft with a readable location fallback', () => {
    const d = draftFromText('accident near Sitabuldi, need an ambulance')
    expect(d.emergencyType).toBe('Accident')
    expect(d.location).toBe('Sitabuldi')
    expect(d.assistance).toContain('Ambulance')
  })

  it('creates a real persisted case only after confirmation', () => {
    const d = draftFromText('There has been an accident near Sitabuldi. My father is injured and we need an ambulance.')
    const c = createCaseFromDraft(d)
    expect(c.id).toMatch(/^NGP-\d+$/)
    expect(c.emergencyType).toBe('Accident')
    expect(c.location).toBe('Sitabuldi')
    expect(c.description).toContain('HealthGrid AI Assistant')
    expect(getCase(c.id)?.id).toBe(c.id)
  })
})

describe('answerQuestion — grounded in app data only', () => {
  it('summarises the surge from stored cases and demo resources', () => {
    saveCase(createEmergencyCase(report()))
    const a = answerQuestion('What is happening right now?', null)
    expect(a.answer).toContain('Surge snapshot')
    expect(a.bullets.some((b) => b.includes('active case'))).toBe(true)
    expect(a.bullets.some((b) => b.toLowerCase().includes('final control'))).toBe(true)
  })

  it('recommends hospitals with capacity, distance and load factors', () => {
    const a = answerQuestion('Which hospital can receive this case?', null)
    expect(a.answer).toBeTruthy()
    expect(a.bullets.length).toBeGreaterThan(0)
    expect(a.bullets.some((b) => /ICU/.test(b))).toBe(true)
    expect(a.followUp).toBeTruthy()
  })

  it('explains a hospital recommendation factor by factor', () => {
    const c = createEmergencyCase(report({ location: 'Manewada' }))
    c.hospital = { status: 'Selected', hospitalId: 'H001', hospitalName: 'Alexis Multispeciality Hospital' }
    c.ambulance = { ...c.ambulance, status: 'Assigned', callSign: 'Nagpur-1' }
    saveCase(c)
    const a = answerQuestion('Why did you recommend this hospital?', getCase(c.id))
    expect(a.answer).toContain('Why')
    expect(a.bullets.some((b) => b.includes('Reported availability'))).toBe(true)
    expect(a.bullets.some((b) => b.includes('Distance'))).toBe(true)
    expect(a.followUp).toBe(ASSISTANT_DISCLAIMER)
  })

  it('refuses to explain when no hospital was selected', () => {
    const a = answerQuestion('Why did you recommend this hospital?', null)
    expect(a.answer).toContain('nothing to explain')
  })

  it('reports fleet status without claiming live GPS', () => {
    const a = answerQuestion('Find an available ambulance', null)
    expect(a.answer).toContain('simulated')
    expect(a.answer).toContain('available')
  })

  it('answers blood questions with demo stock and asks for the group when missing', () => {
    const missing = answerQuestion('Find blood support', null)
    expect(missing.answer).toContain('Which blood group')

    const found = answerQuestion('Do we have O+ blood available?', null)
    expect(found.answer).toContain('O+')
    expect(found.bullets.length).toBeGreaterThan(0)
  })

  it('reports case status by id and refuses unknown ids', () => {
    const c = createEmergencyCase(report())
    saveCase(c)
    const a = answerQuestion(`Check case status ${c.id}`, null)
    expect(a.answer).toContain(c.id)
    expect(a.bullets.some((b) => b.includes('Ambulance:'))).toBe(true)

    const unknown = answerQuestion('Check case status NGP-9999', null)
    expect(unknown.answer).toContain('no case NGP-9999')
  })

  it('answers overflow questions from the partner network', () => {
    const a = answerQuestion('Hospital A is full. What are our alternatives?', null)
    expect(a.answer).toBeTruthy()
  })

  it('never diagnoses or prescribes — unknown questions stay coordination-only', () => {
    const a = answerQuestion('What medicine should the patient take?', null)
    expect(a.answer).not.toMatch(/take|dose|mg|prescrib/i)
    expect(a.followUp).toBe(ASSISTANT_DISCLAIMER)
  })
})
