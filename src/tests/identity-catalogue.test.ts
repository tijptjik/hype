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
  listGroupBrands,
  listSubgroups,
  readIdentityCatalogue,
  readIdentityCatalogueByCode,
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
import {
  IdentityCatalogueContentSchema,
  seedIdentityCatalogue,
} from '../lib/locations/identityCatalogue'
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
function fixture(applyHierarchy = true) {
  const f = publicationSqlite({})
  connections.push(f)
  f.sqlite.exec(`CREATE TABLE location(id TEXT PRIMARY KEY,kind TEXT,state TEXT,ssId TEXT,ownerOrganisationId TEXT,matchingType TEXT GENERATED ALWAYS AS(kind));
    CREATE TABLE locationRevision(id TEXT PRIMARY KEY,locationId TEXT,version INTEGER,facts TEXT,rawSource TEXT);
    INSERT INTO location(id,kind,state) VALUES('place','establishment','linked');`)
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
  f.sqlite.exec(
    readFileSync('migrations/0241_authoritative_revision_translations.sql', 'utf8')
      .split('DROP TRIGGER identity_catalogue_i18n_revision;')[1]
      .split('DROP VIEW featureAcceptedNamingLocation;')[0]
      .replace(/^/, 'DROP TRIGGER identity_catalogue_i18n_revision;'),
  )
  if (applyHierarchy)
    f.sqlite.exec(readFileSync('migrations/0245_catalogue_group_hierarchy.sql', 'utf8'))
  f.sqlite.exec('CREATE VIEW locationRevisionContent AS SELECT * FROM locationRevision')
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

it('searches only the selected catalogue revision while retaining old translations once', async () => {
  const f = fixture()
  await ensureImportedBrand(f.db, f.facts.brands[0], 'import')
  const record = (await searchIdentityCatalogue(f.db, 'brand', 'AROME'))[0]
  await saveIdentityCatalogue(f.db, {
    id: record.id,
    kind: 'brand',
    expectedVersion: record.version,
    content: seedIdentityCatalogue({ en: 'New family' }),
    actorId: 'editor',
    guard: sql`1`,
  })
  expect(await searchIdentityCatalogue(f.db, 'brand', 'AROME')).toHaveLength(0)
  expect(await searchIdentityCatalogue(f.db, 'brand', 'New family')).toHaveLength(1)
  expect((await readIdentityCatalogue(f.db, record.id, 1))?.i18n.en.name).toBe('AROME')
  expect(
    f.sqlite
      .prepare(
        "SELECT count(*) n FROM identityCatalogueRevision WHERE json_type(content,'$.i18n') IS NOT NULL",
      )
      .get()?.n,
  ).toBe(0)
})

it('disambiguates identical names with unique searchable codes and taxonomy associations', async () => {
  const f = fixture()
  const content = {
    ...seedIdentityCatalogue({ en: 'Same name' }),
    code: 'same-bakery',
    categories: ['bakery'],
  }
  const save = (id: string, value = content) =>
    saveIdentityCatalogue(f.db, {
      id,
      kind: 'brand',
      expectedVersion: 0,
      content: value,
      actorId: 'admin',
      guard: sql`1`,
    })
  expect(await save('first')).not.toBeNull()
  expect(await save('duplicate')).toBeNull()
  expect(await save('second', { ...content, code: 'same-cafe' })).not.toBeNull()
  expect(
    (await searchIdentityCatalogue(f.db, 'brand', 'same-bakery')).map(row => row.id),
  ).toEqual(['first'])
  await expect(
    save('invalid', { ...content, code: 'invalid', categories: ['invented-category'] }),
  ).rejects.toThrow()
  expect((await readIdentityCatalogue(f.db, 'first'))?.categories).toEqual(['bakery'])
})

it('proposes a brand group together with the brand and preserves an explicit group choice', async () => {
  const f = fixture()
  for (const id of ['group', 'other'])
    await saveIdentityCatalogue(f.db, {
      id,
      kind: 'group',
      expectedVersion: 0,
      content: seedIdentityCatalogue({ en: id }),
      actorId: 'editor',
      guard: sql`1`,
    })
  await saveIdentityCatalogue(f.db, {
    id: 'brand',
    kind: 'brand',
    expectedVersion: 0,
    content: { ...seedIdentityCatalogue({ en: 'Brand' }), groupId: 'group' },
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
  const automatic = await prepareSharedLocationCorrection(f.db, {
    ...input,
    patch: { brandId: { mode: 'override', value: 'brand' } },
  })
  expect(automatic.fields).toContain('groupId')
  await executeRevisionBatch(f.db, automatic.guard, automatic.queries)
  const current = await sharedLocationFacts(f.db, 'place', f.facts)
  expect(current.facts.groupId).toBe('group')
  const explicit = await prepareSharedLocationCorrection(f.db, {
    ...input,
    expectedRevision: current.revision,
    patch: {
      brandId: { mode: 'override', value: 'brand' },
      groupId: { mode: 'override', value: 'other' },
    },
  })
  await executeRevisionBatch(f.db, explicit.guard, explicit.queries)
  expect((await sharedLocationFacts(f.db, 'place', f.facts)).facts.groupId).toBe(
    'other',
  )
})

it('creates an inline group and its brand link atomically with localized names', async () => {
  const f = fixture()
  const i18n = seedIdentityCatalogue({ en: 'Example Group', 'zh-hant': '集團' }).i18n
  const record = await saveIdentityCatalogue(f.db, {
    id: 'inline-brand',
    kind: 'brand',
    expectedVersion: 0,
    content: {
      ...seedIdentityCatalogue({ en: 'Example Brand' }),
      groupId: 'inline-group',
    },
    newGroup: { id: 'inline-group', i18n },
    actorId: 'editor',
    guard: sql`1`,
  })
  expect(record?.groupId).toBe('inline-group')
  expect(await readIdentityCatalogue(f.db, 'inline-group')).toMatchObject({
    kind: 'group',
    i18n,
    version: 1,
  })
})

it('does not leave an inline group behind when the brand revision guard fails', async () => {
  const f = fixture()
  const result = await saveIdentityCatalogue(f.db, {
    id: 'missing-brand',
    kind: 'brand',
    expectedVersion: 4,
    content: { ...seedIdentityCatalogue({ en: 'Brand' }), groupId: 'unused-group' },
    newGroup: { id: 'unused-group', i18n: seedIdentityCatalogue({ en: 'Group' }).i18n },
    actorId: 'editor',
    guard: sql`1`,
  })
  expect(result).toBeNull()
  expect(await readIdentityCatalogue(f.db, 'unused-group')).toBeNull()
})

it('rejects inline group payloads that are not the brand link being saved', async () => {
  const f = fixture()
  await expect(
    saveIdentityCatalogue(f.db, {
      id: 'brand',
      kind: 'brand',
      expectedVersion: 0,
      content: { ...seedIdentityCatalogue({ en: 'Brand' }), groupId: 'other' },
      newGroup: { id: 'new-group', i18n: seedIdentityCatalogue({ en: 'Group' }).i18n },
      actorId: 'editor',
      guard: sql`1`,
    }),
  ).rejects.toThrow('CATALOGUE_GROUP_REQUIRED')
  expect(await readIdentityCatalogue(f.db, 'new-group')).toBeNull()
})

it('retains optional nested group membership in history and projects the current foreign key', async () => {
  const f = fixture()
  for (const [id, groupId] of [
    ['root', null],
    ['middle', 'root'],
    ['leaf', 'middle'],
  ] as const) {
    await saveIdentityCatalogue(f.db, {
      id,
      kind: 'group',
      expectedVersion: 0,
      content: { ...seedIdentityCatalogue({ en: id }), groupId },
      actorId: 'editor',
      guard: sql`1`,
    })
  }
  expect(
    f.sqlite.prepare("SELECT groupId FROM identityCatalogue WHERE id='leaf'").get(),
  ).toEqual({ groupId: 'middle' })
  expect(
    (await searchIdentityCatalogue(f.db, 'group', '', 'middle')).map(row => row.id),
  ).toEqual(['root'])
  expect(await searchIdentityCatalogue(f.db, 'group', 'leaf', 'root')).toEqual([])
  const saved = await saveIdentityCatalogue(f.db, {
    id: 'leaf',
    kind: 'group',
    expectedVersion: 1,
    content: { ...seedIdentityCatalogue({ en: 'leaf' }), groupId: null },
    actorId: 'editor',
    guard: sql`1`,
  })
  expect(saved?.groupId).toBeNull()
  expect((await readIdentityCatalogue(f.db, 'leaf', 1))?.groupId).toBe('middle')
  expect(
    f.sqlite.prepare("SELECT groupId FROM identityCatalogue WHERE id='leaf'").get(),
  ).toEqual({ groupId: null })
})

it('rejects self links, missing parents, brand parents and indirect group cycles', async () => {
  const f = fixture()
  for (const [id, kind, groupId] of [
    ['root', 'group', null],
    ['child', 'group', 'root'],
    ['brand', 'brand', null],
  ] as const) {
    await saveIdentityCatalogue(f.db, {
      id,
      kind,
      expectedVersion: 0,
      content: { ...seedIdentityCatalogue({ en: id }), groupId },
      actorId: 'editor',
      guard: sql`1`,
    })
  }
  for (const [groupId, error] of [
    ['root', 'CATALOGUE_GROUP_CYCLE'],
    ['child', 'CATALOGUE_GROUP_CYCLE'],
    ['missing', 'CATALOGUE_GROUP_REQUIRED'],
    ['brand', 'CATALOGUE_GROUP_REQUIRED'],
  ]) {
    await expect(
      saveIdentityCatalogue(f.db, {
        id: 'root',
        kind: 'group',
        expectedVersion: 1,
        content: { ...seedIdentityCatalogue({ en: 'root' }), groupId },
        actorId: 'editor',
        guard: sql`1`,
      }),
    ).rejects.toThrow(error)
  }
  expect((await readIdentityCatalogue(f.db, 'root'))?.version).toBe(1)
  // Database checks also protect writes that bypass the service or race its preflight read.
  expect(() =>
    f.sqlite.exec("UPDATE identityCatalogue SET groupId='child' WHERE id='root'"),
  ).toThrow('CATALOGUE_GROUP_CYCLE')
  expect(() =>
    f.sqlite.exec("UPDATE identityCatalogue SET groupId='brand' WHERE id='root'"),
  ).toThrow('CATALOGUE_GROUP_REQUIRED')
  expect(() =>
    f.sqlite.exec(
      "INSERT INTO identityCatalogue(id,kind,version,groupId) VALUES('self','group',1,'self')",
    ),
  ).toThrow('CATALOGUE_GROUP_CYCLE')
  expect(
    f.sqlite.prepare("SELECT groupId FROM identityCatalogue WHERE id='root'").get(),
  ).toEqual({ groupId: null })
})

it('creates an optional parent inline atomically and rejects stale group edits', async () => {
  const f = fixture()
  const input = {
    id: 'child',
    kind: 'group' as const,
    expectedVersion: 0,
    content: { ...seedIdentityCatalogue({ en: 'Child' }), groupId: 'parent' },
    newGroup: { id: 'parent', i18n: seedIdentityCatalogue({ en: 'Parent' }).i18n },
    actorId: 'editor',
    guard: sql`1`,
  }
  expect((await saveIdentityCatalogue(f.db, input))?.groupId).toBe('parent')
  expect(
    f.sqlite.prepare("SELECT groupId FROM identityCatalogue WHERE id='child'").get(),
  ).toEqual({ groupId: 'parent' })
  expect(
    await saveIdentityCatalogue(f.db, {
      ...input,
      content: { ...input.content, groupId: 'unused' },
      newGroup: { ...input.newGroup, id: 'unused' },
    }),
  ).toBeNull()
  expect(await readIdentityCatalogue(f.db, 'unused')).toBeNull()
})

it('backfills existing memberships without rewriting revisions', () => {
  const f = fixture(false)
  f.sqlite.exec(
    `INSERT INTO identityCatalogue(id,kind,version) VALUES('parent','group',1),('legacy','brand',1)`,
  )
  const insert = f.sqlite.prepare(
    "INSERT INTO identityCatalogueRevisionContent(catalogueId,version,content,actorId,createdAt) VALUES(?,1,?,'editor','now')",
  )
  insert.run('parent', JSON.stringify(seedIdentityCatalogue({ en: 'Parent' })))
  insert.run(
    'legacy',
    JSON.stringify({ ...seedIdentityCatalogue({ en: 'Legacy' }), groupId: 'parent' }),
  )
  const before = f.sqlite
    .prepare('SELECT * FROM identityCatalogueRevision ORDER BY catalogueId')
    .all()
  f.sqlite.exec(readFileSync('migrations/0245_catalogue_group_hierarchy.sql', 'utf8'))
  expect(
    f.sqlite.prepare("SELECT groupId FROM identityCatalogue WHERE id='legacy'").get(),
  ).toEqual({ groupId: 'parent' })
  expect(
    f.sqlite
      .prepare('SELECT * FROM identityCatalogueRevision ORDER BY catalogueId')
      .all(),
  ).toEqual(before)
  expect(f.sqlite.prepare('PRAGMA foreign_key_list(identityCatalogue)').all()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        table: 'identityCatalogue',
        from: 'groupId',
        to: 'id',
      }),
    ]),
  )
})

