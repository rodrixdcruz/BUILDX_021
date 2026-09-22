import type { EmergencyCase, EmergencyType, GeoPoint, TriageCategory } from '../models/types'
import { NAGPUR_AREAS } from '../constants/emergency'
import { getAllCases, createEmergencyCase, saveCase, formatDistance, haversineKm } from './emergencyService'
import { getHospitals } from './hospitalService'
import { loadFleetState, isDispatchable } from './ambulanceService'
import { searchBloodBanks, matchBloodBank, ALL_BLOOD_GROUPS } from './bloodBankService'
import { getFacilities, hospitalReportedCapacity, isReceiving } from './facilityService'
import type { BloodGroup } from '../models/types'

/**
 * HealthGrid AI Assistant — Commit 3.
 *
 * A LOCAL, rule-based coordination assistant grounded ONLY in application
 * data (demo hospitals, demo fleet, demo blood banks, stored cases).
 *
 * ⚠️ Scope guards, enforced throughout:
 * - No paid or external AI APIs are used; everything runs locally.
 * - The assistant NEVER diagnoses, prescribes or gives medical advice.
 * - It never invents data: when information is missing it says so.
 * - It supports coordinators; the coordinator retains final control.
 */

export const ASSISTANT_DISCLAIMER =
  'Coordination support based on app/demo data only — not medical advice. A human coordinator makes all final decisions.'

export interface QuickAction {
  id: string
  label: string
  prompt: string
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'report', label: '🚨 Report Emergency', prompt: 'Report a new emergency' },
  { id: 'ambulance', label: '🚑 Find Ambulance', prompt: 'Find an available ambulance' },
  { id: 'hospital', label: '🏥 Find Hospital', prompt: 'Which hospital can receive this case?' },
  { id: 'blood', label: '🩸 Find Blood Support', prompt: 'Find blood support' },
  { id: 'status', label: '📋 Check Case Status', prompt: 'Check case status' },
  { id: 'why', label: '💡 Explain Recommendation', prompt: 'Why did you recommend this hospital?' },
  { id: 'surge', label: '📊 Surge Summary', prompt: 'What is happening right now?' },
]

// ---------------------------------------------------------------------------
// Natural-language emergency reporting (rule-based extraction)
// ---------------------------------------------------------------------------

export interface ExtractedReport {
  emergencyType: EmergencyType
  location: string | null
  assistance: string[]
  /** Reporter-stated urgency mapped to the app's priority scale. */
  priority: 'Emergency' | 'High' | 'Normal'
  triage: TriageCategory
  bloodGroup: BloodGroup | null
  rawText: string
}

const TYPE_KEYWORDS: Array<{ type: EmergencyType; words: string[] }> = [
  { type: 'Accident', words: ['accident', 'crash', 'collision', 'rammed', 'overturn', 'highway smash'] },
  { type: 'Cardiac Emergency', words: ['cardiac', 'heart attack', 'chest pain', 'cardiopulmonary', 'cpr'] },
  { type: 'Breathing Problem', words: ['breathing', 'breathless', 'choking', 'suffocat', 'asthma', 'gas leak'] },
  { type: 'Unconscious Patient', words: ['unconscious', 'collapsed', 'not responding', 'fainted', 'passed out'] },
  { type: 'Injury', words: ['injured', 'injury', 'wound', 'bleeding', 'fracture', 'burn', 'hurt'] },
]

const ASSISTANCE_KEYWORDS: Array<{ label: string; words: string[] }> = [
  { label: 'Ambulance', words: ['ambulance', '108', 'transport'] },
  { label: 'Hospital bed', words: ['bed', 'icu', 'hospital', 'admission'] },
  { label: 'Blood support', words: ['blood', 'o-negative', 'o+', 'o-', 'a+', 'a-', 'b+', 'b-', 'ab+', 'ab-', 'transfusion'] },
]

const EMERGENCY_WORDS = ['critical', 'dying', 'severe', 'immediately', 'right now', 'emergency']
const NORMAL_WORDS = ['minor', 'normal', 'not urgent', 'whenever', 'non-urgent']

const GROUP_RE = /\b(AB|A|B|O)\s?([+-])(?![a-zA-Z0-9])/i

