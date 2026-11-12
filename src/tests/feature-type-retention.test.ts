// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
import FeatureIntentChoice from '#lib/bits/patterns/forms/featureIntent/FeatureIntentChoice.svelte'
import { DEFAULT_FEATURE_TYPES } from '#lib/features/intents.js'
const options = vi.hoisted(() => vi.fn())
vi.mock('#lib/api/featureIntents.remote.js', () => ({
  getFeatureIntentOptions: options,
}))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

it('retains an explicit choice while loading and restores it even when selection is required', async () => {
  let resolve!: (value: typeof DEFAULT_FEATURE_TYPES) => void
  options.mockReturnValue(
    new Promise(done => {
      resolve = done
    }),
  )
  const onChange = vi.fn()
  const selected = DEFAULT_FEATURE_TYPES[1]!
  render(FeatureIntentChoice, {
    layerId: 'layer',
    value: selected.id,
    requireSelection: true,
    onChange,
  })
  expect(onChange).not.toHaveBeenCalled()
  resolve(DEFAULT_FEATURE_TYPES)
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(selected))
  expect(onChange).not.toHaveBeenCalledWith(null)
})

it('preserves the selected type through a failed options request and retry', async () => {
  const selected = DEFAULT_FEATURE_TYPES[1]!
  options
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue(DEFAULT_FEATURE_TYPES)
  const onChange = vi.fn()
  render(FeatureIntentChoice, {
    layerId: 'layer',
    value: selected.id,
    requireSelection: true,
    onChange,
  })
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect(onChange).not.toHaveBeenCalled()
  screen.getByRole('button', { name: /retry|try again/i }).click()
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(selected))
  expect(onChange).not.toHaveBeenCalledWith(null)
})

it('clears a choice only after the resolved layer options exclude it', async () => {
  options.mockResolvedValue([])
  const onChange = vi.fn()
  render(FeatureIntentChoice, {
    layerId: 'other-layer',
    value: DEFAULT_FEATURE_TYPES[1]!.id,
    requireSelection: true,
    onChange,
  })
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(null))
})
