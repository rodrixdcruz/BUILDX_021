import { useEffect, useState } from 'react'
import type { EmergencyCase } from '../models/types'
import { getAllCases } from '../services/emergencyService'
import { refreshFromApi, cloudEnabled } from '../services/syncService'

/**
 * Cloud-aware case list: starts from local storage, pulls the shared Neon
 * dataset when the API is configured and the network is up, and re-pulls on
 * an interval plus whenever connectivity returns. Falls back to local-only
 * behavior (offline demo) when the API is absent — never blocks the UI.
 */
export function useCloudCases(pollMs = 10_000): EmergencyCase[] {
  const [cases, setCases] = useState<EmergencyCase[]>(() => getAllCases())

  useEffect(() => {
    let cancelled = false
    const load = () => {
      if (!cloudEnabled()) {
        setCases(getAllCases())
        return
      }
      void refreshFromApi().then(() => {
        if (!cancelled) setCases(getAllCases())
      })
    }
    load()
    const t = window.setInterval(load, pollMs)
    window.addEventListener('nhg-connectivity-changed', load)
    window.addEventListener('online', load)
    return () => {
      cancelled = true
      window.clearInterval(t)
      window.removeEventListener('nhg-connectivity-changed', load)
      window.removeEventListener('online', load)
    }
  }, [pollMs])

  return cases
}
