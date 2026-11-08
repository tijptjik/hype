// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { getTaskImageBadgeLabel, getTaskImageBadgeClass } from '#lib/client/services/task.js'
import type { ViewerRenderable } from '#lib/bits/patterns/images/images.types.js'

it.each([
  ['accepted', 'ACCEPTED', 'bg-emerald-600'],
  ['rejected', 'REJECTED', 'bg-rose-600'],
  [undefined, null, undefined],
] as const)('uses the research decision %s independently of publication', (outcome, label, color) => {
  const item: ViewerRenderable = { id: 'photo', intent: 'research', isPublished: false, status: { kind: 'persisted' } }
  expect(getTaskImageBadgeLabel(item, [item], true, () => true, outcome)).toBe(label)
  expect(getTaskImageBadgeClass(item, [item], true, () => true, outcome)).toBe(color)
  expect(getTaskImageBadgeLabel(item, [item], true, () => false, outcome)).toBeNull()
})
