import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetFeatureWithRelations, mockListFeatures, mockToListResponseShape } =
  vi.hoisted(() => ({
    mockGetFeatureWithRelations: vi.fn(() => ({})),
    mockListFeatures: vi.fn(async () => ({
      data: [],
    })),
    mockToListResponseShape: vi.fn(async (value: unknown) => value),
  }))

vi.mock('#lib/api/services/feature.js', () => ({
  getFeatureWithRelations: mockGetFeatureWithRelations,
  toListResponseShape: mockToListResponseShape,
}))

vi.mock('#lib/db/services/feature.js', () => ({
  listFeatures: mockListFeatures,
}))

import {
  getLayerMapRenderData,
  getProjectMapRenderData,
  planProjectMapRenderRefreshJobs,
  planLayerMapRenderRefreshJobs,
} from '#lib/map/renders/render.server.js'

type QueryStep = {
  result: unknown
  expectFrom?: unknown
}

type FakeQueryBuilder = {
  from: (value: unknown) => FakeQueryBuilder
  innerJoin: (_table: unknown, _on: unknown) => FakeQueryBuilder
  where: (_condition: unknown) => FakeQueryBuilder
  orderBy: (..._values: unknown[]) => Promise<unknown>
  limit: (_value: number) => Promise<unknown>
}

const createFakeDb = (steps: QueryStep[]) => {
  const queue = [...steps]

  const next = (table?: unknown): Promise<unknown> => {
    const step = queue.shift()

    if (!step) {
      throw new Error('Unexpected query execution')
    }

    if (step.expectFrom !== undefined && step.expectFrom !== table) {
      throw new Error('Unexpected table queried')
    }

    return Promise.resolve(step.result)
  }

  const db = {
    select: () => {
      let currentTable: unknown

      const builder: FakeQueryBuilder = {
        from(value) {
          currentTable = value
          return builder
        },
        innerJoin() {
          return builder
        },
        where() {
          return builder
        },
        orderBy() {
          return next(currentTable)
        },
        limit() {
          return next(currentTable)
        },
      }

      return builder
    },
  }

  return db
}

describe('layer map render refresh planning', () => {
  beforeEach(() => {
    mockGetFeatureWithRelations.mockReturnValue({})
    mockListFeatures.mockResolvedValue({ data: [] })
    mockToListResponseShape.mockImplementation(async (value: unknown) => value)
  })

  it('plans force-refresh jobs for unpublished layers', async () => {
    const db = createFakeDb([
      { result: [{ id: 'layer-draft' }] },
      {
        result: [
          {
            id: 'layer-draft',
            projectId: 'project-1',
            modifiedAt: '2026-03-20T10:00:00.000Z',
            rank: 7,
          },
        ],
      },
      { result: [{ code: 'hyper' }] },
      { result: [] },
    ])

    const jobs = await planLayerMapRenderRefreshJobs(
      db as never,
      'https://preview.hype.hk',
      'secret-token',
      24,
      true,
    )

    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      kind: 'layers',
      identifier: 'layer-draft',
      sourceUrl:
        'https://preview.hype.hk/headless/map-layer-render/layer-draft?token=secret-token',
    })
  })

  it('plans incremental refresh jobs when an unpublished layer changes', async () => {
    const db = createFakeDb([
      { result: [{ id: 'layer-draft' }] },
      {
        result: [
          {
            id: 'layer-draft',
            projectId: 'project-1',
            modifiedAt: '2026-03-20T10:00:00.000Z',
            rank: 7,
          },
        ],
      },
      { result: [{ code: 'hyper' }] },
      { result: [] },
    ])

    const jobs = await planLayerMapRenderRefreshJobs(
      db as never,
      'https://preview.hype.hk',
      null,
      24,
      false,
    )

    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      kind: 'layers',
      identifier: 'layer-draft',
      sourceUrl: 'https://preview.hype.hk/headless/map-layer-render/layer-draft',
    })
  })
})

describe('unpublished preview SQL eligibility', () => {
  it('renders draft projects and layers and detects changes in draft default layers', async () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      CREATE TABLE organisation(id TEXT, isPublished INTEGER, isArchived INTEGER);
      CREATE TABLE project(id TEXT, organisationId TEXT, isPublished INTEGER, isArchived INTEGER, modifiedAt TEXT);
      CREATE TABLE layer(id TEXT, projectId TEXT, isPublished INTEGER, isArchived INTEGER, isDefaultVisible INTEGER, modifiedAt TEXT, rank INTEGER);
      CREATE TABLE feature(id TEXT, layerId TEXT, isPublished INTEGER, isArchived INTEGER, modifiedAt TEXT, geometry TEXT);
      CREATE TABLE mapStyles(id TEXT, code TEXT);
      CREATE TABLE projectMapStyles(projectId TEXT, mapStyleId TEXT);
      INSERT INTO organisation VALUES('org',0,0);
      INSERT INTO project VALUES('draft','org',0,0,'2000-01-01T00:00:00.000Z');
      INSERT INTO layer VALUES('draft-layer','draft',0,0,1,'2099-01-01T00:00:00.000Z',1);
    `)
    const db = drizzle(async (query, params) => ({
      rows: sqlite
        .prepare(query)
        .all(...params)
        .map(row => Object.values(row)),
    }))
    try {
      expect(await getLayerMapRenderData(db as never, 'draft-layer')).toMatchObject({
        selectedLayerIds: ['draft-layer'],
      })
      expect(await getProjectMapRenderData(db as never, 'draft')).toMatchObject({
        selectedLayerIds: ['draft-layer'],
      })
      const jobs = await planProjectMapRenderRefreshJobs(
        db as never,
        'http://localhost:5173',
        null,
        24,
        false,
      )
      expect(jobs.map(job => job.identifier)).toEqual(['draft'])
      sqlite.exec('UPDATE layer SET isArchived = 1')
      expect(await getLayerMapRenderData(db as never, 'draft-layer')).toBeNull()
      expect(await getProjectMapRenderData(db as never, 'draft')).toMatchObject({
        selectedLayerIds: [],
      })
      sqlite.exec('UPDATE project SET isArchived = 1')
      expect(await getProjectMapRenderData(db as never, 'draft')).toBeNull()
    } finally {
      sqlite.close()
    }
  })
})
