import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui'

export function NotFoundPage() {
  return (
    <div className="page page--narrow">
      <h1>Page not found</h1>
      <EmptyState icon="🧭" title="This route does not exist">
        <p className="muted">The page you requested is not part of Nagpur HealthGrid.</p>
        <Link to="/" className="btn btn--primary" style={{ marginTop: '0.6rem' }}>
          Back to home
        </Link>
      </EmptyState>
    </div>
  )
}
