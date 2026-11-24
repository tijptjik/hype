// @vitest-environment node
import { readFileSync } from 'node:fs'
import { setupLocationServiceDatabase } from './fixtures/locationServiceDatabase'
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
  mocks.put.mockReset()
  mocks.ctx.user.superAdmin = true
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    get: mocks.read,
  }
  mocks.ctx.db = {
    select: () => chain,
    update: () => ({
      set: () => ({ where: () => ({ returning: mocks.save }) }),
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

function removalFixture(sourceModelId = 'assembly') {
  const { db, sqlite } = setupLocationServiceDatabase(false, true, false)
  sqlite.exec(readFileSync('migrations/0268_location_exterior_model.sql', 'utf8'))
  sqlite.exec(
    "INSERT INTO location(id,state,ownerOrganisationId) VALUES ('building','manual','p'),('other','manual','p')",
  )
  const insert = sqlite.prepare('INSERT INTO locationExteriorModel VALUES(?,?,?,?,?,?)')
  for (const location of ['building', 'other'])
    insert.run(location, 'old', sourceModelId, 'sheet', 'admin', 'today')
  mocks.ctx.db = db
  return sqlite
}

const removal = { locationId: 'building', expectedAssetId: 'old', modelId: 'B1' }

it('rebuilds from retained files and unlinks the final slice only for the selected location', async () => {
  const sqlite = removalFixture()
  const assets = new Map<string, string>([
    ['location-exteriors/old/assembly.json', JSON.stringify({ sources })],
    ['location-exteriors/old/B2--texture.jpg', 'retained texture'],
  ])
  mocks.get.mockImplementation(async key => {
    const value = assets.get(key)
    return value === undefined
      ? null
      : { body: value, json: async () => JSON.parse(value) }
  })
  mocks.put.mockImplementation(async (key, value) => assets.set(key, value))
  const retained = await remote.removeLocationExteriorSlice(removal)
  const assetId = sqlite
    .prepare("SELECT assetId FROM locationExteriorModel WHERE locationId='building'")
    .get()?.assetId as string
  const prefix = 'location-exteriors/' + assetId + '/'
  expect(retained).toMatchObject({
    assetId,
    url: `/api/location-exterior/building/${assetId}/assembly.gltf`,
    comparisonFile: null,
  })
  expect(JSON.parse(assets.get(prefix + 'assembly.json')!).sources).toEqual([
    sources[1],
  ])
  expect(JSON.parse(assets.get(prefix + 'assembly.gltf')!).images).toEqual([
    { uri: 'B2--texture.jpg' },
  ])
  expect(assets.get(prefix + 'B2--texture.jpg')).toBe('retained texture')
  expect(mocks.lookup).not.toHaveBeenCalled()
  await expect(
    remote.removeLocationExteriorSlice({ ...removal, modelId: 'B2' }),
  ).rejects.toMatchObject({ status: 409 })
  await expect(
    remote.removeLocationExteriorSlice({
      ...removal,
      expectedAssetId: assetId,
      modelId: 'B2',
    }),
  ).resolves.toBeNull()
  expect(
    sqlite.prepare('SELECT locationId, assetId FROM locationExteriorModel').all(),
  ).toEqual([{ locationId: 'other', assetId: 'old' }])
})

it('unlinks a legacy model without reading assets and checks authority and slice identity', async () => {
  const sqlite = removalFixture('B1')
  mocks.ctx.user.superAdmin = false
  await expect(remote.removeLocationExteriorSlice(removal)).rejects.toMatchObject({
    status: 403,
  })
  mocks.ctx.user.superAdmin = true
  await expect(
    remote.removeLocationExteriorSlice({ ...removal, modelId: 'B2' }),
  ).rejects.toMatchObject({ status: 404 })
  await remote.removeLocationExteriorSlice(removal)
  expect(mocks.authorize).toHaveBeenCalledWith(mocks.ctx, 'building')
  expect(mocks.get).not.toHaveBeenCalled()
  expect(sqlite.prepare('SELECT locationId FROM locationExteriorModel').all()).toEqual([
    { locationId: 'other' },
  ])
})

it('preserves the current association on a missing retained dependency', async () => {
  const sqlite = removalFixture()
  mocks.get
    .mockResolvedValueOnce({ json: async () => ({ sources }) })
    .mockResolvedValueOnce(null)
  await expect(remote.removeLocationExteriorSlice(removal)).rejects.toMatchObject({
    status: 409,
  })
  expect(
    sqlite
      .prepare("SELECT assetId FROM locationExteriorModel WHERE locationId='building'")
      .get()?.assetId,
  ).toBe('old')
})

it('rejects publication if another reviewer unlinks the model while the replacement uploads', async () => {
  const sqlite = removalFixture()
  mocks.put.mockImplementationOnce(async () => {
    sqlite.exec("DELETE FROM locationExteriorModel WHERE locationId='building'")
  })
  await expect(remote.removeLocationExteriorSlice(removal)).rejects.toMatchObject({
    status: 409,
  })
  expect(
    sqlite
      .prepare("SELECT assetId FROM locationExteriorModel WHERE locationId='building'")
      .get(),
  ).toBeUndefined()
})
