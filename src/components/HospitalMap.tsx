import { useEffect, useMemo, useRef, useState } from 'react'
import type { GeoPoint, Hospital } from '../models/types'
import { NAGPUR_CENTER } from '../constants/emergency'
import { drivingRouteGeometry, interpolateAlong, type RoutePath } from '../services/routingService'
import { subscribeTheme, type ResolvedTheme } from '../services/themeService'
import {
  getRouteStart,
  routeProgressKey,
  saveRouteStart,
  clearRouteStart,
} from '../services/routeProgressService'

/**
 * Tile providers per resolved theme. Both use the standard OpenStreetMap
 * tiles; in dark mode the same tiles are restyled via a CSS filter on the
 * tile pane only (invert + hue-rotate), leaving markers, popups and
 * controls untouched. (CARTO's hosted dark tiles were tried first but now
 * render an "API KEY REQUIRED" watermark without a paid key — the filter
 * approach is key-less and dependency-free. A dedicated dark tile vendor
 * can slot in later by extending TILE_SOURCES.)
 */
const TILE_SOURCES: Record<ResolvedTheme, { url: string; attribution: string; className?: string }> = {
  light: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  dark: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    className: 'hg-tiles-dark',
  },
}

/** Tracks the RESOLVED theme (system flip, toggle, or cross-tab change). */
function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>('light')
  useEffect(() => subscribeTheme(setTheme), [])
  return theme
}

/**
 * HospitalMap — a real interactive OpenStreetMap map (Leaflet, no API key).
 *
 * Shows the patient position (blue), nearby hospitals (teal, red when
 * selected) with popups, and — when the dashboard passes an
 * `ambulanceLocation` — the ambulance's route to the selected hospital as a
 * dashed polyline with a marker that animates along the real road geometry
 * (OSRM `overview=full`). The movement is a SIMULATION paced from the
 * route's drive-time estimate: no live GPS feed exists in the demo.
 *
 * Hospital markers sit in a leaflet.markercluster group: when several pins
 * overlap at low zoom they collapse into cluster bubbles (styled to match
 * the design system, color = busiest tier inside). Clicking a bubble does
 * NOT zoom or spiderfy — it opens a picker popup listing the hidden
 * hospitals by name: picking one (when a patient origin is known) draws
 * the live directions route, and a "Zoom to area" action spreads the pins.
 * The patient and ambulance markers are never clustered.
 *
 * Offline, tiles fail and the grid background shows; markers still render.
 * Without geometry (OSRM down) the route line is simply absent — the
 * straight-line estimate would be misleading to draw on a road map.
 *
 * Implementation notes:
 * - The map is created ONCE per mount (useRef + empty deps). Marker layers
 *   are replaced imperatively on prop changes — the idiomatic Leaflet
 *   pattern — and everything is torn down on unmount.
 * - MarkerCluster CSS is imported alongside Leaflet's so the stylesheet
 *   pipeline keeps bundling one file.
 * - The truck animation ticks through a SEPARATE 'hg-route-tick' event so
 *   the per-200ms redraws never rebuild the cluster group (which would
 *   reset cluster/spiderfy state mid-interaction).
 * - No external default-marker images are used (avoids the classic broken
 *   Leaflet icon URL problem under bundlers): pins are divIcons styled by
 *   this component's CSS.
 */

interface Props {
  hospitals: Hospital[]
  selectedHospitalId?: string
  /** Patient position; null shows the Nagpur-centred overview. */
  point: GeoPoint | null
  /**
   * Simulated ambulance position. When set together with a selected
   * hospital, the route polyline + moving marker are rendered.
   */
  ambulanceLocation?: GeoPoint | null
  /**
   * Case id for route-progress persistence: when set (with ambulance +
   * selected hospital), the animation resumes from its persisted start on
   * re-open instead of restarting. Omit on maps without a single case.
   */
  routeCaseId?: string | null
}

/** Marker/geometry inputs for the ambulance route (null while not ready). */
interface RouteSpec {
  from: GeoPoint
  to: GeoPoint
  durationMin: number
}

/**
 * Resolves the OSRM geometry for the ambulance→hospital route and animates
 * a 0..1 progress value across it. When `caseId` is provided, the traversal
 * start time is persisted per case (routeProgressService) so re-opening the
 * dashboard RESUMES the animation mid-route instead of restarting it.
 */
