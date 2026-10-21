// TYPES
import type {
  FeatureLocationOverrides,
  LocationFacts,
  LocationPosition,
  LocationOverride,
} from './model'

/**
 * Resolve one field without treating an explicit empty value as inheritance.
 * @param inherited Value from the accepted Location revision.
 * @param override Feature's explicit choice.
 * @returns Effective value, or null for explicit suppression.
 */
export function resolveLocationField<T>(
  inherited: T,
  override?: LocationOverride<T>,
): T | null {
  if (!override || override.mode === 'inherit') return inherited
  return override.mode === 'clear' ? null : override.value
}

export type EffectiveLocationFacts = {
  entity?: LocationFacts['entity']
  operatingStatus?: LocationFacts['operatingStatus']
  buildingStatus?: LocationFacts['buildingStatus']
  successorLocationId?: LocationFacts['successorLocationId']
  names: Record<string, string | null>
  phoneNumber: string[] | null
  brands: LocationFacts['brands'] | null
  location: LocationPosition | null
}

/**
 * Resolve a Feature from independently accepted fact and location revisions.
 * @param facts Accepted Location facts, held back too when identity is under review.
 * @param location Accepted atomic location group, possibly from an older revision.
 * @param overrides Explicit Feature edits; absent fields continue inheriting.
 * @returns Effective fields, preserving locale suppression and ordered arrays.
 * @remarks This pure resolver does not mutate snapshots or materialize database rows.
 */
export function resolveFeatureLocation(
  facts: LocationFacts,
  location: LocationPosition,
  overrides: FeatureLocationOverrides,
): EffectiveLocationFacts {
  const names: Record<string, string | null> = {}
  // Resolve the union of locales to retain local translations absent upstream.
  const locales = new Set([
    ...Object.keys(facts.names),
    ...Object.keys(overrides.names ?? {}),
  ])
  for (const locale of locales) {
    names[locale] = resolveLocationField(
      facts.names[locale] ?? null,
      overrides.names?.[locale],
    )
  }
  return {
    ...(facts.entity ? { entity: facts.entity } : {}),
    ...(facts.operatingStatus !== undefined
      ? { operatingStatus: facts.operatingStatus }
      : {}),
    ...(facts.buildingStatus !== undefined
      ? { buildingStatus: facts.buildingStatus }
      : {}),
    ...(facts.successorLocationId !== undefined
      ? { successorLocationId: facts.successorLocationId }
      : {}),
    names,
    phoneNumber: resolveLocationField(facts.phoneNumber, overrides.phoneNumber),
    brands: resolveLocationField(facts.brands, overrides.brands),
    location: resolveLocationField(location, overrides.location),
  }
}
