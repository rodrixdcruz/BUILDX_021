import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCloudCases } from './useCloudCases'
import { createEmergencyCase } from '../services/emergencyService'
import type { EmergencyCase } from '../models/types'

/**
 * The hook is tested with the sync layer MOCKED, so these tests exercise the
 * cloud-mode wiring (initial pull, push notifications, safety-net poll,
 * teardown) without any network. The service's own behavior is covered in
 * liveCaseSyncService.test.ts.
 */

const mocks = vi.hoisted(() => ({
  cloudEnabled: vi.fn(),
  refreshFromApi: vi.fn(),
  subscribeLiveCases: vi.fn(),
}))

vi.mock('../services/syncService', () => ({
  cloudEnabled: mocks.cloudEnabled,
  refreshFromApi: mocks.refreshFromApi,
}))

vi.mock('../services/liveCaseSyncService', () => ({
  subscribeLiveCases: mocks.subscribeLiveCases,
}))

function makeCase(id: string, patientName = 'Cloud Patient'): EmergencyCase {
  const c = createEmergencyCase({
    patientName,
    age: '35',
    emergencyType: 'Accident',
    contactNumber: '9876500000',
    location: 'Civil Lines',
    priority: 'High',
  })
  return { ...c, id }
}

describe('useCloudCases (cloud mode — SSE-driven)', () => {
  let stored: EmergencyCase[]

  beforeEach(() => {
    window.localStorage.clear()
    stored = []
    mocks.cloudEnabled.mockReturnValue(true)
    mocks.refreshFromApi.mockImplementation(async () => {
      // Simulate the sync layer writing the merged list into local storage.
      window.localStorage.setItem('nhg.cases', JSON.stringify(stored))
      return { pulled: stored.length, merged: stored.length }
    })
    mocks.subscribeLiveCases.mockReturnValue(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pulls immediately on mount and shows the merged local list', async () => {
    stored = [makeCase('NGP-1001')]
    const { result } = renderHook(() => useCloudCases())

    await waitFor(() => {
      expect(result.current.map((c) => c.id)).toEqual(['NGP-1001'])
    })
    expect(mocks.refreshFromApi).toHaveBeenCalled()
    expect(mocks.subscribeLiveCases).toHaveBeenCalledTimes(1)
  })

  it('re-renders instantly when a push event delivers updated cases', async () => {
    stored = [makeCase('NGP-1001')]
    let push: ((cases: EmergencyCase[]) => void) | undefined
    mocks.subscribeLiveCases.mockImplementation((listener: (cases: EmergencyCase[]) => void) => {
      push = listener
      return () => {
        push = undefined
      }
    })

    const { result } = renderHook(() => useCloudCases())
    await waitFor(() => expect(result.current).toHaveLength(1))

    // A change on another device arrives via the stream.
    act(() => {
      push?.([makeCase('NGP-1001'), makeCase('NGP-1002')])
    })
    expect(result.current.map((c) => c.id)).toEqual(['NGP-1001', 'NGP-1002'])
  })

  it('unsubscribes from the live stream on unmount', async () => {
    const unsub = vi.fn()
    mocks.subscribeLiveCases.mockReturnValue(unsub)

    const { unmount } = renderHook(() => useCloudCases())
    await waitFor(() => expect(mocks.subscribeLiveCases).toHaveBeenCalled())
    unmount()
    expect(unsub).toHaveBeenCalledTimes(1)
  })

  it('re-checks connectivity when the app comes back online', async () => {
    renderHook(() => useCloudCases())
    await waitFor(() => expect(mocks.refreshFromApi).toHaveBeenCalledTimes(1))

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(mocks.refreshFromApi).toHaveBeenCalledTimes(2))
  })
})

describe('useCloudCases (local mode — legacy polling)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mocks.cloudEnabled.mockReturnValue(false)
    mocks.refreshFromApi.mockResolvedValue(null)
    mocks.subscribeLiveCases.mockReturnValue(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('never opens the live stream and reads local storage instead', async () => {
    window.localStorage.setItem('nhg.cases', JSON.stringify([makeCase('NGP-3001', 'Local Patient')]))
    const { result } = renderHook(() => useCloudCases(10_000))

    expect(result.current.map((c) => c.id)).toEqual(['NGP-3001'])
    expect(mocks.subscribeLiveCases).not.toHaveBeenCalled()
    expect(mocks.refreshFromApi).not.toHaveBeenCalled()
  })
})
