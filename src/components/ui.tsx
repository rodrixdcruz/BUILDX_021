import type { ReactNode } from 'react'
import type { EmergencyPriority } from '../models/types'
import { haversineKm, formatDistance } from '../services/emergencyService'
import type { GeoPoint } from '../models/types'

/** Colored chip for hospital availability / status. */
export function AvailabilityChip({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={`chip ${ok ? 'chip--ok' : 'chip--danger'}`}>
      <span aria-hidden="true">{ok ? '●' : '○'}</span> {children}
    </span>
  )
}

/** Colored badge for emergency priority. */
export function PriorityBadge({ priority }: { priority: EmergencyPriority }) {
  return <span className={`badge badge--${priority}`}>{priority}</span>
}

/** Small persistent notice marking simulated data. */
export function DemoNotice({ children }: { children?: ReactNode }) {
  return (
    <p className="demo-note">
      <span aria-hidden="true">⚠️</span>
      <span>{children ?? 'DEMO DATA — bed availability is simulated for this hackathon MVP, not real-time.'}</span>
    </p>
  )
}

/** Loading block with spinner + label. */
export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  )
}

/** Friendly empty state. */
export function EmptyState({
  icon = '🗂️',
  title,
  children,
}: {
  icon?: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      {children}
    </div>
  )
}

/** Error banner with optional retry. */
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="error-banner" role="alert">
      <span aria-hidden="true">⚠️</span>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0 }}>{message}</p>
        {onRetry && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={onRetry} style={{ marginTop: '0.5rem' }}>
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

/** Renders a formatted haversine distance between two points, or a dash. */
export function DistanceLabel({ from, to }: { from: GeoPoint | null; to: GeoPoint }) {
  if (!from) return <span className="faint">—</span>
  return <strong>{formatDistance(haversineKm(from, to))}</strong>
}
