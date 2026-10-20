import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mirrorSourceSubset } from '../../scripts/places/lib/mirror-source-subset'
import { readMirrorCheckpoint } from '../../scripts/places/lib/mirror-checkpoint'
const mocks = vi.hoisted(() => ({ read: vi.fn(), hydrate: vi.fn(), persist: vi.fn() }))
vi.mock('#lib/places/sourceClient.js', () => ({ readSaanSeoiPlacePage: mocks.read }))
vi.mock('#lib/places/sourceAddress.js', () => ({
  hydrateSaanSeoiPlaceAddress: mocks.hydrate,
}))
vi.mock('#lib/db/services/placeSource.js', () => ({
  persistForwardSaanSeoiPlace: mocks.persist,
}))
const pin = {
  releaseSet: 'release',
  catalogRevision: 'catalog',
  knownAt: '2026-10-01T00:00:00Z',
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.read.mockResolvedValue({
    places: [{ ssId: 'a' }, { ssId: 'b' }],
    total: 2,
    nextOffset: null,
  })
  mocks.hydrate.mockImplementation(async (_client, row) => ({ ...row, hydrated: true }))
  mocks.persist.mockImplementation(async (_db, row) => ({
    placeId: row.ssId,
    revisionId: 'revision-' + row.ssId,
  }))
})
describe('source mirror page checkpoint boundary', () => {
  it('retries a page after Address failure without checkpointing partial writes', async () => {
    const saveCheckpoint = vi.fn()
    const checkpoint = readMirrorCheckpoint(undefined, pin, {})
    const input = {
      db: {} as never,
      client: {} as never,
      checkpoint,
      saveCheckpoint,
      report: vi.fn(),
    }
    mocks.hydrate
      .mockResolvedValueOnce({ ssId: 'a', hydrated: true })
      .mockRejectedValueOnce(new Error('Address transport failed'))
    await expect(mirrorSourceSubset(input)).rejects.toThrow('Address transport failed')
    expect(mocks.persist).toHaveBeenCalledTimes(1)
    expect(saveCheckpoint).not.toHaveBeenCalled()
    expect(checkpoint.offset).toBe(0)
    const completed = await mirrorSourceSubset(input)
    expect(completed).toMatchObject({
      complete: true,
      offset: 2,
      total: 2,
      revisions: ['revision-a', 'revision-b'],
    })
    expect(mocks.persist).toHaveBeenLastCalledWith(input.db, {
      ssId: 'b',
      hydrated: true,
    })
    expect(saveCheckpoint).toHaveBeenCalledTimes(1)
  })
  it('does not advance past a rejected publication or concurrent write', async () => {
    const saveCheckpoint = vi.fn()
    mocks.persist.mockRejectedValueOnce(
      new Error('Source mirror changed during persistence'),
    )
    await expect(
      mirrorSourceSubset({
        db: {} as never,
        client: {} as never,
        checkpoint: readMirrorCheckpoint(undefined, pin, {}),
        saveCheckpoint,
        report: vi.fn(),
      }),
    ).rejects.toThrow('changed during persistence')
    expect(saveCheckpoint).not.toHaveBeenCalled()
  })
  it('does not report completion when durable checkpoint storage fails', async () => {
    const report = vi.fn()
    await expect(
      mirrorSourceSubset({
        db: {} as never,
        client: {} as never,
        checkpoint: readMirrorCheckpoint(undefined, pin, {}),
        saveCheckpoint: () => {
          throw new Error('Disk full')
        },
        report,
      }),
    ).rejects.toThrow('Disk full')
    expect(report).not.toHaveBeenCalled()
  })
})
