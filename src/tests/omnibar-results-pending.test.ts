// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tick } from 'svelte'
import Results from '#lib/bits/patterns/bars/omnibar/components/OmnibarResults.svelte'
import type { OmnibarResultSection } from '#lib/bits/patterns/bars/omnibar/omnibar.types.js'

vi.mock('#lib/bits/index.js', async () => ({
  Icon: (await import('./mocks/svelte-component.svelte')).default,
}))
vi.mock('#lib/i18n.js', () => ({
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}))
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

function section(
  type: 'feature' | 'layer',
  count: number,
  loading = false,
): OmnibarResultSection {
  return {
    collectionType: type,
    loading,
    limit: 2,
    onSelection: vi.fn(),
    results: Array.from({ length: count }, (_, index) => ({
      ref: `${type}-${index}`,
      name: `${type} match`,
      count: 0,
      collectionType: type,
    })),
  }
}

it('keeps category headings and rows until each replacement settles', async () => {
  const view = render(Results, {
    sections: [section('feature', 1), section('layer', 1)],
  })
  await tick()
  await view.rerender({
    sections: [section('feature', 0, true), section('layer', 0, true)],
  })
  expect(view.getByRole('button', { name: 'omni__title_features' })).toBeTruthy()
  expect(view.getByRole('button', { name: 'maps__layers' })).toBeTruthy()
  expect(view.getByText('feature match')).toBeTruthy()
  expect(view.getByText('layer match')).toBeTruthy()
  expect(view.queryByText('omni__no_results')).toBeNull()

  // One completed empty category must not remove another category still being checked.
  await view.rerender({ sections: [section('feature', 0), section('layer', 0, true)] })
  expect(view.queryByRole('button', { name: 'omni__title_features' })).toBeNull()
  expect(view.getByRole('button', { name: 'maps__layers' })).toBeTruthy()
  await view.rerender({ sections: [section('feature', 0), section('layer', 1)] })
  expect(view.getByText('layer match')).toBeTruthy()
  await view.rerender({ sections: [section('feature', 0), section('layer', 0)] })
  expect(view.queryByRole('button', { name: 'maps__layers' })).toBeNull()
  expect(view.getByText('omni__no_results')).toBeTruthy()
})

it('does not invent categories on first load or retain them after removal', async () => {
  const view = render(Results, { sections: [section('layer', 0, true)] })
  expect(view.queryByRole('button', { name: 'maps__layers' })).toBeNull()
  expect(view.getByText('resource_loading')).toBeTruthy()
  await view.rerender({ sections: [section('layer', 1)] })
  await view.rerender({ sections: [] })
  await view.rerender({ sections: [section('layer', 0, true)] })
  expect(view.queryByRole('button', { name: 'maps__layers' })).toBeNull()
})

it('retains the complete displayed set and count across rapid queries, then replaces them together', async () => {
  const initial = { ...section('feature', 2), totalCount: 174 }
  initial.results[0].name = 'Original first'
  initial.results[1].name = 'Original second'
  const view = render(Results, { sections: [initial] })
  await tick()
  const replacement = { ...section('feature', 1, true), totalCount: 1 }
  replacement.results[0].name = 'New match'
  await view.rerender({ sections: [replacement] })
  expect(view.getByText('Original first')).toBeTruthy()
  expect(view.getByText('Original second')).toBeTruthy()
  expect(view.getByRole('button', { name: 'omni__title_features (174)' })).toBeTruthy()
  expect(view.queryByText('New match')).toBeNull()
  await view.rerender({ sections: [section('feature', 0, true)] })
  expect(view.getByText('Original second')).toBeTruthy()
  await view.rerender({ sections: [{ ...replacement, loading: false }] })
  expect(view.queryByText('Original first')).toBeNull()
  expect(view.queryByText('Original second')).toBeNull()
  expect(view.getByText('New match')).toBeTruthy()
  expect(view.getByRole('button', { name: 'omni__title_features (1)' })).toBeTruthy()
})
