// @vitest-environment jsdom
// TESTS
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
// CONTEXT
import { ImportCtx } from '#lib/context/import.svelte.js'
// COMPONENTS
import LayerMatchingStep from '#lib/bits/patterns/import/components/features/steps/layers/LayerMatchingStep.svelte'

vi.mock('#lib/context/responsive.svelte.js', async original => {
  const module = await original<typeof import('#lib/context/responsive.svelte.js')>()
  return { ...module, getResponsiveCtx: () => new module.ResponsiveCtx() }
})
afterEach(cleanup)

it('filters fallback layer choices using the entered search text and clears the filter', async () => {
  vi.useRealTimers()
  const ctx = new ImportCtx()
  ctx.setLayerValidation({ showLayerSelection: true })
  ctx.setLayersLoaded(true)
  ctx.setAllLayers([
    { id: 'alpha', i18n: { en: { name: 'Alpha layer' } } },
    { id: 'beta', i18n: { en: { name: 'Beta layer' } } },
  ] as never)
  render(LayerMatchingStep, { importCtx: ctx })
  const input = screen.getByPlaceholderText('Search for layer...')
  await fireEvent.focus(input)
  expect(screen.getByRole('button', { name: /Alpha layer/ })).toBeTruthy()
  await fireEvent.input(input, { target: { value: 'Beta' } })
  expect(ctx.getLayerSearchQuery()).toBe('Beta')
  expect(screen.queryByRole('button', { name: /Alpha layer/ })).toBeNull()
  expect(screen.getByRole('button', { name: /Beta layer/ })).toBeTruthy()
  await fireEvent.input(input, { target: { value: '' } })
  expect(ctx.getLayerSearchQuery()).toBe('')
  expect(screen.getByRole('button', { name: /Alpha layer/ })).toBeTruthy()
})
