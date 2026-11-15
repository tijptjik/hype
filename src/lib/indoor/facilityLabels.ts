// TYPES
import type { IndoorData } from './model'

const acronyms = new Set([
  'ATM',
  'AED',
  'MTR',
  'CUC',
  'CVC',
  'IPL',
  'EPL',
  'TCL',
  'AEL',
  'HK',
  'QR',
  'USB',
  'WC',
])
const plurals: Readonly<Record<string, string>> = {
  ramps: 'Ramp',
  platforms: 'Platform',
  corridors: 'Corridor',
  elevators: 'Elevator',
  lifts: 'Lift',
  escalators: 'Escalator',
  toilets: 'Toilet',
  lobbies: 'Lobby',
  'moving walkways': 'Moving Walkway',
  'ticket issuing machines': 'Ticket Issuing Machine',
  'vending machines': 'Vending Machine',
  'exit gates': 'Exit Gate',
  'entry gates': 'Entry Gate',
  stair: 'Stairs',
  step: 'Steps',
}

/** Normalize English facility terms without changing identifiers or destination names.
 * @param name Imported facility label.
 * @returns Title-cased label with consistent generic singulars and natural plurals.
 * @remarks Stairs and Steps remain plural; acronyms and equipment/exit codes retain uppercase.
 */
export function canonicalFacilityLabel(name: string): string {
  const text = name.trim().replace(/\s+/g, ' ')
  const generic = plurals[text.toLowerCase()]
  if (generic) return generic
  // Singularize known terminal facility nouns, never arbitrary words or line destinations.
  const normalized = text.replace(
    /\b(ramps|platforms|corridors|elevators|lifts|escalators|toilets|lobbies|walkways|machines|gates|rooms)\s*$/i,
    word => (word.toLowerCase() === 'lobbies' ? 'Lobby' : word.slice(0, -1)),
  )
  return normalized.replace(/[A-Za-z]+[A-Za-z0-9]*/g, word => {
    const upper = word.toUpperCase()
    if (acronyms.has(upper) || /\d/.test(word) || word.length === 1) return upper
    return word[0].toUpperCase() + word.slice(1).toLowerCase()
  })
}

/** Normalize imported facility fields before explicit correction replay.
 * @param data Mutable derived map data, after its raw baseline has been retained.
 * @returns Nothing; updates only English unit and amenity facility labels.
 * @remarks Occupant names, retail units, source IDs, categories and other locales are preserved.
 */
export function normalizeMapFacilityLabels(data: IndoorData): void {
  const occupied = new Set(data.occupant_point.features.map(f => f.properties.unit_id))
  // Occupied and retail units retain publisher brand spelling, even without an occupant name.
  for (const feature of data.unit_polygon.features) {
    const p = feature.properties
    if (occupied.has(p.unit_id) || /^(retail|shop)/i.test(String(p.unit_category)))
      continue
    if (typeof p.unit_name_en === 'string')
      p.unit_name_en = canonicalFacilityLabel(p.unit_name_en)
  }
  for (const feature of data.amenity_point.features) {
    const p = feature.properties
    if (typeof p.amenity_name_en === 'string')
      p.amenity_name_en = canonicalFacilityLabel(p.amenity_name_en)
  }
}
