import { useMemo, useState } from 'react'
import type { HospitalFilters, GeoPoint } from '../models/types'
import { getHospitals, filterHospitals, withDistances } from '../services/hospitalService'
import { NAGPUR_AREAS } from '../constants/emergency'
import { HospitalCard } from '../components/HospitalCard'
import { LocationPanel } from '../components/LocationPanel'
import { DemoNotice, EmptyState } from '../components/ui'

const defaultFilters: HospitalFilters = {
  query: '',
  emergencyOnly: true,
  icuOnly: false,
  generalBedOnly: false,
  area: 'All Areas',
}

export function HospitalsPage() {
  const [filters, setFilters] = useState<HospitalFilters>(defaultFilters)
  const [point, setPoint] = useState<GeoPoint | null>(null)
  const [label, setLabel] = useState('')

  const hospitals = useMemo(() => getHospitals(), [])

  const results = useMemo(() => {
    const filtered = filterHospitals(hospitals, filters)
    return withDistances(filtered, point)
  }, [hospitals, filters, point])

  function update<K extends keyof HospitalFilters>(key: K, value: HospitalFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <h1>Hospitals &amp; bed availability</h1>
          <p className="muted">
            {results.length} of {hospitals.length} network hospitals match your filters.
          </p>
        </div>
        <DemoNotice />
      </div>

      <div className="filter-bar" role="search" aria-label="Hospital filters">
        <div className="filter-bar__search">
          <label className="sr-only" htmlFor="hospital-search">Search by hospital name or area</label>
          <input
            id="hospital-search"
            type="search"
            value={filters.query}
            onChange={(e) => update('query', e.target.value)}
            placeholder="Search by hospital name or area…"
          />
        </div>

        <label className={`check-chip ${filters.emergencyOnly ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={filters.emergencyOnly}
            onChange={(e) => update('emergencyOnly', e.target.checked)}
          />
          🚨 Emergency available
        </label>

        <label className={`check-chip ${filters.icuOnly ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={filters.icuOnly}
            onChange={(e) => update('icuOnly', e.target.checked)}
          />
          🛏️ ICU available
        </label>

        <label className={`check-chip ${filters.generalBedOnly ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={filters.generalBedOnly}
            onChange={(e) => update('generalBedOnly', e.target.checked)}
          />
          🛌 General bed available
        </label>

        <label className="sr-only" htmlFor="area-filter">Filter by area</label>
        <select
          id="area-filter"
          value={filters.area}
          onChange={(e) => update('area', e.target.value)}
        >
          <option value="All Areas">All Areas</option>
          {NAGPUR_AREAS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No hospitals match your filters"
        >
          <p className="muted">Try removing a filter, searching a different area, or widening your search.</p>
        </EmptyState>
      ) : (
        <div className="card-grid">
          {results.map((h) => (
            <HospitalCard key={h.id} hospital={h} userPoint={point} />
          ))}
        </div>
      )}

      <div className="section">
        <LocationPanel
          hospitals={results}
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
