import { useEffect, useState } from 'react'
import type { GeoPoint, Hospital } from '../models/types'
import { locateBrowser, LocationError, areaCenter } from '../services/locationService'
import { reverseGeocode, drivingRoute, type DrivingRoute } from '../services/routingService'
import { HospitalMap } from './HospitalMap'
import { NAGPUR_CENTER, NAGPUR_AREAS } from '../constants/emergency'
import { haversineKm, formatDistance } from '../services/emergencyService'

interface RouteInfo {
  km: string
  min: number
  live: boolean
}

/**
 * Fetches real driving distance/duration for one hospital via OSRM.
 * Falls back silently to the straight-line estimate when offline.
 */
function useDrivingRoutes(point: GeoPoint | null, hospitals: Hospital[]): Map<string, RouteInfo> {
  const [routes, setRoutes] = useState<Map<string, RouteInfo>>(new Map())

  useEffect(() => {
    if (!point || hospitals.length === 0) return
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        hospitals.map(async (h) => {
          const r: DrivingRoute = await drivingRoute(point, h.location)
          return [
            h.id,
            { km: formatDistance(r.distanceKm), min: r.durationMin, live: r.source === 'osrm' },
          ] as const
        }),
      )
      if (!cancelled) setRoutes(new Map(entries))
    })()
    return () => {
      cancelled = true
    }
  }, [point, hospitals])

  return routes
}

interface Props {
  hospitals: Hospital[]
  selectedHospitalId?: string
  /** Controlled patient location (shared with the form/dashboard). */
  point: GeoPoint | null
  label: string
  onLocationChange: (point: GeoPoint | null, label: string) => void
  /**
   * Simulated ambulance position — renders the dashed route polyline with
   * an animated truck marker when a hospital is also selected.
   */
  ambulanceLocation?: GeoPoint | null
  /** Case id for route-progress persistence (resume animation on re-open). */
  routeCaseId?: string | null
}

/**
 * Map / location panel. Shows a real interactive OpenStreetMap (Leaflet)
 * with patient + hospital markers, supports browser geolocation and manual
 * area selection, and lists nearby hospitals with OSRM road distances.
 * Falls back gracefully (offline tiles, denied geolocation, API hiccups).
 */
export function LocationPanel({
  hospitals,
  selectedHospitalId,
  point,
  label,
  onLocationChange,
  ambulanceLocation,
  routeCaseId,
}: Props) {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualArea, setManualArea] = useState('')

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
      // Upgrade the demo nearest-area label with a real Nominatim reverse
      // geocode; on failure res.label (approx. area) is kept.
      void reverseGeocode(res.point).then((place) => {
        onLocationChange(res.point, place.label)
      })
      onLocationChange(res.point, res.label)
    } catch (e) {
      setError(e instanceof LocationError ? e.message : 'Could not determine your location.')
    } finally {
      setLocating(false)
    }
  }

  const visible = hospitals.slice(0, 8)
  const routes = useDrivingRoutes(point, visible)

  return (
    <section className="card map-panel" aria-label="Location and map">
      <div className="section-head" style={{ marginBottom: '0.8rem' }}>
        <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Location &amp; Map</h2>
        <span className="faint">Distances via OSRM road routing when online; straight-line estimate offline.</span>
      </div>

      <HospitalMap
        hospitals={visible}
        selectedHospitalId={selectedHospitalId}
        point={point}
        ambulanceLocation={ambulanceLocation}
        routeCaseId={routeCaseId}
      />

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
        <p className="faint" style={{ margin: 0, fontSize: '0.72rem' }}>
          * = offline estimate. Live routes by OSRM; labels by OpenStreetMap Nominatim.
        </p>

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
                    {routes.get(h.id) ? (
                      <>
                        {routes.get(h.id)!.km}
                        {' · ~'}{routes.get(h.id)!.min} min
                        {!routes.get(h.id)!.live && ' *'}
                      </>
                    ) : (
                      formatDistance(haversineKm(point ?? NAGPUR_CENTER, h.location))
                    )}
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
