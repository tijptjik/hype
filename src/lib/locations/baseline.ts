// TYPES
import type {
  FeatureLocationOverrides,
  LocationFacts,
  LocationPosition,
  LocationOverride,
} from './model'
import type { EffectiveLocationFacts } from './resolve'

/**
 * Compare JSON values without treating object insertion order as a user correction.
 * @param left Persisted effective value.
 * @param right Accepted source value.
 * @returns Whether values match, retaining meaningful array order.
 */
export function equalLocationValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  )
    return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => equalLocationValue(value, right[index]))
    )
  }
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(
      key => Object.hasOwn(b, key) && equalLocationValue(a[key], b[key]),
    )
  )
}

/**
 * Preserve a baseline value only when it differs from the accepted source.
 * @param baseline Persisted Feature value, including explicit suppression.
 * @param inherited Accepted Location value.
 * @returns A correction or suppression, or undefined to keep inheriting.
 */
function preserveField<T>(
  baseline: T | null,
  inherited: T | null,
): LocationOverride<T> | undefined {
  if (equalLocationValue(baseline, inherited)) return undefined
  return baseline === null
    ? { mode: 'clear' }
    : { mode: 'override', value: structuredClone(baseline) }
}

/**
 * Derive initial inheritance inputs without changing existing effective Feature values.
 * @param baseline Complete persisted Feature projection, never a client preservation rawSource.
 * @param facts Accepted Location facts.
 * @param location Independently accepted Location location.
 * @returns Minimal overrides; matching fields remain eligible for future source updates.
 * @remarks Missing baseline locales suppress existing source translations. A locale absent
 * from both records remains inheritable when later introduced upstream. Callers must
 * validate and authorize persisted inputs and commit the association with concurrency checks.
 */
export function preserveFeatureLocationBaseline(
  baseline: EffectiveLocationFacts,
  facts: LocationFacts,
  location: LocationPosition,
): FeatureLocationOverrides {
  const overrides: FeatureLocationOverrides = {}
  const names: NonNullable<FeatureLocationOverrides['names']> = {}
  // Compare the full locale union so linking cannot silently introduce translations.
  for (const locale of new Set([
    ...Object.keys(baseline.names),
    ...Object.keys(facts.names),
  ])) {
    const correction: LocationOverride<string> | undefined =
      baseline.names[locale] === null
        ? { mode: 'clear' }
        : preserveField(baseline.names[locale] ?? null, facts.names[locale] ?? null)
    if (correction) names[locale] = correction
  }
  if (Object.keys(names).length) overrides.names = names
  if (
    baseline.confirmedUnnamed !== undefined &&
    baseline.confirmedUnnamed !== facts.confirmedUnnamed
  )
    overrides.confirmedUnnamed = { mode: 'override', value: baseline.confirmedUnnamed }
  // Legacy Features have no extent to preserve and should inherit a newly linked footprint.
  if (baseline.footprint !== undefined) {
    const footprint = preserveField(baseline.footprint, facts.footprint ?? null)
    if (footprint) overrides.footprint = footprint
  }
  const phones = preserveField(baseline.phoneNumber, facts.phoneNumber)
  const brands = preserveField(baseline.brands, facts.brands)
  const correctedLocation = preserveField(baseline.location, location)
  if (phones) overrides.phoneNumber = phones
  if (brands) overrides.brands = brands
  if (correctedLocation) overrides.location = correctedLocation
  if (
    baseline.operatingStatus !== undefined &&
    !equalLocationValue(baseline.operatingStatus, facts.operatingStatus)
  )
    overrides.operatingStatus = { mode: 'override', value: baseline.operatingStatus }
  if (
    baseline.buildingStatus !== undefined &&
    !equalLocationValue(baseline.buildingStatus, facts.buildingStatus)
  )
    overrides.buildingStatus = { mode: 'override', value: baseline.buildingStatus }
  if (
    baseline.successorLocationId !== undefined &&
    !equalLocationValue(baseline.successorLocationId, facts.successorLocationId)
  )
    overrides.successorLocationId = {
      mode: 'override',
      value: baseline.successorLocationId,
    }
  return overrides
}
