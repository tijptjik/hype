// Approved service colours shared by map symbols and their design reference.
export const facilityColourGroups = [
  {
    label: 'Movement & transport',
    color: '#0f766e',
    background: '#f0fdfa',
    keys: [
      'elevator',
      'escalator',
      'ramp',
      'stairs',
      'walkway',
      'corridor',
      'movingwalkway',
      'platform',
      'rail.muni',
      'taxi',
      'parking',
      'parking.ev',
      'parking.motorcycle',
    ],
  },
  {
    label: 'Information & communication',
    color: '#0369a1',
    background: '#f0f9ff',
    keys: [
      'information',
      'reception.desk',
      'guestservices',
      'phone',
      'payphone',
      'mailbox',
    ],
  },
  {
    label: 'Personal care & accessibility',
    color: '#7e22ce',
    background: '#faf5ff',
    keys: [
      'restroom.male',
      'restroom.female',
      'restroom.unisex',
      'restroom.accessible',
      'mothersroom',
      'babychanging',
      'wheelchairassist',
      'shower',
      'drinkingfountain',
    ],
  },
  {
    label: 'Shopping & transactions',
    color: '#92400e',
    background: '#fffbeb',
    keys: ['atm', 'bank', 'vendingmachine', 'foodservice', 'photobooth'],
  },
  {
    label: 'Leisure & recreation',
    color: '#3f6212',
    background: '#f7fee7',
    keys: ['childplayarea', 'fieldofplay', 'swimmingpool', 'publiclibrary'],
  },
  {
    label: 'Medical help',
    color: '#15803d',
    background: '#f0fdf4',
    keys: ['firstaid', 'defibrillator'],
  },
  {
    label: 'Emergency communication',
    color: '#b91c1c',
    background: '#fef2f2',
    keys: ['phone.emergency'],
  },
  {
    label: 'Police & security',
    color: '#1e3a8a',
    background: '#eff6ff',
    keys: ['police', 'security', 'checkin:Police sign-in box'],
  },
  {
    label: 'General spaces',
    color: '#475569',
    background: '#f1f5f9',
    keys: ['lobby', 'seating', 'room', 'checkin'],
  },
]
/** Resolve the approved service group, including source-name variants.
 * @param key Review symbol identity. @returns Approved colour group.
 */
export function facilityColourGroup(
  key: string,
): (typeof facilityColourGroups)[number] {
  return (
    facilityColourGroups.find(group => group.keys.includes(key)) ??
    facilityColourGroups.find(group => group.keys.includes(key.split(':')[0])) ??
    facilityColourGroups[8]
  )
}
