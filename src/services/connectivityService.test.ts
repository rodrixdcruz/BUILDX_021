import { describe, it, expect, beforeEach } from 'vitest'
import {
  setForceOffline,
  isOnline,
  getOutbox,
  queueEmergencyReport,
  queueCaseUpdate,
  removeOutboxAction,
  syncOutbox,
  pendingOutboxCount,
  draftSmsFallback,
  getSmsDrafts,
} from './connectivityService'
import { createEmergencyCase, getAllCases, getCase, saveCase } from './emergencyService'
import type { EmergencyCase, EmergencyReportInput } from '../models/types'

const report = (): EmergencyReportInput => ({
  patientName: 'Offline Patient',
  age: '40',
  emergencyType: 'Accident',
  contactNumber: '9876543210',
  location: 'Kamptee Road',
  priority: 'Emergency',
})

describe('connectivity state', () => {
  beforeEach(() => window.localStorage.clear())

  it('reports online by default in the test environment', () => {
    expect(isOnline()).toBe(true)
  })

  it('reports offline while the demo blackout is active', () => {
    setForceOffline(true)
    expect(isOnline()).toBe(false)
    setForceOffline(false)
    expect(isOnline()).toBe(true)
  })
})

describe('offline outbox', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts empty', () => {
    expect(getOutbox()).toEqual([])
    expect(pendingOutboxCount()).toBe(0)
  })

  it('queues a case report captured while offline', () => {
    const action = queueEmergencyReport(report())
    expect(action.kind).toBe('create-case')
    expect(action.input?.location).toBe('Kamptee Road')
    expect(pendingOutboxCount()).toBe(1)
  })

  it('queues a case update as a full snapshot', () => {
    const c = createEmergencyCase(report())
    saveCase(c)
    const action = queueCaseUpdate(c)
    expect(action.kind).toBe('update-case')
    expect(action.caseRecord?.id).toBe(c.id)
    expect(getOutbox().length).toBe(1)
  })

  it('removes a single action', () => {
    queueEmergencyReport(report())
    const second = queueEmergencyReport(report())
    removeOutboxAction(second.id)
    expect(getOutbox().length).toBe(1)
    expect(getOutbox()[0].id).not.toBe(second.id)
  })

  it('syncs queued reports into real cases and clears the outbox', () => {
    queueEmergencyReport(report())
    queueEmergencyReport({ ...report(), patientName: 'Second Offline' })

    const result = syncOutbox()
    expect(result.processed).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.caseIds.length).toBe(2)
    expect(pendingOutboxCount()).toBe(0)

    for (const id of result.caseIds) expect(getCase(id)?.patientName).toBeTruthy()
  })

  it('syncs queued case updates over the stored record', () => {
    const c = createEmergencyCase(report())
    saveCase(c)
    const moved: EmergencyCase = {
      ...c,
      hospital: { status: 'Selected', hospitalId: 'H001', hospitalName: 'Alexis' },
    }
    queueCaseUpdate(moved)
    saveCase(c) // stale overwrite that sync must fix

    const result = syncOutbox()
    expect(result.processed).toBe(1)
    expect(getCase(c.id)?.hospital.status).toBe('Selected')
  })

  it('counts malformed actions as failed instead of throwing', () => {
    const c = createEmergencyCase(report())
    queueCaseUpdate(c)
    const actions = getOutbox()
    const broken = { ...actions[0], caseRecord: undefined }
    window.localStorage.setItem(
      'nhg.outbox',
      JSON.stringify([...actions, { id: 'broken-1', kind: 'update-case', queuedAt: new Date().toISOString() }]),
    )
    expect(broken).toBeTruthy()

    const result = syncOutbox()
    expect(result.processed).toBe(1)
    expect(result.failed).toBe(1)
  })
})

describe('SMS fallback drafts (demo)', () => {
  beforeEach(() => window.localStorage.clear())

  it('stores drafts and keeps one per case', () => {
    const msg = { caseId: 'NGP-1001', text: 'CASE NGP-1001 | CRITICAL | Accident', to: '108', channel: 'demo' as const }
    draftSmsFallback(msg)
    draftSmsFallback({ ...msg, text: 'updated text' })
    const drafts = getSmsDrafts()
    expect(drafts.length).toBe(1)
    expect(drafts[0].text).toBe('updated text')
  })

  it('returns the message even when draft storage fails', () => {
    const orig = window.localStorage.setItem
    window.localStorage.setItem = () => {
      throw new Error('quota')
    }
    try {
      const msg = { caseId: 'NGP-2002', text: 'CASE NGP-2002 | URGENT | Injury', to: '108', channel: 'demo' as const }
      expect(draftSmsFallback(msg).text).toBe('CASE NGP-2002 | URGENT | Injury')
    } finally {
      window.localStorage.setItem = orig
    }
  })

  it('cases created offline sync with their full workflow intact', () => {
    setForceOffline(true)
    queueEmergencyReport(report())
    setForceOffline(false)
    const result = syncOutbox()
    expect(result.processed).toBe(1)
    const created = getAllCases()[0]
    expect(created.lifecycle).toBe('Emergency Reported')
    expect(created.triage).toBe('CRITICAL')
    expect(created.timeline?.length).toBe(1)
  })
})
