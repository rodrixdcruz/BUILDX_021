import { useState } from 'react'
import type { EmergencyReportInput } from '../models/types'
import { EMERGENCY_TYPES, EMERGENCY_PRIORITIES } from '../constants/emergency'
import { createEmergencyCase, saveCase } from '../services/emergencyService'
import { locateBrowser, LocationError } from '../services/locationService'
import { DemoNotice } from '../components/ui'

const emptyForm: EmergencyReportInput = {
  patientName: '',
  age: '',
  emergencyType: '',
  contactNumber: '',
  location: '',
  locationPoint: undefined,
  description: '',
  priority: 'Normal',
}

export function EmergencyFormPage({ onCaseCreated }: { onCaseCreated: (id: string) => void }) {
  const [form, setForm] = useState<EmergencyReportInput>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationErr, setLocationErr] = useState<string | null>(null)

  const isEmergencyPriority = form.priority === 'Emergency'

  function setField<K extends keyof EmergencyReportInput>(key: K, value: EmergencyReportInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.patientName.trim()) e.patientName = 'Patient name is required.'
    const age = Number(form.age)
    if (!form.age || Number.isNaN(age) || age < 1 || age > 120) {
      e.age = 'Enter a valid age between 1 and 120.'
    }
    if (!form.emergencyType) e.emergencyType = 'Select the emergency type.'
    if (!/^[0-9]{10}$/.test(form.contactNumber.trim())) {
      e.contactNumber = 'Enter a valid 10-digit Indian mobile number.'
    }
    if (!form.location.trim()) e.location = 'Enter your current location or use the locator.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleUseLocation() {
    setLocationBusy(true)
    setLocationErr(null)
    try {
      const res = await locateBrowser()
      setField('location', res.label)
      setField('locationPoint', res.point)
      setErrors((prev) => ({ ...prev, location: '' }))
    } catch (err) {
      if (err instanceof LocationError && err.code === 'denied') {
        setLocationErr('Permission denied — please type your location below instead.')
      } else {
        setLocationErr('Could not get your location. Please type it manually below.')
      }
    } finally {
      setLocationBusy(false)
    }
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    // Brief simulated dispatch latency so loading/transition states are real UX.
    window.setTimeout(() => {
      const created = createEmergencyCase(form)
      saveCase(created)
      setSubmitting(false)
      onCaseCreated(created.id)
    }, 900)
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h1>Report an emergency</h1>
          <p className="muted">Every second counts. Fill this once — HealthGrid coordinates the rest.</p>
        </div>
      </div>

      {isEmergencyPriority && (
        <div className="error-banner" role="alert" style={{ borderColor: 'var(--emergency)' }}>
          <span aria-hidden="true">🚨</span>
          <span>
            <strong>EMERGENCY priority selected.</strong> This case will be flagged for immediate
            hospital matching on submission.
          </span>
        </div>
      )}

      <form className="card form-card" onSubmit={handleSubmit} noValidate>
        <DemoNotice />

        <div className="form-row">
          <div className="field">
            <label htmlFor="patientName">Patient name *</label>
            <input
              id="patientName"
              value={form.patientName}
              onChange={(e) => setField('patientName', e.target.value)}
              aria-invalid={!!errors.patientName}
              aria-describedby={errors.patientName ? 'err-patientName' : undefined}
              placeholder="e.g. Ashwin Deshmukh"
              autoComplete="off"
            />
            {errors.patientName && (
              <p id="err-patientName" className="field-error">{errors.patientName}</p>
            )}
          </div>

          <div className="field">
            <label htmlFor="age">Age *</label>
            <input
              id="age"
              type="number"
              min={1}
              max={120}
              value={form.age}
              onChange={(e) => setField('age', e.target.value)}
              aria-invalid={!!errors.age}
              aria-describedby={errors.age ? 'err-age' : undefined}
              placeholder="e.g. 45"
            />
            {errors.age && <p id="err-age" className="field-error">{errors.age}</p>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="emergencyType">Emergency type *</label>
          <select
            id="emergencyType"
            value={form.emergencyType}
            onChange={(e) =>
              setField('emergencyType', e.target.value as EmergencyReportInput['emergencyType'])
            }
            aria-invalid={!!errors.emergencyType}
            aria-describedby={errors.emergencyType ? 'err-emergencyType' : undefined}
          >
            <option value="">Select emergency type…</option>
            {EMERGENCY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {errors.emergencyType && (
            <p id="err-emergencyType" className="field-error">{errors.emergencyType}</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="contactNumber">Contact number *</label>
          <input
            id="contactNumber"
            type="tel"
            inputMode="numeric"
            value={form.contactNumber}
            onChange={(e) => setField('contactNumber', e.target.value)}
            aria-invalid={!!errors.contactNumber}
            aria-describedby={errors.contactNumber ? 'err-contactNumber' : undefined}
            placeholder="10-digit mobile number"
          />
          {errors.contactNumber && (
            <p id="err-contactNumber" className="field-error">{errors.contactNumber}</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="location">Current location *</label>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <input
              id="location"
              value={form.location}
              onChange={(e) => {
                setField('location', e.target.value)
                setField('locationPoint', undefined)
              }}
              aria-invalid={!!errors.location}
              aria-describedby={errors.location ? 'err-location' : undefined}
              placeholder="e.g. Near Jaiprakash Nagar Metro, Manewada"
              style={{ flex: '1 1 220px' }}
            />
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleUseLocation}
              disabled={locationBusy}
              style={{ whiteSpace: 'nowrap' }}
            >
              {locationBusy ? 'Locating…' : '📍 Use my location'}
            </button>
          </div>
          {errors.location && <p id="err-location" className="field-error">{errors.location}</p>}
          {locationErr && <p className="field-hint">{locationErr}</p>}
          <p className="field-hint">
            Manual input is always available if geolocation is denied or unavailable.
          </p>
        </div>

        <div className="field">
          <label htmlFor="description">
            Description <span className="optional">(optional)</span>
          </label>
          <textarea
            id="description"
            value={form.description ?? ''}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="e.g. Two-wheeler collision, patient is conscious but bleeding from the left leg."
            maxLength={500}
          />
          <p className="field-hint">{(form.description ?? '').length}/500 characters</p>
        </div>

        <div className="field">
          <label id="priority-label">Emergency priority *</label>
          <div className="priority-group" role="radiogroup" aria-labelledby="priority-label">
            {EMERGENCY_PRIORITIES.map((p) => {
              const checked = form.priority === p
              return (
                <label key={p} className={`priority-option priority-option--${p} ${checked ? `checked--${p}` : ''}`}>
                  <input
                    type="radio"
                    name="priority"
                    value={p}
                    checked={checked}
                    onChange={() => setField('priority', p)}
                  />
                  {p === 'Emergency' ? '🚨 ' : ''}{p}
                </label>
              )
            })}
          </div>
        </div>

        {submitting ? (
          <div className="loading-block" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            Submitting your emergency request and starting hospital search…
          </div>
        ) : (
          <div className="form-actions">
            <button type="submit" className="btn btn--emergency btn--block">
              🚨 Submit Emergency Request
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
