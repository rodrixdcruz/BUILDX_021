import type { Ambulance } from '../models/types'

/**
 * DEMO / SIMULATED ambulance fleet for Nagpur.
 *
 * ⚠️ Units, call signs, positions and statuses are FICTIONAL demo values.
 * They are NOT live GPS or dispatch data. A real fleet/108 integration
 * would replace `getAmbulances()` in a later commit without UI changes.
 */
export const DEMO_AMBULANCES: Ambulance[] = [
  {
    id: 'AMB-01',
    callSign: 'Nagpur-1',
    vehicleType: 'ALS',
    contact: '0712-1110001',
    baseArea: 'Civil Lines',
    location: { lat: 21.1458, lng: 79.0882 },
    status: 'Available',
  },
  {
    id: 'AMB-02',
    callSign: 'Nagpur-2',
    vehicleType: 'BLS',
    contact: '0712-1110002',
    baseArea: 'Dharampeth',
    location: { lat: 21.1402, lng: 79.0622 },
    status: 'Available',
  },
  {
    id: 'AMB-03',
    callSign: 'Nagpur-3',
    vehicleType: 'ALS',
    contact: '0712-1110003',
    baseArea: 'Sitabuldi',
    location: { lat: 21.1355, lng: 79.0768 },
    status: 'Busy',
  },
  {
    id: 'AMB-04',
    callSign: 'Nagpur-4',
    vehicleType: 'BLS',
    contact: '0712-1110004',
    baseArea: 'Itwari',
    location: { lat: 21.1525, lng: 79.1082 },
    status: 'Available',
  },
  {
    id: 'AMB-05',
    callSign: 'Nagpur-5',
    vehicleType: 'PTV',
    contact: '0712-1110005',
    baseArea: 'Manewada',
    location: { lat: 21.1146, lng: 79.0944 },
    status: 'Available',
  },
  {
    id: 'AMB-06',
    callSign: 'Nagpur-6',
    vehicleType: 'BLS',
    contact: '0712-1110006',
    baseArea: 'Jaripatka',
    location: { lat: 21.1667, lng: 79.0793 },
    status: 'Offline',
  },
  {
    id: 'AMB-07',
    callSign: 'Nagpur-7',
    vehicleType: 'ALS',
    contact: '0712-1110007',
    baseArea: 'Hingna Road',
    location: { lat: 21.1027, lng: 79.0436 },
    status: 'Available',
  },
  {
    id: 'AMB-08',
    callSign: 'Nagpur-8',
    vehicleType: 'PTV',
    contact: '0712-1110008',
    baseArea: 'Wardha Road',
    location: { lat: 21.1196, lng: 79.0647 },
    status: 'Busy',
  },
  {
    id: 'AMB-09',
    callSign: 'Nagpur-9',
    vehicleType: 'BLS',
    contact: '0712-1110009',
    baseArea: 'Nandanvan',
    location: { lat: 21.1383, lng: 79.1178 },
    status: 'Available',
  },
  {
    id: 'AMB-10',
    callSign: 'Nagpur-10',
    vehicleType: 'ALS',
    contact: '0712-1110010',
    baseArea: 'Katol Road',
    location: { lat: 21.1893, lng: 79.0401 },
    status: 'Offline',
  },
]
