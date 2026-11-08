// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/DeferredSectionFixture.svelte'

vi.mock('#lib/i18n.js', () => ({
  m: { resource_loading: () => 'Loading', bootstrap__retry: () => 'Retry' },
}))
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('loads only after opening a section and keeps navigation available while pending', async () => {
  let resolve!: (module: { label: string }) => void
  const load = vi.fn(
    () =>
      new Promise<{ label: string }>(done => {
        resolve = done
      }),
  )
  render(Fixture, { load })
  expect(load).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle section' }))
  expect(load).toHaveBeenCalledOnce()
  expect(screen.getByRole('status')).toHaveTextContent('Loading')
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle section' }))
  resolve({ label: 'Obsolete section' })
  await Promise.resolve()
  expect(screen.queryByText('Obsolete section')).toBeNull()
})

it('offers an explicit retry after a chunk failure and renders the recovered section', async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ label: 'History loaded' })
  render(Fixture, { load })
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle section' }))
  await fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(screen.getByText('History loaded')).toBeTruthy())
  expect(load).toHaveBeenCalledTimes(2)
})
