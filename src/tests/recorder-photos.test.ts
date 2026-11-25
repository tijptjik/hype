// @vitest-environment node
// TESTS
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { getPlatformProxy, type PlatformProxy } from 'wrangler'
import type { R2Bucket } from '@cloudflare/workers-types'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import { PUT } from '../routes/api/recorder/records/[id]/photos/[photo]/+server'

const { context } = vi.hoisted(() => ({ context: vi.fn() }))
vi.mock('#lib/api/index.js', () => ({ setupRequestHandler: context }))
vi.mock('#lib/db/services/property.js', () => ({
  listResolvedProjectProperties: async () => [],
}))

const store = lifecycleFixture()
let worker: PlatformProxy<{ ASSET_RAW_DEV: R2Bucket }>
let bucket: R2Bucket
const actor = {
  db: store.db,
  user: { id: 'author' },
  userRoles: [{ type: 'project', role: 'maintainer', projectId: 'project' }],
}
const photo = crypto.randomUUID()
const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aXkAAAAASUVORK5CYII=',
    'base64',
  ),
)

beforeAll(async () => {
  worker = await getPlatformProxy({
    configPath: 'wrangler.local.toml',
    persist: false,
    remoteBindings: false,
    envFiles: [],
  })
  bucket = worker.env.ASSET_RAW_DEV
  store.sqlite.exec(`CREATE TABLE fieldResearchSession(id TEXT,projectId TEXT,organisationId TEXT,configuration TEXT,code TEXT,status TEXT,isArchived INTEGER,revision INTEGER);
    CREATE TABLE fieldResearchRecord(id TEXT,sessionId TEXT,featureId TEXT,archivedAt TEXT);
    CREATE TABLE fieldResearchSessionLayer(sessionId TEXT,layerId TEXT,overrides TEXT);
    CREATE TABLE featureIntentPolicy(scopeType TEXT,scopeId TEXT,definition TEXT,namingRules TEXT,version INTEGER);
    INSERT INTO fieldResearchSession VALUES ('s','project','org','{"properties":{}}','survey','uploading',0,1);
    INSERT INTO fieldResearchSessionLayer VALUES ('s','layer','{}');
    INSERT INTO fieldResearchRecord VALUES ('r','s','f',NULL);`)
  await store.initialize(false)
  context.mockResolvedValue(actor)
})
afterAll(async () => {
  store.sqlite.close()
  await worker?.dispose()
})

function upload(bytes = png, size = bytes.length): Promise<Response> {
  const url = new URL(
    'https://example.test/api/recorder/records/r/photos/' +
      photo +
      '?filename=capture.png',
  )
  const request = new Request(url, {
    method: 'PUT',
    body: bytes,
    headers: { 'content-type': 'image/png', 'x-photo-size': String(size) },
  })
  return Promise.resolve(
    PUT({
      request,
      url,
      params: { id: 'r', photo },
      locals: { platform: { env: { ASSET_RAW_DEV: bucket } } },
    } as unknown as Parameters<typeof PUT>[0]),
  )
}

it('retains the exact original and one gallery revision across a lost acknowledgement', async () => {
  const first = await (await upload()).json()
  const again = await (await upload()).json()
  expect(first.photoRevisions).toHaveLength(3)
  expect(again.photoRevisions).toEqual(first.photoRevisions)
  expect(again.version).toBe(first.version)
  const key = 'h/features/f/recorder/author/' + photo
  expect(new Uint8Array(await (await bucket.get(key))!.arrayBuffer())).toEqual(png)
  const changed = png.slice()
  changed[12] ^= 1
  await expect(upload(changed)).rejects.toMatchObject({ status: 409 })
})

it('rejects oversized, mismatched and unsupported bytes, and enforces project and session access', async () => {
  await expect(upload(png, 21 * 1024 * 1024)).rejects.toMatchObject({ status: 413 })
  await expect(upload(png, 1)).rejects.toMatchObject({ status: 400 })
  await expect(upload(new Uint8Array([1, 2]))).rejects.toMatchObject({ status: 415 })
  context.mockResolvedValueOnce({ ...actor, userRoles: [] })
  await expect(upload()).rejects.toMatchObject({ status: 404 })
  store.sqlite.exec("UPDATE fieldResearchSession SET status='completed'")
  await expect(upload()).rejects.toMatchObject({ status: 403 })
})
