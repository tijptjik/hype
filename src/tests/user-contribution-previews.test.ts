// @vitest-environment node
// TESTS
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// DRIZZLE
import { getTableColumns } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
// DB AND SERVICES
import * as schema from '#lib/db/schema/index.js'
import { readUserContributionPreviews } from '#lib/api/services/userContributionPreviews.js'
// TYPES
import type { Database, SessionUser, UserRoleDisco } from '#lib/types.js'

let sqlite: DatabaseSync
let db: Database
let statements: string[]
const params = {
  userId: 'target',
  actor: { id: 'viewer', isAnonymous: false, superAdmin: false } as SessionUser,
  userRoles: [
    { type: 'organisation', role: 'owner', organisationId: 'org', userId: 'viewer' },
  ] as UserRoleDisco[],
  locale: 'zh-Hant',
  hub: { isCore: false, organisations: [{ id: 'org' }] } as never,
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  statements = []
  for (const name of [
    'user',
    'feature',
    'featureI18n',
    'image',
    'featureImage',
    'layer',
  ] as const) {
    const columns = Object.values(getTableColumns(schema[name]))
    sqlite.exec(
      `CREATE TABLE "${name}" (${columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(',')})`,
    )
  }
  sqlite.exec(`
    INSERT INTO user (id,isArchived) VALUES ('target',0),('archived',1);
    INSERT INTO layer (id,isPublished,isArchived) VALUES ('layer',1,0),('hidden-layer',0,0);
  `)
  db = drizzle(async (query, values) => {
    statements.push(query)
    const statement = sqlite.prepare(query)
    statement.setReturnArrays(true)
    return { rows: statement.all(...values) as unknown as unknown[][] }
  }) as unknown as Database
})
afterEach(() => sqlite.close())

function addFeature(id: string, createdAt = '2026-01-01', owner = 'target'): void {
  sqlite
    .prepare(`INSERT INTO feature
    (id,createdAt,contributorId,organisationId,projectId,layerId,isPublished,isArchived,isDraft)
    VALUES (?,?,?,'org','project','layer',1,0,0)`)
    .run(id, createdAt, owner)
}

function addPhoto(
  id: string,
  featureId: string,
  createdAt = '2026-02-01',
  owner = 'target',
): void {
  sqlite
    .prepare(`INSERT INTO image
    (id,createdAt,contributorId,isArchived,cdn,env,publicId,version)
    VALUES (?,?,?,0,'cloudflareR2','local',?,1)`)
    .run(id, createdAt, owner, `images/${id}`)
  sqlite
    .prepare(`INSERT INTO featureImage (featureId,imageId,isPublished,intent)
    VALUES (?,?,1,'undefined')`)
    .run(featureId, id)
}

describe('profile contribution previews', () => {
  it('returns seven recent contributions in one query, with minimal translated display data', async () => {
    for (let i = 0; i < 10; i++)
      addFeature(`f${i}`, `2026-01-${String(i + 1).padStart(2, '0')}`)
    addPhoto('photo', 'f9')
    // Multiple published assignments must not consume extra slots.
    sqlite.exec(`INSERT INTO featureImage VALUES ('f8','photo','undefined',1,NULL,NULL,NULL);
      INSERT INTO featureI18n (featureId,locale,title) VALUES
        ('f8','en','English title'),('f8','zh-Hant','中文標題'),('f9','en','Fallback title');`)
    const result = await readUserContributionPreviews(db, params)
    expect(statements).toHaveLength(1)
    expect(result).toHaveLength(7)
    expect(result.map(row => row.id)).toEqual([
      'photo',
      'f9',
      'f8',
      'f7',
      'f6',
      'f5',
      'f4',
    ])
    expect(result[0]).toEqual({
      id: 'photo',
      kind: 'photo',
      featureId: 'f8',
      imageId: 'photo',
      title: '中文標題',
      image: {
        id: 'photo',
        cdn: 'cloudflareR2',
        env: 'local',
        publicId: 'images/photo',
        version: 1,
      },
    })
    expect(result[1].title).toBe('Fallback title')
    expect(result[3].image).toBeNull()
  })

  it('filters inaccessible candidates before the limit, including photos on hidden parents', async () => {
    addFeature('visible')
    for (const id of [
      'draft',
      'unpublished',
      'archived-feature',
      'hidden-layer',
      'other-hub',
    ]) {
      addFeature(id, '2026-12-01')
      addPhoto(`photo-${id}`, id, '2026-12-02')
    }
    sqlite.exec(`UPDATE feature SET isDraft=1 WHERE id='draft';
      UPDATE feature SET isPublished=0 WHERE id='unpublished';
      UPDATE feature SET isArchived=1 WHERE id='archived-feature';
      UPDATE feature SET layerId='hidden-layer' WHERE id='hidden-layer';
      UPDATE feature SET organisationId='other-org' WHERE id='other-hub';`)
    addPhoto('archived-photo', 'visible')
    addPhoto('unpublished-photo', 'visible')
    addPhoto('visible-photo', 'visible')
    sqlite.exec(`UPDATE image SET isArchived=1 WHERE id='archived-photo';
      UPDATE featureImage SET isPublished=0 WHERE imageId='unpublished-photo';`)
    expect((await readUserContributionPreviews(db, params)).map(row => row.id)).toEqual(
      ['visible-photo', 'visible'],
    )
  })

  it('chooses a published canonical thumbnail, never an archived or unpublished one', async () => {
    addFeature('visible')
    for (const id of ['fallback', 'canonical', 'archived', 'unpublished'])
      addPhoto(id, 'visible', '2026-02-01', 'other')
    sqlite.exec(`UPDATE featureImage SET intent='canonical' WHERE imageId='canonical';
      UPDATE image SET isArchived=1 WHERE id='archived';
      UPDATE featureImage SET isPublished=0 WHERE imageId='unpublished';`)
    const result = await readUserContributionPreviews(db, params)
    expect(result).toHaveLength(1)
    expect(result[0].image?.id).toBe('canonical')
  })

  it('rejects unprivileged viewers before querying and omits absent or archived contributors', async () => {
    await expect(
      readUserContributionPreviews(db, { ...params, userRoles: [] }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      readUserContributionPreviews(db, {
        ...params,
        actor: { ...params.actor, isAnonymous: true },
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(statements).toHaveLength(0)
    addFeature('archived-owner-feature', '2026-01-01', 'archived')
    expect(
      await readUserContributionPreviews(db, { ...params, userId: 'archived' }),
    ).toEqual([])
    expect(
      await readUserContributionPreviews(db, { ...params, userId: 'absent' }),
    ).toEqual([])
  })
})
