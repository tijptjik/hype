import { expect, it, vi } from 'vitest'
import { finalizePreparedImageUpload } from '#lib/client/services/image.js'

const remote = vi.hoisted(() => vi.fn())
vi.mock('#lib/api/image.remote.js', () => ({ finalizeImageUpload: remote }))
const prepared = {
  auth: { confirmToken: 'same-confirmation' },
  metadata: {},
  persist: {},
  isAdminRequest: true,
} as Parameters<typeof finalizePreparedImageUpload>[0]

it('replays the same confirmation after a lost network response', async () => {
  remote
    .mockReset()
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValue({ data: { image: { id: 'committed' } } })
  const pending = finalizePreparedImageUpload(prepared)
  const observed = pending.then(
    value => value,
    error => error,
  )
  await vi.runAllTimersAsync()
  expect(await observed).toEqual({ image: { id: 'committed' } })
  expect(remote).toHaveBeenCalledTimes(2)
  expect(remote.mock.calls[0]).toEqual(remote.mock.calls[1])
})

it.each([
  new TypeError('Cannot read properties of undefined'),
  new SyntaxError('Unexpected token in application data'),
  { status: 403 },
  { status: 409 },
])('does not retry application errors: %s', async failure => {
  remote.mockReset().mockRejectedValue(failure)
  await expect(finalizePreparedImageUpload(prepared)).rejects.toBe(failure)
  expect(remote).toHaveBeenCalledOnce()
})

it('bounds repeated network failure and preserves its final error', async () => {
  const failure = new TypeError('NetworkError when attempting to fetch resource.')
  remote.mockReset().mockRejectedValue(failure)
  const observed = finalizePreparedImageUpload(prepared).then(
    value => value,
    error => error,
  )
  await vi.runAllTimersAsync()
  expect(await observed).toBe(failure)
  expect(remote).toHaveBeenCalledTimes(4)
  for (const call of remote.mock.calls) expect(call).toEqual(remote.mock.calls[0])
})

it('replays the confirmation when the response JSON is truncated', async () => {
  remote
    .mockReset()
    .mockRejectedValueOnce(new SyntaxError('Unexpected end of JSON input'))
    .mockResolvedValue({ data: { image: { id: 'committed' } } })
  const observed = finalizePreparedImageUpload(prepared).then(
    value => value,
    error => error,
  )
  await vi.runAllTimersAsync()
  expect(await observed).toEqual({ image: { id: 'committed' } })
  expect(remote).toHaveBeenCalledTimes(2)
  expect(remote.mock.calls[1]).toEqual(remote.mock.calls[0])
})