function useAmbulanceRoute(
  spec: RouteSpec | null,
  caseId?: string,
): { path: RoutePath | null; progress: number } {
  const [path, setPath] = useState<RoutePath | null>(null)
  const [progress, setProgress] = useState(0)

  const specKey = spec
    ? routeProgressKey(spec.from.lat, spec.from.lng, spec.to.lat, spec.to.lng)
    : ''

  useEffect(() => {
    if (!spec) {
      setPath(null)
      setProgress(0)
      return
    }
    let cancelled = false
    void drivingRouteGeometry(spec.from, spec.to).then((p) => {
      if (cancelled) return
      setPath(p)
      setProgress(0)
    })
    return () => {
      cancelled = true
    }
  }, [specKey])

  useEffect(() => {
    if (!path || path.points.length < 2) return
    // Simulated pace: traverse the full route in ~45 s regardless of the
    // real drive time — long enough to read as motion, short enough to demo.
    const TRAVERSE_MS = 45_000
    // Resume support: reuse the persisted start for this case's CURRENT
    // route; none (first view, route changed, no caseId) → start fresh.
    const persisted = caseId ? getRouteStart(caseId, specKey) : null
    const started = persisted ?? Date.now()
    if (caseId && persisted === null) saveRouteStart(caseId, specKey, started)
    const timer = window.setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / TRAVERSE_MS)
      setProgress(t)
      if (t >= 1) window.clearInterval(timer)
    }, 200)
    return () => window.clearInterval(timer)
  }, [path, caseId, specKey])

  return { path, progress }
}

/** Visual tier for a cluster bubble based on how many hospitals it hides. */
export function clusterTier(count: number): 'small' | 'medium' | 'large' {
  if (count < 4) return 'small'
  if (count < 8) return 'medium'
  return 'large'
}

/** Minimal hospital shape the cluster picker popup needs. */
export interface PickerHospital {
  id: string
  name: string
  area: string
}

/** Counts for the tiny map debug overlay. */
export interface MapDebugStats {
  zoom: number
  /** Hospitals currently swallowed by cluster bubbles. */
  clustered: number
  /** Hospitals currently rendered as individual pins. */
  visible: number
  /** Number of cluster bubbles on the map right now. */
  bubbles: number
}

/**
 * One-line text for the tiny debug overlay (zoom + cluster breakdown).
 * Pure so the format is unit-testable without a map.
 */
export function mapDebugText(s: MapDebugStats): string {
  const total = s.clustered + s.visible
  if (total === 0) return `z${s.zoom} · 0 hospitals`
  const clusteredPart =
    s.clustered === 0 ? '0 clustered' : `${s.clustered} clustered in ${s.bubbles} bubble${s.bubbles === 1 ? '' : 's'}`
  return `z${s.zoom} · ${s.visible} visible · ${clusteredPart}`
}

/**
 * HTML for the cluster picker popup: clicking a cluster bubble lists every
 * hospital it hides as a pick button (data-hg-pick), so users can choose a
 * hospital without zooming or spiderfying. Clicks are delegated by the
 * component via the data attributes — this stays a pure string builder so
 * it can be unit-tested without a map.
 */
export function clusterPickerHtml(hospitals: PickerHospital[], canPick: boolean): string {
  const items = hospitals
    .map(
      (h) =>
        `<li><button type="button" class="hg-cluster-picker__item" data-hg-pick="${h.id}"${canPick ? '' : ' disabled'}>` +
        `<strong>${h.name}</strong><span>${h.area}</span></button></li>`,
    )
    .join('')
  const hint = canPick
    ? 'Pick one to see live driving directions.'
    : 'Set the patient location to get driving directions.'
  return (
    `<div class="hg-cluster-picker">` +
    `<p class="hg-cluster-picker__title">${hospitals.length} hospital${hospitals.length === 1 ? '' : 's'} here</p>` +
    `<ul class="hg-cluster-picker__list">${items}</ul>` +
    `<button type="button" class="hg-cluster-picker__zoom" data-hg-zoom>Zoom to area</button>` +
    `<p class="hg-cluster-picker__hint">${hint}</p>` +
    `</div>`
  )
}

/**
 * Clickable-directions: when the user picks a hospital on the map (and a
 * patient origin exists), fetches the patient→hospital OSRM route with
 * geometry. Null while idle, out of region, offline, or when OSRM fails —
 * the panel then simply doesn't appear (no misleading straight line).
 */
