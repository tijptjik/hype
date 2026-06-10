import { describe, expect, it, vi } from 'vitest'
import { SQL } from 'drizzle-orm'
import { feature, layer, project } from '$lib/db/schema'
import {
  cascadeOrganisationArchivedStateToDescendants,
  cascadeOrganisationPublishedStateToDescendants,
} from '$lib/db/services/organisation'
import {
  cascadeProjectArchivedStateToDescendants,
  cascadeProjectPublishedStateToDescendants,
} from '$lib/db/services/project'
import {
  cascadeLayerArchivedStateToDescendants,
  cascadeLayerPublishedStateToDescendants,
} from '$lib/db/services/layer'
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

const isSqlExpression = (value: unknown): value is SQL => value instanceof SQL

describe('publication cascade services', () => {
  it('snapshots organisation descendants into local publish state when unpublishing', async () => {
    const { db, updateCalls } = createDbMock()

    await cascadeOrganisationPublishedStateToDescendants(db, {
      organisationId: 'org-1',
      state: false,
    })

    expect(updateCalls).toHaveLength(3)
    expect(updateCalls.map(call => call.table)).toEqual([project, layer, feature])
    expect(isSqlExpression(updateCalls[0]?.values.isPublished)).toBe(true)
    expect(isSqlExpression(updateCalls[1]?.values.isPublished)).toBe(true)
    expect(isSqlExpression(updateCalls[2]?.values.isPublished)).toBe(true)
    expect(isSqlExpression(updateCalls[0]?.values.localIsPublished)).toBe(true)
    expect(isSqlExpression(updateCalls[1]?.values.localIsPublished)).toBe(true)
    expect(isSqlExpression(updateCalls[2]?.values.localIsPublished)).toBe(true)
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
    expect(isSqlExpression(updateCalls[0]?.values.isPublished)).toBe(true)
    expect(isSqlExpression(updateCalls[1]?.values.isPublished)).toBe(true)
    expect(isSqlExpression(updateCalls[2]?.values.isPublished)).toBe(true)
  })

  it('cascades project publish changes into layers and features only', async () => {
    const { db, updateCalls } = createDbMock()

    await cascadeProjectPublishedStateToDescendants(db, {
      projectId: 'project-1',
      state: false,
    })

    expect(updateCalls).toHaveLength(2)
    expect(updateCalls.map(call => call.table)).toEqual([layer, feature])
    expect(isSqlExpression(updateCalls[0]?.values.localIsPublished)).toBe(true)
    expect(isSqlExpression(updateCalls[1]?.values.localIsPublished)).toBe(true)
    expect(isSqlExpression(updateCalls[0]?.values.isPublished)).toBe(true)
    expect(isSqlExpression(updateCalls[1]?.values.isPublished)).toBe(true)
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
    expect(isSqlExpression(updateCalls[0]?.values.isPublished)).toBe(true)
  })

  it('snapshots organisation descendants into local archive state when archiving', async () => {
    const { db, updateCalls } = createDbMock()

    await cascadeOrganisationArchivedStateToDescendants(db, {
      organisationId: 'org-1',
      state: true,
    })

    expect(updateCalls).toHaveLength(3)
    expect(updateCalls.map(call => call.table)).toEqual([project, layer, feature])
    expect(isSqlExpression(updateCalls[0]?.values.localIsArchived)).toBe(true)
    expect(isSqlExpression(updateCalls[1]?.values.localIsArchived)).toBe(true)
    expect(isSqlExpression(updateCalls[2]?.values.localIsArchived)).toBe(true)
    expect(isSqlExpression(updateCalls[0]?.values.isArchived)).toBe(true)
    expect(isSqlExpression(updateCalls[1]?.values.isArchived)).toBe(true)
    expect(isSqlExpression(updateCalls[2]?.values.isArchived)).toBe(true)
  })

  it('restores organisation descendants from local archive state when unarchiving', async () => {
    const { db, updateCalls } = createDbMock()

    await cascadeOrganisationArchivedStateToDescendants(db, {
      organisationId: 'org-1',
      state: false,
    })

    expect(updateCalls).toHaveLength(3)
    expect(updateCalls.map(call => call.table)).toEqual([project, layer, feature])
    expect(updateCalls[0]?.values.localIsArchived).toBeNull()
    expect(updateCalls[1]?.values.localIsArchived).toBeNull()
    expect(updateCalls[2]?.values.localIsArchived).toBeNull()
    expect(isSqlExpression(updateCalls[0]?.values.isArchived)).toBe(true)
    expect(isSqlExpression(updateCalls[1]?.values.isArchived)).toBe(true)
    expect(isSqlExpression(updateCalls[2]?.values.isArchived)).toBe(true)
  })

  it('cascades project archive changes into layers and features only', async () => {
    const { db, updateCalls } = createDbMock()

    await cascadeProjectArchivedStateToDescendants(db, {
      projectId: 'project-1',
      state: true,
    })

    expect(updateCalls).toHaveLength(2)
    expect(updateCalls.map(call => call.table)).toEqual([layer, feature])
    expect(isSqlExpression(updateCalls[0]?.values.localIsArchived)).toBe(true)
    expect(isSqlExpression(updateCalls[1]?.values.localIsArchived)).toBe(true)
    expect(isSqlExpression(updateCalls[0]?.values.isArchived)).toBe(true)
    expect(isSqlExpression(updateCalls[1]?.values.isArchived)).toBe(true)
  })

  it('cascades layer archive changes into features only', async () => {
    const { db, updateCalls } = createDbMock()

    await cascadeLayerArchivedStateToDescendants(db, {
      layerId: 'layer-1',
      state: false,
    })

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]?.table).toBe(feature)
    expect(updateCalls[0]?.values.localIsArchived).toBeNull()
    expect(isSqlExpression(updateCalls[0]?.values.isArchived)).toBe(true)
  })
})
