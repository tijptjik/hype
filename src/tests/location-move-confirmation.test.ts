// @vitest-environment jsdom
// TESTS
import { cleanup, fireEvent, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LocationMoveConfirmation from '#lib/bits/patterns/forms/featureLocation/LocationMoveConfirmation.svelte'

beforeEach(() => vi.useRealTimers())
afterEach(cleanup)
it.each(['building', 'address'] as const)(
  'keeps %s marker movement behind explicit confirmation or cancellation',
  async kind => {
    const onConfirm = vi.fn(),
      onCancel = vi.fn()
    const view = render(LocationMoveConfirmation, {
      kind,
      distance: 23.7,
      onConfirm,
      onCancel,
    })
    expect(view.getByRole('alert').textContent).toContain('24 m')
    await fireEvent.click(view.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
    await fireEvent.click(
      view.getByRole('button', {
        name:
          kind === 'building'
            ? 'Move marker and link building'
            : 'Move marker and use address',
      }),
    )
    expect(onConfirm).toHaveBeenCalledOnce()
  },
)
