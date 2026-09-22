import { Link } from 'react-router-dom'

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
        </nav>
        <Link to="/emergency/new" className="header-emergency">
          <span aria-hidden="true">🚨</span> Emergency
        </Link>
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
          Commit 1 — MVP foundation: emergency reporting, hospital discovery, case tracking.
        </span>
        <span className="faint">Ambulance · Blood bank · AI assistant — coming in later commits.</span>
      </div>
    </footer>
  )
}
