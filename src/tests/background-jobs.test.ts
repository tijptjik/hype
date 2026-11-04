import { expect, it } from 'vitest'
import { BackgroundJobs } from '#lib/context/backgroundJobs.svelte.js'
import { runBulkCommands } from '#lib/client/services/bulkCommands.js'

it('retains progress independently of the initiating view and finishes all chunks', async () => {
  const jobs = new BackgroundJobs()
  let finish!: () => void
  const gate = new Promise<void>(resolve => {
    finish = resolve
  })
  const dispatched: string[] = []
  const pending = jobs.run('Publish', 2, async advance => {
    const results = await runBulkCommands(
      [['a'], ['b']],
      async chunk => {
        dispatched.push(...chunk)
        if (chunk[0] === 'a') await gate
        return chunk
      },
      chunk => advance(chunk.length, 0),
      () => true,
    )
    return results !== null
  })
  expect(jobs.busy).toBe(true)
  jobs.dismiss(jobs.jobs[0].id)
  expect(jobs.jobs).toHaveLength(1)
  finish()
  await pending
  expect(dispatched).toEqual(['a', 'b'])
  expect(jobs.jobs[0]).toMatchObject({ completed: 2, status: 'complete' })
  expect(jobs.busy).toBe(false)
  jobs.dismiss(jobs.jobs[0].id)
  expect(jobs.jobs).toHaveLength(0)
})

it('records an account-bound stop without claiming completion', async () => {
  const jobs = new BackgroundJobs()
  await jobs.run('Publish', 2, async advance => {
    advance(1, 0)
    return false
  })
  expect(jobs.jobs[0]).toMatchObject({ completed: 1, total: 2, status: 'stopped' })
})
