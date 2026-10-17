import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSqliteBusyError, retryBusyRead } from '#lib/db/services/sqlite.js'

describe('D1 read retry detection', () => {
  it('recognises a busy SQLite error nested in a D1 object wrapper', () => {
    expect(
      isSqliteBusyError({
        error: {
          cause: { message: 'SQLITE_BUSY: database is locked' },
        },
      }),
    ).toBe(true)
  })

  it('does not retry unrelated D1 failures', () => {
    expect(
      isSqliteBusyError({
        message: 'D1_ERROR: no such table: hub',
      }),
    ).toBe(false)
  })
})

describe('bounded read recovery', () => {
  afterEach(() => vi.useRealTimers())

  it('re-executes a read after a wrapped commit-token failure', async () => {
    vi.useFakeTimers()
    const failure = new Error('Failed query', {
      cause: new Error(
        'D1_ERROR: Failed to get session commit token: internal error; reference = abc123',
      ),
    })
    expect(isSqliteBusyError(failure)).toBe(false)
    const read = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(['row'])
    const result = retryBusyRead(read)
    await vi.runAllTimersAsync()
    await expect(result).resolves.toEqual(['row'])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('surfaces a persistent commit-token failure after six attempts', async () => {
    vi.useFakeTimers()
    const failure = new Error('Failed to get session commit token: internal error')
    const read = vi.fn().mockRejectedValue(failure)
    const result = expect(retryBusyRead(read)).rejects.toBe(failure)
    await vi.runAllTimersAsync()
    await result
    expect(read).toHaveBeenCalledTimes(6)
  })

  it('does not retry unrelated internal errors', async () => {
    const failure = new Error('D1_ERROR: internal error')
    const read = vi.fn().mockRejectedValue(failure)
    await expect(retryBusyRead(read)).rejects.toBe(failure)
    expect(read).toHaveBeenCalledTimes(1)
  })
})
