import type { EmergencyCase } from '../models/types'
import { explainAllocation } from '../services/resourceAllocationService'

/**
 * Shows the deterministic allocation plan for a case: coordination order
 * plus the explainable reasons behind each resource choice.
 * Coordination logic only — no clinical advice is displayed or implied.
 */
export function AllocationPanel({ caseRecord }: { caseRecord: EmergencyCase }) {
  const notes = explainAllocation(caseRecord)

  return (
    <section className="card" aria-label="Resource allocation explanation">
      <div className="section-head" style={{ marginBottom: '0.6rem' }}>
        <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Why these resources?</h2>
        <span className="faint">Deterministic coordination — no clinical advice.</span>
      </div>

      {notes.map((note, i) => (
        <div key={i} style={{ marginBottom: '0.8rem' }}>
          <p style={{ fontWeight: 700, margin: '0.2rem 0' }}>{note.title}</p>
          {note.reasons.length > 0 && (
            <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.2rem' }}>
              {note.reasons.map((r) => (
                <li key={r.key} className="muted" style={{ fontSize: '0.88rem' }}>
                  {r.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  )
}
