// VALIDATION
import { z } from 'zod'
// DOMAIN
import {
  FeatureRevisionContentSchema,
  FEATURE_CONTENT_MERGE_POLICY,
} from './featureContent'
import { equalRevisionValue } from './value'
// TYPES
import type { FeatureRevisionContent } from './featureContent'
import type {
  RevisionConflict,
  RevisionValue,
  RevisionSlot,
  RevisionResolution,
} from './merge'

// TABLE OF CONTENTS
// 1. Partial proposal contract
// 2. Deterministic changes from inspected content
// 3. Conflict-aware application to the current record

const key = z
  .string()
  .min(1)
  .max(200)
  .refine(
    value => !['__proto__', 'prototype', 'constructor'].includes(value),
    'Unsafe field key',
  )
const path = z
  .array(key)
  .min(1)
  .max(8)
  .refine(
    value =>
      ['profile', 'placement', 'detachedBrands', 'translations', 'properties'].includes(
        value[0],
      ),
    'Unsupported Feature field',
  )
  .refine(
    value =>
      !value
        .slice(0, -1)
        .some((_, index) =>
          FEATURE_CONTENT_MERGE_POLICY.isAtomic(value.slice(0, index + 1)),
        ),
    'Dependent fields must be proposed together',
  )
const galleryEntry = FeatureRevisionContentSchema.shape.gallery.shape.entries.valueType
const operations = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('set'), path, value: z.json() }),
  z.strictObject({ op: z.literal('remove'), path }),
  z.strictObject({ op: z.literal('addImage'), imageId: key, entry: galleryEntry }),
  z.strictObject({ op: z.literal('removeImage'), imageId: key }),
  z.strictObject({
    op: z.literal('editImage'),
    imageId: key,
    changes: galleryEntry.partial(),
  }),
  z.strictObject({ op: z.literal('orderImages'), imageIds: z.array(key).max(1000) }),
])
/** Server-built partial changes. Referenced catalogue definitions and image pins still require authorization. */
export const FeatureChangesSchema = z.strictObject({
  format: z.literal('feature-changes/v1'),
  operations: z.array(operations).max(2000),
})
export type FeatureChanges = z.infer<typeof FeatureChangesSchema>
export type FeatureChangeResult =
  | { status: 'ready'; content: FeatureRevisionContent }
  | { status: 'conflict'; conflicts: RevisionConflict[] }

/** Read an own JSON field without conflating omission with explicit null.
 * @param value Complete JSON value. @param keys Field path. @returns Present or missing slot.
 */
function read(value: RevisionValue, keys: readonly string[]): RevisionSlot {
  let current = value
  for (const name of keys) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !Object.hasOwn(current, name)
    )
      return { present: false }
    current = current[name]
  }
  return { present: true, value: current }
}

/** Compare two slots including absence.
 * @param a First slot. @param b Second slot. @returns Whether both have identical JSON meaning.
 */
function same(a: RevisionSlot, b: RevisionSlot): boolean {
  return a.present && b.present
    ? equalRevisionValue(a.value, b.value)
    : a.present === b.present
}

/** Write a validated own field on an isolated content copy.
 * @param value Mutable copy. @param keys Safe field path. @param slot Resulting field state.
 * @returns Nothing. @remarks Missing parent objects are not fabricated by partial edits.
 */
function write(
  value: RevisionValue,
  keys: readonly string[],
  slot: RevisionSlot,
): void {
  const parent = read(value, keys.slice(0, -1))
  if (
    !parent.present ||
    parent.value === null ||
    typeof parent.value !== 'object' ||
    Array.isArray(parent.value)
  )
    throw new Error('Proposed field parent no longer exists')
  const name = keys.at(-1)!
  if (slot.present)
    Object.defineProperty(parent.value, name, {
      value: structuredClone(slot.value),
      enumerable: true,
      writable: true,
      configurable: true,
    })
  else delete parent.value[name]
}

/** Derive only changed fields and explicit gallery operations from inspected server content.
 * @param base Accepted content at contribution time. @param proposed Validated proposed content.
 * @returns A partial proposal, without a duplicate complete Feature snapshot.
 * @remarks Dependent values such as a Location association or property selection remain atomic.
 */
