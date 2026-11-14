// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasResourceLogoStorage } from '#lib/db/services/resourceLogoSnapshot.js'
import { readResourceLogoHead } from '#lib/db/services/resourceLogoRevision.js'
import type { Database } from '#lib/types.js'

const commitTokenFailure = new Error('Failed query', {
  cause: new Error(
    'D1_ERROR: Failed to get session commit token: internal error; reference = hhot572g8iproc9js7icofas',
  ),
})

describe('resource logo read recovery', () => {
  afterEach(() => vi.useRealTimers())

  it('recovers the schema probe from the reported commit-token failure', async () => {
    vi.useFakeTimers()
    const get = vi
      .fn()
      .mockRejectedValueOnce(commitTokenFailure)
      .mockResolvedValue({ n: 4 })
    const result = hasResourceLogoStorage({ get } as unknown as Database)
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe(true)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('recovers the exact head read without repeating the schema probe', async () => {
    vi.useFakeTimers()
    const row = {
      imageRevisionId: 'revision',
      assetVersionId: 'asset',
      metadata: '{"rotation":90}',
      storageNamespace: 'local',
      storageKey: 'logo',
      contentHash: 'hash',
      byteSize: 10,
      mediaType: 'image/png',
    }
    const get = vi
      .fn()
      .mockResolvedValueOnce({ n: 4 })
      .mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked'))
      .mockResolvedValueOnce(row)
    const result = readResourceLogoHead({ get } as unknown as Database, 'image')
    await vi.runAllTimersAsync()
    await expect(result).resolves.toEqual({
      imageRevisionId: 'revision',
      assetVersionId: 'asset',
      metadata: { rotation: 90 },
      asset: {
        storageNamespace: 'local',
        storageKey: 'logo',
        contentHash: 'hash',
        byteSize: 10,
        mediaType: 'image/png',
      },
    })
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('surfaces persistent failures instead of treating storage as absent', async () => {
    vi.useFakeTimers()
    const get = vi.fn().mockRejectedValue(commitTokenFailure)
    const result = expect(
      hasResourceLogoStorage({ get } as unknown as Database),
    ).rejects.toBe(commitTokenFailure)
    await vi.runAllTimersAsync()
    await result
    expect(get).toHaveBeenCalledTimes(6)
  })

  it('preserves missing and incomplete migration handling without caching', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ n: 0 })
      .mockResolvedValueOnce({ n: 2 })
      .mockResolvedValueOnce({ n: 4 })
    const db = { get } as unknown as Database
    await expect(hasResourceLogoStorage(db)).resolves.toBe(false)
    await expect(hasResourceLogoStorage(db)).rejects.toThrow(
      'Incomplete resource logo revision migration',
    )
    await expect(hasResourceLogoStorage(db)).resolves.toBe(true)
    expect(get).toHaveBeenCalledTimes(3)
  })
})
