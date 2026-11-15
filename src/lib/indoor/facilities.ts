export type FacilitySymbol = {
  label: string
  path: string
  color: string
  background: string
  text?: string
}

/** Shared facility pictograms in a 24px square, used by markers and their legend. */
export const facilitySymbols: Record<string, FacilitySymbol> = {
  'restroom.male': {
    color: '#1d4ed8',
    background: '#eff6ff',
    label: 'Male toilet',
    path: 'M10 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M8 12V9h8v3M10 9v12m4-12v12',
  },
  'restroom.female': {
    color: '#9d174d',
    background: '#fdf2f8',
    label: 'Female toilet',
    path: 'M10 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M12 8l-5 9h10zM10 17v4m4-4v4',
  },
  'restroom.accessible': {
    color: '#6d28d9',
    background: '#f5f3ff',
    label: 'Accessible toilet',
    path: 'M9 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0M11 8v6h6l3 6h2M11 10h5M7 11a5 5 0 1 0 7 7',
  },
  babychanging: {
    color: '#9a3412',
    background: '#fff7ed',
    label: 'Baby changing',
    path: 'M3 16h18M5 16v5m14-5v5M7 11a2 2 0 1 0 0 .1M10 13h7l2-4m-9 4l3-4 3 2',
  },
  elevator: {
    color: '#0f766e',
    background: '#f0fdfa',
    label: 'Lift',
    path: 'M5 8h14v14H5zM10 12v6m4-6v6M5 5V1m-2 2 2-2 2 2M19 1v4m-2-2 2 2 2-2',
  },
  escalator: {
    color: '#0f766e',
    background: '#f0fdfa',
    label: 'Escalator',
    path: 'M2 17h5l9-10h6v5h-4L9 22H2zM10 5a1.5 1.5 0 1 0 0 .1M10 8v4',
  },
  information: {
    color: '#0369a1',
    background: '#f0f9ff',
    label: 'Information',
    path: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v6m0-10v.1',
  },
  mothersroom: {
    label: "Mother's room",
    color: '#9d174d',
    background: '#fdf2f8',
    path: 'M7 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0M9 8v5l5 3h5M5 10v7h7l3 5M3 21V10M15 9a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M11 11l4 2 4-1',
  },
  wheelchairassist: {
    label: 'Wheelchair assist',
    color: '#6d28d9',
    background: '#f5f3ff',
    path: 'M7 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M9 9v6h5l3 6h3M6 12a5 5 0 1 0 7 7M17 3a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M19 7l-3 4h-4m7-4v8l3 6',
  },
  'reception.desk': {
    label: 'Reception desk',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M10 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 12v-2a5 3 0 0 1 10 0v2M2 12h20M4 12v9h16v-9M9 16h6',
  },
  defibrillator: {
    color: '#15803d',
    background: '#f0fdf4',
    label: 'Defibrillator',
    path: 'M12 21 3 12C-2 4 8 0 12 7C16 0 26 4 21 12zM13 8l-4 5h5l-3 5',
  },
  movingwalkway: {
    label: 'Moving walkway',
    color: '#0f766e',
    background: '#f0fdfa',
    path: 'M8 3a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 7v6m-3-3 3-3 3 3h3M10 13l-3 4m3-4 3 4M2 18h20v4H2zM17 7h5m-2-2 2 2-2 2',
  },
  parking: {
    label: 'Parking',
    color: '#1d4ed8',
    background: '#eff6ff',
    path: 'M3 3h18v18H3zM9 17V7h4a3 3 0 0 1 0 6H9',
  },
  'restroom.unisex': {
    label: 'Unisex toilet',
    color: '#475569',
    background: '#f1f5f9',
    path: 'M3 4h18v16H3zM6 8v7l2-4 2 4V8m8 1a3 3 0 1 0 0 5',
  },
  phone: {
    label: 'Telephone',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M5 13V9a7 7 0 0 1 14 0v4M5 10H3v7h4v-7zM19 10h2v7h-4v-7zM19 17v2l-6 2h-2',
  },
  'phone.emergency': {
    label: 'Emergency intercom',
    color: '#b91c1c',
    background: '#fef2f2',
    path: 'M3 7V4c5-3 13-3 18 0v3h-5V5H8v2z',
    text: 'SOS',
  },
  checkin: {
    label: 'Check-in point',
    color: '#4338ca',
    background: '#eef2ff',
    path: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM12 5.5l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3L7.2 9l3.3-.5z',
  },
  atm: {
    label: 'ATM',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M3 3h18v18H3zM6 6h12v5H6zM7 15h10M9 18h6',
  },
  bank: {
    label: 'Bank',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M2 8l10-6 10 6zM4 21h16M5 10v8m5-8v8m4-8v8m5-8v8M2 21h20',
  },
  childplayarea: {
    label: 'Children’s play area',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M3 21 7 3h10l4 18M7 3l10 18M11 10h6M12 14h6M4 21h7',
  },
  drinkingfountain: {
    label: 'Drinking fountain',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M3 11h12v4H3zM6 15v6m6-6v6M15 11V7a3 3 0 0 1 6 0M17 10v1m3-1v2',
  },
  fieldofplay: {
    label: 'Playing area',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M2 5h20v14H2zM12 5v14M2 9h4v6H2m20-6h-4v6h4M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  },
  firstaid: {
    label: 'First aid',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  },
  foodservice: {
    label: 'Food service',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M3 2v6a3 3 0 0 0 6 0V2M6 2v20M18 2v20M18 2c-5 4-5 10 0 10',
  },
  guestservices: {
    label: 'Guest services',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M3 17h18M5 15a7 7 0 0 1 14 0M12 8V5m-2 0h4M2 21h20',
  },
  lobby: {
    label: 'Lobby',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M3 21V3h18v18M8 21V9h8v12M3 6h18M11 15h.1',
  },
  mailbox: {
    label: 'Mailbox',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M3 7h18v14H3zM3 8l9 7 9-7M7 3h10',
  },
  'parking.ev': {
    label: 'EV parking',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M3 21V3h12v18M6 6h6v5H6zM15 8h3l3 3v7a2 2 0 0 1-4 0v-3M10 13l-3 4h4l-2 3',
  },
  'parking.motorcycle': {
    label: 'Motorcycle parking',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M2 17a4 4 0 1 0 8 0a4 4 0 1 0-8 0M14 17a4 4 0 1 0 8 0a4 4 0 1 0-8 0M6 17l5-8h5l2 8M9 12h7M13 5h3l2 4M5 9h4',
  },
  payphone: {
    label: 'Payphone',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M5 2h14v20H5zM8 7V5h8v2M9 10v5l3 3 3-3M9 10l2 1m2 4 2 0',
  },
  photobooth: {
    label: 'Photo booth',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M3 2h18v20H3zM14 2v20M6 6h5M7 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 18v-2a3 3 0 0 1 6 0v2M17 5v14',
  },
  police: {
    label: 'Police',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM12 7l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5L7 10.5l3.5-.5z',
  },
  publiclibrary: {
    label: 'Public library',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M12 6C8 3 4 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-2-1-6-1-10 2v15M5 8h4m6 0h4',
  },
  'rail.muni': {
    label: 'Light rail platform',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M5 3h14v15H5zM5 11h14M8 3v8m8-8v8M8 15h.1m8 0h.1M8 18l-3 4m11-4 3 4M8 1h8',
  },
  room: {
    label: 'Room',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M4 22V2h16v20M4 22h16M8 22V6h8v16M12 14h.1',
  },
  seating: {
    label: 'Seating',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M6 3h12v10H6zM3 10v7h18v-7M5 17v5m14-5v5M6 13h12',
  },
  security: {
    label: 'Security',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6',
  },
  shower: {
    label: 'Shower',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M4 22V7a4 4 0 0 1 8 0M9 10a5 5 0 0 1 10 0zM10 14v1m4-1v1m4-1v1m-8 4v1m4-1v1m4-1v1',
  },
  swimmingpool: {
    label: 'Swimming pool',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M2 18q3-3 5 0t5 0 5 0 5 0M2 22q3-3 5 0t5 0 5 0 5 0M4 13l6-5 5 5M10 8l-3-4H3M15 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  },
  taxi: {
    label: 'Taxi',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M3 12l3-6h12l3 6v7H3zM3 12h18M6 19v3m12-3v3M7 15h.1m10 0h.1M9 6V2h6v4',
  },
  corridor: {
    label: 'Corridor',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M3 2l5 5v10l-5 5M21 2l-5 5v10l5 5M8 7h8M8 17h8M3 2h18M3 22h18',
  },
  walkway: {
    label: 'Walkway',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M8 3a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 7l-3 5H3m7-5 4 5h5M10 7v7l-5 7m5-7 6 7M2 23h20',
  },
  platform: {
    label: 'Platform',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M3 3h14v13H3zM3 10h14M6 13h.1m8 0h.1M6 16l-3 5m11-5 3 5M20 5v16h3',
  },
  ramp: {
    label: 'Ramp',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M2 20h20V6zM5 13l12-8m-4-1 4 1-1 4',
  },
  stairs: {
    label: 'Stairs',
    color: '#0369a1',
    background: '#f0f9ff',
    path: 'M2 21h5v-5h5v-5h5V6h5M3 11l8-8M7 3h4v4',
  },
  vendingmachine: {
    label: 'Vending machine',
    color: '#92400e',
    background: '#fffbeb',
    path: 'M5 2h14v20H5zM8 6h8v5H8zM8 16h8',
  },
}
/** Resolve source aliases to shared symbol identities.
 * @param category Source category. @returns Canonical display category.
 * @remarks Source records remain unchanged; entity corrections are persisted separately.
 */
