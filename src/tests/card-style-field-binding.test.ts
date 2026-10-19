// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
// @ts-expect-error The private JS runtime has no declarations; exercise the installed parser.
import * as kitForms from '../../node_modules/@sveltejs/kit/src/runtime/form-utils.js'
import Picker from '#lib/bits/patterns/forms/formCardStyleSection/FormCardStyleSection.svelte'

// Keep the real selector/input and isolate decorative wrappers from this contract.
vi.mock('#lib/bits/custom/index.js', async () => {
  const { default: Component } = await import('./mocks/svelte-component.svelte')
  return { LocalSearch: Component, SectionHeader: Component }
})
vi.mock('#lib/bits/patterns/cards/mapStyleCard/index.js', async () => {
  const { default: Component } = await import('./mocks/svelte-component.svelte')
  return { MapStyleCard: { Root: Component, Preview: Component, Body: Component } }
})
afterEach(cleanup)

it.each(['project', 'layer', 'inherit'] as const)(
  'submits the bound %s card choice through SvelteKit conversion',
  scope => {
    const fields = kitForms.create_field_proxy({
      form_id: 'card-test',
      get: () => ({}),
      set: vi.fn(),
      get_issues: () => ({}),
      get_touched: () => ({}),
      get_dirty: () => ({}),
    })
    const value = scope === 'inherit' ? '' : 'no-description'
    const field =
      scope === 'project'
        ? fields.data.cardStyleCode
        : fields.data.metadata.cardStyleCode
    const { container } = render(Picker, {
      value: value || null,
      allowInherit: scope !== 'project',
      inputAttrs: field.as('hidden', value),
      onSelect: vi.fn(),
    })
    const input = container.querySelector('input')!
    const data = new FormData()
    data.set(input.name, input.value)
    expect(kitForms.convert_formdata('card-test', data)).toEqual({
      data:
        scope === 'project'
          ? { cardStyleCode: value }
          : { metadata: { cardStyleCode: value } },
    })
  },
)