function useDirectionsRoute(
  picked: Hospital | null,
  origin: GeoPoint | null,
): { route: RoutePath | null; loading: boolean } {
  const [route, setRoute] = useState<RoutePath | null>(null)
  const [loading, setLoading] = useState(false)

  const key = picked && origin ? `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}>${picked.id}` : ''

  useEffect(() => {
    if (!picked || !origin) {
      setRoute(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void drivingRouteGeometry(origin, picked.location).then((r) => {
      if (cancelled) return
      setRoute(r)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [key])

  return { route, loading }
}

export function HospitalMap({
  hospitals,
  selectedHospitalId,
  point,
  ambulanceLocation,
  routeCaseId,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const debugRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<unknown>(null)
  const layersRef = useRef<unknown>(null)
  const routeLayerRef = useRef<unknown>(null)
  const tileRef = useRef<unknown>(null)

  const theme = useResolvedTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme

  const visible = useMemo(() => hospitals.slice(0, 8), [hospitals])

  // Clickable directions: ONLY explicit user picks (marker clicks). No
  // fallback to the coordination-selected hospital — the dashboard already
  // draws the red ambulance route for that one, and surprise lines are bad.
  const [pickedId, setPickedId] = useState<string | null>(null)
  const picked = useMemo(
    () => visible.find((h) => h.id === pickedId) ?? null,
    [visible, pickedId],
  )
  const { route: directions, loading: directionsLoading } = useDirectionsRoute(picked, point)

  // Route spec: only when an ambulance position AND a selected hospital exist.
  const selected = useMemo(
    () => visible.find((h) => h.id === selectedHospitalId) ?? null,
    [visible, selectedHospitalId],
  )
  const routeSpec: RouteSpec | null =
    ambulanceLocation && selected ? { from: ambulanceLocation, to: selected.location, durationMin: 0 } : null
  const { path, progress } = useAmbulanceRoute(routeSpec, routeCaseId ?? undefined)

  // Unassigned (or hospital deselected) → drop any persisted progress so a
  // LATER re-assignment starts its drive from the beginning.
  useEffect(() => {
    if (!routeCaseId) return
    if (!routeSpec) clearRouteStart(routeCaseId)
  }, [routeCaseId, routeSpec])

  // The truck's current simulated position along the route.
  const ambulancePos: GeoPoint | null = useMemo(
    () => (path && path.points.length > 1 ? interpolateAlong(path.points, progress) : ambulanceLocation ?? null),
    [path, progress, ambulanceLocation],
  )

  // Keep the latest props/state in refs so the single map-creation effect
  // can re-render layers when they change.
  const propsRef = useRef({ visible, selectedHospitalId, pickedId, point, path, ambulancePos, directions })
  propsRef.current = { visible, selectedHospitalId, pickedId, point, path, ambulancePos, directions }

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined

    void (async () => {
      const L = (await import('leaflet')).default
      // Side-effect import: registers L.markerClusterGroup on the Leaflet
      // namespace. Must run before the cluster group is created.
      await import('leaflet.markercluster')
      if (disposed || !containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current, {
        center: [point?.lat ?? NAGPUR_CENTER.lat, point?.lng ?? NAGPUR_CENTER.lng],
        zoom: point ? 14 : 12,
        scrollWheelZoom: false, // don't hijack page scroll
        zoomControl: true,
        attributionControl: true,
      })
      mapRef.current = map

      const applyTiles = () => {
        const src = TILE_SOURCES[themeRef.current]
        const existing = tileRef.current as { remove: () => void } | null
        if (existing) existing.remove()
        const layer = L.tileLayer(src.url, {
          maxZoom: 19,
          attribution: src.attribution,
          ...(src.className ? { className: src.className } : {}),
        }).addTo(map)
        tileRef.current = layer
      }
      applyTiles()

      const routeLayer = L.layerGroup().addTo(map) // polyline + truck, below pins
      routeLayerRef.current = routeLayer
      // Hospital pins go into a CLUSTER group (bubbles at low zoom). Clicking
      // a bubble opens the picker popup (clusterPickerHtml) instead of
      // zooming/spiderfying. Patient pin uses a plain layer group so it is
      // never clustered and never collapses into hospital counts.
      const patientLayer = L.layerGroup().addTo(map)
      type ClusterChild = { options?: { hospital?: PickerHospital } }
      type ClusterLike = {
        getAllChildMarkers: () => ClusterChild[]
        getChildCount: () => number
        getBounds: () => { pad: (p: number) => unknown }
      }
      const cluster = (L as unknown as {
        markerClusterGroup: (opts: Record<string, unknown>) => {
          clearLayers: () => void
          addLayer: (l: unknown) => void
          addTo: (m: unknown) => void
          getLayers?: () => unknown[]
          on: (type: string, fn: (e: { layer: ClusterLike }) => void) => void
        }
      }).markerClusterGroup({
        showCoverageOnHover: false,
        // Cluster click = picker popup, NOT zoom/spiderfy (clusterclick below).
        zoomToBoundsOnClick: false,
        spiderfyOnMaxZoom: false,
        maxClusterRadius: 55,
        animateAddingMarkers: false,
        // Design-system bubble: tier class + count, tier from clusterTier().
        iconCreateFunction: (c: ClusterLike) => {
          const count = c.getChildCount()
          // A cluster containing the SELECTED hospital renders in red.
          const hasSelected = c
            .getAllChildMarkers()
            .some((m) => m.options?.hospital && propsRef.current.selectedHospitalId === m.options.hospital.id)
          const tier = clusterTier(count)
          return L.divIcon({
            className: `hg-cluster hg-cluster--${tier}${hasSelected ? ' hg-cluster--selected' : ''}`,
            html: `<span class="hg-cluster__count">${count}</span>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          })
        },
      })
      ;(cluster as unknown as { addTo: (m: unknown) => void }).addTo(map)
      layersRef.current = { patientLayer, cluster }

      // Cluster click → picker popup listing the hidden hospitals by name
      // (data-hg-pick buttons). The popup is rebound per cluster on click.
      let activeCluster: ClusterLike | null = null
      cluster.on('clusterclick', (e) => {
        activeCluster = e.layer
        const hospitals = e.layer
          .getAllChildMarkers()
          .map((m) => m.options?.hospital)
          .filter((h): h is PickerHospital => !!h)
          .sort((a, b) => a.name.localeCompare(b.name))
        const popupLayer = e.layer as unknown as {
          bindPopup: (html: string, opts?: Record<string, unknown>) => unknown
          openPopup: () => void
        }
        popupLayer.bindPopup(clusterPickerHtml(hospitals, !!propsRef.current.point), {
          maxWidth: 280,
          className: 'hg-cluster-popup',
        })
        popupLayer.openPopup()
      })

      // One delegated listener handles every picker popup button (popups are
      // recreated per click; delegation on the map container survives that).
      const onPickerClick = (ev: Event) => {
        const target = ev.target as HTMLElement | null
        if (!target) return
        const pick = target.closest('[data-hg-pick]') as HTMLElement | null
        if (pick?.dataset.hgPick) {
          ;(map as { closePopup: () => void }).closePopup()
          if (propsRef.current.point) setPickedId(pick.dataset.hgPick)
          return
        }
        if (target.closest('[data-hg-zoom]') && activeCluster) {
          ;(map as unknown as { closePopup: () => void; fitBounds: (b: unknown) => void }).fitBounds(
            activeCluster.getBounds().pad(0.35),
          )
          ;(map as { closePopup: () => void }).closePopup()
        }
      }
      containerRef.current?.addEventListener('click', onPickerClick)

      // Debug overlay: zoom + clustered/visible hospital counts. Reads the
      // cluster plugin's internal _featureGroup (what is DISPLAYED right
      // now: clusters carry getChildCount, plain markers don't). Updated on
      // zoom, recluster, and every redraw — imperative text, no re-render.
      const updateDebug = () => {
        const el = debugRef.current
        if (!el) return
        const fg = (cluster as unknown as {
          _featureGroup?: { eachLayer: (fn: (l: unknown) => void) => void }
        })._featureGroup
        let visibleCount = 0
        let clusteredCount = 0
        let bubbleCount = 0
        if (fg) {
          fg.eachLayer((l) => {
            const c = l as { getChildCount?: () => number }
            if (typeof c.getChildCount === 'function') {
              bubbleCount++
              clusteredCount += c.getChildCount()
            } else {
              visibleCount++
            }
          })
        } else {
          // Plugin internals changed: degrade to totals, don't lie.
          visibleCount = propsRef.current.visible.length
        }
        el.textContent = mapDebugText({
          zoom: (map as { getZoom: () => number }).getZoom(),
          clustered: clusteredCount,
          visible: visibleCount,
          bubbles: bubbleCount,
        })
      }
      const mapOn = map as unknown as {
        on: (type: string, fn: () => void) => void
        off: (type: string, fn: () => void) => void
      }
      const clusterOn = cluster as unknown as {
        on: (type: string, fn: () => void) => void
        off: (type: string, fn: () => void) => void
      }
      mapOn.on('zoomend', updateDebug)
      clusterOn.on('clusteringend', updateDebug)
      clusterOn.on('animationend', updateDebug)

      const pin = (color: string) =>
        L.divIcon({
          className: 'hg-marker',
          html: `<span class="hg-marker__pin" style="background:${color}"></span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          popupAnchor: [0, -10],
        })

      const renderMarkers = () => {
        const layers = layersRef.current as {
          patientLayer: { clearLayers: () => void; addLayer: (l: unknown) => void }
          cluster: { clearLayers: () => void; addLayer: (l: unknown) => void }
        } | null
        if (!layers) return
        layers.patientLayer.clearLayers()
        // Clear the cluster group too: without this, every redraw (e.g. the
        // dashboard's 1 s golden-hour tick, whose `visible` array is a new
        // identity) would pile duplicate markers into the group — duplicating
        // pins and exploding the cluster picker list.
        layers.cluster.clearLayers()

        for (const h of propsRef.current.visible) {          const isSelected = h.id === propsRef.current.selectedHospitalId
          const isPicked = h.id === propsRef.current.pickedId && !!propsRef.current.point
          const marker = L.marker([h.location.lat, h.location.lng], {
            icon: pin(isSelected ? 'var(--emergency)' : isPicked ? '#1d4ed8' : 'var(--brand)'),
            title: h.name,
            keyboard: false,
          })
          // Cluster picker data: lets the clusterclick handler list this
          // hospital by name and lets bubbles highlight when selected.
          ;(marker.options as Record<string, unknown>).hospital = { id: h.id, name: h.name, area: h.area }
          marker.bindPopup(
            `<strong>${h.name}</strong><br/>${h.area}, Nagpur<br/>` +
              `<a href="https://www.google.com/maps?q=${h.location.lat},${h.location.lng}" ` +
              `target="_blank" rel="noreferrer">Open in Google Maps ↗</a>`,
          )
          // Clickable directions: picking a marker (when the patient origin
          // is known) draws the blue route + opens the ETA panel.
          marker.on('click', () => {
            if (propsRef.current.point) setPickedId(h.id)
          })
          layers.cluster.addLayer(marker)
        }

        const p = propsRef.current.point
        if (p) {
          const you = L.marker([p.lat, p.lng], {
            icon: pin('#2f80ed'),
            title: 'Patient location',
            keyboard: false,
          })
          you.bindPopup('<strong>Patient location</strong>')
          layers.patientLayer.addLayer(you)
        }

        // Fit the view: all markers if any, else the Nagpur city centre.
        const pts: Array<[number, number]> = [
          ...propsRef.current.visible.map((h) => [h.location.lat, h.location.lng] as [number, number]),
          ...(p ? [[p.lat, p.lng] as [number, number]] : []),
        ]
        if (pts.length > 1) {
          ;(map as { fitBounds: (b: unknown, o?: unknown) => void }).fitBounds(L.latLngBounds(pts).pad(0.35))
        } else if (pts.length === 1) {
          ;(map as { setView: (c: [number, number], z: number) => void }).setView(pts[0], 14)
        } else {
          ;(map as { setView: (c: [number, number], z: number) => void }).setView(
            [NAGPUR_CENTER.lat, NAGPUR_CENTER.lng],
            12,
          )
        }
      }

      /** Route polyline + moving ambulance marker; redrawn on each tick. */
      const renderRoute = () => {
        const rl = routeLayerRef.current as { clearLayers: () => void; addLayer: (l: unknown) => void } | null
        if (!rl) return
        rl.clearLayers()

        // Clickable-directions line (blue, solid) — patient → picked hospital.
        const dir = propsRef.current.directions
        if (dir && dir.points.length > 1) {
          const dirLine = L.polyline(
            dir.points.map((pt) => [pt.lat, pt.lng] as [number, number]),
            { color: 'var(--info)', weight: 5, opacity: 0.9, lineCap: 'round' },
          )
          dirLine.bindPopup(
            `<strong>DIRECTIONS</strong><br/>≈ ${dir.distanceKm} km · ~${dir.durationMin} min driving<br/>` +
              `<span style="color:#6d8494">Live road routing via OSRM — no traffic data.</span>`,
          )
          rl.addLayer(dirLine)
        }

        const route = propsRef.current.path
        const truck = propsRef.current.ambulancePos
        if (!route || route.points.length < 2 || !truck) return

        const latlngs = route.points.map((pt) => [pt.lat, pt.lng] as [number, number])
        const line = L.polyline(latlngs, {
          color: 'var(--emergency)',
          weight: 4,
          opacity: 0.85,
          dashArray: '8 10',
          lineCap: 'round',
        })
        line.bindPopup('<strong>SIMULATED ambulance route</strong><br/>Road geometry via OSRM — movement is demo animation, not live GPS.')
        rl.addLayer(line)

        const truckIcon = L.divIcon({
          className: 'hg-marker hg-marker--ambulance',
          html: '<span class="hg-marker__truck" title="Ambulance (simulated position)">🚑</span>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          popupAnchor: [0, -14],
        })
        const truckMarker = L.marker([truck.lat, truck.lng], { icon: truckIcon, keyboard: false, zIndexOffset: 500 })
        truckMarker.bindPopup('<strong>Ambulance (SIMULATED position)</strong><br/>Animating along the OSRM route for the demo — no live GPS feed.')
        rl.addLayer(truckMarker)
      }

      renderMarkers()
      renderRoute()

      // Two event channels: full marker/route rebuild vs cheap truck move.
      const redraw = () => {
        renderMarkers()
        renderRoute()
        updateDebug() // counts change when the prop set itself changes
      }
      const routeTick = () => renderRoute()
      containerRef.current?.addEventListener('hg-map-redraw', redraw)
      containerRef.current?.addEventListener('hg-map-retheme', applyTiles)
      containerRef.current?.addEventListener('hg-route-tick', routeTick)

      // Invalidate size after layout settles (cards/animations can shift it).
      setTimeout(() => (map as { invalidateSize: () => void }).invalidateSize(), 150)
      updateDebug() // initial overlay text (markers render before this)

      cleanup = () => {
        containerRef.current?.removeEventListener('hg-map-redraw', redraw)
        containerRef.current?.removeEventListener('hg-map-retheme', applyTiles)
        containerRef.current?.removeEventListener('hg-route-tick', routeTick)
        containerRef.current?.removeEventListener('click', onPickerClick)
        mapOn.off('zoomend', updateDebug)
        clusterOn.off('clusteringend', updateDebug)
        clusterOn.off('animationend', updateDebug)
        ;(map as { remove: () => void }).remove()
        mapRef.current = null
        layersRef.current = null
        routeLayerRef.current = null
        tileRef.current = null
      }
    })()

    return () => {
      disposed = true
      cleanup?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-render layers when props/state change (imperative bridge).
  useEffect(() => {
    containerRef.current?.dispatchEvent(new CustomEvent('hg-map-redraw'))
  }, [visible, selectedHospitalId, point, pickedId, directions])

  // The truck tick fires ONLY the cheap route-layer redraw — rebuilding the
  // cluster group every 200 ms would close any open picker popup and churn.
  useEffect(() => {
    containerRef.current?.dispatchEvent(new CustomEvent('hg-route-tick'))
  }, [path, ambulancePos])

  // Theme flips swap the tile layer in place (no map recreation).
  useEffect(() => {
    containerRef.current?.dispatchEvent(new CustomEvent('hg-map-retheme'))
  }, [theme])

  const clearDirections = () => setPickedId(null)

  return (
    <div className="hospital-map" role="application" aria-label="Interactive map of patient and hospital locations">
      <div ref={containerRef} className="hospital-map__canvas" />

      {/* Tiny debug overlay: zoom + clustered/visible counts. */}
      <div ref={debugRef} className="map-debug" aria-hidden="true" />

      {/* Clickable-directions panel: live OSRM numbers for the picked hospital. */}
      {picked && point && (directions || directionsLoading) && (
        <div className="directions-panel" role="status">
          {directionsLoading && !directions ? (
            <span className="faint">Measuring route…</span>
          ) : directions ? (
            <>
              <span className="directions-panel__eta">
                <strong>🧭 {picked.name}</strong> · ≈ {directions.distanceKm} km · ~{directions.durationMin} min
              </span>
              <span className="faint directions-panel__note">live OSRM · no traffic</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={clearDirections}>
                Clear
              </button>
            </>
          ) : (
            <>
              <span className="faint">Route unavailable right now.</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={clearDirections}>
                Clear
              </button>
            </>
          )}
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
        {directions && (
          <span>
            <i className="map-legend__directions" /> Directions
          </span>
        )}
        {path && (
          <span>
            <i className="map-legend__route" /> 🚑 Route (simulated)
          </span>
        )}
      </div>
    </div>
  )
}
