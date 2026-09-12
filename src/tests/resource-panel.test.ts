// @vitest-environment jsdom
import { writable } from 'svelte/store'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ResourceSection from '$lib/bits/patterns/resourcePanel/components/ResourceSection.svelte'
import type { ResourcePanelSection } from '$lib/bits/patterns/resourcePanel'

// Geometry and FLIP are checked in Chromium; keep jsdom focused on the controls.
vi.mock('@tanstack/svelte-virtual', () => ({
  createVirtualizer: () =>
    writable({
      range: null,
      setOptions: vi.fn(),
      measureElement: vi.fn(),
      getTotalSize: () => 0,
      getVirtualItems: () => [],
    }),
}))

beforeEach(() => {
  vi.useRealTimers()
  // jsdom has no Web Animations API; real animation is verified in Chromium.
  HTMLElement.prototype.getAnimations = vi.fn(() => [])
  HTMLElement.prototype.scrollTo = vi.fn()
})
afterEach(() => {
  cleanup()
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
  delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations
})

const section = (count: number): ResourcePanelSection => ({
  id: 'layer',
  title: 'Layers',
  search: '',
  defaultOpen: true,
  loading: false,
  error: false,
  viewKey: 'layers',
  onSearch: vi.fn(),
  onReset: vi.fn(),
  onNext: vi.fn(),
  onRetry: vi.fn(),
  onVisible: vi.fn(),
  rows: Array.from({ length: count }, (_, index) => ({
    id: String(index),
    name: `Layer ${index}`,
    breadcrumbs: ['Organisation', 'Project'],
    selected: index === 0,
    active: false,
    enabled: index === 0,
    primaryLabel: `Toggle layer ${index}`,
    toggleLabel: `Unpin layer ${index}`,
    onPrimary: vi.fn(),
    onToggle: vi.fn(),
    onIsolate: vi.fn(),
  })),
})

it('shows search at five rows and keeps a typed search available when results shrink', async () => {
  const view = render(ResourceSection, { section: section(4) })
  expect(screen.queryByRole('searchbox')).toBeNull()
  await view.rerender({ section: section(5) })
  expect(screen.getByRole('searchbox')).toBeTruthy()
  await view.rerender({ section: { ...section(1), search: 'Layer' } })
  expect(screen.getByRole('searchbox')).toBeTruthy()
})

it('keeps layer additive, exclusive and collapsed-chip actions separate', async () => {
  const model = section(1)
  render(ResourceSection, { section: model })
  expect(screen.queryByRole('button', { name: 'Unpin layer 0' })).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle layer 0' }))
  expect(model.rows[0].onPrimary).toHaveBeenCalledOnce()
  await fireEvent.click(screen.getByRole('button', { name: 'Isolate Layer 0' }))
  expect(model.rows[0].onIsolate).toHaveBeenCalledOnce()
  expect(model.rows[0].onToggle).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Collapse Layers' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Layer 0' }))
  expect(model.rows[0].onToggle).toHaveBeenCalledOnce()
})

it('uses compact names in collapsed tags while preserving full row names', async () => {
  const model = section(1)
  model.rows[0].shortName = 'All'
  render(ResourceSection, { section: model })
  expect(screen.getByText('Layer 0')).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: 'Collapse Layers' }))
  expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
  expect(screen.queryByText('Layer 0')).toBeNull()
})
