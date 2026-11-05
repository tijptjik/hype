/** JSON content only; authorization and identity controls are excluded by the caller. */
export type RevisionValue =
  | null
  | boolean
  | number
  | string
  | RevisionValue[]
  | {
      [key: string]: RevisionValue
    }

/** Missing is represented explicitly so removal differs from a JSON null value. */
export type RevisionSlot = { present: false } | { present: true; value: RevisionValue }
/**
 * Compares normalized JSON values without treating object key order as a change.
 * @param left First content value.
 * @param right Second content value.
 * @returns Whether values have identical JSON meaning, including array order.
 */
export function equalRevisionValue(left: RevisionValue, right: RevisionValue): boolean {
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
      left.every((value, index) => equalRevisionValue(value, right[index]))
    )
  }
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      key => Object.hasOwn(right, key) && equalRevisionValue(left[key], right[key]),
    )
  )
}
