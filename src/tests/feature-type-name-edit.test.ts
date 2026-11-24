// @vitest-environment jsdom
// TESTS
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
// FIXTURE
import DataModelTranslationFixture from './fixtures/components/DataModelTranslationFixture.svelte'
// DOMAIN
import { DEFAULT_FEATURE_TYPES } from '#lib/features/intents.js'

// jsdom has no font-loading or layout engine for the responsive header.
vi.mock('#lib/bits/custom/form/fitSectionHeader.js', () => ({
  fitSectionHeader: () => {},
}))
vi.mock('#lib/api/featureIntents.remote.js', () => ({
  getFeatureIntentSettings: async () => ({
    types: [DEFAULT_FEATURE_TYPES[0]],
    inheritedTypes: [DEFAULT_FEATURE_TYPES[0]],
    definition: null,
    namingRules: {},
  }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('keeps inherited names read-only and updates the owning custom draft on edit', async () => {
  vi.useRealTimers()
  const warn = vi.spyOn(console, 'warn')
  const { container } = render(DataModelTranslationFixture)
  await waitFor(() =>
    expect(container.querySelector('[data-inherited-schema]')).toBeTruthy(),
  )
  const inheritedNames = container.querySelector<HTMLElement>(
    '[data-inherited-schema] [data-type-names]',
  )!
  expect(within(inheritedNames).queryByRole('textbox')).toBeNull()
  const toolbar = container.querySelector<HTMLElement>('[data-feature-type-toolbar]')!
  await fireEvent.click(within(toolbar).getByRole('switch', { name: 'Custom' }))
  const card = container.querySelector<HTMLElement>(
    '[data-type-list] [data-feature-type-section]',
  )!
  const editor = within(card.querySelector<HTMLElement>('[data-type-names]')!)
  await fireEvent.click(editor.getByRole('button', { name: 'Display name' }))
  await fireEvent.input(editor.getByRole('textbox', { name: 'Display name' }), {
    target: { value: 'Test type' },
  })
  await waitFor(() => {
    const draft =
      container.querySelector<HTMLElement>('[data-model-fixture]')?.dataset.draft
    expect(JSON.parse(draft ?? '{}').definition?.at(-1)).toMatchObject({
      id: 'test-type',
      label: 'Test type',
      labels: { en: 'Test type' },
    })
  })
  expect(warn.mock.calls.flat().join(' ')).not.toMatch(
    /ownership_invalid_(binding|mutation)/,
  )
})
