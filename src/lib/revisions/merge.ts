// REVISION VALUES
import { equalRevisionValue } from './value'
import type { RevisionValue, RevisionSlot } from './value'
export { equalRevisionValue } from './value'
export type { RevisionValue, RevisionSlot } from './value'

export type RevisionConflict = {
  path: string[]
  base: RevisionSlot
  current: RevisionSlot
  proposed: RevisionSlot
}
export type RevisionMerge =
  | { status: 'merged'; value: RevisionValue }
  | { status: 'conflict'; conflicts: RevisionConflict[] }

/** Server-owned rules for values whose children cannot be approved independently. */
export type RevisionMergePolicy = {
  isAtomic: (path: readonly string[]) => boolean
}

/**
 * Merges independent proposed changes into the latest accepted content.
 * @param base Immutable content from which the proposal was authored.
 * @param current Latest published content inspected by the reviewer.
 * @param proposed Exact submitted candidate content.
 * @param policy Server-owned grouping of dependent values, such as accepted Location references.
 * @returns Complete merged content or explicit conflicts; never a partial publishable result.
 * @remarks Arrays are atomic, including gallery order. Keyed objects merge by field.
 * A remove-versus-edit is a conflict. Callers validate dependent fields after merging,
 * authorize the resulting changes, and fence publication against the inspected heads.
 */
export function mergeRevisionContent(
  base: RevisionValue,
  current: RevisionValue,
  proposed: RevisionValue,
  policy?: RevisionMergePolicy,
): RevisionMerge {
  const conflicts: RevisionConflict[] = []
  const result = mergeSlot(
    slot(base),
    slot(current),
    slot(proposed),
    [],
    conflicts,
    policy,
  )
  if (conflicts.length) return { status: 'conflict', conflicts }
  if (!result.present) throw new Error('A revision root cannot be removed')
  return { status: 'merged', value: result.value }
}

/**
 * Wraps a present JSON value without conflating null and missing fields.
 * @param value Stored content value.
 * @returns Present value slot.
 */
function slot(value: RevisionValue): RevisionSlot {
  return { present: true, value }
}

/**
 * Reads only own object fields, including safely handled prototype-like names.
 * @param value Object containing a field.
 * @param key Field name.
 * @returns Present or missing value slot.
 */
function child(value: Record<string, RevisionValue>, key: string): RevisionSlot {
  return Object.hasOwn(value, key) ? slot(value[key]) : { present: false }
}

/**
 * Tests presence and content equality.
 * @param left First field state.
 * @param right Second field state.
 * @returns Whether both states are equivalent.
 */
function equalSlot(left: RevisionSlot, right: RevisionSlot): boolean {
  return left.present && right.present
    ? equalRevisionValue(left.value, right.value)
    : left.present === right.present
}

/**
 * Narrows a present value to a keyed JSON object.
 * @param value Possibly missing field state.
 * @returns Whether recursive field merging is applicable.
 */
function isObject(
  value: RevisionSlot,
): value is { present: true; value: Record<string, RevisionValue> } {
  return (
    value.present &&
    value.value !== null &&
    typeof value.value === 'object' &&
    !Array.isArray(value.value)
  )
}

/**
 * Resolves one field or accumulates conflicts without guessing a winner.
 * @param base Original field state.
 * @param current Accepted field state.
 * @param proposed Submitted field state.
 * @param path Unescaped field path segments for review rendering.
 * @param conflicts Accumulated review conflicts.
 * @param policy Server-owned indivisible content boundaries.
 * @returns Intermediate field state, usable only when the conflict list remains empty.
 */
function mergeSlot(
  base: RevisionSlot,
  current: RevisionSlot,
  proposed: RevisionSlot,
  path: string[],
  conflicts: RevisionConflict[],
  policy?: RevisionMergePolicy,
): RevisionSlot {
  if (equalSlot(base, proposed) || equalSlot(current, proposed))
    return structuredClone(current)
  if (equalSlot(base, current)) return structuredClone(proposed)
  // Concurrent creation of the same object is reviewed as a conflict, not invented composition.
  if (
    !policy?.isAtomic(path) &&
    isObject(base) &&
    isObject(current) &&
    isObject(proposed)
  ) {
    const value: Record<string, RevisionValue> = {}
    const keys = new Set([
      ...Object.keys(base.value),
      ...Object.keys(current.value),
      ...Object.keys(proposed.value),
    ])
    for (const key of keys) {
      const result = mergeSlot(
        child(base.value, key),
        child(current.value, key),
        child(proposed.value, key),
        [...path, key],
        conflicts,
        policy,
      )
      if (result.present)
        Object.defineProperty(value, key, {
          value: result.value,
          enumerable: true,
          configurable: true,
          writable: true,
        })
    }
    return slot(value)
  }
  conflicts.push(structuredClone({ path, base, current, proposed }))
  return structuredClone(current)
}

/** Reviewer-authored replacement for exactly one conflict in the displayed comparison. */
export type RevisionResolution = { path: string[]; result: RevisionSlot }

/**
 * Resolves all conflicts against the exact three snapshots shown during review.
 * @param base Immutable proposal base.
 * @param current Published snapshot inspected by the reviewer.
 * @param proposed Submitted candidate snapshot.
 * @param resolutions Explicit replacement or removal for every conflicting path.
 * @param policy The same server-owned boundaries used to present the comparison.
 * @returns Complete resolved content; throws for missing, duplicate or unrelated decisions.
 * @remarks This is pure content resolution. Persist the reviewed head guards and
 * resolution evidence, and rerun domain validation before accepting the result.
 */
export function resolveRevisionContent(
  base: RevisionValue,
  current: RevisionValue,
  proposed: RevisionValue,
  resolutions: readonly RevisionResolution[],
  policy?: RevisionMergePolicy,
): RevisionValue {
  const conflicts: RevisionConflict[] = []
  let merged = mergeSlot(
    slot(base),
    slot(current),
    slot(proposed),
    [],
    conflicts,
    policy,
  )
  const expected = new Set(conflicts.map(conflict => JSON.stringify(conflict.path)))
  const supplied = new Set(
    resolutions.map(resolution => JSON.stringify(resolution.path)),
  )
  if (
    supplied.size !== resolutions.length ||
    supplied.size !== expected.size ||
    [...supplied].some(key => !expected.has(key))
  ) {
    throw new Error(
      'Resolve every displayed conflict exactly once; unrelated edits require a new proposal',
    )
  }
  for (const resolution of resolutions) {
    if (resolution.path.length === 0) {
      merged = structuredClone(resolution.result)
      continue
    }
    if (!isObject(merged)) throw new Error('Invalid conflict resolution root')
    let parent = merged.value
    for (const segment of resolution.path.slice(0, -1)) {
      const next = child(parent, segment)
      if (!isObject(next)) throw new Error('Invalid conflict resolution path')
      parent = next.value
    }
    const key = resolution.path[resolution.path.length - 1]
    if (resolution.result.present) {
      Object.defineProperty(parent, key, {
        value: structuredClone(resolution.result.value),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    } else {
      delete parent[key]
    }
  }
  if (!merged.present) throw new Error('A revision root cannot be removed')
  return merged.value
}
