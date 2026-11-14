// @vitest-environment jsdom
// TESTING
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
// COMPONENTS
import Fixture from './fixtures/components/DisplayTemplateFixture.svelte'

vi.mock('#lib/api/featureIntents.remote.js', () => ({
  getFeatureNamingExamples: vi.fn().mockResolvedValue([]),
}))

afterEach(cleanup)
it('retains component options while editing text and removes only the selected block', async () => {
  vi.useRealTimers()
  const view = render(Fixture)
  const original = '{{ pair(brand.name, branch, " - ") ?? source.name }}'
  expect(view.getByRole('group', { name: 'Options' })).toBeTruthy()
  await fireEvent.click(view.getByRole('button', { name: `Select ${original}` }))
  await fireEvent.input(view.getByRole('textbox', { name: 'Separator' }), {
    target: { value: ' / ' },
  })
  await fireEvent.input(view.getByRole('textbox', { name: 'Text 1' }), {
    target: { value: 'Hello ' },
  })
  expect(
    (view.getByRole('textbox', { name: 'Separator' }) as HTMLInputElement).value,
  ).toBe(' / ')
  expect(view.container.querySelector('output')?.textContent).toBe(
    'Hello Sample Brand / Sample Branch',
  )
  await fireEvent.click(
    view.getByRole('button', {
      name: 'Remove {{ pair(brand.name, branch, " / ") ?? source.name }}',
    }),
  )
  expect(view.container.querySelector('output')?.textContent).toBe('Hello ')
  expect(view.getByRole('group', { name: 'Options' }).textContent).toContain(
    'Select a component block',
  )
})

it('keeps the complete previous preview until refreshed inputs arrive', async () => {
  let finish:
    | ((
        rows: import('#lib/db/services/featureNamingExamples.js').FeatureNamingExample[],
      ) => void)
    | undefined
  const loadExamples = vi
    .fn()
    .mockResolvedValueOnce([
      {
        id: 'one',
        title: 'Saved record',
        values: { 'brand.name': 'Shop', branch: 'Central', 'source.name': 'Old name' },
        missing: [],
      },
    ])
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
  const view = render(Fixture, { loadExamples })
  await waitFor(() =>
    expect(view.container.querySelector('output')?.textContent).toBe('Shop - Central'),
  )
  await fireEvent.click(
    view.getByRole('button', {
      name: 'Select {{ pair(brand.name, branch, " - ") ?? source.name }}',
    }),
  )
  const buttons = view.getAllByRole('button', { name: /properties.open/ })
  await fireEvent.click(buttons[0])
  await waitFor(() => expect(loadExamples).toHaveBeenCalledTimes(2))
  expect(view.container.querySelector('output')?.textContent).toBe('Shop - Central')
  expect(view.getByText('Example: Saved record')).toBeTruthy()
  finish?.([
    {
      id: 'two',
      title: 'Refreshed record',
      values: { 'properties.open': 'Open', branch: 'East', 'source.name': 'New name' },
      missing: [],
    },
  ])
  await waitFor(() =>
    expect(view.container.querySelector('output')?.textContent).toBe('Open - East'),
  )
})

it('reorders blocks with the keyboard while preserving surrounding text', async () => {
  const view = render(Fixture)
  await fireEvent.click(
    view.getByRole('button', { name: 'Insert Property', exact: true }),
  )
  const block = view.getByRole('button', {
    name: 'Select {{ source.name }}',
    exact: true,
  })
  await fireEvent.keyDown(block, { key: 'ArrowLeft', altKey: true })
  expect(view.container.querySelector('output')?.textContent).toBe(
    'Sample NameSample Brand - Sample Branch',
  )
  expect(
    view
      .getByRole('button', { name: 'Select {{ source.name }}', exact: true })
      .getAttribute('aria-pressed'),
  ).toBe('true')
})

it('accepts pasted expressions and switches back to selectable blocks', async () => {
  const view = render(Fixture)
  await fireEvent.click(
    view.getByRole('button', { name: 'Edit expression as text', exact: true }),
  )
  const input = view.getByRole('textbox', { name: 'Expression', exact: true })
  await fireEvent.input(input, {
    target: { value: '{{ join(brand.name, branch, " / ") }}' },
  })
  expect(view.container.querySelector('output')?.textContent).toBe(
    'Sample Brand / Sample Branch',
  )
  await fireEvent.input(input, { target: { value: '{{ unknown(brand.name) }}' } })
  expect(view.getByRole('alert').textContent).toContain('Unknown function')
  await fireEvent.input(input, { target: { value: '{{ source.name }}' } })
  await fireEvent.click(view.getByRole('button', { name: 'Show blocks', exact: true }))
  expect(view.getByRole('button', { name: 'Select {{ source.name }}' })).toBeTruthy()
})

it('provides the field catalogue and returns from LLM help to a pasteable expression', async () => {
  const view = render(Fixture)
  await fireEvent.click(view.getByRole('button', { name: 'Ask your LLM' }))
  const prompt = view.getByRole('textbox', {
    name: 'LLM naming prompt',
  }) as HTMLTextAreaElement
  expect(prompt.value).toContain('properties.open')
  expect(prompt.value).toContain('First ask how I would like')
  expect(prompt.value).toContain('not JavaScript')
  await fireEvent.click(view.getByRole('button', { name: 'Back to expression' }))
  expect(view.getByRole('textbox', { name: 'Expression', exact: true })).toBeTruthy()
})