it('resolves exact current codes within their brand or group namespace', async () => {
  const f = fixture()
  for (const kind of ['brand', 'group'] as const) {
    await saveIdentityCatalogue(f.db, {
      id: `route-${kind}`,
      kind,
      expectedVersion: 0,
      content: { ...seedIdentityCatalogue({ en: kind }), code: 'same-code' },
      actorId: 'admin',
      guard: sql`1`,
    })
  }
  expect((await readIdentityCatalogueByCode(f.db, 'brand', 'same-code'))?.id).toBe(
    'route-brand',
  )
  expect((await readIdentityCatalogueByCode(f.db, 'group', 'same-code'))?.id).toBe(
    'route-group',
  )
  expect(await readIdentityCatalogueByCode(f.db, 'brand', 'same')).toBeNull()
})

it('retains discovery preferences independently from classification and translations', async () => {
  const f = fixture()
  const content = {
    ...seedIdentityCatalogue({ en: 'AROME' }),
    categories: ['bakery'],
    discovery: { terms: ['AROME Bakery', '東海堂'], category: 'cafe' },
  }
  await saveIdentityCatalogue(f.db, {
    id: 'discovery-brand',
    kind: 'brand',
    expectedVersion: 0,
    content,
    actorId: 'editor',
    guard: sql`1`,
  })
  const record = await readIdentityCatalogue(f.db, 'discovery-brand')
  expect(record?.discovery).toEqual(content.discovery)
  expect(record?.categories).toEqual(['bakery'])
  expect(record?.i18n.en.name).toBe('AROME')
})

