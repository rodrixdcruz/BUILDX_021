import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EmergencyCase, Facility, TriageCategory } from '../models/types'
import { getAllCases, haversineKm, formatDistance } from '../services/emergencyService'
import { loadFleetState, isDispatchable } from '../services/ambulanceService'
import { getHospitals } from '../services/hospitalService'
import { hospitalReportedCapacity } from '../services/facilityService'
import { getFacilities, isReceiving, overflowAlternatives } from '../services/facilityService'
import { isOnline, setForceOffline } from '../services/connectivityService'
import { DemoNotice, EmptyState } from '../components/ui'
import { ASSISTANT_DISCLAIMER } from '../services/assistantService'

/**
 * Emergency Surge Mode dashboard — Commit 3.
 *
 * City-wide coordination view for a mass-casualty drill: every case bucketed
 * by transparent demo triage (CRITICAL / URGENT / NON_URGENT — derived from
 * reporter priority, NOT clinical assessment), fleet and hospital capacity
 * at a glance, load-aware alternates, and explainable hospital picks.
 * All availability numbers are demo/reported snapshots.
 */

const TRIAGE_ORDER: TriageCategory[] = ['CRITICAL', 'URGENT', 'NON_URGENT']

const TRIAGE_LABEL: Record<TriageCategory, string> = {
  CRITICAL: 'Critical',
  URGENT: 'Urgent',
  NON_URGENT: 'Non-urgent',
}

function TriageBadge({ cat }: { cat: TriageCategory }) {
  const cls = cat === 'CRITICAL' ? 'badge--danger' : cat === 'URGENT' ? 'badge--pending' : 'badge--neutral'
  return <span className={`badge ${cls}`}>{cat}</span>
}

/** Explainable pick: best receiving hospital for one case (demo factors). */
function pickHospital(c: EmergencyCase): { name: string; reasons: string[] } | null {
  const candidates = getHospitals()
    .filter((h) => h.emergencyAvailable && h.beds.ICU && h.beds.ICU.available > 0)
    .map((h) => {
      const cap = hospitalReportedCapacity(h.id)
      const reasons: string[] = [`Reported capacity: ${cap.status} (${cap.bedsAvailable}/${cap.bedsTotal} beds, demo)`]
      let score = cap.bedsAvailable * 2
      if (h.emergencyAvailable) {
        score += 12
        reasons.push('Emergency capability: supported')
      }
      if (c.locationPoint) {
        const km = haversineKm(c.locationPoint, h.location)
        score += Math.max(0, 30 - km * 3)
        reasons.push(`Distance: ${formatDistance(km)} (estimated route)`)
      }
      if (cap.bedsAvailable === 0) score -= 100
      return { h, score, reasons }
    })
    .sort((a, b) => b.score - a.score || a.h.id.localeCompare(b.h.id))

  return candidates.length > 0 ? { name: candidates[0].h.name, reasons: candidates[0].reasons } : null
}

/**
 * Demo blackout control — simulates a city-wide network failure so judges can
 * exercise Offline Mode (shell stays up, actions queue, sync on restore).
 */
