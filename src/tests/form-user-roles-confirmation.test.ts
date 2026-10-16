// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/FormUserRolesSectionFixture.svelte'

vi.mock('svelte/transition', () => ({
  fade: () => ({ duration: 0 }),
  slide: () => ({ duration: 0 }),
}))

beforeEach(() => {
  vi.useRealTimers()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  HTMLElement.prototype.getAnimations = vi.fn(() => [])
  HTMLElement.prototype.scrollTo = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function removalButtons(): Promise<HTMLElement[]> {
  return [
    await screen.findByRole('button', { name: 'Remove Alex Self' }),
    await screen.findByRole('button', { name: 'Remove Robin Other' }),
  ]
}

it('removes another member without a warning or confirmation', async () => {
  const onRemoveUser = vi.fn()
  render(Fixture, { onRemoveUser })
  const buttons = await removalButtons()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByText(/By removing yourself/)).toBeNull()
  await fireEvent.click(buttons[1])
  expect(onRemoveUser).toHaveBeenCalledExactlyOnceWith('other')
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('requires explicit self-removal confirmation and keeps cancellation inert', async () => {
  const onRemoveUser = vi.fn()
  render(Fixture, { onRemoveUser })
  const buttons = await removalButtons()
  await fireEvent.click(buttons[0])
  expect(await screen.findByRole('dialog', { name: 'Remove yourself?' })).toBeTruthy()
  expect(onRemoveUser).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(onRemoveUser).not.toHaveBeenCalled()
  await fireEvent.click(buttons[0])
  await fireEvent.click(
    await screen.findByRole('button', { name: 'Remove myself', exact: true }),
  )
  expect(onRemoveUser).toHaveBeenCalledExactlyOnceWith('self')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it.each([
  { resourceKey: 'organisation-two' },
  { currentUserId: 'other' },
  { isEditing: false },
])('invalidates pending confirmation on context change: %j', async nextProps => {
  const onRemoveUser = vi.fn()
  const view = render(Fixture, { onRemoveUser })
  const buttons = await removalButtons()
  await fireEvent.click(buttons[0])
  await screen.findByRole('dialog')
  await view.rerender(nextProps)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(onRemoveUser).not.toHaveBeenCalled()
})

it('dismisses only the modal on Escape without removing anyone', async () => {
  const onRemoveUser = vi.fn()
  render(Fixture, { onRemoveUser })
  const buttons = await removalButtons()
  await fireEvent.click(buttons[0])
  const dialog = await screen.findByRole('dialog')
  await fireEvent.keyDown(dialog, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(
    screen.getByRole('button', { name: 'Remove Alex Self', exact: true }),
  ).toBeTruthy()
  expect(onRemoveUser).not.toHaveBeenCalled()
})

it('shows search in edit mode without opening results on mount', async () => {
  const view = render(Fixture)
  expect(screen.getByPlaceholderText('Add users')).toBeTruthy()
  expect(document.querySelector('.bits-search__results')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Remove User', exact: true })).toBeNull()
  await view.rerender({ isEditing: false })
  expect(screen.queryByPlaceholderText('Add users')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Remove Alex Self' })).toBeNull()
})