it('saves intentionally untranslated catalogue names without filling them from another locale', async () => {
  const f = fixture()
  const content = seedIdentityCatalogue({ en: 'Kitchen' })
  content.i18n['zh-Hant'].name = ''
  content.i18n['zh-Hans'].name = ''
  const saved = await saveIdentityCatalogue(f.db, {
    id: 'incomplete-brand',
    kind: 'brand',
    expectedVersion: 0,
    content,
    actorId: 'editor',
    guard: sql`1`,
  })
  if (!saved) throw new Error('Expected catalogue save to succeed')
  const record = await readIdentityCatalogue(f.db, saved.id)
  expect(record?.i18n.en.name).toBe('Kitchen')
  expect(record?.i18n['zh-Hant'].name).toBe('')
  expect(record?.i18n['zh-Hans'].name).toBe('')
})

it('accepts blank lines while editing discovery terms and normalizes them on save', () => {
  const record = IdentityCatalogueContentSchema.parse({
    ...seedIdentityCatalogue({ en: 'AROME' }),
    discovery: { terms: [' AROME Bakery ', '', '東海堂', '  '] },
  })
  expect(record.discovery?.terms).toEqual(['AROME Bakery', '東海堂'])
})

it('saves a reviewed Wikidata mapping atomically and reuses it for upstream imports', async () => {
  const f = fixture()
  const content = seedIdentityCatalogue({ en: 'Reviewed Bakery' })
  const saved = await saveIdentityCatalogue(f.db, {
    id: 'reviewed',
    kind: 'brand',
    expectedVersion: 0,
    content,
    wikidataId: 'Q12345',
    actorId: 'editor',
    guard: sql`1`,
  })
  expect(saved?.wikidataId).toBe('Q12345')
  const imported = await ensureImportedBrand(
    f.db,
    {
      identifiers: { wikidata: 'Q12345' },
      names: { en: 'Upstream Bakery' },
    },
    'import',
  )
  expect(imported.id).toBe('reviewed')
  expect(imported.i18n.en.name).toBe('Reviewed Bakery')
  await expect(
    saveIdentityCatalogue(f.db, {
      id: 'duplicate',
      kind: 'brand',
      expectedVersion: 0,
      content,
      wikidataId: 'Q12345',
      actorId: 'editor',
      guard: sql`1`,
    }),
  ).rejects.toThrow('WIKIDATA_BRAND_ALREADY_LINKED')
  expect(await readIdentityCatalogue(f.db, 'duplicate')).toBeNull()
})

