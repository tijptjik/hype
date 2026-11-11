// DOMAIN
import { equalLocationValue } from './baseline'

/** Identify additions that fill missing content without replacing any existing value.
 * @param before Consumer's accepted value, including explicit empty values.
 * @param after Proposed value.
 * @returns True when at least one addition exists and all previous content is preserved.
 * @remarks Callers must separately exclude explicit clear/override choices.
 */
export function fillsMissingLocationValue(before: unknown, after: unknown): boolean {
  if (equalLocationValue(before, after)) return false
  if (before == null || before === '') return after != null && after !== ''
  if (Array.isArray(before))
    return before.length === 0 && Array.isArray(after) && after.length > 0
  if (
    typeof before !== 'object' ||
    Array.isArray(after) ||
    !after ||
    typeof after !== 'object'
  )
    return false
  const previous = before as Record<string, unknown>
  const next = after as Record<string, unknown>
  return (
    Object.keys(previous).every(
      key =>
        equalLocationValue(previous[key], next[key]) ||
        fillsMissingLocationValue(previous[key], next[key]),
    ) &&
    Object.keys(next).some(key => fillsMissingLocationValue(previous[key], next[key]))
  )
}
