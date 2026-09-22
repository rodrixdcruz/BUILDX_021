import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Header, Footer } from './components/Header'
import { HomePage } from './pages/HomePage'
import { EmergencyFormPage } from './pages/EmergencyFormPage'
import { ConfirmationPage } from './pages/ConfirmationPage'
import { HospitalsPage } from './pages/HospitalsPage'
import { HospitalDetailPage } from './pages/HospitalDetailPage'
import { CasesPage } from './pages/CasesPage'
import { CaseDashboardPage } from './pages/CaseDashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'

export default function App() {
  // Keyed by the case list; bumping it refreshes counts across pages.
  const [casesVersion, setCasesVersion] = useState(0)

  return (
    <BrowserRouter>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        <div className="page">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/emergency/new"
              element={<NewEmergency onCaseCountChanged={() => setCasesVersion((v) => v + 1)} />}
            />
            <Route path="/emergency/confirmed/:id" element={<ConfirmationPage />} />
            <Route path="/hospitals" element={<HospitalsPage />} />
            <Route path="/hospitals/:id" element={<HospitalDetailPage />} />
            <Route path="/cases" element={<CasesPage key={casesVersion} />} />
            <Route path="/cases/:id" element={<CaseDashboardPage />} />
            <Route path="/index.html" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
      <Footer />
    </BrowserRouter>
  )
}

/** Wraps the form so a successful submission navigates to the confirmation page. */
function NewEmergency({ onCaseCountChanged }: { onCaseCountChanged: () => void }) {
  const navigate = useNavigate()
  return (
    <EmergencyFormPage
      onCaseCreated={(id) => {
        onCaseCountChanged()
        navigate(`/emergency/confirmed/${id}`)
      }}
    />
  )
}
