import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { CaseDashboardPage } from './CaseDashboardPage'
import { createEmergencyCase, saveCase } from '../services/emergencyService'
import { DEMO_HOSPITALS } from '../data/demoHospitals'

function renderAt(path: string) {
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cases/:id" element={<CaseDashboardPage />} />
        <Route path="/hospitals/:id" element={<div>hospital detail</div>} />
      </Routes>
    </MemoryRouter>,
  )
  /** Workflow step titles, scoped so allocation-panel text can't interfere. */
  const stepTitles = () =>
    [...utils.container.querySelectorAll('.step h3')].map((h) => h.textContent?.replace(/\s+/g, ' ').trim())
  return { ...utils, stepTitles }
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
    const { stepTitles } = renderAt(`/cases/${c.id}`)

    expect(screen.getByText(`CASE #${c.id}`)).toBeInTheDocument()
    expect(screen.getAllByText('Patient', { selector: 'span' }).length).toBeGreaterThan(0)
    expect(screen.getByText(/Test Patient/)).toBeInTheDocument()

    const titles = stepTitles()
    expect(titles).toHaveLength(5)
    expect(titles[0]).toMatch(/^Hospital/)
    expect(titles[1]).toMatch(/^Bed/)
    expect(titles[2]).toMatch(/^Ambulance Not Assigned Yet$/)
    expect(titles[3]).toMatch(/^Blood Not Assigned Yet$/)
    expect(titles[4]).toMatch(/^Navigation Not Assigned Yet$/)
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

    // Wait on persisted state — generic text like "Selected"/"Available" also
    // appears in the map legend and allocation panel, so DOM matching is unreliable.
    await waitFor(
      () => {
        const saved = JSON.parse(window.localStorage.getItem('nhg.cases')!)[0]
        expect(saved.hospital.status).toBe('Selected')
        expect(saved.bed.status).toBe('Available')
      },
      { timeout: 6000 },
    )

    const saved = JSON.parse(window.localStorage.getItem('nhg.cases')!)[0]
    expect(saved.hospital.hospitalId).toBeTruthy()
    expect(DEMO_HOSPITALS.some((h) => h.id === saved.hospital.hospitalId)).toBe(true)
    expect(screen.getByText(/Why these resources?/i)).toBeInTheDocument()
  }, 10000)

  it('renders a friendly not-found state for unknown ids', () => {
    renderAt('/cases/NGP-4242')
    expect(screen.getByText(/Case not found/i)).toBeInTheDocument()
  })
})
