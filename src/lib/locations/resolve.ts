import { equalLocationValue } from './baseline'
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
  websites?: LocationFacts['websites']
  socials?: LocationFacts['socials']
  accessibility?: LocationFacts['accessibility']
  footprint?: LocationFacts['footprint']
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
  // Organisation policy is explicit; absent policy preserves deliberate corrections.
  overrides = { ...overrides }
  for (const [key, policy] of Object.entries(overrides.freshness ?? {})) {
    if (policy.mode !== 'follow' || !Object.hasOwn(facts, key)) continue
    if (!equalLocationValue(facts[key as keyof LocationFacts], policy.original))
      delete (overrides as Record<string, unknown>)[key]
  }
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
    ...(facts.footprint !== undefined || overrides.footprint
      ? { footprint: resolveLocationField(facts.footprint, overrides.footprint) }
      : {}),
    ...(facts.entity ? { entity: facts.entity } : {}),
    ...(overrides.operatingStatus?.mode === 'override'
      ? { operatingStatus: overrides.operatingStatus.value }
      : facts.operatingStatus !== undefined
        ? { operatingStatus: facts.operatingStatus }
        : {}),
    ...(overrides.buildingStatus?.mode === 'override'
      ? { buildingStatus: overrides.buildingStatus.value }
      : facts.buildingStatus !== undefined
        ? { buildingStatus: facts.buildingStatus }
        : {}),
    ...(overrides.successorLocationId?.mode === 'override'
      ? { successorLocationId: overrides.successorLocationId.value }
      : facts.successorLocationId !== undefined
        ? { successorLocationId: facts.successorLocationId }
        : {}),
    ...(facts.websites !== undefined || overrides.websites
      ? { websites: resolveLocationField(facts.websites, overrides.websites) ?? [] }
      : {}),
    ...(facts.socials !== undefined || overrides.socials
      ? { socials: resolveLocationField(facts.socials, overrides.socials) ?? {} }
      : {}),
    ...(facts.accessibility !== undefined || overrides.accessibility
      ? {
          accessibility: resolveLocationField(
            facts.accessibility,
            overrides.accessibility,
          ),
        }
      : {}),
    names,
    phoneNumber: resolveLocationField(facts.phoneNumber, overrides.phoneNumber),
    brands: resolveLocationField(facts.brands, overrides.brands),
    location: resolveLocationField(location, overrides.location),
  }
}