it('does not persist a source mapping when the catalogue revision is stale', async () => {
  const f = fixture()
  const content = seedIdentityCatalogue({ en: 'Reviewed Bakery' })
  expect(
    await saveIdentityCatalogue(f.db, {
      id: 'missing',
      kind: 'brand',
      expectedVersion: 5,
      content,
      wikidataId: 'Q12345',
      actorId: 'editor',
      guard: sql`1`,
    }),
  ).toBeNull()
  expect(f.sqlite.prepare('SELECT * FROM identityCatalogueSource').all()).toEqual([])
})

it('finds sibling brands across intermediate groups while group pages stay within their subtree', async () => {
  const f = fixture()
  const entries = [
    ['root', 'group', null],
    ['middle', 'group', 'root'],
    ['nested', 'group', 'middle'],
    ['other', 'group', 'root'],
    ['unrelated', 'group', null],
    ['direct', 'brand', 'root'],
    ['cakes', 'brand', 'middle'],
    ['arome', 'brand', 'middle'],
    ['deep', 'brand', 'nested'],
    ['cousin', 'brand', 'other'],
    ['outside', 'brand', 'unrelated'],
    ['ungrouped', 'brand', null],
  ] as const
  for (const [id, kind, groupId] of entries) {
    await saveIdentityCatalogue(f.db, {
      id,
      kind,
      expectedVersion: 0,
      actorId: 'admin',
      guard: sql`1`,
      content: { ...seedIdentityCatalogue({ en: id }), groupId },
    })
  }
  const ids = async (id: string, ancestors = false) =>
    (await listGroupBrands(f.db, id, ancestors)).map(row => row.id)
  expect((await listSubgroups(f.db, 'root')).map(row => row.id)).toEqual([
    'middle',
    'other',
  ])
  expect((await listSubgroups(f.db, 'middle')).map(row => row.id)).toEqual(['nested'])
  expect(await listSubgroups(f.db, 'cakes')).toEqual([])
  expect(await listSubgroups(f.db, 'missing')).toEqual([])
  expect(await ids('middle')).toEqual(['arome', 'cakes', 'deep'])
  expect(await ids('middle', true)).toEqual([
    'arome',
    'cakes',
    'cousin',
    'deep',
    'direct',
  ])
  expect(await ids('other', true)).toEqual(await ids('middle', true))
  expect(await ids('root')).toEqual(await ids('middle', true))
  expect(await ids('missing', true)).toEqual([])
  expect(await ids('cakes', true)).toEqual([])
  const cakes = await readIdentityCatalogue(f.db, 'cakes')
  if (!cakes) throw new Error('Missing cakes fixture')
  await saveIdentityCatalogue(f.db, {
    id: 'cakes',
    kind: 'brand',
    expectedVersion: cakes.version,
    actorId: 'admin',
    guard: sql`1`,
    content: { ...seedIdentityCatalogue({ en: 'cakes' }), groupId: 'unrelated' },
  })
  expect(await ids('middle', true)).toEqual(['arome', 'cousin', 'deep', 'direct'])
})