/** Extracts a structured draft from free text. Pure string rules — no AI API. */
export function parseEmergencyReport(text: string): ExtractedReport {
  const t = text.toLowerCase()

  let emergencyType: EmergencyType = 'Other'
  for (const { type, words } of TYPE_KEYWORDS) {
    if (words.some((w) => t.includes(w))) {
      emergencyType = type
      break
    }
  }

  const location = NAGPUR_AREAS.find((a) => t.includes(a.toLowerCase())) ?? null

  const assistance = ASSISTANCE_KEYWORDS.filter(({ words }) => words.some((w) => t.includes(w))).map(
    ({ label }) => label,
  )

  const groupMatch = GROUP_RE.exec(text)
  const bloodGroup = groupMatch ? ((groupMatch[1].toUpperCase() + groupMatch[2]) as BloodGroup) : null

  let priority: ExtractedReport['priority']
  if (EMERGENCY_WORDS.some((w) => t.includes(w))) priority = 'Emergency'
  else if (NORMAL_WORDS.some((w) => t.includes(w))) priority = 'Normal'
  else priority = 'High' // emergencies default to High — never downgrade silently

  const triage: TriageCategory =
    priority === 'Emergency' ? 'CRITICAL' : priority === 'High' ? 'URGENT' : 'NON_URGENT'

  return { emergencyType, location, assistance, priority, triage, bloodGroup, rawText: text }
}

/** Confirmation draft the UI shows before creating a case (user stays in control). */
export interface ReportDraft {
  emergencyType: EmergencyType
  location: string
  assistance: string
  priority: 'Emergency' | 'High' | 'Normal'
  triage: TriageCategory
  bloodGroup?: BloodGroup
  /** Original free text, stored on the case description for the audit trail. */
  rawText: string
}

export function draftFromText(text: string): ReportDraft {
  const e = parseEmergencyReport(text)
  return {
    emergencyType: e.emergencyType,
    location: e.location ?? 'Unspecified — please confirm',
    assistance: e.assistance.length > 0 ? e.assistance.join(', ') : 'Assessment on arrival',
    priority: e.priority,
    triage: e.triage,
    bloodGroup: e.bloodGroup ?? undefined,
    rawText: text,
  }
}

/** Creates the case ONLY after the user explicitly confirms the draft. */
export function createCaseFromDraft(draft: ReportDraft, point?: GeoPoint): EmergencyCase {
  const created = createEmergencyCase({
    patientName: 'Unverified — AI-assisted report',
    age: '0',
    emergencyType: draft.emergencyType,
    contactNumber: '0000000000',
    location: draft.location,
    locationPoint: point,
    description: `Reported via HealthGrid AI Assistant: "${draft.rawText}" · Assistance: ${draft.assistance}`,
    priority: draft.priority,
    requiredBloodGroup: draft.bloodGroup ?? '',
  })
  saveCase(created)
  return created
}

// ---------------------------------------------------------------------------
// Grounded question answering
// ---------------------------------------------------------------------------

export interface AssistantAnswer {
  answer: string
  bullets: string[]
  followUp?: string
}

const has = (t: string, words: string[]) => words.some((w) => t.includes(w))

function surgeSummary(): AssistantAnswer {
  const cases = getAllCases()
  const active = cases.filter((c) => c.status !== 'Closed')
  const byTriage = (cat: TriageCategory) => active.filter((c) => (c.triage ?? 'NON_URGENT') === cat).length
  const fleet = loadFleetState()
  const hospitals = getHospitals()
  const full = hospitals.filter((h) => hospitalReportedCapacity(h.id).status === 'Full')
  const pending = active.filter((c) => c.ambulance.status !== 'Assigned')

  const bullets = [
    `${active.length} active case(s): ${byTriage('CRITICAL')} critical, ${byTriage('URGENT')} urgent, ${byTriage('NON_URGENT')} non-urgent (demo triage).`,
    `Ambulances: ${fleet.filter(isDispatchable).length} available, ${fleet.filter((a) => a.status === 'Assigned').length} assigned (simulated fleet).`,
    `Hospitals: ${hospitals.length - full.length} reporting availability, ${full.length} at capacity (reported demo data).`,
  ]
  if (pending.length > 0) {
    bullets.push(`${pending.length} case(s) still waiting for an ambulance assignment.`)
  }
  if (full.length > 0) {
    bullets.push(`Overflow alternatives available at: ${getFacilities().filter(isReceiving).slice(0, 3).map((f) => f.name).join(', ')}.`)
  }
  bullets.push('You retain final control over all assignments.')

  return { answer: `Surge snapshot (demo data, ${new Date().toLocaleTimeString()}):`, bullets }
}

