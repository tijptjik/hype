// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta, mockedRemoteModule } from './remote-function-mock'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  lookup: vi.fn(),
  extract: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  ctx: {
    user: { id: 'admin', superAdmin: true },
    event: { locals: { platform: {} } },
    db: {} as any,
  },
}))
vi.mock('#lib/api/server/guarded', () => {
  const wrap = (schema: any, handler: any) =>
    withRemoteMeta(
      (input: unknown) => handler(schema.parse(input), mocks.ctx),
      'command',
    )
  return { guardedQuery: wrap, guardedCommand: wrap }
})
vi.mock('#lib/locations/exterior/authorize.server.js', () => ({
  authorizeExteriorLocation: mocks.authorize,
}))
vi.mock('#lib/indoor/server/storage.js', () => ({
  premisesMapBucket: () => ({ get: mocks.get, put: mocks.put }),
}))
vi.mock('#lib/locations/exterior/csdi.server.js', () => ({
  lookupSheet: mocks.lookup,
  extractModel: mocks.extract,
  modelCandidates: vi.fn(),
}))
import * as module from '#lib/api/locationExterior.remote.js'
const remote = mockedRemoteModule(module)
const input = {
  locationId: 'building',
  coordinates: [114, 22] as [number, number],
  expectedAssetId: 'old',
  refreshAll: true,
  slices: [],
  meta: { isAdminRequest: true },
}
const document = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{}],
  images: [{ uri: 'texture.jpg' }],
}
const sources = ['B1', 'B2'].map(modelId => ({
  slice: {
    modelId,
    sheet: 'sheet',
    footprintId: 'footprint',
    label: 'Reviewed label',
    evidenceKeys: [],
  },
  document,
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.ctx.user.superAdmin = true
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    get: mocks.read,
  }
  mocks.ctx.db = {
    select: () => chain,
    insert: () => ({
      values: () => ({ onConflictDoUpdate: () => ({ returning: mocks.save }) }),
    }),
  }
  mocks.read
    .mockReset()
    .mockResolvedValueOnce({ assetId: 'old', sourceModelId: 'assembly' })
    .mockResolvedValueOnce({ rawSource: {} })
  mocks.get.mockResolvedValue({ json: async () => ({ sources }) })
  mocks.lookup.mockResolvedValue({
    sheet: 'sheet',
    etag: 'new-etag',
    lastModified: 'date',
    revisionDate: 1000,
  })
  mocks.extract.mockImplementation(
    async (_sheet, id) =>
      new Map([
        [id + '.gltf', new TextEncoder().encode(JSON.stringify(document))],
        ['texture.jpg', new Uint8Array([1, 2])],
      ]),
  )
  mocks.save.mockResolvedValue([{ assetId: 'new' }])
})
it('refreshes every saved slice and its textures while retaining reviewed labels and footprint IDs', async () => {
  await remote.importLocationExterior(input)
  expect(mocks.extract.mock.calls.map(call => call[1])).toEqual(['B1', 'B2'])
  const manifest = mocks.put.mock.calls.find(call => call[0].endsWith('/assembly.json'))
  const saved = JSON.parse(manifest![1]).sources
  expect(saved.map((source: any) => source.slice.modelId)).toEqual(['B1', 'B2'])
  expect(saved[0].slice).toMatchObject({
    footprintId: 'footprint',
    label: 'Reviewed label',
    sourceVersion: { etag: 'new-etag', textureCount: 1 },
  })
  expect(mocks.put.mock.calls.filter(call => call[0].endsWith('.jpg'))).toHaveLength(2)
  expect(mocks.save).toHaveBeenCalledOnce()
})
it('does not replace the database pointer when any upstream model is unavailable', async () => {
  mocks.extract.mockRejectedValueOnce(new Error('Model is not present in this sheet'))
  await expect(remote.importLocationExterior(input)).rejects.toThrow(
    'Model is not present',
  )
  expect(mocks.save).not.toHaveBeenCalled()
})
it('rejects stale refresh requests before fetching upstream', async () => {
  await expect(
    remote.importLocationExterior({ ...input, expectedAssetId: 'stale' }),
  ).rejects.toBeDefined()
  expect(mocks.lookup).not.toHaveBeenCalled()
  expect(mocks.save).not.toHaveBeenCalled()
})
it('requires super-admin authorization for refresh', async () => {
  mocks.ctx.user.superAdmin = false
  await expect(remote.importLocationExterior(input)).rejects.toBeDefined()
  expect(mocks.lookup).not.toHaveBeenCalled()
})
