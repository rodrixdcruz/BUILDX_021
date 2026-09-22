import type { EmergencyPriority, EmergencyType } from '../models/types'

export const EMERGENCY_TYPES: EmergencyType[] = [
  'Accident',
  'Cardiac Emergency',
  'Breathing Problem',
  'Unconscious Patient',
  'Injury',
  'Other',
]

export const EMERGENCY_PRIORITIES: EmergencyPriority[] = ['Emergency', 'High', 'Normal']

export const NAGPUR_AREAS: string[] = [
  'Dharampeth',
  'Sitabuldi',
  'Civil Lines',
  'Sadar',
  'Itwari',
  'Nandanvan',
  'Manewada',
  'Hingna Road',
  'Wardha Road',
  'Koradi Road',
  'Jaripatka',
  'Katol Road',
]

/** Google Maps deep link (opens Google Maps; no paid API, no key needed). */
export function mapsDeepLink(point: { lat: number; lng: number }, label?: string): string {
  const { lat, lng } = point
  return label
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : `https://www.google.com/maps?q=${lat},${lng}`
}

/** Nagpur city reference point used when the patient has no precise location. */
export const NAGPUR_CENTER = { lat: 21.1458, lng: 79.0882 }
