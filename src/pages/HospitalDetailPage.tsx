import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { GeoPoint } from '../models/types'
import { getHospitalById } from '../services/hospitalService'
import { LocationPanel } from '../components/LocationPanel'
import { DemoNotice, EmptyState } from '../components/ui'

export function HospitalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const hospital = useMemo(() => (id ? getHospitalById(id) : null), [id])
  const [point, setPoint] = useState<GeoPoint | null>(null)
  const [label, setLabel] = useState('')

  if (!hospital) {
    return (
      <div className="page">
        <h1>Hospital not found</h1>
        <EmptyState icon="🔎" title={`No hospital with ID ${id ?? ''}`}>
          <Link to="/hospitals" className="btn btn--primary" style={{ marginTop: '0.6rem' }}>
            Back to all hospitals
          </Link>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="page">
      <p>
        <Link to="/hospitals" className="muted">← Back to hospitals</Link>
      </p>
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{hospital.name}</h1>
          <p className="muted">
            📍 {hospital.area}, Nagpur · 🏥 {hospital.sector} hospital · 📞 {hospital.contact}
          </p>
        </div>
        <DemoNotice />
      </div>

      <div className="detail-grid">
        <section className="card">
          <h2 style={{ fontSize: '1.1rem' }}>Bed availability (DEMO)</h2>
          <div className="bed-badges" style={{ margin: '0.6rem 0 1rem' }}>
            {(['ICU', 'General', 'Oxygen'] as const).map((cat) => {
              const b = hospital.beds[cat]
              return (
                <span key={cat} className={`bed-badge ${b && b.available === 0 ? 'bed-badge--out' : ''}`}>
                  <span>{cat}</span>
                  {b ? `${b.available} / ${b.total} free` : 'N/A'}
                </span>
              )
            })}
          </div>

          <ul className="detail-list">
            <li><span>Emergency department</span><strong>{hospital.emergencyAvailable ? 'Open 24x7' : 'Not available'}</strong></li>
            <li><span>Address</span><strong>{hospital.address}</strong></li>
            <li><span>Contact</span><strong>{hospital.contact}</strong></li>
            <li>
              <span>Coordinates</span>
              <strong>
                {hospital.location.lat.toFixed(4)}, {hospital.location.lng.toFixed(4)}
              </strong>
            </li>
          </ul>

          <h2 style={{ fontSize: '1.1rem', marginTop: '1.2rem' }}>Facilities</h2>
          <div className="facilities">
            {hospital.facilities.map((f) => (
              <span key={f} className="facility-chip">{f}</span>
            ))}
          </div>

          <div style={{ marginTop: '1.4rem', display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
            <a
              className="btn btn--primary"
              href={`tel:${hospital.contact.replace(/[^+\d]/g, '')}`}
            >
              📞 Call hospital
            </a>
            <Link className="btn btn--ghost" to="/emergency/new">🚨 Report emergency here</Link>
          </div>
          <p className="faint" style={{ marginTop: '0.8rem' }}>
            Availability shown is simulated for this hackathon MVP — always confirm by phone before
            travelling in a real emergency.
          </p>
        </section>

        <LocationPanel
          hospitals={[hospital]}
          point={point}
          label={label}
          onLocationChange={(p, l) => {
            setPoint(p)
            setLabel(l)
          }}
        />
      </div>
    </div>
  )
}