export function buildFeatureChanges(
  base: FeatureRevisionContent,
  proposed: FeatureRevisionContent,
): FeatureChanges {
  const before = FeatureRevisionContentSchema.parse(base),
    after = FeatureRevisionContentSchema.parse(proposed)
  const result: FeatureChanges = { format: 'feature-changes/v1', operations: [] }
  const walk = (keys: string[]): void => {
    const a = read(before, keys),
      b = read(after, keys)
    if (same(a, b)) return
    if (
      a.present &&
      b.present &&
      a.value !== null &&
      b.value !== null &&
      typeof a.value === 'object' &&
      typeof b.value === 'object' &&
      !Array.isArray(a.value) &&
      !Array.isArray(b.value) &&
      !FEATURE_CONTENT_MERGE_POLICY.isAtomic(keys)
    ) {
      for (const name of [
        ...new Set([...Object.keys(a.value), ...Object.keys(b.value)]),
      ].sort())
        walk([...keys, name])
    } else
      result.operations.push(
        b.present
          ? { op: 'set', path: keys, value: b.value }
          : { op: 'remove', path: keys },
      )
  }
  for (const name of [
    'profile',
    'placement',
    'detachedBrands',
    'translations',
    'properties',
  ])
    walk([name])
  for (const imageId of before.gallery.order)
    if (!Object.hasOwn(after.gallery.entries, imageId))
      result.operations.push({ op: 'removeImage', imageId })
  for (const imageId of after.gallery.order) {
    const entry = after.gallery.entries[imageId],
      old = before.gallery.entries[imageId]
    if (!old) result.operations.push({ op: 'addImage', imageId, entry })
    else if (!equalRevisionValue(old, entry)) {
      const changes: Partial<typeof entry> = {}
      for (const name of Object.keys(entry) as (keyof typeof entry)[])
        if (!equalRevisionValue(old[name], entry[name]))
          Object.assign(changes, { [name]: entry[name] })
      result.operations.push({ op: 'editImage', imageId, changes })
    }
  }
  const natural = [
    ...before.gallery.order.filter(id => Object.hasOwn(after.gallery.entries, id)),
    ...after.gallery.order.filter(id => !Object.hasOwn(before.gallery.entries, id)),
  ]
  if (!equalRevisionValue(natural, after.gallery.order))
    result.operations.push({ op: 'orderImages', imageIds: after.gallery.order })
  return FeatureChangesSchema.parse(result)
}

/** Apply reviewed partial changes to the latest accepted content while preserving unrelated edits.
 * @param base Immutable revision from which the proposal was authored.
 * @param current Current accepted Feature, regardless of publication state.
 * @param proposal Stored partial changes.
 * @param resolutions Explicit choices for every displayed conflict, fenced against current content by the caller.
 * @returns Validated resulting content or overlapping-field conflicts. Nothing is persisted here.
 * @remarks Adding a photo never replaces the gallery. Removes conflict with intervening edits.
 */
