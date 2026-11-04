// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { bridgeNativeTooltips } from '#lib/bits/core/tooltip/bridgeNativeTooltips.js'
import TooltipProvider from '#lib/bits/core/tooltip/TooltipProvider.svelte'

beforeEach(() => vi.useRealTimers())

afterEach(() => {
  cleanup()
  document.querySelectorAll('[data-test-tooltip-trigger]').forEach(node => {
    node.remove()
  })
})

/** Add a dynamic control to exercise the same delegation used by portalled menus. */
function control(): HTMLButtonElement {
  const button = document.createElement('button')
  button.dataset.testTooltipTrigger = ''
  button.dataset.tooltip = 'Synced'
  button.setAttribute('aria-describedby', 'existing-description')
  document.body.append(button)
  return button
}

it('describes dynamically inserted controls on focus and preserves existing descriptions', async () => {
  const view = render(TooltipProvider)
  const button = control()
  await fireEvent.focusIn(button)
  expect((await screen.findByRole('tooltip', { hidden: true })).textContent).toBe(
    'Synced',
  )
  expect(button.getAttribute('aria-describedby')).toMatch(/^existing-description .+/)
  await fireEvent.keyDown(button, { key: 'Escape' })
  await waitFor(() =>
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull(),
  )
  expect(button.getAttribute('aria-describedby')).toBe('existing-description')
  await fireEvent.focusIn(button)
  await screen.findByRole('tooltip', { hidden: true })
  view.unmount()
  expect(button.getAttribute('aria-describedby')).toBe('existing-description')
})

it('refreshes changed labels and dismisses help when the underlying menu opens', async () => {
  render(TooltipProvider)
  const button = control()
  await fireEvent.pointerOver(button)
  await screen.findByRole('tooltip', { hidden: true })
  button.dataset.tooltip = 'Unsynced'
  await waitFor(() =>
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toBe('Unsynced'),
  )
  button.setAttribute('aria-expanded', 'true')
  await waitFor(() =>
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull(),
  )
  await fireEvent.pointerOver(button)
  expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
})

it('dismisses on scrolling and does not duplicate rich tooltip triggers', async () => {
  render(TooltipProvider)
  const button = control()
  await fireEvent.pointerOver(button)
  await screen.findByRole('tooltip', { hidden: true })
  await fireEvent.scroll(document)
  await waitFor(() =>
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull(),
  )
  button.classList.add('bits-tooltip__trigger')
  await fireEvent.pointerOver(button)
  expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
})

it('bridges dynamically created library controls and their changing native labels', async () => {
  const boundary = document.createElement('div')
  const bridge = bridgeNativeTooltips(boundary)
  const button = document.createElement('button')
  button.title = 'Find my location'
  button.setAttribute('aria-label', 'Geolocate')
  boundary.append(button)
  await waitFor(() => expect(button.dataset.tooltip).toBe('Find my location'))
  expect(button.hasAttribute('title')).toBe(false)
  expect(button.getAttribute('aria-label')).toBe('Geolocate')
  button.title = 'Location unavailable'
  await waitFor(() => expect(button.dataset.tooltip).toBe('Location unavailable'))
  expect(button.hasAttribute('title')).toBe(false)
  bridge.destroy()
  button.title = 'Detached control'
  await Promise.resolve()
  expect(button.title).toBe('Detached control')
})

it('suppresses repeated visible labels but retains clipped and icon-only labels', async () => {
  render(TooltipProvider)
  const button = control()
  Object.defineProperty(button, 'innerText', {
    configurable: true,
    value: '  Synced  ',
  })
  await fireEvent.pointerOver(button)
  expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
  await fireEvent.focusIn(button)
  expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
  Object.defineProperty(button, 'scrollWidth', { configurable: true, value: 100 })
  Object.defineProperty(button, 'clientWidth', { configurable: true, value: 40 })
  await fireEvent.pointerOver(button)
  expect((await screen.findByRole('tooltip', { hidden: true })).textContent).toBe(
    'Synced',
  )
  await fireEvent.keyDown(button, { key: 'Escape' })
  Object.defineProperty(button, 'innerText', { configurable: true, value: '' })
  await fireEvent.pointerOver(button)
  expect((await screen.findByRole('tooltip', { hidden: true })).textContent).toBe(
    'Synced',
  )
})
