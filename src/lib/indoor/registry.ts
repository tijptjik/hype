// I18N
import { premisesNameI18n } from './premisesLabels'
// DATA
import catalogue from '../routing/mtr-catalog.json'
// TYPES
import type { MapCatalogueEntry } from './releases'
// Public station URLs use descriptive names consistently, including PDF-only stations.
export const stations = catalogue.stations.map(station => ({
  ...station,
  kind: 'station' as const,
  i18n: premisesNameI18n(station),
  slug: `${station.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-mtr`,
}))
type PremisesRecord = {
  operator?: MapCatalogueEntry['operator']
  kind: MapCatalogueEntry['kind']
  id: string
  slug: string
  name: string
  nameZh: string
  i18n: ReturnType<typeof premisesNameI18n>
}

/** Non-rail premises keep their own URL identities and official references. */
export let buildings: PremisesRecord[] = []
let publishedPremises: PremisesRecord[] = []
/** Finds an indoor venue. @param code Registry code. @returns Venue metadata. */
export const findPremises = (code: string) =>
  publishedPremises.find(b => b.id.toUpperCase() === code.toUpperCase()) ??
  findStation(code)
/** Resolves a public slug without aliasing unrelated places. @param slug URL segment. @returns Registry code if known. */
export function premisesCode(slug: string): string | undefined {
  return (
    publishedPremises.find(b => b.slug === slug)?.id ??
    stations.find(station => station.slug === slug)?.id
  )
}
/** Searches rail and building names. @param query User text. @returns Matching premises. */
export function searchPremises(query: string) {
  const term = query.toLowerCase().replace(/[\s-]+/g, '')
  return [
    ...searchStations(query),
    ...buildings.filter(
      b =>
        term &&
        `${b.id} ${b.name} ${b.nameZh}`
          .toLowerCase()
          .replace(/[\s-]+/g, '')
          .includes(term),
    ),
  ]
}
/** Finds a station by its official code. @param code MTR code. @returns Station metadata. */
export const findStation = (code: string) =>
  stations.find(s => s.id === code.toUpperCase())
/** Builds a stable source-space URL. @param code Station code. @param id Optional source space ID. @returns Public path. */
export function premisesPath(code: string, id?: string): string {
  const venue = findPremises(code)
  if (!venue) throw new Error(`Unknown premises code: ${code}`)
  return `/${venue.kind === 'building' ? 'buildings' : 'premises'}/${venue.slug}${id ? `/places/${encodeURIComponent(id)}` : ''}`
}
/** Searches bilingual station names and codes. @param query Search text. @returns Matching stations. */
export function searchStations(query: string): typeof stations {
  const normalise = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '')
  const term = normalise(query)
  if (['mtr', 'mtrstations', '港鐵', '港铁'].includes(term)) return stations
  return term
    ? stations.filter(s =>
        normalise(`${s.id} ${s.name} ${s.nameZh} ${s.i18n.zhHans.name}`).includes(term),
      )
    : []
}

/** Maintained map metadata; data directories remain stable independently of public map IDs. */
export type PremisesMap = {
  kind?: MapCatalogueEntry['kind']
  id: string
  code: string
  basePath: string
  enabled: boolean
  ready: boolean
}
export let premisesMaps: PremisesMap[] = []
/** Refresh the database-backed discovery catalogue. @param signal Optional cancellation. @returns Published metadata and lightweight footprints. */
export async function loadPremisesCatalogue(
  signal?: AbortSignal,
): Promise<MapCatalogueEntry[]> {
  const response = await fetch('/api/premises-maps', { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Could not load premises maps')
  const maps: MapCatalogueEntry[] = await response.json()
  premisesMaps = maps.map(map => ({
    id: map.id,
    kind: map.kind,
    code: map.code,
    basePath: `/api/premises-maps/${map.id}`,
    enabled: true,
    ready: Boolean(map.publishedHash),
  }))
  publishedPremises = maps.map(m => ({
    operator: m.operator,
    id: m.code,
    kind: m.kind,
    slug: m.id,
    name: m.name,
    nameZh: m.nameZh,
    i18n: premisesNameI18n(m),
  }))
  buildings = maps
    .filter(m => m.kind !== 'station')
    .map(m => ({
      operator: m.operator,
      id: m.code,
      kind: m.kind,
      slug: m.id,
      name: m.name,
      nameZh: m.nameZh,
      i18n: premisesNameI18n(m),
    }))
  indoorSnapshots = Object.fromEntries(premisesMaps.map(m => [m.code, m.basePath]))
  return maps
}

/** Resolve only enabled, ready detail maps. @param id Stored map reference.
 * @param registry Maintained map registry. @returns Available map or null, never a PDF-only station.
 */
export function availablePremisesMap(
  id: string | null | undefined,
  registry = premisesMaps,
): (PremisesMap & { href: string }) | null {
  const map = registry.find(entry => entry.id === id && entry.enabled && entry.ready)
  return map
    ? {
        ...map,
        href: `/${map.kind === 'building' ? 'buildings' : 'premises'}/${map.id}`,
      }
    : null
}

/** Find a ready map by its registry venue code. @param code Venue code. @returns Available map or null. */
export function premisesMapForCode(
  code: string,
): (PremisesMap & { href: string }) | null {
  return availablePremisesMap(
    premisesMaps.find(entry => entry.code.toUpperCase() === code.toUpperCase())?.id,
  )
}

/** Curated complete snapshots; stations absent here retain official PDF references. */
export let indoorSnapshots: Record<string, string> = {}