function hospitalRecommendation(c: EmergencyCase | null): AssistantAnswer {
  const hospitals = getHospitals().filter((h) => h.emergencyAvailable && h.beds.ICU && h.beds.ICU.available > 0)
  if (hospitals.length === 0) {
    return { answer: 'No hospital in the demo network currently reports free ICU capacity.', bullets: [] }
  }
  const from = c?.locationPoint ?? null
  const ranked = hospitals
    .map((h) => {
      const km = from ? haversineKm(from, h.location) : null
      const cap = hospitalReportedCapacity(h.id)
      return { h, km, cap }
    })
    .sort((a, b) => (b.h.beds.ICU?.available ?? 0) - (a.h.beds.ICU?.available ?? 0) || (a.km ?? 999) - (b.km ?? 999))
    .slice(0, 3)

  return {
    answer: c
      ? `For case ${c.id} (${c.emergencyType}, ${c.priority}), top receiving hospitals (reported demo capacity):`
      : 'Hospitals currently best placed to receive a case (reported demo capacity):',
    bullets: ranked.map(({ h, km, cap }) =>
      `${h.name} — ${cap.status} · ${km !== null ? formatDistance(km) : h.area} · ICU ${h.beds.ICU?.available ?? 0} free`,
    ),
    followUp: 'Reported/demo data — confirm by phone before transport.',
  }
}

function explainHospitalChoice(c: EmergencyCase | null): AssistantAnswer {
  if (!c || c.hospital.status !== 'Selected' || !c.hospital.hospitalId) {
    return { answer: 'No hospital has been selected on a case yet, so there is nothing to explain.', bullets: [] }
  }
  const h = getHospitals().find((x) => x.id === c.hospital.hospitalId)
  if (!h) return { answer: 'The selected hospital is no longer in the demo network.', bullets: [] }
  const cap = hospitalReportedCapacity(h.id)
  const km = c.locationPoint ? haversineKm(c.locationPoint, h.location) : null

  return {
    answer: `Why ${h.name} was recommended for case ${c.id} (factors, in order):`,
    bullets: [
      `Reported availability: ${cap.status} — ${cap.bedsAvailable}/${cap.bedsTotal} beds free (demo).`,
      `Distance: ${km !== null ? formatDistance(km) : h.area} — estimated route, not live traffic.`,
      'Emergency capability: 24x7 emergency department supported.',
      'Current allocation/load: scored together with capacity so cases spread across facilities.',
      'Selection is deterministic (same inputs → same hospital). Priority affected coordination order only — never clinical urgency.',
    ],
    followUp: ASSISTANT_DISCLAIMER,
  }
}

function ambulanceStatus(): AssistantAnswer {
  const fleet = loadFleetState()
  const available = fleet.filter(isDispatchable)
  return {
    answer: `Demo fleet status: ${available.length} available, ${fleet.filter((a) => a.status === 'Assigned').length} assigned, ${fleet.filter((a) => a.status === 'Busy').length} busy, ${fleet.filter((a) => a.status === 'Offline').length} offline (simulated — no live GPS).`,
    bullets: available.slice(0, 4).map((a) => `${a.callSign} (${a.vehicleType}) based in ${a.baseArea}`),
    followUp: available.length > 0 ? 'Deterministic match happens on each case dashboard via the dispatch step.' : undefined,
  }
}

