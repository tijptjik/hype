// TYPES
import type { LocationFacts } from './model'
import type { LocationKind } from './kinds'

/** Classify an unknown entity from facts that establish its kind.
 * @param kind Requested entity kind.
 * @param facts Accepted brand and lifecycle facts.
 * @returns A concrete kind when facts identify one, otherwise the requested kind.
 * @remarks Conflicting establishment and building facts require explicit correction.
 */
export function classifyLocationFactsKind(
  kind: LocationKind,
  facts: Pick<LocationFacts, 'brands' | 'operatingStatus' | 'buildingStatus'>,
): LocationKind {
  const establishment = facts.brands.length > 0 || facts.operatingStatus != null
  const building = facts.buildingStatus != null
  if (establishment && building)
    throw new Error('Conflicting establishment and building facts')
  if (kind === 'unknown')
    return establishment ? 'establishment' : building ? 'building' : 'unknown'
  if (establishment && kind !== 'establishment')
    throw new Error('Establishment facts require establishment kind')
  if (building && kind !== 'building')
    throw new Error('Building facts require building kind')
  return kind
}
