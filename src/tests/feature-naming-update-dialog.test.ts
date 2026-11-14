// @vitest-environment jsdom
// TESTS
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import FeatureNamingUpdateDialog from '#lib/bits/patterns/forms/featureIntent/FeatureNamingUpdateDialog.svelte'
vi.mock('#lib/context/responsive.svelte.js', async importOriginal => {
  const module =
    await importOriginal<typeof import('#lib/context/responsive.svelte.js')>()
  return { ...module, getResponsiveCtx: () => new module.ResponsiveCtx() }
})
const preview = vi.hoisted(() => vi.fn())
vi.mock('#lib/api/featureIntents.remote.js', () => ({
  previewFeatureNamingDefault: preview,
}))
const props = {
  typeIds: ['object'],
  policyScope: { type: 'project' as const, id: 'p' },
  patch: { definition: null, namingRules: {}, version: 1, fingerprint: 'policy' },
  onCancel: vi.fn(),
}
beforeEach(() => vi.useRealTimers())
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('requires opening the before/after preview before choosing existing Features', async () => {
  preview.mockResolvedValue({
    token: 'review',
    rows: [
      {
        id: 'one',
        status: 'update',
        names: [{ locale: 'en', before: 'Old', after: 'New' }],
      },
      {
        id: 'two',
        status: 'override',
        names: [{ locale: 'en', before: 'Custom', after: 'Custom' }],
      },
    ],
  })
  const onChoose = vi.fn()
  const view = render(FeatureNamingUpdateDialog, { ...props, onChoose })
  expect(preview).not.toHaveBeenCalled()
  await fireEvent.click(view.getByRole('button', { name: 'Review changes' }))
  await waitFor(() => expect(view.getByText('Old')).toBeTruthy())
  expect(view.getByText('New')).toBeTruthy()
  await fireEvent.click(view.getByRole('button', { name: 'Apply naming rule' }))
  expect(onChoose).toHaveBeenCalledWith('review', {
    typeIds: ['object'],
    resetRules: false,
    resetTitles: false,
  })
})
it('requires review for resets and retains choices across preview errors', async () => {
  preview
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ token: 'retry', rows: [] })
  const onChoose = vi.fn()
  const view = render(FeatureNamingUpdateDialog, { ...props, onChoose })
  await fireEvent.click(view.getByRole('radio', { name: /Apply across all layers/ }))
  await fireEvent.click(view.getByRole('radio', { name: /Reset all custom titles/ }))
  await fireEvent.click(view.getByRole('button', { name: 'Review changes' }))
  await waitFor(() => expect(view.getByRole('alert')).toBeTruthy())
  expect(
    (view.getByRole('button', { name: 'Confirm changes' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  await fireEvent.click(view.getByRole('button', { name: 'Retry preview' }))
  await waitFor(() =>
    expect(view.getByText('No existing feature names will change.')).toBeTruthy(),
  )
  await fireEvent.click(view.getByRole('button', { name: 'Confirm changes' }))
  expect(onChoose).toHaveBeenCalledWith('retry', {
    typeIds: ['object'],
    resetRules: true,
    resetTitles: true,
  })
})
