import type { Facility } from '../models/types'
import { DEMO_HOSPITALS } from './demoHospitals'

/**
 * DEMO partner-network facilities for Hospital Overflow Mode (Commit 3).
 *
 * ⚠️ Capacity figures are REPORTED / SIMULATED snapshots for the hackathon
 * demo — not live bed data. A real facility-capacity feed would replace
 * `getFacilities()` in a future version without touching the UI.
 */
export const DEMO_FACILITIES: Facility[] = [
  // --- Overflow-capable hospitals (extra receiving capacity, same demo network) ---
  {
    id: 'F-H001',
    name: 'Alexis Multispeciality Hospital — Overflow Wing',
    kind: 'hospital',
    area: 'Manewada',
    location: { lat: 21.1322, lng: 79.0622 },
    contact: '+91 90000 10101',
    reportedCapacity: 'Available',
    emergencyCapability: true,
    loadPercent: 46,
    bedsTotal: 20,
    bedsAvailable: 11,
  },
  {
    id: 'F-H002',
    name: 'Wockhardt Super Speciality — Annex',
    kind: 'hospital',
    area: 'Wardha Road',
    location: { lat: 21.1236, lng: 79.0503 },
    contact: '+91 90000 10202',
    reportedCapacity: 'Limited',
    emergencyCapability: true,
    loadPercent: 74,
    bedsTotal: 14,
    bedsAvailable: 3,
  },

  // --- Healthcare centres ---
  {
    id: 'F-C001',
    name: 'Sadar Healthcare Centre',
    kind: 'healthcare-centre',
    area: 'Sadar',
    location: { lat: 21.1553, lng: 79.0901 },
    contact: '+91 90000 20101',
    reportedCapacity: 'Available',
    emergencyCapability: true,
    loadPercent: 38,
    bedsTotal: 12,
    bedsAvailable: 7,
  },
  {
    id: 'F-C002',
    name: 'Nandanvan Urban Health Centre',
    kind: 'healthcare-centre',
    area: 'Nandanvan',
    location: { lat: 21.1662, lng: 79.1195 },
    contact: '+91 90000 20202',
    reportedCapacity: 'Limited',
    emergencyCapability: true,
    loadPercent: 68,
    bedsTotal: 8,
    bedsAvailable: 2,
  },
  {
    id: 'F-C003',
    name: 'Hingna Road Community Health Centre',
    kind: 'healthcare-centre',
    area: 'Hingna Road',
    location: { lat: 21.1389, lng: 79.0311 },
    contact: '+91 90000 20303',
    reportedCapacity: 'Available',
    emergencyCapability: true,
    loadPercent: 52,
    bedsTotal: 10,
    bedsAvailable: 5,
  },

  // --- Temporary emergency camps ---
  {
    id: 'F-E001',
    name: 'Reserve Bank Ground Emergency Camp',
    kind: 'emergency-camp',
    area: 'Civil Lines',
    location: { lat: 21.1437, lng: 79.0764 },
    contact: '+91 90000 30101',
    reportedCapacity: 'Available',
    emergencyCapability: true,
    loadPercent: 12,
    bedsTotal: 40,
    bedsAvailable: 34,
  },
  {
    id: 'F-E002',
    name: 'Koradi Road Triage Camp',
    kind: 'emergency-camp',
    area: 'Koradi Road',
    location: { lat: 21.1769, lng: 79.0638 },
    contact: '+91 90000 30202',
    reportedCapacity: 'Available',
    emergencyCapability: true,
    loadPercent: 18,
    bedsTotal: 25,
    bedsAvailable: 20,
  },
]

/** Facilities that are hospitals — reference the existing demo hospital records. */
export const DEMO_FACILITY_HOSPITAL_IDS = DEMO_HOSPITALS.slice(0, 6).map((h) => h.id)