it('claims kebab-case group codes, disambiguates names, and preserves explicit codes', async () => {
  const f = fixture()
  const saveGroup = (
    id: string,
    content = seedIdentityCatalogue({ en: 'Blossom Group' }),
  ) =>
    saveIdentityCatalogue(f.db, {
      id,
      kind: 'group',
      expectedVersion: 0,
      content,
      actorId: 'editor',
      guard: sql`1`,
    })
  expect((await saveGroup('blossom-one'))?.code).toBe('blossom-group')
  expect((await saveGroup('blossom-two'))?.code).toBe('blossom-group-2')
  expect(
    (
      await saveGroup('explicit', {
        ...seedIdentityCatalogue({ en: 'Blossom Group' }),
        code: 'custom-code',
      })
    )?.code,
  ).toBe('custom-code')
  expect(
    (await saveGroup('non-latin', seedIdentityCatalogue({ 'zh-Hant': '花開集團' })))
      ?.code,
  ).toBe('group-non-latin')
  expect((await readIdentityCatalogueByCode(f.db, 'group', 'blossom-group'))?.id).toBe(
    'blossom-one',
  )
})

it('claims distinct codes for an inline parent and new child with the same name', async () => {
  const f = fixture()
  const content = seedIdentityCatalogue({ en: 'Blossom' })
  const child = await saveIdentityCatalogue(f.db, {
    id: 'child',
    kind: 'group',
    expectedVersion: 0,
    content: { ...content, groupId: 'parent' },
    newGroup: { id: 'parent', i18n: content.i18n },
    actorId: 'editor',
    guard: sql`1`,
  })
  expect(child?.code).toBe('blossom')
  expect((await readIdentityCatalogue(f.db, 'parent'))?.code).toBe('blossom-2')
})

