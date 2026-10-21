// DOMAIN
import { equalLocationValue } from './baseline'
// TYPES
import type { FeatureLocationOverrides, LocationOverride } from './model'
import type { EffectiveLocationFacts } from './resolve'

/**
 * Represent an explicit user edit without confusing clearing with inheritance.
 * @param value New effective field value.
 * @returns A copied override or explicit suppression.
 */
function editedValue<T>(value: T | null): LocationOverride<T> {
  return value === null
    ? { mode: 'clear' }
    : { mode: 'override', value: structuredClone(value) }
}

/**
 * Record only changed effective fields during a normal linked Feature edit.
 * @param current Existing override choices, including deliberate clears and matching overrides.
 * @param before Persisted effective baseline used for concurrency validation.
 * @param after Validated effective projection of the proposed Feature form.
 * @returns Updated overrides; untouched inherited fields remain inherited.
 * @remarks Reset-to-inherit is a separate explicit operation. Editing a field back to
 * a source-matching value does not silently reset the user's correction. Location
 * changes replace the entire geometry/address group, and locale changes are independent.
 */
export function applyFeatureLocationEdits(
  current: FeatureLocationOverrides,
  before: EffectiveLocationFacts,
  after: EffectiveLocationFacts,
): FeatureLocationOverrides {
  const result = structuredClone(current)
  // Compare exact effective values so description-only saves cannot freeze inherited facts.
  for (const locale of new Set([
    ...Object.keys(before.names),
    ...Object.keys(after.names),
  ])) {
    const value = after.names[locale] ?? null
    if (!equalLocationValue(before.names[locale] ?? null, value)) {
      result.names ??= {}
      result.names[locale] = editedValue(value)
    }
  }
  if (!equalLocationValue(before.phoneNumber, after.phoneNumber))
    result.phoneNumber = editedValue(after.phoneNumber)
  if (!equalLocationValue(before.brands, after.brands))
    result.brands = editedValue(after.brands)
  if (!equalLocationValue(before.location, after.location))
    result.location = editedValue(after.location)
  return result
}
