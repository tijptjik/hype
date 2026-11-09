// @vitest-environment node
// TESTS
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it } from 'vitest'
// DRIZZLE
import { getTableColumns, getTableName, is } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
// DB AND SERVICES
import * as schema from '#lib/db/schema/index.js'
import {
  readUserContributedFeatures,
  readUserContributedImages,
} from '#lib/api/services/userContributions.js'
// TYPES
import type { Database, SessionUser, UserRoleDisco } from '#lib/types.js'

let sqlite: DatabaseSync
let db: Database
let statements: { query: string; parameters: number }[]
const params = {
  userId: 'target',
  ids: [] as string[],
  actor: { id: 'viewer', isAnonymous: false, superAdmin: false } as SessionUser,
  userRoles: [
    { type: 'organisation', role: 'owner', organisationId: 'org', userId: 'viewer' },
  ] as UserRoleDisco[],
  isAdminRequest: true,
  hub: { isCore: false, organisations: [{ id: 'org' }] } as never,
}
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  statements = []
  for (const table of Object.values(schema)) {
    if (!is(table, SQLiteTable)) continue
    const columns = Object.values(getTableColumns(table))
    sqlite.exec(
      `CREATE TABLE IF NOT EXISTS "${getTableName(table)}" (${columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(',')})`,
    )
  }
  sqlite.exec(`INSERT INTO user (id,isArchived) VALUES ('target',0),('archived',1);
    INSERT INTO layer (id,isPublished,isArchived) VALUES ('layer',1,0),('hidden',0,0);`)
  db = drizzle(
    async (query, values) => {
      statements.push({ query, parameters: values.length })
      const statement = sqlite.prepare(query)
      statement.setReturnArrays(true)
      return { rows: statement.all(...values) as unknown as unknown[][] }
    },
    { schema },
  ) as unknown as Database
})
afterEach(() => sqlite.close())

function addFeature(id: string, owner = 'target'): void {
  sqlite
    .prepare(
      `INSERT INTO feature
    (id,createdAt,modifiedAt,contributorId,organisationId,projectId,layerId,isPublished,isArchived,isDraft,isPendingReview,isVisitable,isIntangible,addressMeta,geometry)
    VALUES (?,'2026-01-01','2026-01-01',?,'org','project','layer',1,0,0,0,1,0,'{}','{"type":"Point","coordinates":[114,22]}')`,
    )
    .run(id, owner)
}
function addPhoto(id: string, featureId: string, owner = 'target'): void {
  sqlite
    .prepare(
      `INSERT INTO image
    (id,createdAt,modifiedAt,contributorId,isArchived,cdn,env,publicId,version,presentationMode)
    VALUES (?,'2026-01-01','2026-01-01',?,0,'cloudflareR2','local',?,1,'contain')`,
    )
    .run(id, owner, `images/${id}`)
  sqlite
    .prepare(
      `INSERT INTO featureImage (featureId,imageId,isPublished,intent) VALUES (?,?,1,'undefined')`,
    )
    .run(featureId, id)
}

it('reads 20 map-compatible features in one statement with bounded parameters', async () => {
  const ids = Array.from({ length: 20 }, (_, i) => `f${i}`)
  for (const id of ids) addFeature(id)
  sqlite.exec(`INSERT INTO featureI18n (featureId,locale,title,titleGen,displayAddress,displayAddressGen,descriptionGen)
    VALUES ('f0','en','A place',0,'Street address',0,0)`)
  const rows = await readUserContributedFeatures(db, { ...params, ids })
  expect(rows).toHaveLength(20)
  expect(rows.find(row => row.id === 'f0')).toMatchObject({
    projectId: 'project',
    layerId: 'layer',
    geometry: { type: 'Point', coordinates: [114, 22] },
    i18n: { en: { title: 'A place', displayAddress: 'Street address' } },
  })
  expect(statements).toHaveLength(1)
  expect(statements[0].parameters).toBeLessThan(100)
})

