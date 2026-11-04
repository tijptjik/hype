import { expect, it, vi } from 'vitest'
import { TaskSubmissionRetry } from '#lib/client/services/taskSubmissionRetry.js'

it.each(['scope', 'content', 'files', 'clear'])(
  'discards retained steps when %s changes',
  async change => {
    const session = new TaskSubmissionRetry()
    let scope = 'account:1'
    let content = 'request'
    let files = [new File([], 'photo')]
    const first = session.begin(() => scope, content, files)
    const create = vi.fn(async () => 'draft')
    expect(await first.run('draft', create)).toBe('draft')
    expect(
      await session.begin(() => scope, content, [...files]).run('draft', create),
    ).toBe('draft')
    expect(create).toHaveBeenCalledTimes(1)
    if (change === 'scope') scope = 'account:2'
    if (change === 'content') content = 'changed'
    if (change === 'files') files = [new File([], 'photo')]
    if (change === 'clear') session.clear()
    const next = session.begin(() => scope, content, files)
    await expect(first.run('upload', create)).rejects.toThrow('scope changed')
    expect(await next.run('draft', create)).toBe('draft')
    expect(create).toHaveBeenCalledTimes(2)
  },
)

it('deduplicates an in-flight step and rejects late results after account change', async () => {
  const session = new TaskSubmissionRetry()
  let scope = 'account:1'
  let finish!: (value: string) => void
  const request = vi.fn(
    () =>
      new Promise<string>(resolve => {
        finish = resolve
      }),
  )
  const attempt = session.begin(() => scope, 'request', [])
  const first = attempt.run('draft', request)
  const second = attempt.run('draft', request)
  const results = Promise.allSettled([first, second])
  await Promise.resolve()
  expect(request).toHaveBeenCalledTimes(1)
  scope = 'account:2'
  finish('old-draft')
  expect((await results).map(result => result.status)).toEqual(['rejected', 'rejected'])
  const upload = vi.fn(async () => {})
  await expect(attempt.run('upload', upload)).rejects.toThrow('scope changed')
  expect(upload).not.toHaveBeenCalled()
})

it.each([false, true])(
  'renews expired unfinished authorization, retaining completed finalization: %s',
  async completed => {
    const session = new TaskSubmissionRetry()
    const attempt = session.begin(() => 'account', 'request', [])
    attempt.expires('finalize', new Date(Date.now() - 1).toISOString())
    if (completed) await attempt.run('finalize', async () => 'saved')
    const next = session.begin(() => 'account', 'request', [])
    expect(next === attempt).toBe(completed)
  },
)

it.each([false, true])(
  'keeps an expired attempt while its finalization is in flight (failure: %s)',
  async fails => {
    const session = new TaskSubmissionRetry()
    const attempt = session.begin(() => 'account', 'request', [])
    attempt.expires('finalize', new Date(Date.now() + 100).toISOString())
    let finish!: () => void
    let reject!: (error: unknown) => void
    const operation = vi.fn(
      () =>
        new Promise<void>((resolve, fail) => {
          finish = resolve
          reject = fail
        }),
    )
    const pending = attempt.run('finalize', operation)
    const observed = pending.then(
      () => 'saved',
      error => error,
    )
    await Promise.resolve()
    vi.advanceTimersByTime(101)
    const overlapping = session.begin(() => 'account', 'request', [])
    expect(overlapping).toBe(attempt)
    if (fails) reject(new Error('network failed'))
    else finish()
    const result = await observed
    if (fails) expect(result).toEqual(new Error('network failed'))
    else expect(result).toBe('saved')
    expect(session.begin(() => 'account', 'request', []) === attempt).toBe(!fails)
  },
)

it('rejects late submission completion after signing back into the same account', async () => {
  const { AccountState } = await import('#lib/context/account.svelte.js')
  const identity = {
    id: 'alice',
    isAnonymous: false,
    superAdmin: false,
    roles: [],
  } as unknown as import('#lib/types.js').SessionUser
  const account = new AccountState(identity)
  const session = new TaskSubmissionRetry()
  const scope = () => JSON.stringify([account.revision, account.user?.id])
  const attempt = session.begin(scope, 'request', [])
  let finish!: () => void
  const observed = attempt
    .run(
      'finalize',
      () =>
        new Promise<void>(resolve => {
          finish = resolve
        }),
    )
    .then(
      () => 'saved',
      error => error,
    )
  await Promise.resolve()
  account.syncSession(null)
  account.syncSession(identity)
  finish()
  expect(await observed).toEqual(new Error('Submission scope changed'))
  const later = vi.fn(async () => 'submitted')
  await expect(attempt.run('submit', later)).rejects.toThrow('Submission scope changed')
  expect(later).not.toHaveBeenCalled()
  expect(session.begin(scope, 'request', [])).not.toBe(attempt)
})