function bloodSupport(question: string, c: EmergencyCase | null): AssistantAnswer {
  const group = c?.requiredBloodGroup ?? (GROUP_RE.exec(question)?.[0]?.replace(/\s/g, '').toUpperCase() as BloodGroup | undefined)
  if (!group || !ALL_BLOOD_GROUPS.includes(group)) {
    return {
      answer: 'Which blood group do you need? I can check demo stock for any of: ' + ALL_BLOOD_GROUPS.join(', ') + '.',
      bullets: [],
    }
  }
  const banks = searchBloodBanks({ group, minUnits: 1 })
  if (banks.length === 0) {
    return { answer: `No ${group} stock found in the demo blood-bank network.`, bullets: [] }
  }
  const { bank } = c
    ? matchBloodBank(c)
    : { bank: searchBloodBanks({ group, minUnits: 1 })[0] ?? null }
  return {
    answer: `${group} availability (simulated inventory):`,
    bullets: banks.slice(0, 4).map((b) => `${b.name} — ${b.unitsAvailable} unit(s)${b.distanceText ? ` · ${b.distanceText}` : ''}`),
    followUp: bank ? `Deterministic pick: ${bank.name} — confirm by phone; reservations here are demo-only.` : undefined,
  }
}

function caseStatus(question: string): AssistantAnswer {
  const idMatch = /NGP-\d+/i.exec(question)
  const cases = getAllCases()
  if (idMatch) {
    const c = cases.find((x) => x.id.toLowerCase() === idMatch[0].toLowerCase())
    if (!c) return { answer: `I have no case ${idMatch[0]} in this browser's storage.`, bullets: [] }
    return {
      answer: `Case ${c.id} — ${c.emergencyType} at ${c.location}, priority ${c.priority} (demo triage: ${c.triage ?? '—'}):`,
      bullets: [
        `Hospital: ${c.hospital.status}${c.hospital.hospitalName ? ` (${c.hospital.hospitalName})` : ''}`,
        `Bed: ${c.bed.status}${c.bed.category ? ` · ${c.bed.category}` : ''}`,
        `Ambulance: ${c.ambulance.status}${c.ambulance.callSign ? ` (${c.ambulance.callSign})` : ''}`,
        `Blood: ${c.blood.status}${c.blood.bloodGroup ? ` (${c.blood.bloodGroup})` : ''}`,
      ],
    }
  }
  const active = cases.filter((c) => c.status !== 'Closed')
  if (active.length === 0) return { answer: 'No active cases in this browser. Report one via the emergency form.', bullets: [] }
  return {
    answer: `${active.length} active case(s) in this browser:`,
    bullets: active.slice(0, 5).map((c) => `${c.id} · ${c.emergencyType} · ${c.priority} · hospital ${c.hospital.status}`),
    followUp: 'Open My Cases for the full dashboard.',
  }
}

function overflowAlternativesAnswer(): AssistantAnswer {
  const full = getHospitals().filter((h) => hospitalReportedCapacity(h.id).status === 'Full')
  if (full.length === 0) {
    return { answer: 'No hospital in the demo network is currently reporting FULL capacity.', bullets: [] }
  }
  const alts = getFacilities().filter(isReceiving).slice(0, 4)
  return {
    answer: `${full.map((h) => h.name).join(', ')} report FULL (demo). Alternatives in the partner network:`,
    bullets: alts.map((f) => `${f.name} — ${f.reportedCapacity} · load ${f.loadPercent}% (${f.kind})`),
    followUp: 'Reported/demo availability — confirm by phone.',
  }
}

/** Main entry: answer a coordinator question using ONLY application data. */
export function answerQuestion(question: string, context: EmergencyCase | null): AssistantAnswer {
  const t = question.toLowerCase()

  if (has(t, ['what is happening', 'surge', 'summary', 'overview', 'situation'])) return surgeSummary()
  if (has(t, ['full', 'overflow', 'alternatives'])) return overflowAlternativesAnswer()
  if (has(t, ['why']) && has(t, ['hospital', 'recommend'])) return explainHospitalChoice(context)
  if (has(t, ['status', 'case ngp', 'ngp-'])) return caseStatus(question)
  if (has(t, ['ambulance', 'fleet', 'dispatch'])) return ambulanceStatus()
  if (has(t, ['blood'])) return bloodSupport(question, context)
  if (has(t, ['hospital', 'receive', 'recommend', 'find hospital'])) return hospitalRecommendation(context)

  return {
    answer: 'I can help with: hospital capacity, ambulance fleet status, blood availability, case status, surge summary, overflow alternatives and explaining recommendations.',
    bullets: QUICK_ACTIONS.slice(1).map((q) => q.label),
    followUp: ASSISTANT_DISCLAIMER,
  }
}
