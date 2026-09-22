import { Link } from 'react-router-dom'
import type { Hospital, BedCategory, GeoPoint } from '../models/types'
import { AvailabilityChip, DistanceLabel } from './ui'
import { mapsDeepLink } from '../constants/emergency'

const BED_LABELS: Record<BedCategory, string> = {
  ICU: 'ICU',
  General: 'General',
  Oxygen: 'Oxygen',
}

export function HospitalCard({ hospital, userPoint }: { hospital: Hospital; userPoint: GeoPoint | null }) {
  const openNow = hospital.emergencyAvailable
  const avail = (cat: BedCategory) => hospital.beds[cat]

  return (
    <article className="card hospital-card" aria-label={hospital.name}>
      <div className="hospital-card__top">
        <div>
          <h3>{hospital.name}</h3>
          <span className="hospital-card__area">
            <span aria-hidden="true">📍</span> {hospital.area}, Nagpur
            {userPoint && (
              <>
                {' · '}
                <DistanceLabel from={userPoint} to={hospital.location} />
              </>
            )}
          </span>
        </div>
        <AvailabilityChip ok={openNow}>{openNow ? 'Emergency Open' : 'No Emergency'}</AvailabilityChip>
      </div>

      <div className="bed-badges" aria-label="Bed availability (demo data)">
        {(['ICU', 'General', 'Oxygen'] as BedCategory[]).map((cat) => {
          const b = avail(cat)
          return (
            <span key={cat} className={`bed-badge ${b && b.available === 0 ? 'bed-badge--out' : ''}`}>
              <span>{BED_LABELS[cat]}</span>
              {b ? `${b.available} / ${b.total} free` : 'N/A'}
            </span>
            // DEMO availability
          )
        })}
      </div>

      <div className="facilities">
        {hospital.facilities.slice(0, 4).map((f) => (
          <span key={f} className="facility-chip">{f}</span>
        ))}
      </div>

      <div className="hospital-card__meta">
        <span>📞 {hospital.contact}</span>
        <span>🏥 {hospital.sector}</span>
      </div>

      <div className="hospital-card__actions">
        <a
          className="btn btn--sm btn--ghost"
          href={mapsDeepLink(hospital.location, hospital.name)}
          target="_blank"
          rel="noreferrer"
        >
          🗺️ Map
        </a>
        <Link className="btn btn--sm btn--primary" to={`/hospitals/${hospital.id}`}>
          View Details
        </Link>
      </div>
    </article>
  )
}
