// DOMAIN
import { FeatureLocationOverridesSchema } from './validation'
// TYPES
import type { FeatureLocationOverrides, LocationFacts } from './model'

/** Retain the author's effective values only for fields contributed in this revision.
 * @param current Existing Organisation overrides, including unrelated internal fields.
 * @param facts Effective community facts after the contribution.
 * @param fields Fields authored in this revision.
 * @returns Validated overrides without changing unrelated inheritance choices.
 */
export function retainCommunityEditOverrides(
  current: FeatureLocationOverrides,
  facts: LocationFacts,
  fields: readonly string[],
): FeatureLocationOverrides {
  const result = structuredClone(current) as Record<string, unknown>
  for (const field of fields) {
    const value = facts[field as keyof LocationFacts]
    if (field === 'names') {
      result.names = Object.fromEntries(
        Object.entries(facts.names).map(([locale, value]) => [
          locale,
          { mode: 'override', value },
        ]),
      )
    } else if (value !== undefined) {
      result[field] =
        value === null &&
        !['operatingStatus', 'buildingStatus', 'successorLocationId'].includes(field)
          ? { mode: 'clear' }
          : { mode: 'override', value: structuredClone(value) }
    }
  }
  return FeatureLocationOverridesSchema.parse(result)
}
