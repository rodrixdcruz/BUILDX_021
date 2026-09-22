import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { EmergencyFormPage } from './EmergencyFormPage'

function renderForm(onCaseCreated: (id: string) => void = () => {}) {
  return render(
    <MemoryRouter>
      <EmergencyFormPage onCaseCreated={onCaseCreated} />
    </MemoryRouter>,
  )
}

describe('EmergencyFormPage', () => {
  beforeEach(() => window.localStorage.clear())

  it('shows validation errors when submitted empty', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: /submit emergency request/i }))
    expect(await screen.findByText('Patient name is required.')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid age between 1 and 120.')).toBeInTheDocument()
    expect(screen.getByText('Select the emergency type.')).toBeInTheDocument()
    expect(screen.getByText(/valid 10-digit/i)).toBeInTheDocument()
    expect(screen.getByText('Enter your current location or use the locator.')).toBeInTheDocument()
  })

  it('submits a valid report and creates a case starting at NGP-1001', async () => {
    const created: string[] = []
    renderForm((id) => created.push(id))

    await userEvent.type(screen.getByLabelText('Patient name *'), 'Ashwin Deshmukh')
    await userEvent.type(screen.getByLabelText('Age *'), '42')
    await userEvent.selectOptions(screen.getByLabelText('Emergency type *'), 'Cardiac Emergency')
    await userEvent.type(screen.getByLabelText('Contact number *'), '9876543210')
    await userEvent.type(screen.getByLabelText('Current location *'), 'Manewada Chowk')
    await userEvent.click(screen.getByRole('radio', { name: /emergency/i }))
    await userEvent.click(screen.getByRole('button', { name: /submit emergency request/i }))

    await waitFor(() => expect(created).toEqual(['NGP-1001']), { timeout: 3000 })
  })
})
