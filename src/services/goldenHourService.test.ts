import { describe, it, expect } from 'vitest'
import {
  GOLDEN_HOUR_SECONDS,
  elapsedSeconds,
  remainingSeconds,
  isWindowElapsed,
  formatCountdown,
  formatClock,
  elapsedLabel,
  rapidResponseSteps,
} from './goldenHourService'
import { createEmergencyCase } from './emergencyService'
import type { EmergencyCase } from '../models/types'

const makeCase = (createdAt: string): EmergencyCase => {
  const c = createEmergencyCase({
    patientName: 'Timer Test',
    age: '45',
    emergencyType: 'Accident',
    contactNumber: '9876543210',
    location: 'Wardha Road',
    priority: 'Emergency',
  })
  return { ...c, createdAt }
}

describe('golden hour window', () => {
  it('is a 60-minute demo window', () => {
    expect(GOLDEN_HOUR_SECONDS).toBe(3600)
  })

  it('counts elapsed time from the report timestamp', () => {
    const start = Date.parse('2026-09-22T10:00:00Z')
    const c = makeCase(new Date(start).toISOString())
    expect(elapsedSeconds(c, start + 42_000)).toBe(42)
    expect(elapsedSeconds(c, start - 5000)).toBe(0)
  })

  it('clamps remaining time at zero once elapsed', () => {
    const start = Date.parse('2026-09-22T10:00:00Z')
    const c = makeCase(new Date(start).toISOString())
    expect(remainingSeconds(c, start + 1800_000)).toBe(1800)
    expect(remainingSeconds(c, start + 3600_000)).toBe(0)
    expect(remainingSeconds(c, start + 7200_000)).toBe(0)
    expect(isWindowElapsed(c, start + 3600_000)).toBe(true)
    expect(isWindowElapsed(c, start + 60_000)).toBe(false)
  })
})

describe('formatting', () => {
  it('formats countdowns as HH:MM:SS', () => {
    expect(formatCountdown(42 * 60 + 18)).toBe('00:42:18')
    expect(formatCountdown(0)).toBe('00:00:00')
    expect(formatCountdown(3600)).toBe('01:00:00')
    expect(formatCountdown(-5)).toBe('00:00:00')
  })

  it('formats clock labels and ignores invalid timestamps', () => {
    expect(formatClock('2026-09-22T13:05:00')).toMatch(/^\d{2}:\d{2}$/)
    expect(formatClock('not-a-date')).toBe('--:--')
  })

  it('formats human elapsed labels', () => {
    const now = Date.parse('2026-09-22T13:00:00Z')
    expect(elapsedLabel(new Date(now - 30_000).toISOString(), now)).toBe('30s')
    expect(elapsedLabel(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m 0s')
    expect(elapsedLabel(new Date(now - 125 * 60_000).toISOString(), now)).toBe('2h 5m')
    expect(elapsedLabel('bogus', now)).toBe('')
  })
})

describe('rapidResponseSteps', () => {
  it('marks unadvanced cases with only the report timestamp set', () => {
    const c = createEmergencyCase({
      patientName: 'Flow',
      age: '30',
      emergencyType: 'Injury',
      contactNumber: '9876543210',
      location: 'Sadar',
      priority: 'High',
    })
    const steps = rapidResponseSteps(c)
    expect(steps.length).toBe(7)
    expect(steps[0].at).not.toBeNull()
    expect(steps.slice(1).every((s) => s.at === null)).toBe(true)
  })

  it('picks up timeline entries as the case advances', () => {
    const c = createEmergencyCase({
      patientName: 'Flow',
      age: '30',
      emergencyType: 'Injury',
      contactNumber: '9876543210',
      location: 'Sadar',
      priority: 'Emergency',
    })
    const advanced: EmergencyCase = {
      ...c,
      timeline: [
        ...(c.timeline ?? []),
        { key: 'ambulance-assigned', label: 'Ambulance assigned', at: c.createdAt, detail: 'Nagpur-1' },
      ],
    }
    const steps = rapidResponseSteps(advanced)
    expect(steps.find((s) => s.stage === 'Ambulance Assigned')?.at).not.toBeNull()
  })

  it('never throws on legacy cases without a timeline', () => {
    const legacy = {
      id: 'NGP-9002',
      patientName: 'Old',
      age: 50,
      emergencyType: 'Injury',
      contactNumber: '9876543210',
      location: 'Sadar',
      priority: 'Normal',
      status: 'Submitted',
      createdAt: new Date().toISOString(),
      hospital: { status: 'Searching' },
      bed: { status: 'Checking' },
      ambulance: { status: 'NotAssignedYet', note: 'x' },
      blood: { status: 'NotAssignedYet', note: 'x' },
      navigation: { status: 'NotAssignedYet', note: 'x' },
    } as unknown as EmergencyCase
    expect(rapidResponseSteps(legacy).length).toBe(7)
    expect(elapsedSeconds(legacy)).toBeGreaterThanOrEqual(0)
  })
})
