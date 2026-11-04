// TESTS
import { expect, it, vi } from 'vitest'
// SERVICES
import { runBulkCommands } from '#lib/client/services/bulkCommands.js'

it.each(['success', 'failure'])(
  'stops publication and later writes after cancellation during %s',
  async outcome => {
    let current = true
    let finish!: (value: string[]) => void
    let fail!: (error: Error) => void
    const apply = vi.fn(
      () =>
        new Promise<string[]>((resolve, reject) => {
          finish = resolve
          fail = reject
        }),
    )
    const publish = vi.fn()
    const pending = runBulkCommands(
      [['first'], ['second']],
      apply,
      publish,
      () => current,
    )
    current = false
    if (outcome === 'success') finish(['saved'])
    else fail(new Error('late failure'))
    expect(await pending).toBeNull()
    expect(apply).toHaveBeenCalledOnce()
    expect(publish).not.toHaveBeenCalled()
  },
)

it('publishes current results in order and returns them for final cache updates', async () => {
  const publish = vi.fn()
  expect(
    await runBulkCommands(
      [['a'], ['b']],
      async chunk => chunk,
      publish,
      () => true,
    ),
  ).toEqual(['a', 'b'])
  expect(publish.mock.calls).toEqual([[['a']], [['b']]])
})
