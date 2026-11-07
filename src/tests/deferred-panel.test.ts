// @vitest-environment jsdom
// SVELTE
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
// TEST
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// COMPONENTS
import Fixture from './fixtures/components/DeferredPanelFixture.svelte'
import Content from './fixtures/components/DeferredPanelContent.svelte'

vi.mock('#lib/i18n.js', () => ({
  m: {
    resource_loading: () => 'Loading',
    bootstrap__retry: () => 'Retry',
  },
}))
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('defers imports until open and retains mounted state when closed and reopened', async () => {
  const load = vi.fn(async () => ({ default: Content }))
  const view = render(Fixture, { active: false, load })
  expect(load).not.toHaveBeenCalled()
  await view.rerender({ active: true, load })
  await fireEvent.click(await screen.findByRole('button', { name: 'Panel count 0' }))
  await view.rerender({ active: false, load })
  await view.rerender({ active: true, load })
  expect(screen.getByRole('button', { name: 'Panel count 1' })).toBeTruthy()
  expect(load).toHaveBeenCalledTimes(1)
})

it('shares an in-flight import across opens and allows retry after failure', async () => {
  let reject!: (error: Error) => void
  const load = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    .mockResolvedValue({ default: Content })
  const view = render(Fixture, { active: true, load })
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
  await view.rerender({ active: false, load })
  await view.rerender({ active: true, load })
  expect(load).toHaveBeenCalledTimes(1)
  reject(new Error('Chunk unavailable'))
  await fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('button', { name: 'Panel count 0' })).toBeTruthy()
  expect(load).toHaveBeenCalledTimes(2)
})
