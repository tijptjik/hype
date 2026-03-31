import { describe, expect, it, vi } from 'vitest'
import { feature, layer, project } from '$lib/db/schema'
import { cascadeOrganisationPublishedStateToDescendants } from '$lib/db/services/organisation'
import { cascadeProjectPublishedStateToDescendants } from '$lib/db/services/project'
import { cascadeLayerPublishedStateToDescendants } from '$lib/db/services/layer'
import type { Database } from '$lib/types'

type UpdateCall = {
  table: unknown
  values: Record<string, unknown>
  where: unknown
}

const createDbMock = (): {
  db: Database
  updateCalls: UpdateCall[]
} => {
  const updateCalls: UpdateCall[] = []

  const db = {
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async (where: unknown) => {
          updateCalls.push({ table, values, where })
        }),
      })),
    })),
  } as unknown as Database

  return { db, updateCalls }
}

describe('publication cascade services', () => {
  it('snapshots organisation descendants into local publish state when unpublishing', async () => {
    const { db, updateCalls } = createDbMock()

    await cascadeOrganisationPublishedStateToDescendants(db, {
      organisationId: 'org-1',
      state: false,
    })

    expect(updateCalls).toHaveLength(3)
    expect(updateCalls.map(call => call.table)).toEqual([project, layer, feature])
    expect(updateCalls[0]?.values).toMatchObject({ isPublished: false })
    expect(updateCalls[1]?.values).toMatchObject({ isPublished: false })
    expect(updateCalls[2]?.values).toMatchObject({ isPublished: false })
    expect(updateCalls[0]?.values.localIsPublished).toBeDefined()
    expect(updateCalls[1]?.values.localIsPublished).toBeDefined()
    expect(updateCalls[2]?.values.localIsPublished).toBeDefined()
  })

  it('restores organisation descendants from local publish state when republishing', async () => {
    const { db, updateCalls } = createDbMock()

    await cascadeOrganisationPublishedStateToDescendants(db, {
      organisationId: 'org-1',
      state: true,
    })

    expect(updateCalls).toHaveLength(3)
    expect(updateCalls.map(call => call.table)).toEqual([project, layer, feature])
    expect(updateCalls[0]?.values.localIsPublished).toBeNull()
    expect(updateCalls[1]?.values.localIsPublished).toBeNull()
    expect(updateCalls[2]?.values.localIsPublished).toBeNull()
    expect(updateCalls[0]?.values.isPublished).toBeDefined()
    expect(updateCalls[1]?.values.isPublished).toBeDefined()
    expect(updateCalls[2]?.values.isPublished).toBeDefined()
  })

  it('cascades project publish changes into layers and features only', async () => {
    const { db, updateCalls } = createDbMock()

    await cascadeProjectPublishedStateToDescendants(db, {
      projectId: 'project-1',
      state: false,
    })

    expect(updateCalls).toHaveLength(2)
    expect(updateCalls.map(call => call.table)).toEqual([layer, feature])
    expect(updateCalls[0]?.values).toMatchObject({ isPublished: false })
    expect(updateCalls[1]?.values).toMatchObject({ isPublished: false })
  })

  it('cascades layer publish changes into features only', async () => {
    const { db, updateCalls } = createDbMock()

    await cascadeLayerPublishedStateToDescendants(db, {
      layerId: 'layer-1',
      state: true,
    })

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]?.table).toBe(feature)
    expect(updateCalls[0]?.values.localIsPublished).toBeNull()
    expect(updateCalls[0]?.values.isPublished).toBeDefined()
  })
})
