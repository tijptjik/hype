// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { BackgroundJobs } from '#lib/context/backgroundJobs.svelte.js'
import Status from '#lib/bits/patterns/layout/app/BackgroundJobStatus.svelte'
const navigation = vi.hoisted(() => ({
  guard: null as null | ((event: { willUnload: boolean; cancel: () => void }) => void),
}))
vi.mock('$app/navigation', () => ({
  beforeNavigate: (guard: typeof navigation.guard) => {
    navigation.guard = guard
  },
}))
afterEach(cleanup)
beforeEach(() => vi.useRealTimers())
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
  expect(first.getByRole('status').textContent).toContain('1/2')
  const cancel = vi.fn()
  navigation.guard!({ willUnload: false, cancel })
  expect(cancel).not.toHaveBeenCalled()
  navigation.guard!({ willUnload: true, cancel })
  expect(cancel).toHaveBeenCalledOnce()
  await first.unmount()
  const next = render(Status, { jobs })
  expect(next.getByRole('status').textContent).toContain('1/2')
  finish()
  await pending
  await waitFor(() => expect(next.getByRole('status').textContent).toContain('2/2'))
  navigation.guard!({ willUnload: true, cancel })
  expect(cancel).toHaveBeenCalledOnce()
  await fireEvent.click(next.getByRole('button', { name: 'Dismiss progress' }))
  expect(jobs.jobs).toHaveLength(0)
})
