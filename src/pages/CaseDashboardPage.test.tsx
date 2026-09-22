import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { CaseDashboardPage } from './CaseDashboardPage'
import { createEmergencyCase, saveCase } from '../services/emergencyService'
import { DEMO_HOSPITALS } from '../data/demoHospitals'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cases/:id" element={<CaseDashboardPage />} />
        <Route path="/hospitals/:id" element={<div>hospital detail</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CaseDashboardPage', () => {
  beforeEach(() => window.localStorage.clear())

  it('shows all five workflow steps including the not-yet-assigned ones', () => {
    const c = createEmergencyCase({
      patientName: 'Test Patient',
      age: '50',
      emergencyType: 'Accident',
      contactNumber: '9812345678',
      location: 'Sadar, Nagpur',
      priority: 'High',
    })
    saveCase(c)
    renderAt(`/cases/${c.id}`)

    expect(screen.getByText(`CASE #${c.id}`)).toBeInTheDocument()
    expect(screen.getAllByText('Patient', { selector: 'span' }).length).toBeGreaterThan(0)
    expect(screen.getByText(/Test Patient/)).toBeInTheDocument()
    expect(screen.getAllByText(/Not Assigned Yet/i)).toHaveLength(3) // ambulance, blood, navigation
    expect(screen.getByText(/Ambulance/i)).toBeInTheDocument()
    expect(screen.getByText(/Blood/i)).toBeInTheDocument()
    expect(screen.getByText(/Navigation/i)).toBeInTheDocument()
  })

  it('progresses to a selected hospital with a bed after the simulated search', async () => {
    const c = createEmergencyCase({
      patientName: 'Test Patient',
      age: '50',
      emergencyType: 'Cardiac Emergency',
      contactNumber: '9812345678',
      location: 'Civil Lines',
      priority: 'Emergency',
      locationPoint: { lat: 21.1458, lng: 79.0882 },
    })
    saveCase(c)
    renderAt(`/cases/${c.id}`)

    await waitFor(
      () => expect(screen.getAllByText(/Selected/i).length).toBeGreaterThan(0),
      { timeout: 4000 },
    )
    await waitFor(() => expect(screen.getAllByText(/Available/i).length).toBeGreaterThan(0), {
      timeout: 4000,
    })

    const saved = JSON.parse(window.localStorage.getItem('nhg.cases')!)[0]
    expect(saved.hospital.status).toBe('Selected')
    expect(saved.hospital.hospitalId).toBeTruthy()
    expect(DEMO_HOSPITALS.some((h) => h.id === saved.hospital.hospitalId)).toBe(true)
    expect(saved.bed.status).toBe('Available')
  }, 10000)

  it('renders a friendly not-found state for unknown ids', () => {
    renderAt('/cases/NGP-4242')
    expect(screen.getByText(/Case not found/i)).toBeInTheDocument()
  })
})
