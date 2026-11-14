// @vitest-environment node
// TESTS
import { afterEach, expect, it } from 'vitest'
// SERVICES
import { listLocationResources } from '#lib/db/services/locationDirectory.js'
// FIXTURES
import { publicationSqlite } from './fixtures/publicationSqlite'
// TYPES
import type { Database } from '#lib/types.js'
const stores: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})
/** Build sparse identity anchors so filtering cannot depend on a source revision existing.
 * @returns SQLite-backed D1 query adapter with a hard parameter ceiling.
 */
function fixture() {
  const f = publicationSqlite({}, 100)
  stores.push(f)
  f.sqlite.exec(`CREATE TABLE location(id TEXT PRIMARY KEY,ssId TEXT,kind TEXT,state TEXT,sourceAvailability TEXT,ownerOrganisationId TEXT,createdAt TEXT);
    CREATE TABLE locationRevisionContent(id TEXT,locationId TEXT,version INTEGER,origin TEXT,createdAt TEXT,apiVersion TEXT,releaseId TEXT,snapshotId TEXT,facts TEXT,contentHash TEXT);
    CREATE TABLE locationSharedHead(locationId TEXT,corrections TEXT);
    CREATE TABLE organisationLocationHead(locationId TEXT,organisationId TEXT,overrides TEXT,revision TEXT);
    CREATE TABLE organisationI18n(organisationId TEXT,locale TEXT,name TEXT,nameShort TEXT);
    CREATE TABLE featureLocation(locationId TEXT,featureId TEXT);
    CREATE TABLE feature(id TEXT,projectId TEXT);
    CREATE TABLE project(id TEXT,organisationId TEXT);
    INSERT INTO project VALUES('p','org'),('other','other');
    INSERT INTO feature VALUES('f','p'),('other','other');`)
  const add = (
    id: string,
    ssId: string | null = null,
    state = 'unresolved',
    brandId = 'brand',
  ) => {
    f.sqlite
      .prepare('INSERT INTO location VALUES(?,?,?,?,?,?,?)')
      .run(
        id,
        ssId,
        'establishment',
        state,
        'current',
        state === 'manual' ? 'other' : null,
        'now',
      )
    f.sqlite
      .prepare('INSERT INTO locationSharedHead VALUES(?,?)')
      .run(
        id,
        JSON.stringify({ brandId: { choice: { mode: 'override', value: brandId } } }),
      )
  }
  return { ...f, db: f.db as unknown as Database, add }
}
it('applies brand and provenance before paging sparse community locations', async () => {
  const f = fixture()
  for (let index = 0; index < 28; index++)
    f.add(`local-${String(index).padStart(2, '0')}`)
  f.add('source', 'ss-source')
  f.add('different', null, 'unresolved', 'other')
  f.add('private', null, 'manual')
  f.add('redirect', null, 'redirect')
  const query = { brandId: 'brand', upstream: false, includeCount: true }
  const first = await listLocationResources(f.db, query)
  expect(first.totalCount).toBe(28)
  expect(first.data).toHaveLength(25)
  const second = await listLocationResources(f.db, {
    ...query,
    after: first.nextCursor!,
  })
  expect(second.data).toHaveLength(3)
  expect(second.nextCursor).toBeNull()
  expect(
    (await listLocationResources(f.db, { brandId: 'brand', upstream: true })).data.map(
      row => row.id,
    ),
  ).toEqual(['source'])
})
it('scopes Linked Features to the authorised organisation', async () => {
  const f = fixture()
  f.add('one')
  f.add('two')
  f.sqlite.exec("INSERT INTO featureLocation VALUES('one','f'),('two','other')")
  const query = { brandId: 'brand', organisationId: 'org' }
  expect(
    (await listLocationResources(f.db, { ...query, linkedFeatures: true })).data.map(
      row => row.id,
    ),
  ).toEqual(['one'])
  expect(
    (await listLocationResources(f.db, { ...query, linkedFeatures: false })).data.map(
      row => row.id,
    ),
  ).toEqual(['two'])
  expect(
    (await listLocationResources(f.db, { brandId: 'brand', linkedFeatures: true }))
      .data,
  ).toHaveLength(2)
})
it('does not match superseded or cleared brand assignments', async () => {
  const f = fixture()
  f.add('old')
  f.add('cleared')
  f.add('current')
  f.sqlite.exec(`UPDATE locationSharedHead SET corrections='{"brandId":{"choice":{"mode":"override","value":"brand"},"supersededBy":"new"}}' WHERE locationId='old';
    UPDATE locationSharedHead SET corrections='{"brandId":{"choice":{"mode":"clear"}}}' WHERE locationId='cleared';`)
  expect(
    (await listLocationResources(f.db, { brandId: 'brand' })).data.map(row => row.id),
  ).toEqual(['current'])
})

it('separates upstream published records from ownerless canonical drafts before counting', async () => {
  const f = fixture()
  f.add('draft')
  f.add('published', 'ss-published', 'linked')
  f.add('private', null, 'manual')
  const drafts = await listLocationResources(f.db as Database, {
    publication: 'draft',
    includeCount: true,
  })
  expect(drafts.data.map(row => row.id)).toEqual(['draft'])
  expect(drafts.totalCount).toBe(1)
  const published = await listLocationResources(f.db as Database, {
    publication: 'published',
    includeCount: true,
  })
  expect(published.data.map(row => row.id)).toEqual(['published'])
  expect(published.totalCount).toBe(1)
})
