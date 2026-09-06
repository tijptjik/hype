import { describe, expect, it, vi } from 'vitest'
import { archiveImages, publishImages } from '$lib/db/services/task'
import type { Database } from '$lib/types'

/** Provides review rows including an image with no remaining feature assignment. */
function setup() {
  const rows = [
    { imageId: 'missing-assignment', featureId: 'feature', intent: null },
    { imageId: 'unclassified', featureId: 'feature', intent: 'undefined' },
    { imageId: 'classified', featureId: 'feature', intent: 'general' },
  ]
  const values = vi
    .fn()
    .mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) })
  const deleteWhere = vi.fn().mockResolvedValue(undefined)
  const archiveWhere = vi.fn().mockResolvedValue(undefined)
  const db = {
    batch: async (queries: Promise<unknown>[]) => Promise.all(queries),
    select: () => ({
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(rows),
    }),
    insert: () => ({ values }),
    delete: () => ({ where: deleteWhere }),
    update: () => ({ set: () => ({ where: archiveWhere }) }),
  } as unknown as Database
  return { db, values, deleteWhere, archiveWhere }
}

describe('classified-only task image review', () => {
  it('does not publish an image with null intent as classified', async () => {
    const { db, values } = setup()
    expect(await publishImages(db, 'task', true, 'reviewer')).toEqual({
      success: true,
      processedCount: 1,
    })
    expect(values).toHaveBeenCalledOnce()
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ imageId: 'classified' }),
    )
  })

  it('includes null intent in undefined-only archival', async () => {
    const { db, deleteWhere, archiveWhere } = setup()
    expect(await archiveImages(db, 'task', true)).toEqual({
      success: true,
      processedCount: 2,
    })
    expect(deleteWhere).toHaveBeenCalledTimes(2)
    expect(archiveWhere).toHaveBeenCalledTimes(2)
  })
})
