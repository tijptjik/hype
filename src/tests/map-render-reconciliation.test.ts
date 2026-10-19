// TESTING
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  planLayers: vi.fn(),
  planProjects: vi.fn(),
  repair: vi.fn(),
  send: vi.fn(),
  bucket: {},
  db: {},
}))
vi.mock('#lib/api/index.js', () => ({
  getDatabaseWithoutAuth: async () => ({ db: mocks.db }),
}))
vi.mock('#lib/map/renders/auth.server.js', () => ({ requireMapRefreshAccess: vi.fn() }))
vi.mock('#lib/map/renders/render.server.js', () => ({
  planLayerMapRenderRefreshJobs: mocks.planLayers,
  planProjectMapRenderRefreshJobs: mocks.planProjects,
}))
vi.mock('#lib/map/renders/recovery.server.js', () => ({
  enqueueMissingMapRender: mocks.repair,
}))
vi.mock('#lib/api/services/render.js', () => ({
  getMapRenderQueue: () => ({ send: mocks.send }),
  getRemoteMapRenderBucket: () => mocks.bucket,
  getMapRenderRemoteConfig: vi.fn(),
}))
// ROUTES
import { POST } from '../routes/api/mapRenders/refresh/+server.js'

const layerJob = { kind: 'layers', identifier: 'old-layer' }
const projectJob = { kind: 'projects', identifier: 'old-project' }
const run = (query: string) =>
  POST({
    request: new Request(`https://hype.hk/api/mapRenders/refresh?${query}`, {
      method: 'POST',
    }),
    url: new URL(`https://hype.hk/api/mapRenders/refresh?${query}`),
    locals: {
      platform: {
        env: { ENVIRONMENT: 'production', PUBLIC_ORIGIN: 'https://hype.hk' },
      },
    },
  } as unknown as Parameters<typeof POST>[0])

beforeEach(() => {
  vi.clearAllMocks()
  mocks.planLayers.mockResolvedValue([layerJob])
  mocks.planProjects.mockResolvedValue([projectJob])
})

describe('scheduled missing-preview reconciliation', () => {
  it('plans outside the modification window but only counts missing jobs actually queued', async () => {
    mocks.repair.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const response = await run('mode=enqueue&reconcile=true')
    expect(mocks.planLayers).toHaveBeenCalledWith(
      mocks.db,
      'https://hype.hk',
      null,
      24,
      true,
    )
    expect(mocks.planProjects).toHaveBeenCalledWith(
      mocks.db,
      'https://hype.hk',
      null,
      24,
      true,
    )
    expect(mocks.repair).toHaveBeenCalledTimes(2)
    expect(mocks.send).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({
      planned: 2,
      enqueued: 1,
      reconcile: true,
    })
  })

  it('preserves explicitly forced rebuilds even when a version already exists', async () => {
    const response = await run('mode=enqueue&force=true')
    expect(mocks.repair).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledTimes(2)
    expect(await response.json()).toMatchObject({ planned: 2, enqueued: 2 })
  })
})