export function applyFeatureChanges(
  base: FeatureRevisionContent,
  current: FeatureRevisionContent,
  proposal: FeatureChanges,
  resolutions?: readonly RevisionResolution[],
): FeatureChangeResult {
  const baseline = FeatureRevisionContentSchema.parse(base),
    content = FeatureRevisionContentSchema.parse(current)
  const changes = FeatureChangesSchema.parse(proposal),
    conflicts: RevisionConflict[] = []
  const touched: string[][] = []
  const resolved = new Map(
    (resolutions ?? []).map(resolution => [
      JSON.stringify(resolution.path),
      resolution.result,
    ]),
  )
  const encountered = new Set<string>()
  const conflict = (value: RevisionConflict): RevisionSlot | undefined => {
    const key = JSON.stringify(value.path)
    encountered.add(key)
    const result = resolved.get(key)
    if (result === undefined) conflicts.push(value)
    return result
  }
  const update = (keys: string[], next: RevisionSlot): void => {
    if (
      touched.some(
        previous =>
          previous.every((key, index) => keys[index] === key) ||
          keys.every((key, index) => previous[index] === key),
      )
    )
      throw new Error('Overlapping operations in one proposal')
    touched.push(keys)
    const before = read(baseline, keys),
      now = read(current, keys)
    if (!same(before, now) && !same(now, next)) {
      const choice = conflict({
        path: keys,
        base: before,
        current: now,
        proposed: next,
      })
      if (choice === undefined) return
      next = choice
    }
    if (same(now, next)) return
    const parent = read(content, keys.slice(0, -1))
    if (!parent.present || parent.value === null || typeof parent.value !== 'object') {
      if (resolutions) throw new Error('Resolved field parent no longer exists')
      conflict({ path: keys, base: before, current: now, proposed: next })
      return
    }
    write(content, keys, next)
  }
  // Apply field edits first; gallery membership and order have explicit independent semantics.
  for (const operation of changes.operations) {
    switch (operation.op) {
      case 'set':
        update(operation.path, { present: true, value: operation.value })
        break
      case 'remove':
        update(operation.path, { present: false })
        break
      case 'addImage': {
        if (Object.hasOwn(baseline.gallery.entries, operation.imageId))
          throw new Error('An existing image requires editImage')
        update(['gallery', 'entries', operation.imageId], {
          present: true,
          value: operation.entry,
        })
        if (
          Object.hasOwn(content.gallery.entries, operation.imageId) &&
          !content.gallery.order.includes(operation.imageId)
        )
          content.gallery.order.push(operation.imageId)
        break
      }
      case 'removeImage': {
        if (!Object.hasOwn(baseline.gallery.entries, operation.imageId))
          throw new Error('Cannot remove an image absent from the base revision')
        update(['gallery', 'entries', operation.imageId], { present: false })
        if (!Object.hasOwn(content.gallery.entries, operation.imageId))
          content.gallery.order = content.gallery.order.filter(
            id => id !== operation.imageId,
          )
        break
      }
      case 'editImage': {
        if (!Object.hasOwn(baseline.gallery.entries, operation.imageId))
          throw new Error('Cannot edit an image absent from the base revision')
        for (const [field, value] of Object.entries(operation.changes))
          update(['gallery', 'entries', operation.imageId, field], {
            present: true,
            value,
          })
        break
      }
      case 'orderImages':
        break
    }
  }
  const orders = changes.operations.filter(operation => operation.op === 'orderImages')
  if (orders.length > 1)
    throw new Error('Only one gallery order operation is permitted')
  if (orders.length) {
    const order = orders[0].imageIds
    if (new Set(order).size !== order.length)
      throw new Error('Gallery order contains duplicate images')
    const existing = baseline.gallery.order.filter(id =>
      Object.hasOwn(current.gallery.entries, id),
    )
    const actual = current.gallery.order.filter(id =>
      Object.hasOwn(baseline.gallery.entries, id),
    )
    if (
      !equalRevisionValue(existing, actual) ||
      order.some(id => !Object.hasOwn(content.gallery.entries, id))
    ) {
      const choice = conflict({
        path: ['gallery', 'order'],
        base: { present: true, value: baseline.gallery.order },
        current: { present: true, value: current.gallery.order },
        proposed: { present: true, value: order },
      })
      if (choice) {
        if (
          !choice.present ||
          !Array.isArray(choice.value) ||
          choice.value.some(id => typeof id !== 'string')
        )
          throw new Error('Resolved gallery order must be an array of image IDs')
        content.gallery.order = choice.value as string[]
      }
    } else
      content.gallery.order = [
        ...order,
        ...content.gallery.order.filter(id => !order.includes(id)),
      ]
  }
  if (
    resolutions &&
    (resolved.size !== resolutions.length ||
      resolved.size !== encountered.size ||
      [...resolved.keys()].some(key => !encountered.has(key)))
  )
    throw new Error(
      'Resolve every displayed conflict exactly once; unrelated edits require a new proposal',
    )
  return conflicts.length
    ? { status: 'conflict', conflicts }
    : { status: 'ready', content: FeatureRevisionContentSchema.parse(content) }
}
