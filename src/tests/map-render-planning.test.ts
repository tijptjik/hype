import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetFeatureWithRelations, mockListFeatures, mockToListResponseShape } =
  vi.hoisted(() => ({
    mockGetFeatureWithRelations: vi.fn(() => ({})),
    mockListFeatures: vi.fn(async () => ({
      data: [],
    })),
    mockToListResponseShape: vi.fn(async (value: unknown) => value),
  }))

vi.mock('$lib/api/services/feature', () => ({
  getFeatureWithRelations: mockGetFeatureWithRelations,
  toListResponseShape: mockToListResponseShape,
}))

vi.mock('$lib/db/services/feature', () => ({
  listFeatures: mockListFeatures,
}))

import { planLayerMapRenderRefreshJobs } from '$lib/map/renders/render.server'

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
