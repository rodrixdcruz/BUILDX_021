import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { EmergencyCase, Hospital, GeoPoint } from '../models/types'
import { getCase, saveCase, selectBestHospital } from '../services/emergencyService'
import { getHospitals } from '../services/hospitalService'
import { PriorityBadge, EmptyState, DemoNotice } from '../components/ui'
import { LocationPanel } from '../components/LocationPanel'

/**
 * Emergency case dashboard — the coordination heart of the MVP.
 * Workflow: report → hospital search → bed confirmation. Ambulance, blood
 * and navigation steps are scaffolded as "coming later" for Commits 2 & 3.
 */
export function CaseDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const [caseRecord, setCaseRecord] = useState<EmergencyCase | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [point, setPoint] = useState<GeoPoint | null>(null)
  const [label, setLabel] = useState('')

  const hospitals = useMemo(() => getHospitals(), [])

  useEffect(() => {
    const c = id ? getCase(id) : null
    if (!c) {
      setNotFound(true)
      return
    }
    setCaseRecord(c)
    if (c.locationPoint) setPoint(c.locationPoint)
  }, [id])

  // Simulated coordination pipeline (demo logic, clearly labelled in UI).
  // Stage 1: hospital search — runs while the case is in 'Searching'.
  useEffect(() => {
    if (!caseRecord || caseRecord.hospital.status !== 'Searching') return
    const t1 = window.setTimeout(() => {
      setCaseRecord((prev) => {
        if (!prev || prev.hospital.status !== 'Searching') return prev
        const best = selectBestHospital(prev, hospitals)
        const updated: EmergencyCase = {
          ...prev,
          hospital: best
            ? { status: 'Selected', hospitalId: best.id, hospitalName: best.name }
            : { status: 'Unavailable', note: 'No hospital with emergency & ICU capacity in demo data.' },
        }
        saveCase(updated)
        return updated
      })
    }, 1800)
    return () => window.clearTimeout(t1)
  }, [caseRecord, caseRecord?.hospital.status, hospitals])

  // Stage 2: bed confirmation — starts once a hospital has been selected.
  useEffect(() => {
    if (!caseRecord || caseRecord.hospital.status !== 'Selected' || caseRecord.bed.status !== 'Checking') return
    const t2 = window.setTimeout(() => {
      setCaseRecord((prev) => {
        if (!prev || prev.hospital.status !== 'Selected' || prev.bed.status !== 'Checking') return prev
        const updated: EmergencyCase = { ...prev, bed: { status: 'Available', category: 'ICU' } }
        saveCase(updated)
        return updated
      })
    }, 1400)
    return () => window.clearTimeout(t2)
  }, [caseRecord, caseRecord?.hospital.status, caseRecord?.bed.status])

  if (notFound) {
    return (
      <div className="page page--narrow">
        <h1>Case not found</h1>
        <EmptyState icon="🔎" title={`No case with ID ${id ?? ''}`}>
          <p className="muted">It may have been cleared from this browser.</p>
          <Link to="/cases" className="btn btn--primary" style={{ marginTop: '0.6rem' }}>
            View all cases
          </Link>
        </EmptyState>
      </div>
    )
  }

  if (!caseRecord) return <div className="page"><p className="muted">Loading case…</p></div>

  const c = caseRecord
  const selectedHospital: Hospital | null =
    c.hospital.hospitalId ? hospitals.find((h) => h.id === c.hospital.hospitalId) ?? null : null

  const hospitalState = c.hospital.status === 'Searching' ? 'pending' : c.hospital.status === 'Selected' ? 'done' : 'danger'
  const bedState = c.bed.status === 'Checking' ? 'pending' : c.bed.status === 'Available' ? 'done' : 'danger'

  return (
    <div className="page">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div className="case-head" style={{ width: '100%' }}>
          <div>
            <h1 className="case-id">CASE #{c.id}</h1>
            <p className="muted">
              Reported {new Date(c.createdAt).toLocaleString()} · {c.emergencyType}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <PriorityBadge priority={c.priority} />
            <span className="badge badge--ok">{c.status}</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '0.8rem' }}>
        <div className="case-facts" style={{ marginTop: 0 }}>
          <div className="fact"><span>Patient</span><strong>{c.patientName}, {c.age}</strong></div>
          <div className="fact"><span>Contact</span><strong>{c.contactNumber}</strong></div>
          <div className="fact"><span>Location</span><strong>{c.location}</strong></div>
          <div className="fact"><span>Priority</span><strong><PriorityBadge priority={c.priority} /></strong></div>
          <div className="fact"><span>Status</span><strong>{c.status}</strong></div>
        </div>
        {c.description && (
          <p className="muted" style={{ marginTop: '0.8rem', marginBottom: 0 }}>📝 {c.description}</p>
        )}
      </div>

      <h2 style={{ marginTop: '1.4rem' }}>Coordination workflow</h2>
      <DemoNotice>STATUS PROGRESSION IS SIMULATED FOR THE MVP DEMO.</DemoNotice>

      <div className="workflow">
        {/* 1. Hospital */}
        <section className={`step step--${hospitalState === 'done' ? 'done' : hospitalState === 'pending' ? 'active' : 'todo'}`}>
          <div className="step__icon" aria-hidden="true">🏥</div>
          <div className="step__body">
            <h3>Hospital <span className={`badge badge--${hospitalState === 'done' ? 'ok' : hospitalState === 'pending' ? 'pending' : 'danger'}`}>
              {c.hospital.status}
            </span></h3>
            {c.hospital.status === 'Searching' && <p>Matching case against network hospitals (priority, distance, ICU capacity)…</p>}
            {c.hospital.status === 'Selected' && selectedHospital && (
              <p>
                <strong>{selectedHospital.name}</strong> · {selectedHospital.area} · 📞 {selectedHospital.contact}
              </p>
            )}
            {c.hospital.status === 'Unavailable' && <p>{c.hospital.note ?? 'No suitable hospital found.'}</p>}
            {selectedHospital && (
              <div className="step__link">
                <Link className="btn btn--sm btn--ghost" to={`/hospitals/${selectedHospital.id}`}>
                  View hospital details
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* 2. Bed */}
        <section className={`step step--${bedState === 'done' ? 'done' : bedState === 'pending' ? 'active' : 'todo'}`}>
          <div className="step__icon" aria-hidden="true">🛏️</div>
          <div className="step__body">
            <h3>Bed <span className={`badge badge--${bedState === 'done' ? 'ok' : bedState === 'pending' ? 'pending' : 'danger'}`}>
              {c.bed.status}
              {c.bed.category ? ` · ${c.bed.category}` : ''}
            </span></h3>
            <p>
              {c.bed.status === 'Checking'
                ? 'Checking ICU / general / oxygen availability at the matched hospital…'
                : c.bed.status === 'Available'
                  ? `ICU bed confirmed at ${c.hospital.hospitalName ?? 'the selected hospital'} (demo confirmation).`
                  : c.bed.note ?? 'No bed available — try other hospitals.'}
            </p>
          </div>
          {/* Bed status shown is simulated */}
        </section>

        {/* 3. Ambulance — Commit 2 */}
        <section className="step step--todo">
          <div className="step__icon" aria-hidden="true">🚑</div>
          <div className="step__body">
            <h3>Ambulance <span className="badge badge--neutral">Not Assigned Yet</span></h3>
            <p>{c.ambulance.note}</p>
          </div>
        </section>

        {/* 4. Blood — Commit 2 */}
        <section className="step step--todo">
          <div className="step__icon" aria-hidden="true">🩸</div>
          <div className="step__body">
            <h3>Blood <span className="badge badge--neutral">Not Assigned Yet</span></h3>
            <p>{c.blood.note}</p>
          </div>
        </section>

        {/* 5. Navigation — Commit 3 */}
        <section className="step step--todo">
          <div className="step__icon" aria-hidden="true">🧭</div>
          <div className="step__body">
            <h3>Navigation <span className="badge badge--neutral">Not Assigned Yet</span></h3>
            <p>{c.navigation.note}</p>
          </div>
        </section>
      </div>

      <div className="section">
        <LocationPanel
          hospitals={selectedHospital ? [selectedHospital] : hospitals.filter(h => h.emergencyAvailable).slice(0, 8)}
          selectedHospitalId={selectedHospital?.id}
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
