// @vitest-environment jsdom
// TESTING
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// COMPONENTS
import HubActions from '#lib/bits/patterns/cards/resourceCard/components/HubActions.svelte'

beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('describes both sharing states and changes only exclusivity after an explicit choice', async () => {
  const onToggleHubExclusive = vi.fn()
  const onToggleCoreInclusive = vi.fn()
  render(HubActions, {
    isHubExclusive: false,
    isCoreInclusive: true,
    canSetCoreInclusive: true,
    onToggleHubExclusive,
    onToggleCoreInclusive,
  })
  expect(screen.getByRole('combobox', { name: 'Map sharing' }).textContent).toContain(
    'List on HYPE.hk',
  )
  expect(
    screen.getByRole('combobox', { name: 'HYPE.hk listing' }).textContent,
  ).toContain('Include in HYPE.hk')
  expect(onToggleHubExclusive).not.toHaveBeenCalled()
  const control = screen.getByRole('combobox', { name: 'Map sharing' })
  await fireEvent.click(control)
  expect(
    screen
      .getAllByRole('option', { hidden: true })
      .map(option => option.textContent?.trim()),
  ).toEqual(['List on HYPE.hk', 'Hub Exclusive'])
  expect(onToggleHubExclusive).not.toHaveBeenCalled()
  await fireEvent.keyDown(control, { key: 'End' })
  await fireEvent.keyDown(control, { key: 'Enter' })
  expect(onToggleHubExclusive).toHaveBeenCalledWith(true)
  expect(onToggleCoreInclusive).not.toHaveBeenCalled()
})

it('maps both core inclusion choices to the original boolean callbacks', async () => {
  const onToggleCoreInclusive = vi.fn()
  render(HubActions, {
    isHubExclusive: false,
    isCoreInclusive: true,
    canSetCoreInclusive: true,
    onToggleHubExclusive: vi.fn(),
    onToggleCoreInclusive,
  })
  const control = screen.getByRole('combobox', { name: 'HYPE.hk listing' })
  await fireEvent.click(control)
  await fireEvent.keyDown(control, { key: 'End' })
  await fireEvent.keyDown(control, { key: 'Enter' })
  expect(onToggleCoreInclusive).toHaveBeenLastCalledWith(false)
  await fireEvent.click(control)
  await fireEvent.keyDown(control, { key: 'Home' })
  await fireEvent.keyDown(control, { key: 'Enter' })
  expect(onToggleCoreInclusive).toHaveBeenLastCalledWith(true)
})

it('keeps core inclusion restricted and disables changes during submission', () => {
  render(HubActions, {
    isHubExclusive: true,
    isCoreInclusive: false,
    canSetCoreInclusive: false,
    isSubmitting: true,
    onToggleHubExclusive: vi.fn(),
    onToggleCoreInclusive: vi.fn(),
  })
  expect(screen.queryByRole('combobox', { name: 'HYPE.hk listing' })).toBeNull()
  const sharing = screen.getByRole('combobox', { name: 'Map sharing' })
  expect(sharing.textContent).toContain('Hub Exclusive')
  expect((sharing as HTMLButtonElement).disabled).toBe(true)
})

it('shows both current states as read-only text outside editing', () => {
  render(HubActions, {
    isHubExclusive: false,
    isCoreInclusive: false,
    canSetCoreInclusive: true,
    isEditing: false,
    onToggleHubExclusive: vi.fn(),
    onToggleCoreInclusive: vi.fn(),
  })
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.getByText('List on HYPE.hk')).toBeTruthy()
  expect(screen.getByText('Exclude in HYPE.hk')).toBeTruthy()
})
