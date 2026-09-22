/**
 * Nagpur HealthGrid — core domain models.
 *
 * These types are the contract between UI and data services.
 * Commit 2 (ambulance, blood bank, resource allocation) and
 * Commit 3 (AI assistant, smart coordination, real-time comms)
 * should EXTEND these models, not replace them.
 */

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

export interface GeoPoint {
  lat: number
  lng: number
}

// ---------------------------------------------------------------------------
// Hospitals
// ---------------------------------------------------------------------------

export type BedCategory = 'ICU' | 'General' | 'Oxygen'

export interface BedAvailability {
  /** Total capacity for this bed category (demo data). */
  total: number
  /** Currently available count (DEMO/SIMULATED — not live data). */
  available: number
}

export interface Hospital {
  id: string
  name: string
  area: string
  address: string
  location: GeoPoint
  contact: string
  /** 24x7 emergency department available. */
  emergencyAvailable: boolean
  beds: Record<BedCategory, BedAvailability | null>
  facilities: string[]
  /** Government / private / trust — shown as an informational chip. */
  sector: 'Government' | 'Private' | 'Trust'
}

/** Extra facility descriptors for the demo partner network (Commit 3).
 *  Availability here is REPORTED / SIMULATED — never real-time. */
export interface Facility {
  id: string
  name: string
  kind: FacilityKind
  area: string
  location: GeoPoint
  contact?: string
  /** Demo reported status snapshot — not live. */
  reportedCapacity: 'Available' | 'Limited' | 'Full'
  /** Can the facility receive an emergency ambulance handover right now (demo)? */
  emergencyCapability: boolean
  /** Current demo allocation load, 0-100. */
  loadPercent: number
  /** Optional demo stock for camps/centres. */
  bedsTotal?: number
  bedsAvailable?: number
}

export interface SurgeStats {
  total: number
  critical: number
  urgent: number
  nonUrgent: number
  pending: number
  ambulancesAvailable: number
  ambulancesAssigned: number
  hospitalsAvailable: number
  hospitalsFull: number
}

/** SMS fallback message for offline/demo use — never actually transmitted. */
export interface SmsFallbackMessage {
  caseId: string
  text: string
  to: string
  /** Always 'demo' — no SMS provider is integrated. */
  channel: 'demo'
}

// ---------------------------------------------------------------------------
// Emergency cases
// ---------------------------------------------------------------------------

export type EmergencyType =
  | 'Accident'
  | 'Cardiac Emergency'
  | 'Breathing Problem'
  | 'Unconscious Patient'
  | 'Injury'
  | 'Other'

export type EmergencyPriority = 'Emergency' | 'High' | 'Normal'

export type CaseStatus = 'Submitted' | 'Hospital Selected' | 'Bed Confirmed' | 'Closed'

/** Coordination lifecycle for the golden-hour view (Commit 3).
 *  Derived from case state, except the final two, which are explicit. */
export type LifecycleStage =
  | 'Emergency Reported'
  | 'Ambulance Requested'
  | 'Ambulance Assigned'
  | 'Hospital Selected'
  | 'Hospital Notified'
  | 'Patient En Route'
  | 'Arrived'

/** One timestamped entry on the case timeline. */
export interface TimelineEntry {
  /** Stable machine key, e.g. 'reported', 'ambulance-assigned'. */
  key: string
  /** UI label, e.g. 'Emergency reported'. */
  label: string
  /** ISO timestamp of when the stage was reached. */
  at: string
  /** Short demo note, e.g. 'Nagpur-1 (ALS)'. */
  detail?: string
}

/** Commit 3 demo triage category (surge coordination only, NOT clinical). */
export type TriageCategory = 'CRITICAL' | 'URGENT' | 'NON_URGENT'

/** Facility kind for overflow alternatives (demo network, Commit 3). */
export type FacilityKind = 'hospital' | 'healthcare-centre' | 'emergency-camp'

export type HospitalMatchStatus = 'Searching' | 'Selected' | 'Unavailable'
export type BedMatchStatus = 'Checking' | 'Available' | 'Unavailable'
export type ServiceSlot = 'NotAssignedYet' | 'Assigned'

// ---------------------------------------------------------------------------
// Ambulances (Commit 2)
// ---------------------------------------------------------------------------

/** Fleet status of a demo ambulance unit. */
export type AmbulanceStatus = 'Available' | 'Assigned' | 'Busy' | 'Offline'

/** Operational class of the vehicle (descriptive demo data, not a medical claim). */
export type AmbulanceVehicleType = 'ALS' | 'BLS' | 'PTV'

