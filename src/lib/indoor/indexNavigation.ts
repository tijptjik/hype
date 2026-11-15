// DOMAIN
import type { Place } from './model'
import { isConnector } from './spatial'

/** Find navigable matches for one map-index entry. @param entries Visible places. @param key Facility category or area index key. @returns Matching places, retaining their source identities. */
export function indexMatches(entries: Place[], key: string): Place[] {
  if (key === 'level-change')
    return entries.filter(place => isConnector(place.category))
  if (isConnector(key))
    return entries.filter(place =>
      key === 'stairs'
        ? ['stairs', 'steps'].includes(place.category)
        : place.category === key,
    )
  if (key === 'paid' || key === 'unpaid')
    return entries.filter(
      place =>
        place.area === (key === 'paid' ? 'Paid area' : 'Unpaid area') &&
        ['walkway', 'lobby', 'platform', 'unspecified'].includes(place.category),
    )
  const category = (value: string): string =>
    value === 'restroom.wheelchair' ? 'restroom.accessible' : value
  return entries.filter(
    place =>
      place.kind === 'facility' &&
      category(place.category) === category(key) &&
      place.feature.geometry.type === 'Point',
  )
}
