// DOMAIN
import { facilityColourGroup } from './facilityColours'

export type FacilitySymbol = {
  label: string
  path: string
  color: string
  background: string
  text?: string
}

// A relaxed walking figure is shared by both pedestrian symbols.
const walkingPersonPath =
  'M10 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 8l-1 6m1-5-3 3-2 1m5-4 2 3h3M11 14l-2 7m2-7 3 3 1 4'

// Matching toilet figures share their head, shoulders and relaxed arms.
const toiletFigurePath =
  'M10 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 13V10a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3'

/** Shared facility pictograms in a 24px square, used by markers and their legend. */
const pictograms: Record<string, Omit<FacilitySymbol, 'color' | 'background'>> = {
  'restroom.male': {
    label: 'Male toilet',
    path: `${toiletFigurePath}M9 11v10h2l1-6 1 6h2V11M9 14h6`,
  },
  'restroom.female': {
    label: 'Female toilet',
    path: `${toiletFigurePath}M10 11l-2 6h8l-2-6M10 17v4m4-4v4`,
  },
  'restroom.accessible': {
    label: 'Accessible toilet',
    path: 'M9 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0M11 8v6h6l3 6h2M11 10h5M7 11a5 5 0 1 0 7 7',
  },
  babychanging: {
    label: 'Baby changing',
    path: 'M3 16h18M5 16v5m14-5v5M7 11a2 2 0 1 0 0 .1M10 13h7l2-4m-9 4l3-4 3 2',
  },
  elevator: {
    label: 'Lift',
    path: 'M5 8h14v14H5zM10 12v6m4-6v6M5 5V1m-2 2 2-2 2 2M19 1v4m-2-2 2 2 2-2',
  },
  escalator: {
    label: 'Escalator',
    path: 'M2 17h5l9-10h6v5h-4L9 22H2zM10 5a1.5 1.5 0 1 0 0 .1M10 8v4',
  },
  information: {
    label: 'Information',
    path: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v6m0-10v.1',
  },
  mothersroom: {
    label: "Mother's room",
    path: 'M5 5a3 3 0 1 0 6 0a3 3 0 1 0-6 0M5 5q4 0 5-3M6 10c-3 2-4 7-3 10q1 2 5 2h6M6 14v3q0 2 3 2h5q4-1 6-4M15.5 11a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M16 14q-4 0-5 3q4 1 8-2',
  },
  wheelchairassist: {
    label: 'Wheelchair assist',
    path: 'M7 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M9 9v6h5l3 6h3M6 12a5 5 0 1 0 7 7M17 3a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M19 7l-3 4h-4m7-4v8l3 6',
  },
  'reception.desk': {
    label: 'Reception desk',
    path: 'M10 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 12v-2a5 3 0 0 1 10 0v2M2 12h20M4 12v9h16v-9M9 16h6',
  },
  defibrillator: {
    label: 'Defibrillator',
    path: 'M12 21 3 12C-2 4 8 0 12 7C16 0 26 4 21 12zM13 8l-4 5h5l-3 5',
  },
  movingwalkway: {
    label: 'Moving walkway',
    path: 'M10.5 3a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M12 6l-1 5m1-4-3 2-1 1m4-3 2 2h2M11 11l-2 6m2-6 3 3 1 3M18 4h5m-2-2 2 2-2 2M4 19h16a2 2 0 0 1 0 4H4a2 2 0 0 1 0-4z',
  },
  parking: {
    label: 'Parking',
    path: 'M3 3h18v18H3zM9 17V7h4a3 3 0 0 1 0 6H9',
  },
  'restroom.unisex': {
    label: 'Unisex toilet',
    path: 'M3 3h18v18H3zM6 8v8l2-4 2 4V8M18 9a3 4 0 1 0 0 6',
  },
  phone: {
    label: 'Telephone',
    path: 'M5 2 2 5c0 8 9 17 17 17l3-3-5-5-3 3a17 17 0 0 1-7-7l3-3z',
  },
  'phone.emergency': {
    label: 'SOS Intercom',
    path: 'M3 7V4c5-3 13-3 18 0v3h-5V5H8v2z',
    text: 'SOS',
  },
  checkin: {
    label: 'Check-in point',
    path: 'M8 4H4v18h16V4h-4M8 2h8v4H8zM8 13l3 3 5-6',
  },
  atm: {
    label: 'ATM',
    path: 'M3 3h18v18H3zM12 6v12m3-10h-5a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9',
  },
  bank: {
    label: 'Bank',
    path: 'M2 7l10-5 10 5zM4 10v8m16-8v8M2 21h20M12 9v10m2-9h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3',
  },
  childplayarea: {
    label: 'Children’s play area',
    path: 'M5 8a3 3 0 1 1 3-4m8 0a3 3 0 1 1 3 4M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M9 10h.1m5.8 0h.1M8 15a4 3 0 1 0 8 0a4 3 0 1 0-8 0M11 14h2l-1 1zM12 15v2',
  },
  drinkingfountain: {
    label: 'Drinking fountain',
    path: 'M12 2C10 6 5 10 5 15a7 7 0 0 0 14 0c0-5-5-9-7-13zM8 15a4 4 0 0 0 4 4',
  },
  fieldofplay: {
    label: 'Playing area',
    path: 'M2 5h20v14H2zM12 5v14M2 9h4v6H2m20-6h-4v6h4M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  },
  firstaid: {
    label: 'First aid',
    path: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  },
  foodservice: {
    label: 'Food service',
    path: 'M3 2v6a3 3 0 0 0 6 0V2M6 2v20M18 2v20M18 2c-5 4-5 10 0 10',
  },
  guestservices: {
    label: 'Guest services',
    path: 'M3 17h18M5 15a7 7 0 0 1 14 0M12 8V5m-2 0h4M2 21h20',
  },
  lobby: {
    label: 'Lobby',
    path: 'M2 5h5v8H2zM10 5h5v8h-5zM18 5h4v8h-4zM1 16h22M3 13v3m9-3v3m8-3v3M4 16v5m16-5v5',
  },
  mailbox: {
    label: 'Mailbox',
    path: 'M3 7h18v14H3zM3 8l9 7 9-7M7 3h10',
  },
  'parking.ev': {
    label: 'EV parking',
    path: 'M3 21V3h12v18M6 6h6v5H6zM15 8h3l3 3v7a2 2 0 0 1-4 0v-3M10 13l-3 4h4l-2 3',
  },
  'parking.motorcycle': {
    label: 'Motorcycle parking',
    path: 'M2 17a4 4 0 1 0 8 0a4 4 0 1 0-8 0M14 17a4 4 0 1 0 8 0a4 4 0 1 0-8 0M6 17l5-8h5l2 8M9 12h7M13 5h3l2 4M5 9h4',
  },
  payphone: {
    label: 'Payphone',
    path: 'M5 2 2 5c0 8 9 17 17 17l3-3-5-5-3 3a17 17 0 0 1-7-7l3-3z',
  },
  photobooth: {
    label: 'Photo booth',
    path: 'M2 6h5l2-3h6l2 3h5v15H2zM8 13a4 4 0 1 0 8 0a4 4 0 1 0-8 0M18 9h.1',
  },
  police: {
    label: 'Police',
    path: 'M5 8 3 4l9-3 9 3-2 4zM5 8h14l-3 3H8zM8 11v3a4 4 0 0 0 8 0v-3M5 22c0-6 14-6 14 0M12 4v1',
  },
  publiclibrary: {
    label: 'Public library',
    path: 'M12 6C8 3 4 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-2-1-6-1-10 2v15M5 8h4m6 0h4',
  },
  'rail.muni': {
    label: 'Light rail platform',
    path: 'M5 3h14v15H5zM5 11h14M8 3v8m8-8v8M8 15h.1m8 0h.1M8 18l-3 4m11-4 3 4M8 1h8',
  },
  room: {
    label: 'Room',
    path: 'M4 22V2h16v20M4 22h16M8 22V6h8v16M12 14h.1',
  },
  seating: {
    label: 'Seating',
    path: 'M6 3h12v10H6zM3 10v7h18v-7M5 17v5m14-5v5M6 13h12',
  },
  security: {
    label: 'Security',
    path: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6',
  },
  shower: {
    label: 'Shower',
    path: 'M4 22V7a4 4 0 0 1 8 0M9 10a5 5 0 0 1 10 0zM10 14v1m4-1v1m4-1v1m-8 4v1m4-1v1m4-1v1',
  },
  swimmingpool: {
    label: 'Swimming pool',
    path: 'M2 18q3-3 5 0t5 0 5 0 5 0M2 22q3-3 5 0t5 0 5 0 5 0M4 13l6-5 5 5M10 8l-3-4H3M15 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  },
  taxi: {
    label: 'Taxi',
    path: 'M3 12l3-6h12l3 6v7H3zM3 12h18M6 19v3m12-3v3M7 15h.1m10 0h.1M9 6V2h6v4',
  },
  corridor: {
    label: 'Corridor',
    path: 'M3 2l5 5v10l-5 5M21 2l-5 5v10l5 5M8 7h8M8 17h8M3 2h18M3 22h18',
  },
  walkway: {
    label: 'Walkway',
    path: walkingPersonPath,
  },
  platform: {
    label: 'Platform',
    path: 'M3 3h14v13H3zM3 10h14M6 13h.1m8 0h.1M6 16l-3 5m11-5 3 5M20 5v16h3',
  },
  ramp: {
    label: 'Ramp',
    path: 'M2 20h20V6zM5 13l12-8m-4-1 4 1-1 4',
  },
  stairs: {
    label: 'Stairs',
    path: 'M2 21h5v-5h5v-5h5V6h5M3 11l8-8M7 3h4v4',
  },
  vendingmachine: {
    label: 'Vending machine',
    path: 'M3 2h18v20H3zM6 5h7v9H6zM16 6h2m-2 4h2M6 18h12',
  },
}
/** Shared pictograms with the approved service-family ink and background. */
export const facilitySymbols: Record<string, FacilitySymbol> = Object.fromEntries(
  Object.entries(pictograms).map(([key, symbol]) => {
    const { color, background } = facilityColourGroup(key)
    return [key, { ...symbol, color, background }]
  }),
)

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
    return {
      ...facilitySymbols.police,
      label: 'Police sign-in box',
      path: facilitySymbols.police.path,
    }
  if (category === 'vendingmachine' && /ticket/i.test(sourceName))
    return {
      ...symbol,
      label: 'Ticket machine',
      path: 'M2 4h20v5a3 3 0 0 0 0 6v5H2v-5a3 3 0 0 0 0-6zM9 7h7v8H9zM9 11h7M10 15l-2 3m7-3 2 3M5 6v1m0 10v1',
    }
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
