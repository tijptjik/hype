// TYPES
import type {
  FeaturePlaceOverrides,
  PlaceFacts,
  PlaceLocation,
  PlaceOverride,
} from './model'
import type { EffectivePlaceFacts } from './resolve'

/**
 * Compare JSON values without treating object insertion order as a user correction.
 * @param left Persisted effective value.
 * @param right Accepted source value.
 * @returns Whether values match, retaining meaningful array order.
 */
function equalValue(left: unknown, right: unknown): boolean {
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
      left.every((value, index) => equalValue(value, right[index]))
    )
  }
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(key => Object.hasOwn(b, key) && equalValue(a[key], b[key]))
  )
}

/**
 * Preserve a baseline value only when it differs from the accepted source.
 * @param baseline Persisted Feature value, including explicit suppression.
 * @param inherited Accepted Place value.
 * @returns A correction or suppression, or undefined to keep inheriting.
 */
function preserveField<T>(
  baseline: T | null,
  inherited: T | null,
): PlaceOverride<T> | undefined {
  if (equalValue(baseline, inherited)) return undefined
  return baseline === null
    ? { mode: 'clear' }
    : { mode: 'override', value: structuredClone(baseline) }
}

/**
 * Derive initial inheritance inputs without changing existing effective Feature values.
 * @param baseline Complete persisted Feature projection, never a client preservation payload.
 * @param facts Accepted Place facts.
 * @param location Independently accepted Place location.
 * @returns Minimal overrides; matching fields remain eligible for future source updates.
 * @remarks Missing baseline locales suppress existing source translations. A locale absent
 * from both records remains inheritable when later introduced upstream. Callers must
 * validate and authorize persisted inputs and commit the association with concurrency checks.
 */
export function preserveFeaturePlaceBaseline(
  baseline: EffectivePlaceFacts,
  facts: PlaceFacts,
  location: PlaceLocation,
): FeaturePlaceOverrides {
  const overrides: FeaturePlaceOverrides = {}
  const names: NonNullable<FeaturePlaceOverrides['names']> = {}
  // Compare the full locale union so linking cannot silently introduce translations.
  for (const locale of new Set([
    ...Object.keys(baseline.names),
    ...Object.keys(facts.names),
  ])) {
    const correction: PlaceOverride<string> | undefined =
      baseline.names[locale] === null
        ? { mode: 'clear' }
        : preserveField(baseline.names[locale] ?? null, facts.names[locale] ?? null)
    if (correction) names[locale] = correction
  }
  if (Object.keys(names).length) overrides.names = names
  const phones = preserveField(baseline.phoneNumber, facts.phoneNumber)
  const brands = preserveField(baseline.brands, facts.brands)
  const correctedLocation = preserveField(baseline.location, location)
  if (phones) overrides.phoneNumber = phones
  if (brands) overrides.brands = brands
  if (correctedLocation) overrides.location = correctedLocation
  return overrides
}
