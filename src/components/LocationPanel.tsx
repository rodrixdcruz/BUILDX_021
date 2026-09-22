import { useEffect, useMemo, useState } from 'react'
import type { GeoPoint, Hospital } from '../models/types'
import { locateBrowser, LocationError, areaCenter } from '../services/locationService'
import { NAGPUR_CENTER, NAGPUR_AREAS } from '../constants/emergency'
import { haversineKm, formatDistance } from '../services/emergencyService'

interface Props {
  hospitals: Hospital[]
  selectedHospitalId?: string
  /** Controlled patient location (shared with the form/dashboard). */
  point: GeoPoint | null
  label: string
  onLocationChange: (point: GeoPoint | null, label: string) => void
}

/**
 * Map / location panel. Uses a lightweight schematic canvas (no paid map API)
 * plus Google Maps deep links. Supports browser geolocation and manual area
 * selection with graceful fallback when permission is denied.
 */
export function LocationPanel({ hospitals, selectedHospitalId, point, label, onLocationChange }: Props) {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualArea, setManualArea] = useState('')

  const SPAN = 0.09 // degrees of lat/lng shown in the schematic canvas

  const project = useMemo(() => {
    const center = point ?? NAGPUR_CENTER
    return (p: GeoPoint) => ({
      x: 50 + ((p.lng - center.lng) / SPAN) * 100,
      y: 50 - ((p.lat - center.lat) / SPAN) * 100,
    })
  }, [point])

  useEffect(() => {
    if (manualArea) {
      onLocationChange(areaCenter(manualArea), `${manualArea}, Nagpur (selected area)`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualArea])

  async function handleLocate() {
    setLocating(true)
    setError(null)
    try {
      const res = await locateBrowser()
      onLocationChange(res.point, res.label)
    } catch (e) {
      setError(e instanceof LocationError ? e.message : 'Could not determine your location.')
    } finally {
      setLocating(false)
    }
  }

  const visible = hospitals.slice(0, 8)

  return (
    <section className="card map-panel" aria-label="Location and map">
      <div className="section-head" style={{ marginBottom: '0.8rem' }}>
        <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Location &amp; Map</h2>
        <span className="faint">Schematic map — distances are straight-line estimates.</span>
      </div>

      <div
        className="map-panel__canvas"
        role="img"
        aria-label="Schematic map showing patient and nearby hospital locations"
      >
        {hospitals.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <p className="muted">No hospitals to show on the map yet.</p>
          </div>
        )}

        {visible.map((h) => {
          const { x, y } = project(h.location)
          return (
            <div
              key={h.id}
              className={`map-dot map-dot--hospital ${h.id === selectedHospitalId ? 'map-dot--selected' : ''}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span className="map-dot__pin" />
              <span className="map-dot__label">{h.name}</span>
            </div>
          )
        })}

        {point && (
          <div className="map-dot map-dot--patient" style={{ left: '50%', top: '50%' }}>
            <span className="map-dot__pin" />
            <span className="map-dot__label">You are here</span>
          </div>
        )}

        <div className="map-legend">
          <span>
            <i style={{ background: '#2f80ed' }} /> Patient
          </span>
          <span>
            <i style={{ background: 'var(--brand)' }} /> Hospitals
          </span>
          <span>
            <i style={{ background: 'var(--emergency)' }} /> Selected
          </span>
        </div>
      </div>

      <div className="map-panel__side" style={{ marginTop: '0.9rem' }}>
        <div>
          <strong>Patient location:</strong>{' '}
          {point ? label || 'Unknown' : <span className="faint">not set</span>}
        </div>

        <div className="locate-row">
          <button type="button" className="btn btn--sm btn--primary" onClick={handleLocate} disabled={locating}>
            {locating ? 'Locating…' : '📍 Use my location'}
          </button>
          <label className="sr-only" htmlFor="manual-area">
            Select your area manually
          </label>
          <select
            id="manual-area"
            value={manualArea}
            onChange={(e) => setManualArea(e.target.value)}
            style={{
              border: '1.5px solid var(--line)',
              borderRadius: 999,
              padding: '0.45rem 0.9rem',
              minHeight: 44,
              background: '#fff',
              fontFamily: 'inherit',
              fontWeight: 600,
            }}
          >
            <option value="">Or select your area…</option>
            {NAGPUR_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        {hospitals.length > 0 && (
          <div>
            <strong className="faint" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
              Nearby hospitals
            </strong>
            <ul className="map-list">
              {hospitals.slice(0, 5).map((h) => (
                <li key={h.id} className={h.id === selectedHospitalId ? 'selected' : ''}>
                  <span>{h.name}</span>
                  <span className="dist">
                    {formatDistance(haversineKm(point ?? NAGPUR_CENTER, h.location))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