it('preserves translated property definitions and options in contribution pages', async () => {
  addFeature('translated')
  sqlite.exec(`
    INSERT INTO property
      (id,scope,type,key,dataType,dateResolution,timeMaxHour,cardinality,presentation,audience,component,isTranslatable,isUserContributable,isDefaultEnabled,createdAt,modifiedAt)
      VALUES ('category','project','classifier','category','text','day',24,'one','text','public','SelectField',1,1,1,'2026-01-01','2026-01-01');
    INSERT INTO propertyI18n (propertyId,locale,label,labelGen,placeholderGen)
      VALUES ('category','en','Category',0,0);
    INSERT INTO propertyValue (id,propertyId,rank) VALUES ('bookshop','category',0);
    INSERT INTO propertyValueI18n (propertyValueId,locale,value,valueGen)
      VALUES ('bookshop','en','Bookshop',0);
    INSERT INTO featureProperty (featureId,propertyId,propertyValueId)
      VALUES ('translated','category','bookshop');
  `)
  const rows = await readUserContributedFeatures(db, { ...params, ids: ['translated'] })
  expect(rows[0].properties?.[0]).toMatchObject({
    property: {
      i18n: { en: { label: 'Category' } },
      values: [{ i18n: { en: { value: 'Bookshop' } } }],
    },
    propertyValue: { i18n: { en: { value: 'Bookshop' } } },
  })
  expect(statements).toHaveLength(1)
})

it('reads 24 photo envelopes in one statement and deduplicates assignments', async () => {
  addFeature('f0')
  addFeature('f1')
  const ids = Array.from({ length: 24 }, (_, i) => `p${i}`)
  for (const id of ids) addPhoto(id, 'f0')
  sqlite.exec(
    `INSERT INTO featureImage (featureId,imageId,isPublished,intent) VALUES ('f1','p0',1,'undefined')`,
  )
  const rows = await readUserContributedImages(db, { ...params, ids })
  expect(rows).toHaveLength(24)
  expect(rows.find(row => row.image.id === 'p0')).toMatchObject({
    ctxType: 'feature',
    ctxId: 'f0',
  })
  expect(Object.keys(rows[0].image)).not.toContain('contributor')
  expect(statements).toHaveLength(1)
  expect(statements[0].parameters).toBeLessThan(100)
})

it('filters foreign contributors, hidden parents and unpublished or archived images in SQL', async () => {
  const ids = [
    'public',
    'draft',
    'unpublished',
    'archived',
    'hidden',
    'outside',
    'foreign',
  ]
  ids.forEach(id => {
    addFeature(id, id === 'foreign' ? 'other' : 'target')
    addPhoto(`p-${id}`, id)
  })
  sqlite.exec(`UPDATE feature SET isDraft=1 WHERE id='draft';
    UPDATE feature SET isPublished=0 WHERE id='unpublished';
    UPDATE feature SET isArchived=1 WHERE id='archived';
    UPDATE feature SET layerId='hidden' WHERE id='hidden';
    UPDATE feature SET organisationId='elsewhere' WHERE id='outside';`)
  addPhoto('unpublished-image', 'public')
  addPhoto('archived-image', 'public')
  addPhoto('foreign-image', 'public', 'other')
  sqlite.exec(`UPDATE featureImage SET isPublished=0 WHERE imageId='unpublished-image';
    UPDATE image SET isArchived=1 WHERE id='archived-image'`)
  expect(
    (await readUserContributedFeatures(db, { ...params, ids })).map(row => row.id),
  ).toEqual(['public'])
  expect(
    (
      await readUserContributedImages(db, {
        ...params,
        ids: [
          ...ids.map(id => `p-${id}`),
          'unpublished-image',
          'archived-image',
          'foreign-image',
        ],
      })
    ).map(row => row.image.id),
  ).toEqual(['p-foreign', 'p-public'])
})

