import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { getHospitals } from '../services/hospitalService'
import { getAllCases } from '../services/emergencyService'
import { DemoNotice } from '../components/ui'

export function HomePage() {
  const stats = useMemo(() => {
    const hospitals = getHospitals()
    const withEmergency = hospitals.filter((h) => h.emergencyAvailable)
    const icuFree = hospitals.reduce((sum, h) => sum + (h.beds.ICU?.available ?? 0), 0)
    const generalFree = hospitals.reduce((sum, h) => sum + (h.beds.General?.available ?? 0), 0)
    const cases = getAllCases()
    return { hospitals: hospitals.length, withEmergency: withEmergency.length, icuFree, generalFree, activeCases: cases.length }
  }, [])

  return (
    <>
      <section className="hero">
        <div>
          <span className="hero__eyebrow">
            <span className="hero__pulse" aria-hidden="true" />
            Nagpur emergency coordination network
          </span>
          <h1>
            One emergency.
            <br />
            <em>One coordinated response.</em>
          </h1>
          <p className="hero__sub">
            Nagpur HealthGrid helps patients report an emergency in seconds and instantly discover
            Nagpur hospitals with available emergency care, ICU, general and oxygen beds — all in one
            coordinated view.
          </p>
          <div className="hero__actions">
            <Link to="/emergency/new" className="btn btn--emergency btn--xl">
              🚨 Report an Emergency
            </Link>
            <Link to="/hospitals" className="btn btn--ghost btn--xl">
              🏥 Find Hospitals &amp; Beds
            </Link>
          </div>
        </div>

        <aside className="hero-panel" aria-label="Live network summary">
          <h2>Network status</h2>
          <div className="stat-row">
            <span>Hospitals in network</span>
            <strong>{stats.hospitals}</strong>
          </div>
          <div className="stat-row">
            <span>Emergency depts open</span>
            <strong>{stats.withEmergency} / {stats.hospitals}</strong>
          </div>
          <div className="stat-row">
            <span>ICU beds free (demo)</span>
            <strong>{stats.icuFree}</strong>
          </div>
          <div className="stat-row">
            <span>General beds free (demo)</span>
            <strong>{stats.generalFree}</strong>
          </div>
          <div className="stat-row">
            <span>Your active cases</span>
            <strong>{stats.activeCases}</strong>
          </div>
          <DemoNotice>SUMMARY USES DEMO / SIMULATED AVAILABILITY.</DemoNotice>
        </aside>
      </section>

      <section className="section" aria-labelledby="services-heading">
        <div className="section-head">
          <h2 id="services-heading">Medical services</h2>
          <p>Coordinated emergency services across Nagpur.</p>
        </div>
        <div className="card-grid">
          <ServiceCard
            icon="🚨"
            title="Emergency reporting"
            text="Report an accident, cardiac emergency, breathing problem and more. Get a case ID instantly."
            to="/emergency/new"
            cta="Report now"
          />
          <ServiceCard
            icon="🏥"
            title="Hospital & bed availability"
            text="Filter hospitals by open emergency departments, ICU, general or oxygen beds across Nagpur areas."
            to="/hospitals"
            cta="Browse hospitals"
          />
          <ServiceCard
            icon="📋"
            title="Emergency case dashboard"
            text="Track each case end-to-end: hospital search, bed confirmation, and upcoming ambulance & blood support."
            to="/cases"
            cta="View my cases"
          />
        </div>
      </section>

      <section className="section" aria-labelledby="status-heading">
        <div className="section-head">
          <h2 id="status-heading">Emergency status</h2>
          <p>What is live today — and what is arriving next.</p>
        </div>
        <div className="card">
          <div className="case-facts" style={{ marginTop: 0 }}>
            <div className="fact">
              <span>Emergency reporting</span>
              <strong style={{ color: 'var(--ok)' }}>Live in this MVP</strong>
            </div>
            <div className="fact">
              <span>Hospital discovery</span>
              <strong style={{ color: 'var(--ok)' }}>Live (demo data)</strong>
            </div>
            <div className="fact">
              <span>Bed checking</span>
              <strong style={{ color: 'var(--ok)' }}>Live (demo data)</strong>
            </div>
            <div className="fact">
              <span>Ambulance coordination</span>
              <strong style={{ color: 'var(--warn)' }}>Commit 2</strong>
            </div>
            <div className="fact">
              <span>Blood-bank availability</span>
              <strong style={{ color: 'var(--warn)' }}>Commit 2</strong>
            </div>
            <div className="fact">
              <span>AI emergency assistant</span>
              <strong style={{ color: 'var(--warn)' }}>Commit 3</strong>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function ServiceCard({ icon, title, text, to, cta }: { icon: string; title: string; text: string; to: string; cta: string }) {
  return (
    <article className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <span style={{ fontSize: '1.7rem' }} aria-hidden="true">{icon}</span>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <p className="muted" style={{ flex: 1 }}>{text}</p>
      <Link to={to} className="btn btn--ghost">{cta} →</Link>
    </article>
  )
}
