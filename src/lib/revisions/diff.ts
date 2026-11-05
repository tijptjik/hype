// REVISION VALUES
import { equalRevisionValue } from './value'
// TYPES
import type { RevisionSlot, RevisionValue } from './value'

export type RevisionDifference = {
  path: string[]
  before: RevisionSlot
  after: RevisionSlot
}

/**
 * Compares immutable snapshots for history display, preserving missing versus null.
 * @param before Previous snapshot, or absent for an initial capture.
 * @param after Current snapshot.
 * @returns Changed object paths; arrays remain ordered atomic values.
 */
export function diffRevisionValues(
  before: RevisionSlot,
  after: RevisionSlot,
): RevisionDifference[] {
  const changes: RevisionDifference[] = []
  /** Visit object properties without traversing inherited keys.
   * @param left Previous slot.
   * @param right Current slot.
   * @param path Display path.
   * @returns Nothing; appends changes in deterministic key order.
   */
  function visit(left: RevisionSlot, right: RevisionSlot, path: string[]): void {
    if (!left.present && !right.present) return
    if (left.present && right.present && equalRevisionValue(left.value, right.value))
      return
    const isObject = (value: RevisionValue): value is Record<string, RevisionValue> =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
    if (
      left.present &&
      right.present &&
      isObject(left.value) &&
      isObject(right.value)
    ) {
      for (const key of [
        ...new Set([...Object.keys(left.value), ...Object.keys(right.value)]),
      ].sort()) {
        visit(
          Object.hasOwn(left.value, key)
            ? { present: true, value: left.value[key] }
            : { present: false },
          Object.hasOwn(right.value, key)
            ? { present: true, value: right.value[key] }
            : { present: false },
          [...path, key],
        )
      }
    } else changes.push({ path, before: left, after: right })
  }
  visit(before, after, [])
  return changes
}
