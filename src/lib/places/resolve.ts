// TYPES
import type {
  FeaturePlaceOverrides,
  PlaceFacts,
  PlaceLocation,
  PlaceOverride,
} from './model'

/**
 * Resolve one field without treating an explicit empty value as inheritance.
 * @param inherited Value from the accepted Place revision.
 * @param override Feature's explicit choice.
 * @returns Effective value, or null for explicit suppression.
 */
export function resolvePlaceField<T>(
  inherited: T,
  override?: PlaceOverride<T>,
): T | null {
  if (!override || override.mode === 'inherit') return inherited
  return override.mode === 'clear' ? null : override.value
}

export type EffectivePlaceFacts = {
  names: Record<string, string | null>
  phoneNumber: string[] | null
  brands: PlaceFacts['brands'] | null
  location: PlaceLocation | null
}

/**
 * Resolve a Feature from independently accepted fact and location revisions.
 * @param facts Accepted Place facts, held back too when identity is under review.
 * @param location Accepted atomic location group, possibly from an older revision.
 * @param overrides Explicit Feature edits; absent fields continue inheriting.
 * @returns Effective fields, preserving locale suppression and ordered arrays.
 * @remarks This pure resolver does not mutate snapshots or materialize database rows.
 */
export function resolveFeaturePlace(
  facts: PlaceFacts,
  location: PlaceLocation,
  overrides: FeaturePlaceOverrides,
): EffectivePlaceFacts {
  const names: Record<string, string | null> = {}
  // Resolve the union of locales to retain local translations absent upstream.
  const locales = new Set([
    ...Object.keys(facts.names),
    ...Object.keys(overrides.names ?? {}),
  ])
  for (const locale of locales) {
    names[locale] = resolvePlaceField(
      facts.names[locale] ?? null,
      overrides.names?.[locale],
    )
  }
  return {
    names,
    phoneNumber: resolvePlaceField(facts.phoneNumber, overrides.phoneNumber),
    brands: resolvePlaceField(facts.brands, overrides.brands),
    location: resolvePlaceField(location, overrides.location),
  }
}
