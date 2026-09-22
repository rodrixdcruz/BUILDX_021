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

export type HospitalMatchStatus = 'Searching' | 'Selected' | 'Unavailable'
export type BedMatchStatus = 'Checking' | 'Available' | 'Unavailable'
export type ServiceSlot = 'NotAssignedYet' | 'Assigned'

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
  ambulance: { status: ServiceSlot; note: string }
  blood: { status: ServiceSlot; note: string }
  navigation: { status: ServiceSlot; note: string }
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
