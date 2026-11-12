// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, expect, it } from 'vitest'
// DRIZZLE
import { sql } from 'drizzle-orm'
// SERVICES
import {
  ensureImportedBrand,
  readIdentityCatalogue,
  saveIdentityCatalogue,
  searchIdentityCatalogue,
} from '../lib/db/services/identityCatalogue'
import { linkImportedLocationBrands } from '../lib/db/services/identityCatalogueImport'
import {
  prepareSharedLocationCorrection,
  sharedLocationFacts,
} from '../lib/db/services/locationShared'
import { executeRevisionBatch } from '../lib/db/services/revisionBatch'
// DOMAIN
import { seedIdentityCatalogue } from '../lib/locations/identityCatalogue'
import { emptyFeatureAddress } from '../lib/addresses/featureAddress'
// FIXTURES
import { publicationSqlite } from './fixtures/publicationSqlite'
// TYPES
import type { Database } from '#lib/types.js'

const connections: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const f of connections.splice(0)) f.sqlite.close()
})
/** Build source evidence and real immutable curation/catalogue tables.
 * @returns Isolated SQLite database and the untouched imported facts.
 */
function fixture() {
  const f = publicationSqlite({})
  connections.push(f)
  f.sqlite.exec(`CREATE TABLE location(id TEXT PRIMARY KEY,kind TEXT,state TEXT,matchingType TEXT GENERATED ALWAYS AS(kind));
    CREATE TABLE locationRevision(id TEXT PRIMARY KEY,locationId TEXT,version INTEGER,facts TEXT,rawSource TEXT);
    INSERT INTO location(id,kind,state) VALUES('place','establishment','unresolved');`)
  f.sqlite.exec(
    readFileSync('migrations/0209_shared_location_corrections.sql', 'utf8').split(
      '-- Adopt the latest',
    )[0],
  )
  f.sqlite.exec(readFileSync('migrations/0232_community_curation_locks.sql', 'utf8'))
  f.sqlite.exec(
    readFileSync('migrations/0237_identity_catalogue.sql', 'utf8') +
      readFileSync('migrations/0239_catalogue_i18n.sql', 'utf8'),
  )
  const facts = {
    names: { en: 'AROME Central' },
    brands: [{ identifiers: { breadlineBrand: 'arome' }, names: { en: 'AROME' } }],
    phoneNumber: [],
    location: {
      geometry: { type: 'Point' as const, coordinates: [114, 22] as [number, number] },
      address: emptyFeatureAddress().source,
    },
  }
  f.sqlite
    .prepare('INSERT INTO locationRevision VALUES(?,?,?,?,?)')
    .run('source', 'place', 1, JSON.stringify(facts), '{"rawBrand":"arome"}')
  return { ...f, db: f.db as unknown as Database, facts }
}
it('imports one identity with locale-first fallback names without changing raw source evidence', async () => {
  const f = fixture()
  const original = f.sqlite.prepare('SELECT * FROM locationRevision').get()
  expect(await linkImportedLocationBrands(f.db, 'place', 'import')).toBe(true)
  expect(await linkImportedLocationBrands(f.db, 'place', 'import')).toBe(false)
  const records = await searchIdentityCatalogue(f.db, 'brand', 'AROME')
  expect(records).toHaveLength(1)
  expect(records[0].i18n).toEqual({
    en: { name: 'AROME' },
    'zh-Hant': { name: 'AROME' },
    'zh-Hans': { name: 'AROME' },
  })
  const shared = await sharedLocationFacts(f.db, 'place', f.facts)
  expect(shared.facts.brandId).toBe(records[0].id)
  expect(shared.facts.brands[0].names['zh-Hant']).toBe('AROME')
  expect(f.sqlite.prepare('SELECT * FROM locationRevision').get()).toEqual(original)
})
it('retains accepted catalogue versions and curated translations across repeat imports', async () => {
  const f = fixture()
  await linkImportedLocationBrands(f.db, 'place', 'import')
  const before = await sharedLocationFacts(f.db, 'place', f.facts)
  const record = (await searchIdentityCatalogue(f.db, 'brand', ''))[0]
  const content = {
    i18n: { ...record.i18n, 'zh-Hant': { name: '東海堂' } },
    logo: null,
  }
  expect(
    await saveIdentityCatalogue(f.db, {
      id: record.id,
      kind: 'brand',
      expectedVersion: 1,
      content,
      actorId: 'editor',
      guard: sql`1`,
    }),
  ).not.toBeNull()
  expect(
    (await ensureImportedBrand(f.db, f.facts.brands[0], 'import')).i18n['zh-Hant'].name,
  ).toBe('東海堂')
  expect(
    (await sharedLocationFacts(f.db, 'place', f.facts, before.revision)).facts.brands[0]
      .names['zh-Hant'],
  ).toBe('AROME')
  const change = await prepareSharedLocationCorrection(f.db, {
    locationId: 'place',
    sourceRevisionId: 'source',
    expectedRevision: before.revision,
    actorId: 'editor',
    guard: sql`1`,
    rights: { canEdit: true, superAdmin: false },
    patch: { brandId: { mode: 'override', value: record.id } },
  })
  expect(change.fields).toContain('brands')
  await executeRevisionBatch(f.db, change.guard, change.queries)
  expect(
    (await sharedLocationFacts(f.db, 'place', f.facts)).facts.brands[0].names[
      'zh-Hant'
    ],
  ).toBe('東海堂')
  expect(
    await saveIdentityCatalogue(f.db, {
      id: record.id,
      kind: 'brand',
      expectedVersion: 1,
      content,
      actorId: 'editor',
      guard: sql`1`,
    }),
  ).toBeNull()
  expect((await readIdentityCatalogue(f.db, record.id, 1))?.i18n['zh-Hant'].name).toBe(
    'AROME',
  )
})
it('resolves a pinned group and rejects wrong-kind or locked catalogue links', async () => {
  const f = fixture()
  await saveIdentityCatalogue(f.db, {
    id: 'group',
    kind: 'group',
    expectedVersion: 0,
    content: seedIdentityCatalogue({ en: 'Corporate group' }),
    actorId: 'editor',
    guard: sql`1`,
  })
  const input = {
    locationId: 'place',
    sourceRevisionId: 'source',
    expectedRevision: null,
    actorId: 'editor',
    guard: sql`1`,
    rights: { canEdit: true, superAdmin: false },
  }
  await expect(
    prepareSharedLocationCorrection(f.db, {
      ...input,
      patch: { brandId: { mode: 'override', value: 'group' } },
    }),
  ).rejects.toThrow('CATALOGUE_IDENTITY_UNAVAILABLE')
  const prepared = await prepareSharedLocationCorrection(f.db, {
    ...input,
    patch: { groupId: { mode: 'override', value: 'group' } },
  })
  await executeRevisionBatch(f.db, prepared.guard, prepared.queries)
  expect(
    (await sharedLocationFacts(f.db, 'place', f.facts)).facts.group?.i18n.en.name,
  ).toBe('Corporate group')
  f.sqlite.exec(
    `INSERT INTO locationCurationLockRevision VALUES('lock','place',NULL,'{"groupId":false}','admin','now')`,
  )
  await expect(
    prepareSharedLocationCorrection(f.db, {
      ...input,
      expectedRevision: prepared.id,
      patch: { groupId: { mode: 'inherit' } },
    }),
  ).rejects.toThrow()
})

