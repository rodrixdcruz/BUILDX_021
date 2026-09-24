import { useEffect, useState } from 'react'
import type { EmergencyCase } from '../models/types'
import { getAllCases } from '../services/emergencyService'
import { refreshFromApi, cloudEnabled } from '../services/syncService'
import { subscribeLiveCases } from '../services/liveCaseSyncService'

/**
 * Live case list: local storage first, then pushed updates.
 *
 * Cloud mode (VITE_API_URL set + online): a shared server-sent-events stream
 * announces every case change; the live sync service re-pulls, merges into
 * local storage and notifies this hook — dashboards converge within ~1s of a
 * change on any device, instead of the previous 10s poll. A slow 30s
 * safety-net poll catches anything the stream misses (proxy buffering,
 * dropped reconnects).
 *
 * Local mode (offline demo / API absent): falls back to the original poll
 * cadence so the blackout demo behaves exactly as before.
 */
export function useCloudCases(pollMs = 30_000): EmergencyCase[] {
  const [cases, setCases] = useState<EmergencyCase[]>(() => getAllCases())

  useEffect(() => {
    const readLocal = () => setCases(getAllCases())
    const load = () => {
      if (!cloudEnabled()) {
        readLocal()
        return
      }
      void refreshFromApi().then(() => {
        setCases(getAllCases())
      })
    }

    // Local mode: legacy behavior (10s poll keeps the demo snappy).
    if (!cloudEnabled()) {
      load()
      const t = window.setInterval(load, 10_000)
      window.addEventListener('nhg-connectivity-changed', load)
      window.addEventListener('online', load)
      return () => {
        window.clearInterval(t)
        window.removeEventListener('nhg-connectivity-changed', load)
        window.removeEventListener('online', load)
      }
    }

    // Cloud mode: push-driven.
    load() // initial catch-up pull
    const unsubscribe = subscribeLiveCases((updated) => setCases(updated))
    const t = window.setInterval(load, pollMs) // safety net only
    window.addEventListener('nhg-connectivity-changed', load)
    window.addEventListener('online', load)
    return () => {
      unsubscribe()
      window.clearInterval(t)
      window.removeEventListener('nhg-connectivity-changed', load)
      window.removeEventListener('online', load)
    }
  }, [pollMs])

  return cases
}
