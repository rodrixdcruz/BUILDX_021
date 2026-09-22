import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { EmergencyCase } from '../models/types'
import { getAllCases } from '../services/emergencyService'
import { PriorityBadge, EmptyState } from '../components/ui'

export function CasesPage() {
  const cases = useMemo(() => getAllCases(), [])

  return (
    <div className="page page--narrow">
      <div className="section-head">
        <div>
          <h1>My emergency cases</h1>
          <p className="muted">All cases reported from this browser.</p>
        </div>
        <Link to="/emergency/new" className="btn btn--emergency">🚨 New emergency</Link>
      </div>

      {cases.length === 0 ? (
        <EmptyState icon="📋" title="No cases yet">
          <p className="muted">
            When you report an emergency, it will appear here with a case ID and live coordination
            status.
          </p>
          <Link to="/emergency/new" className="btn btn--primary" style={{ marginTop: '0.6rem' }}>
            Report your first emergency
          </Link>
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {cases.map((c) => (
            <CaseRow key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function CaseRow({ c }: { c: EmergencyCase }) {
  const hospitalLine =
    c.hospital.status === 'Selected' && c.hospital.hospitalName
      ? c.hospital.hospitalName
      : c.hospital.status === 'Searching'
        ? 'Searching…'
        : 'No match found'

  return (
    <Link
      to={`/cases/${c.id}`}
      className="card"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        textDecoration: 'none',
        color: 'inherit',
        flexWrap: 'wrap',
      }}
      aria-label={`Open case ${c.id}`}
    >
      <div>
        <strong className="case-id">{c.id}</strong> · {c.patientName}, {c.age} · {c.emergencyType}
        <div className="faint">📍 {c.location} · {new Date(c.createdAt).toLocaleString()}</div>
        <div className="faint">🏥 {hospitalLine}</div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <PriorityBadge priority={c.priority} />
        <span className="badge badge--neutral">{c.status}</span>
      </div>
    </Link>
  )
}