function BlackoutToggle() {
  const [online, setOnline] = useState(() => isOnline())

  useEffect(() => {
    const refresh = () => setOnline(isOnline())
    window.addEventListener('nhg-connectivity-changed', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    return () => {
      window.removeEventListener('nhg-connectivity-changed', refresh)
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [])

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div className="section-head" style={{ marginBottom: '0.3rem' }}>
        <h2 style={{ marginBottom: 0, fontSize: '1.05rem' }}>📴 Network Blackout Mode (demo)</h2>
        <span className="badge">{online ? '🟢 ONLINE' : '🔴 OFFLINE — EMERGENCY FALLBACK ACTIVE'}</span>
      </div>
      <p className="muted" style={{ marginBottom: '0.6rem' }}>
        Simulates a city-wide internet failure. The app shell, cached demo data and case creation keep working;
        case updates queue locally and sync automatically when the network returns.
      </p>
      {online ? (
        <button type="button" className="btn btn--danger" onClick={() => setForceOffline(true)}>
          Simulate city-wide network failure
        </button>
      ) : (
        <button type="button" className="btn btn--primary" onClick={() => setForceOffline(false)}>
          Restore network (sync queued actions)
        </button>
      )}
    </div>
  )
}

export function SurgePage() {
  const [cases, setCases] = useState<EmergencyCase[]>([])
  const [fleetVersion, setFleetVersion] = useState(0)

  useEffect(() => {
    const refresh = () => {
      setCases(getAllCases())
      setFleetVersion((v) => v + 1)
    }
    refresh()
    const t = window.setInterval(refresh, 4000)
    return () => window.clearInterval(t)
  }, [])

  const fleet = useMemo(() => loadFleetState(), [fleetVersion])
  const hospitals = useMemo(() => getHospitals(), [])
  const facilities = useMemo(() => getFacilities(), [])

  const active = cases.filter((c) => c.status !== 'Closed')
  const byTriage = (cat: TriageCategory) => active.filter((c) => (c.triage ?? 'NON_URGENT') === cat)
  const pending = active.filter((c) => c.ambulance.status !== 'Assigned' && c.ambulance.status !== 'Unavailable')
  const fullHospitals = hospitals.filter((h) => hospitalReportedCapacity(h.id).status === 'Full')

  const stats = {
    total: active.length,
    critical: byTriage('CRITICAL').length,
    urgent: byTriage('URGENT').length,
    nonUrgent: byTriage('NON_URGENT').length,
    pending: pending.length,
    ambulancesAvailable: fleet.filter(isDispatchable).length,
    ambulancesAssigned: fleet.filter((a) => a.status === 'Assigned').length,
    hospitalsAvailable: hospitals.length - fullHospitals.length,
    hospitalsFull: fullHospitals.length,
  }

  const receivingFacilities = facilities.filter(isReceiving)

  if (active.length === 0) {
    return (
      <div className="page">
        <h1>🚨 Emergency Surge Mode</h1>
        <DemoNotice>
          SURGE VIEW USES DEMO / SIMULATED DATA — a coordination drill tool, not live city feeds.
        </DemoNotice>
        <BlackoutToggle />
        <EmptyState icon="📊" title="No active cases to coordinate">
          <p className="muted">Report an emergency (or ten — it is a surge drill) to populate this dashboard.</p>
          <Link to="/emergency/new" className="btn btn--primary" style={{ marginTop: '0.6rem' }}>
            Report emergency
          </Link>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="section-head" style={{ marginBottom: '0.4rem' }}>
        <h1 style={{ marginBottom: 0 }}>🚨 Emergency Surge Mode</h1>
        <span className="faint">Coordinator view · demo drill data</span>
      </div>
      <DemoNotice>
        ALL COUNTS AND CAPACITIES ARE DEMO / SIMULATED. Triage labels are coordination categories derived from the
        reporter's priority — NOT clinical assessments.
      </DemoNotice>

      <BlackoutToggle />

      {/* Stat strip */}
      <div className="surge-stats" style={{ marginTop: '1rem' }}>
        <div className="card surge-stat surge-stat--danger"><strong>{stats.critical}</strong><span>Critical cases</span></div>
        <div className="card surge-stat"><strong>{stats.urgent}</strong><span>Urgent cases</span></div>
        <div className="card surge-stat"><strong>{stats.nonUrgent}</strong><span>Non-urgent cases</span></div>
        <div className="card surge-stat"><strong>{stats.pending}</strong><span>Pending assignments</span></div>
        <div className="card surge-stat surge-stat--ok"><strong>{stats.ambulancesAvailable}</strong><span>Ambulances available</span></div>
        <div className="card surge-stat"><strong>{stats.ambulancesAssigned}</strong><span>Ambulances assigned</span></div>
        <div className="card surge-stat surge-stat--ok"><strong>{stats.hospitalsAvailable}</strong><span>Hospitals with availability</span></div>
        <div className="card surge-stat surge-stat--danger"><strong>{stats.hospitalsFull}</strong><span>Hospitals at capacity</span></div>
      </div>

      {/* Case buckets */}
      <h2 style={{ marginTop: '1.6rem' }}>Active cases by demo triage</h2>
      <div className="surge-buckets">
        {TRIAGE_ORDER.map((cat) => {
          const bucket = byTriage(cat)
          return (
            <section key={cat} className={`surge-bucket surge-bucket--${cat.toLowerCase()}`}>
              <h3>
                {TRIAGE_LABEL[cat]} <span className="badge badge--neutral">{bucket.length}</span>
              </h3>
              {bucket.length === 0 ? (
                <p className="muted">None waiting.</p>
              ) : (
                <ul className="surge-case-list">
                  {bucket.map((c) => {
                    const pick = pickHospital(c)
                    return (
                      <li key={c.id} className="surge-case">
                        <div>
                          <Link to={`/cases/${c.id}`} className="case-id surge-case__id">
                            {c.id}
                          </Link>{' '}
                          <TriageBadge cat={cat} />
                          <div className="muted surge-case__meta">
                            {c.emergencyType} · {c.location} · 🚑 {c.ambulance.status === 'Assigned' ? c.ambulance.callSign : 'pending'}
                          </div>
                          {pick && (
                            <details className="surge-case__why">
                              <summary>Recommended: {pick.name}</summary>
                              <ul>
                                {pick.reasons.map((r, i) => (
                                  <li key={i}>{r}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {/* Hospital capacity board */}
      <h2 style={{ marginTop: '1.8rem' }}>Hospital capacity board</h2>
      <DemoNotice>Reported availability snapshot — demo data, confirm by phone.</DemoNotice>
      <div className="card-grid" style={{ marginTop: '0.6rem' }}>
        {hospitals.map((h) => {
          const cap = hospitalReportedCapacity(h.id)
          return (
            <article key={h.id} className="card hospital-card">
              <div className="hospital-card__top">
                <div>
                  <h3>{h.name}</h3>
                  <span className="hospital-card__area">📍 {h.area}, Nagpur</span>
                </div>
                <span className={`chip ${cap.status === 'Available' ? 'chip--ok' : cap.status === 'Limited' ? 'chip--warn' : 'chip--danger'}`}>
                  {cap.status === 'Full' ? 'HOSPITAL FULL' : cap.status}
                </span>
              </div>
              <div className="bed-badges">
                <span className={`bed-badge ${cap.bedsAvailable === 0 ? 'bed-badge--out' : ''}`}>
                  {cap.bedsAvailable}<span>beds free</span>
                </span>
                <span className="bed-badge">
                  {cap.percentFree}%<span>capacity free</span>
                </span>
              </div>
            </article>
          )
        })}
      </div>

      {/* Overflow alternatives for FULL hospitals */}
      {fullHospitals.length > 0 && (
        <>
          <h2 style={{ marginTop: '1.8rem' }}>Overflow alternatives</h2>
          <DemoNotice>Partner facilities with reported spare capacity (demo network).</DemoNotice>
          {fullHospitals.map((h) => {
            const alts = overflowAlternatives(h.id, null).slice(0, 3)
            return (
              <div key={h.id} className="card" style={{ marginTop: '0.8rem' }}>
                <h3 style={{ marginBottom: '0.2rem' }}>
                  {h.name} <span className="chip chip--danger">FULL</span>
                </h3>
                <p className="muted" style={{ marginBottom: '0.6rem' }}>Alternatives evaluated: {overflowAlternatives(h.id, null).length}</p>
                <ul className="surge-alt-list">
                  {alts.map(({ facility: f, score, reasons }) => (
                    <li key={f.id}>
                      <strong>{f.name}</strong> <span className="chip chip--ok">{f.reportedCapacity}</span>{' '}
                      <span className="faint">{f.kind} · load {f.loadPercent}% · match score {Math.round(score)}</span>
                      <details className="surge-case__why">
                        <summary>Why this alternative?</summary>
                        <ul>{reasons.map((r, i) => <li key={i}>{r.label}</li>)}</ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </>
      )}

      {/* Partner facilities */}
      <h2 style={{ marginTop: '1.8rem' }}>Partner network ({receivingFacilities.length} receiving)</h2>
      <DemoNotice>Healthcare centres & emergency camps — demo facilities, not verified live capacity.</DemoNotice>
      <div className="card-grid" style={{ marginTop: '0.6rem' }}>
        {facilities.map((f: Facility) => (
          <article key={f.id} className="card hospital-card">
            <div className="hospital-card__top">
              <div>
                <h3>{f.name}</h3>
                <span className="hospital-card__area">📍 {f.area}, Nagpur</span>
              </div>
              <span className={`chip ${isReceiving(f) ? 'chip--ok' : 'chip--danger'}`}>{f.reportedCapacity}</span>
            </div>
            <div className="hospital-card__meta">
              <span>🏷 {f.kind}</span>
              {f.bedsAvailable !== undefined && <span>🛏 {f.bedsAvailable}/{f.bedsTotal} beds</span>}
              <span>⚙ load {f.loadPercent}%</span>
              {f.contact && <span>📞 {f.contact}</span>}
            </div>
          </article>
        ))}
      </div>

      <p className="faint" style={{ marginTop: '1.6rem' }}>{ASSISTANT_DISCLAIMER}</p>
    </div>
  )
}