export interface Ambulance {
  id: string
  callSign: string
  vehicleType: AmbulanceVehicleType
  contact: string
  baseArea: string
  location: GeoPoint
  status: AmbulanceStatus
  /** Set when Assigned/Busy — the demo case this unit is attached to. */
  assignedCaseId?: string
}

/** Status of the ambulance step on an emergency case. */
export type AmbulanceStepStatus = 'NotAssignedYet' | 'Searching' | 'Assigned' | 'Unavailable'

// ---------------------------------------------------------------------------
// Blood banks (Commit 2)
// ---------------------------------------------------------------------------

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'

export interface BloodGroupStock {
  group: BloodGroup
  units: number
}

export interface BloodBank {
  id: string
  name: string
  area: string
  address: string
  location: GeoPoint
  contact: string
  hours: string
  stock: BloodGroupStock[]
}

/** Status of the blood step on an emergency case. */
export type BloodStepStatus = 'NotAssignedYet' | 'Checking' | 'Reserved' | 'Unavailable'

// ---------------------------------------------------------------------------
// Resource allocation (Commit 2)
// ---------------------------------------------------------------------------

/** One explainable, human-readable reason behind an allocation decision. */
export interface AllocationReason {
  /** Short machine-stable key, e.g. 'nearest-unit'. */
  key: string
  label: string
}

export interface ResourceDecision {
  resourceType: 'ambulance' | 'bloodBank'
  resourceId: string
  resourceName: string
  score: number
  reasons: AllocationReason[]
}

/** Deterministic, explainable coordination plan for one case. */
export interface AllocationPlan {
  /** Coordination order only — priority never implies clinical urgency. */
  order: Array<'ambulance' | 'hospital' | 'bed'>
  orderReason: string
  ambulance?: ResourceDecision
}

/**
 * The single source of truth for one emergency report.
 * Later commits attach ambulance / blood / navigation / comms
 * records onto the same case object.
 */
export interface EmergencyCase {
  id: string // e.g. NGP-1001
  patientName: string
  age: number
  emergencyType: EmergencyType
  contactNumber: string
  location: string
  locationPoint?: GeoPoint
  description?: string
  priority: EmergencyPriority
  status: CaseStatus
  createdAt: string // ISO timestamp
  /** Required blood group if the reporter knows it (optional, no inference). */
  requiredBloodGroup?: BloodGroup

  // --- Coordination workflow (populated progressively) ---
  hospital: {
    status: HospitalMatchStatus
    hospitalId?: string
    hospitalName?: string
    note?: string
  }
  bed: {
    status: BedMatchStatus
    category?: BedCategory
    note?: string
  }
  ambulance: {
    status: AmbulanceStepStatus
    ambulanceId?: string
    callSign?: string
    vehicleType?: AmbulanceVehicleType
    note?: string
  }
  blood: {
    status: BloodStepStatus
    bloodBankId?: string
    bloodBankName?: string
    bloodGroup?: BloodGroup
    units?: number
    note?: string
  }
  navigation: { status: ServiceSlot; note: string }

  // --- Commit 3: lifecycle, timeline, triage, overflow, comms ---
  /** Derived coordination lifecycle stage; explicit beyond 'Hospital Notified'. */
  lifecycle?: LifecycleStage
  /** Timestamped case timeline (append-only). */
  timeline?: TimelineEntry[]
  /** Demo triage category assigned at creation (coordination aid only). */
  triage?: TriageCategory
  /** Set when the selected hospital reports FULL — alternatives were evaluated. */
  overflow?: {
    /** Hospital id that reported full capacity. */
    hospitalId: string
    hospitalName: string
    /** Deterministically re-matched facility id. */
    alternativeId?: string
    alternativeName?: string
    alternativeKind?: FacilityKind
    evaluated: number
    at: string
  }
  /** SMS fallback message drafted for the case (demo — never transmitted). */
  smsFallback?: SmsFallbackMessage
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export interface EmergencyReportInput {
  patientName: string
  age: string
  emergencyType: EmergencyType | ''
  contactNumber: string
  location: string
  locationPoint?: GeoPoint
  description?: string
  priority: EmergencyPriority
  /** Optional — only when the reporter already knows the patient's group. */
  requiredBloodGroup?: BloodGroup | ''
}

// ---------------------------------------------------------------------------
// Search / filters
// ---------------------------------------------------------------------------

export interface HospitalFilters {
  query: string
  emergencyOnly: boolean
  icuOnly: boolean
  generalBedOnly: boolean
  area: string // 'All Areas' or a specific Nagpur area
}
