// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MapAddressSuggestion from '#lib/bits/patterns/forms/formFeatureAddress/MapAddressSuggestion.svelte'
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)
it('shows the proposed parts and applies only by explicit click; dismiss is independent', async () => {
  const onApply = vi.fn(),
    onDismiss = vi.fn()
  const view = render(MapAddressSuggestion, {
    parts: { block: { type: 'tower', ref: 'B', label: 'Tower B' } },
    onApply,
    onDismiss,
  })
  expect(view.getByText('Tower B')).toBeTruthy()
  expect(onApply).not.toHaveBeenCalled()
  await fireEvent.click(
    view.getByRole('button', { name: 'Dismiss missing address parts' }),
  )
  expect(onDismiss).toHaveBeenCalledOnce()
  expect(onApply).not.toHaveBeenCalled()
  await fireEvent.click(view.getByRole('button', { name: 'Add missing parts Tower B' }))
  expect(onApply).toHaveBeenCalledOnce()
})
