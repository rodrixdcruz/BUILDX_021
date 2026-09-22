import type { EmergencyCase } from '../models/types'
import { LIFECYCLE_STAGES } from './emergencyService'

/**
 * Golden Hour / Rapid Response helpers — Commit 3.
 *
 * ⚠️ The countdown is a DEMONSTRATION AND COORDINATION AID only. It measures
 * elapsed coordination time since the case was reported. It does NOT imply,
 * guarantee or predict any medical outcome. No clinical advice is produced.
 */

/** Total demo golden-hour window in seconds (60 min). */
export const GOLDEN_HOUR_SECONDS = 60 * 60

/** Seconds elapsed since the case was reported (never negative). */
export function elapsedSeconds(c: EmergencyCase, now: number = Date.now()): number {
  const start = new Date(c.createdAt).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.floor((now - start) / 1000))
}

/** Seconds remaining in the golden-hour window (clamped at 0). */
export function remainingSeconds(c: EmergencyCase, now: number = Date.now()): number {
  return Math.max(0, GOLDEN_HOUR_SECONDS - elapsedSeconds(c, now))
}

/** True once the demo window has elapsed. */
export function isWindowElapsed(c: EmergencyCase, now: number = Date.now()): boolean {
  return remainingSeconds(c, now) === 0
}

/** Formats seconds as HH:MM:SS (e.g. 00:42:18). */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

/** HH:MM clock label for a timeline timestamp. */
export function formatClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--:--'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "13m 42s ago" style elapsed label for a timeline entry. */
export function elapsedLabel(iso: string, now: number = Date.now()): string {
  const start = new Date(iso).getTime()
  if (Number.isNaN(start)) return ''
  const s = Math.max(0, Math.floor((now - start) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/**
 * Ordered rapid-response stages for the golden-hour view, each with the
 * timestamp at which the case reached it (null = not yet reached).
 * Reuses the shared LIFECYCLE_STAGES order.
 */
export function rapidResponseSteps(
  c: EmergencyCase,
): Array<{ stage: string; at: string | null; label: string }> {
  const timeline = c.timeline ?? []
  const stageKeys = ['reported', 'location', 'ambulance-requested', 'ambulance-assigned', 'hospital-selected', 'hospital-notified', 'en-route'] as const
  const labels = [
    'Emergency report',
    'Location confirmed',
    'Ambulance requested',
    'Ambulance assigned',
    'Hospital match',
    'Hospital notification',
    'Navigation / en route',
  ]

  return stageKeys.map((key, i) => {
    const hit = timeline.find((t) => t.key === key)
    // Align with lifecycle: 'reported' and 'location' both sit in stage 1,
    // then each later key advances one lifecycle stage.
    const fallbackStage = LIFECYCLE_STAGES[Math.max(0, i - 1)]
    return {
      stage: fallbackStage,
      label: labels[i],
      at: hit ? hit.at : null,
    }
  })
}
