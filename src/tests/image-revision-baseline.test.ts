// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
// DRIZZLE
import { getTableColumns, sql } from 'drizzle-orm'
// SCHEMA
import { image } from '#lib/db/schema/image.js'
// SERVICES
import { registerImageRevisionBaseline } from '#lib/db/services/imageRevisionBaseline.js'
// FIXTURE
import { publicationSqlite } from './fixtures/publicationSqlite'
// TYPES
import type { Database } from '#lib/types.js'

const connections: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => { for (const connection of connections.splice(0)) connection.sqlite.close() })

/** Creates exact locator evidence alongside real immutable media constraints. */
async function fixture() {
  const connection = publicationSqlite({})
  connections.push(connection)
  const db = connection.db as unknown as Database
  connection.sqlite.exec(`CREATE TABLE feature(id TEXT PRIMARY KEY);
    CREATE TABLE image (${Object.values(getTableColumns(image)).map(column => `"${column.name}" ${column.dataType === 'number' || column.dataType === 'boolean' ? 'INTEGER' : 'TEXT'}${column.name === 'id' ? ' PRIMARY KEY' : ''}`).join(',')});`)
  connection.sqlite.exec(readFileSync('migrations/0171_feature_revisions.sql','utf8'))
  connection.sqlite.exec(readFileSync('migrations/0172_image_revisions.sql','utf8'))
  await db.insert(image).values({ id: 'photo', publicId: 'immutable/photo', cdn: 'cloudflareR2', env: 'local', version: 1,
    modifiedAt: 'token', contentHash: null, presentationMode: 'contain' })
  const input = { actorId: 'migration:local', guard: sql`1`, imageId: 'photo', expectedModifiedAt: 'token',
    storageNamespace: 'local' as const, storageKey: 'immutable/photo', expectedVersion: 1,
    bytes: new TextEncoder().encode('abc').buffer, mediaType: 'image/jpeg', metadata: { credit: 'Original' } }
  return { ...connection, db, input }
}

describe('verified image baseline', () => {
  it('retains explicit empty recovery provenance and rejects invented metadata', async () => {
    const f = await fixture()
    const metadataRecovery = { kind: 'empty-missing-sidecar' as const, missingVersion: 1, reason: 'User-approved empty baseline' }
    const input = { ...f.input, metadata: {}, metadataRecovery }
    const first = await registerImageRevisionBaseline(f.db, input)
    expect(await registerImageRevisionBaseline(f.db, input)).toEqual(first)
    const row = f.sqlite.prepare('SELECT metadata FROM imageRevision').get() as { metadata: string }
    expect(JSON.parse(row.metadata)).toMatchObject({ baselineRecovery: metadataRecovery, presentationMode: 'contain', version: 1 })
    await expect(registerImageRevisionBaseline(f.db, { ...input, metadata: { rotation: 90 } })).rejects.toThrow('empty object')
    await expect(registerImageRevisionBaseline(f.db, { ...input, metadataRecovery: { ...metadataRecovery, missingVersion: 2 } })).rejects.toThrow('matching version')
    await expect(registerImageRevisionBaseline(f.db, { ...input, metadataRecovery: { ...metadataRecovery, reason: '' } })).rejects.toThrow('explicit reason')
  })
  it('computes actual bytes and makes identical baseline retries idempotent', async () => {
    const f = await fixture()
    const first = await registerImageRevisionBaseline(f.db, f.input)
    expect(first).not.toBeNull()
    expect(await registerImageRevisionBaseline(f.db, f.input)).toEqual(first)
    expect(f.sqlite.prepare('SELECT contentHash,byteSize FROM imageAssetVersion').get()).toEqual({
      contentHash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', byteSize: 3 })
    expect(f.sqlite.prepare('SELECT count(*) AS n FROM imageRevision').get()).toEqual({ n: 1 })
  })
  it.each([{ storageKey: 'different' }, { storageNamespace: 'production' as const }, { expectedVersion: 2 }, { expectedModifiedAt: 'stale' }])('refuses stale locator evidence: %s', async change => {
    const f = await fixture()
    expect(await registerImageRevisionBaseline(f.db, { ...f.input, ...change })).toBeNull()
    expect(f.sqlite.prepare('SELECT count(*) AS n FROM imageAssetVersion').get()).toEqual({ n: 0 })
  })
  it('refuses changed bytes or metadata at an already registered locator', async () => {
    const f = await fixture()
    await registerImageRevisionBaseline(f.db, f.input)
    await expect(registerImageRevisionBaseline(f.db, { ...f.input, bytes: new TextEncoder().encode('abd').buffer })).rejects.toThrow('different evidence')
    await expect(registerImageRevisionBaseline(f.db, { ...f.input, metadata: { credit: 'Changed' } })).rejects.toThrow('explicit image revision')
  })
  it('records a legacy logo presentation change without rewriting verified old metadata', async () => {
    const f = await fixture()
    const original = (await registerImageRevisionBaseline(f.db, f.input))!
    f.sqlite.exec("UPDATE image SET presentationMode='cast-edges'")
    await expect(registerImageRevisionBaseline(f.db, f.input)).rejects.toThrow('different evidence')
    const current = (await registerImageRevisionBaseline(f.db, { ...f.input, captureCurrentPresentation: true }))!
    expect(current.assetVersionId).toBe(original.assetVersionId)
    expect(current.imageRevisionId).not.toBe(original.imageRevisionId)
    expect(await registerImageRevisionBaseline(f.db, { ...f.input, captureCurrentPresentation: true })).toEqual(current)
    const rows = f.sqlite.prepare('SELECT previousRevisionId,metadata FROM imageRevision ORDER BY rowid').all() as {previousRevisionId:string|null;metadata:string}[]
    expect(JSON.parse(rows[0].metadata).presentationMode).toBe('contain')
    expect(JSON.parse(rows[1].metadata).presentationMode).toBe('cast-edges')
    expect(rows[1].previousRevisionId).toBe(original.imageRevisionId)
    await expect(registerImageRevisionBaseline(f.db, { ...f.input, captureCurrentPresentation: true, metadata: { credit: 'Changed' } })).rejects.toThrow('different evidence')
  })
  it('does not trust a recorded identity hash or bypass the supplied scope guard', async () => {
    const f = await fixture()
    expect(await registerImageRevisionBaseline(f.db, { ...f.input, guard: sql`0` })).toBeNull()
    f.sqlite.exec("UPDATE image SET contentHash='wrong'")
    await expect(registerImageRevisionBaseline(f.db, f.input)).rejects.toThrow('recorded content hash')
  })
  it('rejects bytes that disagree with the exact metadata sidecar hash', async () => {
    const f = await fixture()
    await expect(registerImageRevisionBaseline(f.db, { ...f.input, metadata: { contentHash: 'different' } }))
      .rejects.toThrow('exact metadata content hash')
    expect(f.sqlite.prepare('SELECT count(*) AS n FROM imageAssetVersion').get()).toEqual({ n: 0 })
  })
})
