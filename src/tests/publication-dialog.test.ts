// @vitest-environment jsdom
// TESTING
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// COMPONENTS
import Fixture from './fixtures/components/PublicationDialogFixture.svelte'

const api = vi.hoisted(() => ({ preview: vi.fn(), publish: vi.fn() }))
vi.mock('#lib/api/imagePublication.remote.js', () => ({
  getUnclassifiedPublicationPreview: api.preview,
  publishUnclassifiedImages: api.publish,
}))
vi.mock('#lib/remote/index.js', () => ({
  refreshRemoteQuery: (query: unknown) => query,
}))

/**
 * Creates a controllable remote response for navigation races.
 * @returns A promise and its settlement callbacks.
 */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (cause: Error) => void
} {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const preview = (token = 'one') => ({ count: 2, label: 'General', token })
beforeEach(() => {
  vi.useRealTimers()
  api.preview.mockReset().mockResolvedValue(preview())
  api.publish.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('publishes the inspected token, refreshes images and completes once', async () => {
  const onDone = vi.fn()
  const refresh = vi.fn()
  window.addEventListener('refreshImages', refresh, { once: true })
  render(Fixture, { onDone })
  await fireEvent.click(
    await screen.findByRole('button', { name: 'Publish as General' }),
  )
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  expect(api.publish).toHaveBeenCalledWith({
    scope: { type: 'feature', id: 'one' },
    token: 'one',
  })
  expect(refresh).toHaveBeenCalledOnce()
})

for (const transition of ['scope', 'unmount'] as const) {
  for (const success of [true, false]) {
    it(`ignores ${success ? 'successful' : 'failed'} publication after ${transition}`, async () => {
      const pending = deferred<void>()
      api.publish.mockReturnValue(pending.promise)
      const onDone = vi.fn()
      const dispatch = vi.spyOn(window, 'dispatchEvent')
      const view = render(Fixture, { onDone })
      await fireEvent.click(
        await screen.findByRole('button', { name: 'Publish as General' }),
      )
      if (transition === 'unmount') view.unmount()
      else {
        api.preview.mockResolvedValue(preview('two'))
        await view.rerender({ scopeId: 'two', onDone })
        await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2))
      }
      if (success) pending.resolve()
      else pending.reject(new Error('obsolete failure'))
      await pending.promise.catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(onDone).not.toHaveBeenCalled()
      expect(
        dispatch.mock.calls.filter(([event]) => event.type === 'refreshImages'),
      ).toEqual([])
      expect(api.preview).toHaveBeenCalledTimes(transition === 'scope' ? 2 : 1)
      expect(screen.queryByText('obsolete failure')).toBeNull()
    })
  }
}

it('recovers a rejected token before retrying', async () => {
  const onDone = vi.fn()
  api.publish.mockRejectedValueOnce(new Error('stale token'))
  api.preview.mockResolvedValueOnce(preview()).mockResolvedValue(preview('fresh'))
  render(Fixture, { onDone })
  await fireEvent.click(
    await screen.findByRole('button', { name: 'Publish as General' }),
  )
  await screen.findByText('stale token')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Publish as General' }),
    ).not.toBeDisabled(),
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Publish as General' }))
  expect(api.publish.mock.calls[1][0].token).toBe('fresh')
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
})

it('handles failed recovery without reusing the rejected token', async () => {
  api.publish.mockRejectedValue(new Error('stale token'))
  api.preview.mockResolvedValueOnce(preview()).mockRejectedValue(new Error('offline'))
  render(Fixture, { onDone: vi.fn() })
  await fireEvent.click(
    await screen.findByRole('button', { name: 'Publish as General' }),
  )
  await screen.findByRole('alert')
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('offline'))
  expect(screen.getByRole('button', { name: 'Publish as General' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Keep images unclassified' }),
  ).not.toBeDisabled()
})

it('ignores preview recovery after a scope change', async () => {
  const recovery = deferred<ReturnType<typeof preview>>()
  api.publish.mockRejectedValue(new Error('stale token'))
  api.preview
    .mockResolvedValueOnce(preview())
    .mockReturnValueOnce(recovery.promise)
    .mockResolvedValue(preview('two'))
  const onDone = vi.fn()
  const view = render(Fixture, { onDone })
  await fireEvent.click(
    await screen.findByRole('button', { name: 'Publish as General' }),
  )
  await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2))
  await view.rerender({ scopeId: 'two', onDone })
  await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(3))
  recovery.resolve({ ...preview('obsolete'), count: 0 })
  await recovery.promise
  expect(onDone).not.toHaveBeenCalled()
  api.publish.mockResolvedValue(undefined)
  await fireEvent.click(
    await screen.findByRole('button', { name: 'Publish as General' }),
  )
  expect(api.publish.mock.calls[1][0]).toEqual({
    scope: { type: 'feature', id: 'two' },
    token: 'two',
  })
})

it('closes when recovery confirms that no unclassified images remain', async () => {
  const onDone = vi.fn()
  api.publish.mockRejectedValue(new Error('stale token'))
  api.preview
    .mockResolvedValueOnce(preview())
    .mockResolvedValue({ ...preview(), count: 0 })
  render(Fixture, { onDone })
  await fireEvent.click(
    await screen.findByRole('button', { name: 'Publish as General' }),
  )
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
})

it('does not apply an initial preview from the previous resource', async () => {
  const initial = deferred<ReturnType<typeof preview>>()
  api.preview.mockReturnValueOnce(initial.promise).mockResolvedValue(preview('two'))
  const onDone = vi.fn()
  const view = render(Fixture, { onDone })
  await view.rerender({ scopeId: 'two', onDone })
  await screen.findByRole('button', { name: 'Publish as General' })
  initial.resolve({ ...preview(), count: 0 })
  await initial.promise
  await fireEvent.click(screen.getByRole('button', { name: 'Publish as General' }))
  expect(api.publish).toHaveBeenCalledWith({
    scope: { type: 'feature', id: 'two' },
    token: 'two',
  })
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
})
