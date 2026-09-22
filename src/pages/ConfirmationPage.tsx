import { Link, useParams } from 'react-router-dom'
import type { EmergencyCase } from '../models/types'
import { getCase } from '../services/emergencyService'
import { PriorityBadge, EmptyState } from '../components/ui'

export function ConfirmationPage() {
  const { id } = useParams<{ id: string }>()
  const c: EmergencyCase | null = id ? getCase(id) : null

  if (!c) {
    return (
      <div className="page page--narrow">
        <h1>Case not found</h1>
        <EmptyState icon="🔎" title={`No case found with ID ${id ?? ''}`}>
          <p className="muted">The case may have been cleared from this browser, or the link is incorrect.</p>
          <Link to="/emergency/new" className="btn btn--emergency" style={{ marginTop: '0.6rem' }}>
            Report a new emergency
          </Link>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="page page--narrow">
      <div className="card">
        <div className="confirm-hero">
          <div className="confirm-hero__ring" aria-hidden="true">✅</div>
          <h1>Emergency request received</h1>
          <span className="confirm-case-id">{c.id}</span>
          <p className="muted">
            Your case is registered. Hospital search has started — track live coordination below.
          </p>
        </div>

        <ul className="detail-list" style={{ marginTop: '1.2rem' }}>
          <li><span>Patient</span><strong>{c.patientName}, {c.age}</strong></li>
          <li><span>Emergency type</span><strong>{c.emergencyType}</strong></li>
          <li><span>Priority</span><strong><PriorityBadge priority={c.priority} /></strong></li>
          <li><span>Contact</span><strong>{c.contactNumber}</strong></li>
          <li><span>Location</span><strong>{c.location}</strong></li>
          {c.description && <li><span>Description</span><strong>{c.description}</strong></li>}
        </ul>

        <div className="confirm-actions">
          <Link to={`/cases/${c.id}`} className="btn btn--emergency btn--xl">
            Open case dashboard →
          </Link>
          <Link to="/" className="btn btn--ghost">Back to home</Link>
        </div>
      </div>

      <p className="faint" style={{ textAlign: 'center', marginTop: '0.8rem' }}>
        Save your case ID <strong className="case-id">{c.id}</strong> — you can reopen this dashboard
        anytime from “My Cases”.
      </p>
    </div>
  )
}