it('generates Breadline import links in the same SQL transaction without changing raw brands', async () => {
  const f = fixture()
  const { breadlineBrandCatalogueSql } = await import(
    '../../scripts/breadline/lib/brand-catalogue'
  )
  const statement = breadlineBrandCatalogueSql({
    brand: f.facts.brands[0],
    locationId: 'place',
    sourceRevisionId: 'source',
    actorId: 'import',
  })
  f.sqlite.exec(statement)
  const first = await sharedLocationFacts(f.db, 'place', f.facts)
  expect(first.facts.brands[0].names['zh-Hans']).toBe('AROME')
  f.sqlite.exec(statement)
  expect(f.sqlite.prepare('SELECT count(*) n FROM identityCatalogue').get()).toEqual({
    n: 1,
  })
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM locationSharedRevision').get(),
  ).toEqual({ n: 1 })
})

it('publishes catalogue changes as new community evidence while keeping accepted pins stable', async () => {
  const f = fixture()
  await linkImportedLocationBrands(f.db, 'place', 'import')
  const before = await sharedLocationFacts(f.db, 'place', f.facts)
  const record = (await searchIdentityCatalogue(f.db, 'brand', ''))[0]
  await saveIdentityCatalogue(f.db, {
    id: record.id,
    kind: 'brand',
    expectedVersion: 1,
    content: seedIdentityCatalogue({ en: 'Updated brand' }),
    actorId: 'editor',
    guard: sql`1`,
  })
  const { publishCatalogueLocationPage } = await import(
    '../lib/db/services/identityCatalogueImport'
  )
  expect(await publishCatalogueLocationPage(f.db, record.id, null, 'editor')).toEqual({
    linked: 1,
    failed: [],
    next: null,
  })
  expect(
    (await sharedLocationFacts(f.db, 'place', f.facts)).facts.brands[0].names.en,
  ).toBe('Updated brand')
  expect(
    (await sharedLocationFacts(f.db, 'place', f.facts, before.revision)).facts.brands[0]
      .names.en,
  ).toBe('AROME')
})
