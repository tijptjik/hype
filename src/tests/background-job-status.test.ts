// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/svelte/pure'
import { BackgroundJobs } from '#lib/context/backgroundJobs.svelte.js'
import Status from '#lib/bits/patterns/layout/app/BackgroundJobStatus.svelte'
const notices = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))
vi.mock('svelte-sonner', () => ({ toast: notices }))
const navigation = vi.hoisted(() => ({
  guard: null as null | ((event: { willUnload: boolean; cancel: () => void }) => void),
}))
vi.mock('$app/navigation', () => ({
  beforeNavigate: (guard: typeof navigation.guard) => {
    navigation.guard = guard
  },
}))
afterEach(cleanup)
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
it('shows retained job progress and blocks only document departure until completion', async () => {
  const jobs = new BackgroundJobs()
  let finish!: () => void
  const pending = jobs.run('Publish features', 2, async advance => {
    advance(1, 0)
    await new Promise<void>(resolve => {
      finish = resolve
    })
    advance(1, 0)
    return true
  })
  const first = render(Status, { jobs })
  await waitFor(() =>
    expect(notices.info).toHaveBeenCalledWith(
      'Publish features: 1/2',
      expect.objectContaining({
        id: 'background-job-1',
        duration: Infinity,
        dismissible: false,
      }),
    ),
  )
  const cancel = vi.fn()
  navigation.guard!({ willUnload: false, cancel })
  expect(cancel).not.toHaveBeenCalled()
  navigation.guard!({ willUnload: true, cancel })
  expect(cancel).toHaveBeenCalledOnce()
  await first.unmount()
  render(Status, { jobs })
  await waitFor(() => expect(notices.info).toHaveBeenCalledTimes(2))
  finish()
  await pending
  await waitFor(() =>
    expect(notices.success).toHaveBeenCalledWith(
      'Publish features: 2/2',
      expect.objectContaining({
        id: 'background-job-1',
        duration: 2500,
        dismissible: true,
      }),
    ),
  )
  navigation.guard!({ willUnload: true, cancel })
  expect(cancel).toHaveBeenCalledOnce()
  notices.success.mock.calls[0][1].onAutoClose()
  expect(jobs.jobs).toHaveLength(0)
})

it('uses the success message and keeps failed or stopped work distinguishable', async () => {
  const jobs = new BackgroundJobs()
  render(Status, { jobs })
  await jobs.run(
    'Archive',
    1,
    async advance => {
      advance(1, 0)
      return true
    },
    '1 feature archived',
  )
  await waitFor(() =>
    expect(notices.success).toHaveBeenCalledWith(
      '1 feature archived',
      expect.objectContaining({ id: 'background-job-1' }),
    ),
  )
  await jobs.run('Archive', 2, async advance => {
    advance(1, 0)
    return false
  })
  await waitFor(() =>
    expect(notices.warning).toHaveBeenCalledWith(
      'Stopped because account permissions changed.',
      expect.objectContaining({ duration: Infinity }),
    ),
  )
  await expect(
    jobs.run('Archive', 1, async () => {
      throw new Error('failed')
    }),
  ).rejects.toThrow('failed')
  await waitFor(() =>
    expect(notices.error).toHaveBeenCalledWith(
      'Could not finish. Some changes may have saved.',
      expect.objectContaining({ duration: Infinity }),
    ),
  )
})