it('allows self reads without directory roles but rejects arbitrary profile enumeration', async () => {
  addFeature('public')
  const self = {
    ...params,
    actor: { ...params.actor, id: 'target' },
    userRoles: [],
    isAdminRequest: false,
    ids: ['public'],
  }
  expect(await readUserContributedFeatures(db, self)).toHaveLength(1)
  statements = []
  for (const read of [readUserContributedFeatures, readUserContributedImages]) {
    await expect(
      read(db, { ...params, userRoles: [], ids: ['public'] }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      read(db, { ...params, ids: Array(25).fill('public') }),
    ).rejects.toMatchObject({ status: 400 })
  }
  expect(statements).toHaveLength(0)
})

it('omits absent and archived contributors', async () => {
  addFeature('archived', 'archived')
  addPhoto('photo', 'archived', 'archived')
  expect(
    await readUserContributedFeatures(db, {
      ...params,
      userId: 'archived',
      ids: ['archived'],
    }),
  ).toEqual([])
  expect(
    await readUserContributedImages(db, {
      ...params,
      userId: 'archived',
      ids: ['photo'],
    }),
  ).toEqual([])
})

it('preserves public historical visibility while allowing the admin surface', async () => {
  addFeature('historical')
  addPhoto('historical-photo', 'historical')
  sqlite.exec("UPDATE feature SET isIntangible=1 WHERE id='historical'")
  const publicParams = { ...params, isAdminRequest: false }
  expect(
    await readUserContributedFeatures(db, { ...publicParams, ids: ['historical'] }),
  ).toEqual([])
  expect(
    await readUserContributedImages(db, { ...publicParams, ids: ['historical-photo'] }),
  ).toEqual([])
  expect(
    await readUserContributedFeatures(db, { ...params, ids: ['historical'] }),
  ).toHaveLength(1)
})

it('checks core hub membership without selecting unrelated parent columns', async () => {
  addFeature('core')
  addPhoto('core-photo', 'core')
  sqlite.exec(`INSERT INTO organisation (id,hubId,isHubExclusive) VALUES ('org',NULL,0);
    INSERT INTO project (id,organisationId) VALUES ('project','org');
    UPDATE layer SET projectId='project' WHERE id='layer';
    ALTER TABLE organisation DROP COLUMN permitUserDetailsEdit;`)
  const core = { ...params, isAdminRequest: false, hub: { isCore: true } }
  expect(
    await readUserContributedFeatures(db, { ...core, ids: ['core'] }),
  ).toHaveLength(1)
  expect(
    await readUserContributedImages(db, { ...core, ids: ['core-photo'] }),
  ).toHaveLength(1)
  expect(statements).toHaveLength(2)
  for (const statement of statements)
    expect(statement.query).not.toContain('permitUserDetailsEdit')
})

it('includes unpublished admin contributions only with live management authority and consistent ancestry', async () => {
  sqlite.exec(`INSERT INTO user (id,isArchived,isAnonymous) VALUES ('viewer',0,0);
    INSERT INTO organisation(id,hubId,isArchived) VALUES ('org','hub',0);
    INSERT INTO project(id,organisationId,isArchived) VALUES ('project','org',0);
    UPDATE layer SET organisationId='org',projectId='project';
    INSERT INTO organisationRole(userId,organisationId,role) VALUES ('viewer','org','owner');`)
  for (const id of ['private', 'hidden-parent', 'draft', 'archived', 'outside'])
    addFeature(id)
  sqlite.exec(`UPDATE feature SET isPublished=0;
    UPDATE feature SET layerId='hidden' WHERE id='hidden-parent';
    UPDATE feature SET isDraft=1 WHERE id='draft';
    UPDATE feature SET isArchived=1 WHERE id='archived';
    UPDATE feature SET organisationId='other' WHERE id='outside';`)
  addPhoto('private-photo', 'private')
  sqlite.exec('UPDATE featureImage SET isPublished=0')
  const ids = ['private', 'hidden-parent', 'draft', 'archived', 'outside']
  expect(
    (await readUserContributedFeatures(db, { ...params, ids }))
      .map(row => row.id)
      .sort(),
  ).toEqual(['hidden-parent', 'private'])
  expect(
    (await readUserContributedImages(db, { ...params, ids: ['private-photo'] })).map(
      row => row.image.id,
    ),
  ).toEqual(['private-photo'])
  expect(
    await readUserContributedFeatures(db, { ...params, ids, isAdminRequest: false }),
  ).toEqual([])
  sqlite.exec("UPDATE organisationRole SET role='member'")
  expect(await readUserContributedFeatures(db, { ...params, ids })).toEqual([])
  expect(
    await readUserContributedImages(db, { ...params, ids: ['private-photo'] }),
  ).toEqual([])
  expect(statements.every(statement => statement.parameters < 100)).toBe(true)
})
