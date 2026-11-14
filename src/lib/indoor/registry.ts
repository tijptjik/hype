import catalogue from '../routing/mtr-catalog.json'
export const stations = catalogue.stations
/** Finds a station by its official code. @param code MTR code. @returns Station metadata. */
export const findStation = (code: string) =>
  stations.find(s => s.id === code.toUpperCase())
/** Builds a stable source-space URL. @param code Station code. @param id Optional source space ID. @returns Public path. */
export const premisesPath = (code: string, id?: string): string =>
  `/premises/mtr-${code.toLowerCase()}${id ? `/places/${encodeURIComponent(id)}` : ''}`
/** Searches bilingual station names and codes. @param query Search text. @returns Matching stations. */
export function searchStations(query: string): typeof stations {
  const normalise = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '')
  const term = normalise(query)
  if (['mtr', 'mtrstations', '港鐵'].includes(term)) return stations
  return term
    ? stations.filter(s => normalise(`${s.id} ${s.name} ${s.nameZh}`).includes(term))
    : []
}

/** Curated complete snapshots; stations absent here retain official PDF references. */
export const indoorSnapshots: Record<string, string> = {
  KET: '/indoor/kennedy-town',
  HOK: '/indoor/hong-kong',
}
