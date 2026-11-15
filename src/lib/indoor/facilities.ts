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
  defibrillator: {
    color: '#15803d',
    background: '#f0fdf4',
    label: 'Defibrillator',
    path: 'M12 21 3 12C-2 4 8 0 12 7C16 0 26 4 21 12zM13 8l-4 5h5l-3 5',
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
  vendingmachine: {
    label: 'Vending machine',
    color: '#92400e',
    background: '#fffbeb',
    path: 'M5 2h14v20H5zM8 6h8v5H8zM8 16h8',
  },
}
/** Resolve a facility icon and readable source-specific label.
 * @param category Source category, including government wheelchair aliases.
 * @param sourceName Source facility name, used to distinguish ticket machines and police facilities.
 * @returns Shared pictogram, contrast-safe ink and tinted background for map and legend.
 */
export function facilitySymbol(category: string, sourceName = ''): FacilitySymbol {
  const key = category === 'restroom.wheelchair' ? 'restroom.accessible' : category
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
  'restroom.female',
  'restroom.male',
  'restroom.accessible',
  'vendingmachine',
  'phone',
  'defibrillator',
  'phone.emergency',
  'checkin',
] as const

/** Orders facility categories in the map legend. @param category Source category. @returns Sort rank, with unlisted facilities after the established sequence. */
export function facilityLegendRank(category: string): number {
  const key = category === 'restroom.wheelchair' ? 'restroom.accessible' : category
  const rank = legendOrder.findIndex(entry => entry === key)
  return rank < 0 ? legendOrder.length : rank
}
