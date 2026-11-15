import catalogue from '../routing/mtr-catalog.json'
// Public station URLs use descriptive names consistently, including PDF-only stations.
export const stations = catalogue.stations.map(station => ({
  ...station,
  slug: `${station.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-mtr`,
}))
/** Resolve a canonical station slug. @param slug Public URL segment. @returns Station code if known. */
export function premisesCode(slug: string): string | undefined {
  return stations.find(station => station.slug === slug)?.id
}
/** Finds a station by its official code. @param code MTR code. @returns Station metadata. */
export const findStation = (code: string) =>
  stations.find(s => s.id === code.toUpperCase())
/** Builds a stable source-space URL. @param code Station code. @param id Optional source space ID. @returns Public path. */
export function premisesPath(code: string, id?: string): string {
  const venue = findStation(code)
  if (!venue) throw new Error(`Unknown premises code: ${code}`)
  return `/premises/${venue.slug}${id ? `/places/${encodeURIComponent(id)}` : ''}`
}
/** Searches bilingual station names and codes. @param query Search text. @returns Matching stations. */
export function searchStations(query: string): typeof stations {
  const normalise = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '')
  const term = normalise(query)
  if (['mtr', 'mtrstations', '港鐵'].includes(term)) return stations
  return term
    ? stations.filter(s => normalise(`${s.id} ${s.name} ${s.nameZh}`).includes(term))
    : []
}

/** Maintained map metadata; data directories remain stable independently of public map IDs. */
export type PremisesMap = {
  id: string
  code: string
  basePath: string
  enabled: boolean
  ready: boolean
}
export const premisesMaps: readonly PremisesMap[] = [
  {
    id: 'kennedy-town-mtr',
    code: 'KET',
    basePath: '/indoor/kennedy-town',
    enabled: true,
    ready: true,
  },
  {
    id: 'hong-kong-mtr',
    code: 'HOK',
    basePath: '/indoor/hong-kong',
    enabled: true,
    ready: true,
  },
]

/** Resolve only enabled, ready detail maps. @param id Stored map reference.
 * @param registry Maintained map registry. @returns Available map or null, never a PDF-only station.
 */
export function availablePremisesMap(
  id: string | null | undefined,
  registry = premisesMaps,
): (PremisesMap & { href: string }) | null {
  const map = registry.find(entry => entry.id === id && entry.enabled && entry.ready)
  return map ? { ...map, href: `/premises/${map.id}` } : null
}

/** Find a ready map by its registry venue code. @param code Venue code. @returns Available map or null. */
export function premisesMapForCode(
  code: string,
): (PremisesMap & { href: string }) | null {
  return availablePremisesMap(
    premisesMaps.find(entry => entry.code === code.toUpperCase())?.id,
  )
}

/** Curated complete snapshots; stations absent here retain official PDF references. */
export const indoorSnapshots: Record<string, string> = Object.fromEntries(
  premisesMaps
    .filter(map => map.enabled && map.ready)
    .map(map => [map.code, map.basePath]),
)
