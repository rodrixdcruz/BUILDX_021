import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { EmergencyCase } from '../models/types'
import {
  QUICK_ACTIONS,
  ASSISTANT_DISCLAIMER,
  draftFromText,
  createCaseFromDraft,
  answerQuestion,
  type ReportDraft,
} from '../services/assistantService'
import { getCase } from '../services/emergencyService'
import type { AssistantAnswer } from '../services/assistantService'

/**
 * HealthGrid AI Assistant dock — Commit 3.
 *
 * Floating panel, keyboard accessible, grounded ONLY in app data. The
 * assistant NEVER diagnoses or advises medically; every answer carries the
 * disclaimer and the coordinator confirms before any case is created.
 */

interface ChatMessage {
  id: number
  from: 'user' | 'assistant'
  text: string
  bullets?: string[]
  followUp?: string
  draft?: ReportDraft
}

let nextId = 1

export function AssistantDock({ context }: { context: EmergencyCase | null }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pendingDraft, setPendingDraft] = useState<ReportDraft | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const location = useLocation()

  const push = (m: Omit<ChatMessage, 'id'>) => setMessages((prev) => [...prev, { ...m, id: nextId++ }])

  /**
   * Case context is derived at send time from the URL (e.g. /cases/NGP-1005)
   * so questions like "why did you recommend this hospital?" work on a case
   * dashboard even though the dock mounts app-wide with a null context.
   */
  const contextCase = (): EmergencyCase | null => {
    const m = /\/cases\/(NGP-\d+)/i.exec(location.pathname)
    if (!m) return context
    return context ?? getCase(m[1].toUpperCase())
  }

  useEffect(() => {
    if (open && messages.length === 0) {
      push({
        from: 'assistant',
        text: 'HealthGrid AI Assistant — coordination support grounded in this app\'s demo data.',
        bullets: [
          'Try: "There has been an accident near Sitabuldi, my father is injured and we need an ambulance"',
          'Or ask: which hospital can receive this case? / what is happening right now?',
        ],
        followUp: ASSISTANT_DISCLAIMER,
      })
    }
  }, [open, messages.length])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, pendingDraft])

  const send = (raw?: string) => {
    const text = (raw ?? input).trim()
    if (!text) return
    setInput('')
    push({ from: 'user', text })
    setCreatedId(null)

    // If a draft is pending, only confirm/cancel words act on it.
    if (pendingDraft) {
      const t = text.toLowerCase()
      if (t.includes('confirm') || t === 'yes' || t.includes('create')) {
        const created = createCaseFromDraft(pendingDraft)
        setPendingDraft(null)
        setCreatedId(created.id)
        push({
          from: 'assistant',
          text: `CASE CREATED — ${created.id}. Open the dashboard to coordinate hospital, ambulance, bed and blood.`,
        })
        return
      }
      if (t.includes('cancel') || t === 'no' || t.includes('discard')) {
        setPendingDraft(null)
        push({ from: 'assistant', text: 'Draft discarded — nothing was created.' })
        return
      }
    }

    // Natural-language report detection → draft (requires explicit confirmation).
    const reportish =
      text.split(/\s+/).length >= 4 &&
      /(accident|injur|cardiac|heart|breath|unconscious|collaps|bleed|blood|emergency|ambulance)/i.test(text)
    if (reportish) {
      const draft = draftFromText(text)
      setPendingDraft(draft)
      push({ from: 'assistant', text: 'I extracted an emergency draft from your message. Nothing is created until you confirm.' })
      return
    }

    const answer: AssistantAnswer = answerQuestion(text, contextCase())
    push({ from: 'assistant', text: answer.answer, bullets: answer.bullets, followUp: answer.followUp })
  }

  const confirmDraft = () => {
    if (!pendingDraft) return
    const created = createCaseFromDraft(pendingDraft)
    setPendingDraft(null)
    setCreatedId(created.id)
    push({ from: 'assistant', text: `CASE CREATED — ${created.id}. Open the dashboard to coordinate hospital, ambulance, bed and blood.` })
  }

  return (
    <>
      <button
        type="button"
        className="ai-dock__fab"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="ai-dock-panel"
        aria-label={open ? 'Close HealthGrid AI Assistant' : 'Open HealthGrid AI Assistant'}
      >
        {open ? '✕' : '🤖'}
      </button>

      {open && (
        <section id="ai-dock-panel" className="ai-dock" aria-label="HealthGrid AI Assistant">
          <header className="ai-dock__head">
            <div>
              <h2>HealthGrid AI Assistant</h2>
              <p className="faint">Coordination support · app data only · not medical advice</p>
            </div>
          </header>

          <div className="ai-dock__actions" role="group" aria-label="Quick actions">
            {QUICK_ACTIONS.map((q) => (
              <button key={q.id} type="button" className="chip chip--info ai-dock__chip" onClick={() => send(q.prompt)}>
                {q.label}
              </button>
            ))}
          </div>

          <div className="ai-dock__log" ref={listRef} aria-live="polite">
            {messages.map((m) => (
              <div key={m.id} className={`ai-dock__msg ai-dock__msg--${m.from}`}>
                <p>{m.text}</p>
                {m.bullets && m.bullets.length > 0 && (
                  <ul>
                    {m.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
                {m.followUp && <p className="ai-dock__note">{m.followUp}</p>}
              </div>
            ))}

            {pendingDraft && (
              <div className="ai-dock__msg ai-dock__msg--assistant ai-dock__draft" role="group" aria-label="Confirm emergency draft">
                <h3>CREATE EMERGENCY CASE?</h3>
                <dl className="ai-dock__draft-facts">
                  <div><dt>Emergency type</dt><dd>{pendingDraft.emergencyType}</dd></div>
                  <div><dt>Location</dt><dd>{pendingDraft.location}</dd></div>
                  <div><dt>Assistance</dt><dd>{pendingDraft.assistance}</dd></div>
                  <div><dt>Priority</dt><dd>{pendingDraft.priority} (demo triage: {pendingDraft.triage})</dd></div>
                  {pendingDraft.bloodGroup && <div><dt>Blood group</dt><dd>{pendingDraft.bloodGroup}</dd></div>}
                </dl>
                <p className="faint">Patient name, age and contact are unknown from chat — the coordinator completes them on the case dashboard.</p>
                <div className="ai-dock__draft-actions">
                  <button type="button" className="btn btn--primary btn--sm" onClick={confirmDraft}>
                    CREATE EMERGENCY CASE
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setPendingDraft(null); push({ from: 'assistant', text: 'Draft discarded — nothing was created.' }) }}>
                    Discard
                  </button>
                </div>
              </div>
            )}

            {createdId && (
              <div className="ai-dock__msg ai-dock__msg--assistant">
                <p>
                  <Link to={`/cases/${createdId}`} onClick={() => setOpen(false)}>
                    Open case #{createdId} →
                  </Link>
                </p>
              </div>
            )}
          </div>

          <form
            className="ai-dock__composer"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about capacity, fleet, blood, cases…"
              aria-label="Ask the coordination assistant"
            />
            <button type="submit" className="btn btn--primary btn--sm" disabled={!input.trim()}>
              Ask
            </button>
          </form>
        </section>
      )}
    </>
  )
}
