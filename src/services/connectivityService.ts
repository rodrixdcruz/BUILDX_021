import type { EmergencyCase, EmergencyReportInput, SmsFallbackMessage } from '../models/types'
import { createEmergencyCase, saveCase, getAllCases } from './emergencyService'
import { mirrorCase } from './syncService'

/**
 * Connectivity & offline outbox — Network Blackout Mode (Commit 3).
 *
 * Uses the browser's existing primitives only: localStorage for the queued
 * outbox and `navigator.onLine` + online/offline events for connectivity.
 * A real sync backend would replace `syncOutbox()` later without UI changes.
 *
 * The outbox stores QUEUED ACTIONS (draft cases + case updates) created
 * while offline. In this demo everything is already local, so "syncing"
 * validates and applies them locally; the structure keeps the same shape a
 * real network sync would need. Actions are never silently dropped.
 */

export type OutboxActionKind = 'create-case' | 'update-case'

export interface OutboxAction {
  id: string
  kind: OutboxActionKind
  /** ISO timestamp of when the action was queued. */
  queuedAt: string
  /** For create-case: the form input captured offline. */
  input?: EmergencyReportInput
  /** For update-case: the full updated case record snapshot. */
  caseRecord?: EmergencyCase
}

const OUTBOX_KEY = 'nhg.outbox'
const SMS_KEY = 'nhg.smsDrafts'
const FORCE_OFFLINE_KEY = 'nhg.forceOffline'

/** Demo control: simulates a city-wide blackout (Network Blackout Mode). */
export function setForceOffline(value: boolean): void {
  if (value) window.localStorage.setItem(FORCE_OFFLINE_KEY, '1')
  else window.localStorage.removeItem(FORCE_OFFLINE_KEY)
  window.dispatchEvent(new Event('nhg-connectivity-changed'))
}

/** True when the browser currently reports a network connection. */
export function isOnline(): boolean {
  if (typeof window !== 'undefined' && window.localStorage.getItem(FORCE_OFFLINE_KEY) === '1') return false
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

/** All queued actions, oldest first. */
export function getOutbox(): OutboxAction[] {
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY)
    return raw ? (JSON.parse(raw) as OutboxAction[]) : []
  } catch {
    window.localStorage.removeItem(OUTBOX_KEY)
    return []
  }
}

function persistOutbox(actions: OutboxAction[]): void {
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(actions))
}

/** Queues a case update created while offline (full snapshot). */
export function queueCaseUpdate(caseRecord: EmergencyCase): OutboxAction {
  const action: OutboxAction = {
    id: `upd-${caseRecord.id}-${Date.now()}`,
    kind: 'update-case',
    queuedAt: new Date().toISOString(),
    caseRecord,
  }
  persistOutbox([...getOutbox(), action])
  return action
}

/** Queues a new emergency report captured while the network was down. */
export function queueEmergencyReport(input: EmergencyReportInput): OutboxAction {
  const action: OutboxAction = {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: 'create-case',
    queuedAt: new Date().toISOString(),
    input,
  }
  persistOutbox([...getOutbox(), action])
  return action
}

/** Removes one action after it has been applied. */
export function removeOutboxAction(id: string): void {
  persistOutbox(getOutbox().filter((a) => a.id !== id))
}

export interface SyncResult {
  processed: number
  failed: number
  caseIds: string[]
}

/**
 * Applies every queued action to local storage and clears the outbox.
 * In the demo this is a local commit; with a real backend the same shape
 * would be POSTed and confirmed. Returns what happened for the UI.
 */
export function syncOutbox(): SyncResult {
  const actions = getOutbox()
  const result: SyncResult = { processed: 0, failed: 0, caseIds: [] }

  for (const action of actions) {
    try {
      if (action.kind === 'create-case' && action.input) {
        const created = createEmergencyCase(action.input)
        saveCase(created)
        mirrorCase(created) // push to shared Neon DB when the network is back
        result.caseIds.push(created.id)
        result.processed += 1
      } else if (action.kind === 'update-case' && action.caseRecord) {
        saveCase(action.caseRecord)
        mirrorCase(action.caseRecord)
        result.caseIds.push(action.caseRecord.id)
        result.processed += 1
      } else {
        result.failed += 1
      }
    } catch {
      result.failed += 1
    }
  }

  if (actions.length > 0) persistOutbox([])
  return result
}

/** Number of actions waiting to sync (for badge UI). */
export function pendingOutboxCount(): number {
  return getOutbox().length
}

/**
 * Stores a drafted SMS fallback (DEMO — never transmitted). Returns the
 * draft so the UI can copy it to the clipboard or show it to the user.
 */
export function draftSmsFallback(message: SmsFallbackMessage): SmsFallbackMessage {
  try {
    const raw = window.localStorage.getItem(SMS_KEY)
    const drafts = raw ? (JSON.parse(raw) as SmsFallbackMessage[]) : []
    const next = [message, ...drafts.filter((d) => d.caseId !== message.caseId)].slice(0, 20)
    window.localStorage.setItem(SMS_KEY, JSON.stringify(next))
  } catch {
    // Draft storage is best-effort; the message is still returned to the UI.
  }
  return message
}

/** All drafted SMS fallback messages (demo log). */
export function getSmsDrafts(): SmsFallbackMessage[] {
  try {
    const raw = window.localStorage.getItem(SMS_KEY)
    return raw ? (JSON.parse(raw) as SmsFallbackMessage[]) : []
  } catch {
    window.localStorage.removeItem(SMS_KEY)
    return []
  }
}

/** Convenience: the current demo case list, offline-safe. */
export function offlineCaseCount(): number {
  return getAllCases().length
}
