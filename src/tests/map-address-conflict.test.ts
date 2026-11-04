// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MapAddressConflict from '#lib/bits/patterns/forms/formFeatureAddress/MapAddressConflict.svelte'
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)
it('separates the address comparison from explicit accept and review actions', async () => {
  const onAccept = vi.fn(),
    onReview = vi.fn()
  const view = render(MapAddressConflict, {
    conflicts: [{ field: 'number', selected: '238', mapped: '242-244' }],
    onAccept,
    onReview,
  })
  expect(view.getByText('Address differs')).toBeTruthy()
  expect(view.getByText('238 → 242-244')).toBeTruthy()
  await fireEvent.click(view.getByRole('button', { name: 'Review Change' }))
  expect(onReview).toHaveBeenCalledOnce()
  expect(onAccept).not.toHaveBeenCalled()
  await fireEvent.click(view.getByRole('button', { name: 'Accept Change' }))
  expect(onAccept).toHaveBeenCalledOnce()
})
it('prevents duplicate acceptance while resolving the address and exposes a failed lookup', async () => {
  const onAccept = vi.fn(),
    onReview = vi.fn()
  const view = render(MapAddressConflict, {
    conflicts: [],
    onAccept,
    onReview,
    busy: true,
    error: 'Lookup failed',
  })
  expect(
    view.getByRole('button', { name: 'Loading resources' }).hasAttribute('disabled'),
  ).toBe(true)
  expect(
    view.getByRole('button', { name: 'Review Change' }).hasAttribute('disabled'),
  ).toBe(true)
  expect(view.getByRole('status').textContent).toBe('Lookup failed')
})
it('preserves review-only behavior when the owner does not support automatic reassociation', () => {
  const view = render(MapAddressConflict, { conflicts: [], onReview: vi.fn() })
  expect(view.queryByRole('button', { name: 'Accept Change' })).toBeNull()
  expect(view.getByRole('button', { name: 'Review Change' })).toBeTruthy()
})
it('requires review after an ambiguous match and never offers acceptance again', async () => {
  const onAccept = vi.fn(),
    onReview = vi.fn()
  const view = render(MapAddressConflict, {
    conflicts: [{ field: 'number', selected: '238', mapped: '238-240' }],
    error: 'More than one address matches. Review the change to choose one.',
    reviewRequired: true,
    onAccept,
    onReview,
  })
  expect(view.queryByRole('button', { name: 'Accept Change' })).toBeNull()
  await fireEvent.click(view.getByRole('button', { name: 'Review Change' }))
  expect(onReview).toHaveBeenCalledOnce()
  expect(onAccept).not.toHaveBeenCalled()
})

it('keeps move cancellation available while acceptance is in flight', async () => {
  const onCancel = vi.fn(),
    onAccept = vi.fn()
  const view = render(MapAddressConflict, {
    conflicts: [{ field: 'number', selected: '79', mapped: '77-81' }],
    busy: true,
    onAccept,
    onCancel,
    onReview: vi.fn(),
  })
  await fireEvent.click(
    view.getByRole('button', { name: 'Cancel move and return marker' }),
  )
  expect(onCancel).toHaveBeenCalledOnce()
  expect(onAccept).not.toHaveBeenCalled()
})
