// TESTS
import { expect, it } from 'vitest'
// CLIENT
import {
  captureFormNavigationSnapshot,
  invalidateFormNavigationSnapshots,
  isCurrentFormNavigationSnapshot,
} from '#lib/client/formNavigationSnapshot.js'

it('retains independent history entries without later edits mutating them', () => {
  const draft = { names: { en: 'Before' }, coordinates: [114, 22] }
  const before = captureFormNavigationSnapshot('account-a:new', draft)
  draft.names.en = 'After'
  const after = captureFormNavigationSnapshot('account-a:new', draft)
  expect(before.value.names.en).toBe('Before')
  expect(after.value.names.en).toBe('After')
  expect(isCurrentFormNavigationSnapshot('account-a:new', before)).toBe(true)
  expect(isCurrentFormNavigationSnapshot('account-a:new', after)).toBe(true)
})

it('isolates accounts and feature references', () => {
  const saved = captureFormNavigationSnapshot('account-a:feature-1', { title: 'Draft' })
  expect(isCurrentFormNavigationSnapshot('account-b:feature-1', saved)).toBe(false)
  expect(isCurrentFormNavigationSnapshot('account-a:feature-2', saved)).toBe(false)
})

it.each(['save', 'reset'])(
  '%s invalidates every older entry while allowing a fresh draft',
  () => {
    const scope = `account-a:${crypto.randomUUID()}`
    const first = captureFormNavigationSnapshot(scope, { title: 'One' })
    const second = captureFormNavigationSnapshot(scope, { title: 'Two' })
    const other = captureFormNavigationSnapshot('other-form', { title: 'Other' })
    invalidateFormNavigationSnapshots(scope)
    const fresh = captureFormNavigationSnapshot(scope, { title: 'Fresh' })
    expect(isCurrentFormNavigationSnapshot(scope, first)).toBe(false)
    expect(isCurrentFormNavigationSnapshot(scope, second)).toBe(false)
    expect(isCurrentFormNavigationSnapshot(scope, fresh)).toBe(true)
    expect(isCurrentFormNavigationSnapshot('other-form', other)).toBe(true)
  },
)

it('rejects checkpoints from a previous runtime without requiring browser storage', () => {
  expect(
    isCurrentFormNavigationSnapshot('old-runtime', {
      scope: 'old-runtime',
      revision: 'previous-runtime',
      value: { title: 'Stale' },
    }),
  ).toBe(false)
})
