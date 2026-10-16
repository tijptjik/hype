// @vitest-environment jsdom
import { writable } from 'svelte/store'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ResourceSection from '#lib/bits/patterns/resourcePanel/components/ResourceSection.svelte'
import type { ResourcePanelSection } from '#lib/bits/patterns/resourcePanel/index.js'

// Geometry and animation are checked in Firefox and Chromium; jsdom has no Web Animations API.
vi.mock('svelte/transition', () => ({
  fly: () => ({ duration: 0 }),
  slide: () => ({ duration: 0 }),
}))

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
  // Layout measurements are exercised in Chromium; jsdom only needs the observer lifecycle.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  // jsdom has no Web Animations API; real animation is verified in Chromium.
  HTMLElement.prototype.getAnimations = vi.fn(() => [])
  HTMLElement.prototype.scrollTo = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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

it('preserves organisation names and primary actions across rail collapse and expansion', async () => {
  const model = section(1)
  model.id = 'organisation'
  model.title = 'Organisations'
  model.rows[0].name = 'HK Ghost Signs'
  model.rows[0].breadcrumbs = []
  model.rows[0].onIsolate = undefined
  const view = render(ResourceSection, { section: model, narrow: false })
  expect(screen.getByText('HK Ghost Signs')).toBeTruthy()
  await fireEvent.click(
    screen.getByRole('button', { name: model.rows[0].primaryLabel }),
  )
  await view.rerender({ section: model, narrow: true })
  expect(
    screen.getByText('HK Ghost Signs').closest('[aria-hidden="true"]'),
  ).toBeTruthy()
  await fireEvent.click(
    screen.getByRole('button', { name: model.rows[0].primaryLabel }),
  )
  await view.rerender({ section: model, narrow: false })
  expect(screen.getByText('HK Ghost Signs').closest('[aria-hidden="true"]')).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: model.rows[0].toggleLabel }))
  expect(model.rows[0].onPrimary).toHaveBeenCalledTimes(2)
  expect(model.rows[0].onToggle).toHaveBeenCalledOnce()
})

it('hands one hover label between compact rows without native tooltips', async () => {
  const { default: ResourcePanel } = await import(
    '#lib/bits/patterns/resourcePanel/ResourcePanel.svelte'
  )
  const { Panel } = await import('#lib/enums.js')
  const model = {
    panel: {
      panelType: Panel.admin,
      position: 'left' as const,
      inline: true,
      scrollable: false,
      isAdmin: true,
      isNarrow: true,
    },
    open: true,
    title: 'Admin',
    sections: [section(2)],
    onClose: vi.fn(),
  }
  const view = render(ResourcePanel, { model })
  const first = screen.getByRole('button', { name: 'Toggle layer 0' })
  const next = screen.getByRole('button', { name: 'Toggle layer 1' })
  expect(first.hasAttribute('title')).toBe(false)
  await fireEvent.pointerEnter(first)
  const label = document.querySelector('[data-resource-hover-label]')
  expect(label?.textContent).toContain('Layer 0')
  await fireEvent.pointerLeave(first)
  await fireEvent.pointerEnter(next)
  expect(document.querySelector('[data-resource-hover-label]')).toBe(label)
  expect(label?.textContent).toContain('Layer 1')
  await fireEvent.focus(first)
  expect(label?.textContent).toContain('Layer 0')
  await view.rerender({
    model: { ...model, panel: { ...model.panel, isNarrow: false } },
  })
  // Expanded rows show their names inline and must not open a hover label.
  await fireEvent.pointerEnter(next)
  expect(document.querySelector('[data-resource-hover-label]')).toBeNull()
})

it('keeps the sidebar toggle above the collapsed icons and inside the first expanded section', async () => {
  const { default: ResourcePanel } = await import(
    '#lib/bits/patterns/resourcePanel/ResourcePanel.svelte'
  )
  const { Panel } = await import('#lib/enums.js')
  const model = {
    panel: {
      panelType: Panel.admin,
      position: 'left' as const,
      inline: true,
      scrollable: false,
      isAdmin: true,
      isNarrow: true,
    },
    open: true,
    title: 'Admin',
    sections: [section(1)],
    onClose: vi.fn(),
  }
  const view = render(ResourcePanel, { model })
  const expand = screen.getByRole('button', { name: 'Expand Admin' })
  expect(expand.closest('section')).toBeNull()
  await fireEvent.click(expand)
  expect(model.onClose).toHaveBeenCalledOnce()
  await view.rerender({
    model: { ...model, panel: { ...model.panel, isNarrow: false } },
  })
  const collapse = screen.getByRole('button', { name: 'Collapse Admin' })
  expect(collapse.closest('section')).toBe(view.container.querySelector('section'))
  await fireEvent.click(collapse)
  expect(model.onClose).toHaveBeenCalledTimes(2)
})
