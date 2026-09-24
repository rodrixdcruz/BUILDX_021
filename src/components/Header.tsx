import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getThemeChoice,
  setThemeChoice,
  type ResolvedTheme,
  subscribeTheme,
} from '../services/themeService'

const NEXT_CHOICE: Record<string, 'light' | 'dark' | 'system'> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}

const CHOICE_LABEL: Record<string, string> = {
  light: 'Light theme (click for dark)',
  dark: 'Dark theme (click for system)',
  system: 'System theme (click for light)',
}

/**
 * Theme toggle button — cycles light → dark → system. Shows the RESOLVED
 * theme (what you actually see), not just the choice; `system` is marked
 * with an A so the manual override is discoverable.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState(getThemeChoice)
  const [resolved, setResolved] = useState<ResolvedTheme>('light')

  useEffect(() => subscribeTheme(setResolved), [])

  const icon = resolved === 'dark' ? '🌙' : '☀️'
  const suffix = choice === 'system' ? 'A' : ''

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        const next = NEXT_CHOICE[choice]
        setChoice(next)
        setThemeChoice(next)
      }}
      aria-label={CHOICE_LABEL[choice]}
      title={CHOICE_LABEL[choice]}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="sr-only">Theme: {choice === 'system' ? `system (${resolved})` : resolved}</span>
      {suffix && (
        <span className="theme-toggle__auto" aria-hidden="true">
          {suffix}
        </span>
      )}
    </button>
  )
}

export function Header() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="brand" aria-label="Nagpur HealthGrid home">
          <span className="brand__mark" aria-hidden="true">+</span>
          <span>
            <span className="brand__name">Nagpur HealthGrid</span>
            <span className="brand__tag">One emergency. One coordinated response.</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link to="/">Home</Link>
          <Link to="/hospitals">Hospitals</Link>
          <Link to="/emergency/new">Report Emergency</Link>
          <Link to="/cases">My Cases</Link>
          <Link to="/surge">Surge</Link>
        </nav>
        <div className="site-header__actions">
          <ThemeToggle />
          <Link to="/emergency/new" className="header-emergency">
            <span aria-hidden="true">🚨</span> Emergency
          </Link>
        </div>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <span>
          <strong>Nagpur HealthGrid</strong> — hackathon MVP. Hospital &amp; bed availability shown
          is <strong>DEMO / SIMULATED</strong>, not real-time.
        </span>
        <span>
          For real emergencies in India, call <strong>112</strong> / <strong>108</strong>.
        </span>
      </div>
      <div className="site-footer__inner" style={{ paddingTop: 0 }}>
        <span className="faint">
          Emergency Case Orchestration: reporting · triage buckets · ambulance · hospital &amp; overflow · blood ·
          golden hour · offline fallback.
        </span>
        <span className="faint">All availability data is demo/simulated. No real-time feeds are integrated.</span>
      </div>
    </footer>
  )
}