export function facilityCategory(category: string): string {
  const aliases: Record<string, string> = {
    Bank: 'atm',
    Platform: 'platform',
    'restroom.wheelchair': 'restroom.accessible',
    'restroom.unisex.wheelchair': 'restroom.accessible',
    steps: 'stairs',
  }
  return aliases[category] ?? category
}

/** Resolve a facility icon and readable source-specific label.
 * @param category Source category, including government wheelchair aliases.
 * @param sourceName Source facility name, used to distinguish ticket machines and police facilities.
 * @returns Shared pictogram, contrast-safe ink and tinted background for map and legend.
 */
export function facilitySymbol(category: string, sourceName = ''): FacilitySymbol {
  const key = facilityCategory(category)
  const symbol = facilitySymbols[key] ?? {
    label: category.startsWith('restroom')
      ? 'Toilet (type unspecified)'
      : category.replace(/[._-]/g, ' '),
    path: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v6m0-10v.1',
    color: '#475569',
    background: '#f1f5f9',
  }
  if (category === 'checkin' && /police/i.test(sourceName))
    return { ...symbol, label: 'Police sign-in box' }
  if (category === 'vendingmachine' && /ticket/i.test(sourceName))
    return { ...symbol, label: 'Ticket machine' }
  if (category === 'phone' && /helpline/i.test(sourceName))
    return { ...symbol, label: 'Helpline' }
  return symbol
}

// Keep wayfinding and everyday services ahead of emergency and security facilities.
const legendOrder = [
  'information',
  'reception.desk',
  'restroom.unisex',
  'restroom.female',
  'restroom.male',
  'restroom.accessible',
  'mothersroom',
  'vendingmachine',
  'phone',
  'wheelchairassist',
  'defibrillator',
  'movingwalkway',
  'phone.emergency',
  'parking',
  'checkin',
] as const

/** Orders facility categories in the map legend. @param category Source category. @returns Sort rank, with unlisted facilities before parking and police entries. */
export function facilityLegendRank(category: string): number {
  const key = facilityCategory(category)
  const rank = legendOrder.findIndex(entry => entry === key)
  return rank < 0 ? legendOrder.indexOf('parking') - 0.5 : rank
}