it('hides archived identities from discovery while preserving direct and historical reads', async () => {
  const f = fixture()
  for (const kind of ['brand', 'group'] as const) {
    const content = {
      ...seedIdentityCatalogue({ en: `Archive ${kind}` }),
      code: `archive-${kind}`,
    }
    await saveIdentityCatalogue(f.db, {
      id: kind,
      kind,
      expectedVersion: 0,
      content,
      actorId: 'editor',
      guard: sql`1`,
    })
    await saveIdentityCatalogue(f.db, {
      id: kind,
      kind,
      expectedVersion: 1,
      content: { ...content, isArchived: true },
      actorId: 'admin',
      guard: sql`1`,
    })
    expect(await searchIdentityCatalogue(f.db, kind, '')).toEqual([])
    expect(await searchIdentityCatalogue(f.db, kind, '', undefined, true)).toHaveLength(
      1,
    )
    expect(await searchIdentityCatalogue(f.db, kind, '', undefined, null)).toHaveLength(
      1,
    )
    expect(
      (await readIdentityCatalogueByCode(f.db, kind, content.code))?.isArchived,
    ).toBe(true)
    expect((await readIdentityCatalogue(f.db, kind, 1))?.isArchived).not.toBe(true)
    await saveIdentityCatalogue(f.db, {
      id: kind,
      kind,
      expectedVersion: 2,
      content: { ...content, isArchived: false },
      actorId: 'admin',
      guard: sql`1`,
    })
    expect(await searchIdentityCatalogue(f.db, kind, '')).toHaveLength(1)
  }
})

it('excludes deleted groups from family traversal without bridging their descendants', async () => {
  const f = fixture()
  for (const [id, kind, groupId] of [
    ['root', 'group', null],
    ['child', 'group', 'root'],
    ['brand', 'brand', 'child'],
    ['independent', 'brand', null],
  ] as const) {
    await saveIdentityCatalogue(f.db, {
      id,
      kind,
      expectedVersion: 0,
      content: { ...seedIdentityCatalogue({ en: id }), code: id, groupId },
      actorId: 'admin',
      guard: sql`1`,
    })
  }
  expect(
    (await searchIdentityCatalogue(f.db, 'brand', '', undefined, false, true)).map(
      row => row.id,
    ),
  ).toEqual(['independent'])
  expect(
    (await searchIdentityCatalogue(f.db, 'brand', '', undefined, false, false)).map(
      row => row.id,
    ),
  ).toEqual(['brand'])
  expect(
    await searchIdentityCatalogue(f.db, 'brand', '', undefined, false, null),
  ).toHaveLength(2)
  expect(await listGroupBrands(f.db, 'root')).toHaveLength(1)
  await saveIdentityCatalogue(f.db, {
    id: 'child',
    kind: 'group',
    expectedVersion: 1,
    content: {
      ...seedIdentityCatalogue({ en: 'child' }),
      code: 'child',
      groupId: 'root',
      isArchived: true,
    },
    actorId: 'admin',
    guard: sql`1`,
  })
  expect(await listGroupBrands(f.db, 'root')).toEqual([])
  expect(await listGroupBrands(f.db, 'child', true)).toEqual([])
  expect(await listSubgroups(f.db, 'root')).toEqual([])
})

it.each(['brand', 'group'] as const)(
  'pages every %s with tied names without truncation or duplicates',
  async kind => {
    const f = fixture()
    for (let index = 0; index < 103; index++) {
      await saveIdentityCatalogue(f.db, {
        id: `paging-${kind}-${String(index).padStart(3, '0')}`,
        kind,
        expectedVersion: 0,
        content: {
          i18n: {
            en: { name: 'Same name' },
            'zh-Hant': { name: '' },
            'zh-Hans': { name: '' },
          },
          logo: null,
        },
        actorId: 'editor',
        guard: sql`1`,
      })
    }
    expect(await searchIdentityCatalogue(f.db, kind, '')).toHaveLength(50)
    const ids: string[] = []
    let after: { name: string; id: string } | undefined
    for (;;) {
      const rows = await searchIdentityCatalogue(
        f.db,
        kind,
        '',
        undefined,
        false,
        null,
        { after },
      )
      const page = rows.slice(0, 50)
      ids.push(...page.map(row => row.id))
      if (rows.length <= 50) break
      const last = page.at(-1)!
      after = { name: last.i18n.en.name, id: last.id }
    }
    expect(ids).toHaveLength(103)
    expect(new Set(ids).size).toBe(103)
    expect(ids).toEqual([...ids].sort())
  },
)
