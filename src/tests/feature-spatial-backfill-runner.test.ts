// TESTS
import { beforeEach, describe, expect, it, vi } from 'vitest'
// BACKFILL
import {
  parseFeatureSpatialBackfillOptions,
  runFeatureSpatialBackfill,
} from '../../scripts/backfill-feature-spatial-index'

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('node:child_process', () => ({
  execFile: Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: execute,
  }),
}))

/** Supplies a successful Wrangler query result without connecting to any database. */
function respond(rows: Record<string, unknown>[]): void {
  execute.mockResolvedValueOnce({
    stdout: JSON.stringify([{ success: true, results: rows }]),
    stderr: '',
  })
}

const requiredOptions = () =>
  parseFeatureSpatialBackfillOptions([
    '--remote',
    '--stage',
    'production',
    '--require-complete',
  ])

beforeEach(() => execute.mockReset())

describe('spatial deployment readiness', () => {
  it('requires global completeness even when a resume cursor finds no rows', async () => {
    respond([])
    respond([{ pending: 1 }])
    await expect(
      runFeatureSpatialBackfill({
        ...requiredOptions(),
        afterId: 'later-than-missing-point',
      }),
    ).rejects.toThrow('point features still lack indexes')
  })

  it('fails closed when its work budget ends', async () => {
    respond([{ id: 'invalid', geometry: '{"type":"Point","coordinates":[]}' }])
    await expect(
      runFeatureSpatialBackfill({
        ...requiredOptions(),
        maxBatches: 1,
      }),
    ).rejects.toThrow('batch budget')
  })

  it('accepts a fully prepared database without writes', async () => {
    respond([])
    respond([{ pending: 0 }])
    await runFeatureSpatialBackfill(requiredOptions())
    expect(execute).toHaveBeenCalledTimes(2)
    for (const call of execute.mock.calls)
      expect(call[1][call[1].indexOf('--command') + 1]).toMatch(/^SELECT/i)
  })
})
