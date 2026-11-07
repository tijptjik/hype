// NODE
import { readFileSync } from 'node:fs'
// DRIZZLE
import { getTableColumns, sql } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
// TESTS
import { describe, expect, it } from 'vitest'
// SERVICES
import { prepareAggregateRevisionWindow } from '#lib/db/services/revisionEditWindow.js'
import { revisionChangeSet } from '#lib/db/schema/featureRevision.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

/** Builds all migration dependencies with strict immutable guards, using a controllable SQL clock. */
function fixture() {
  const { sqlite, db } = publicationSqlite({})
  let now = 1_800_000_000_000
  sqlite.function('strftime', { varargs: true }, (...args: unknown[]) => {
    const date = new Date(now)
    return args[0] === '%s'
      ? String(Math.floor(now / 1000))
      : `${String(date.getUTCSeconds()).padStart(2, '0')}.${String(now % 1000).padStart(3, '0')}`
  })
  sqlite.exec(
    `CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,actorId TEXT,origin TEXT,reason TEXT,createdAt TEXT);`,
  )
  for (const resource of ['organisation', 'project', 'layer', 'hub']) {
    sqlite.exec(`CREATE TABLE ${resource}(id TEXT PRIMARY KEY, name TEXT,isPublished INTEGER);
      CREATE TABLE ${resource}Revision(id TEXT PRIMARY KEY,${resource}Id TEXT,previousRevisionId TEXT,changeSetId TEXT,content TEXT,schemaVersion INTEGER);
      CREATE TABLE ${resource}RevisionHead(${resource}Id TEXT PRIMARY KEY,currentRevisionId TEXT,generation INTEGER);
      CREATE TABLE ${resource}RevisionWrite(${resource}Id TEXT PRIMARY KEY,token TEXT,revisionId TEXT,baselineRevisionId TEXT);
      CREATE TRIGGER ${resource}_revision_immutable_update BEFORE UPDATE ON ${resource}Revision BEGIN SELECT RAISE(ABORT,'immutable'); END;`)
    if (resource !== 'layer')
      sqlite.exec(`CREATE TABLE ${resource}RevisionLogo(revisionId TEXT PRIMARY KEY,imageId TEXT,imageRevisionId TEXT);
      CREATE TRIGGER ${resource}_revision_logo_no_delete BEFORE DELETE ON ${resource}RevisionLogo BEGIN SELECT RAISE(ABORT,'immutable'); END;`)
  }
  sqlite.exec(`CREATE TABLE propertyCatalogRevision(id TEXT PRIMARY KEY,scope TEXT,resourceId TEXT,previousRevisionId TEXT,changeSetId TEXT,content TEXT);
    CREATE TABLE propertyCatalogRevisionHead(scope TEXT,resourceId TEXT,currentRevisionId TEXT,generation INTEGER);
    CREATE TABLE propertyCatalogRevisionWrite(scope TEXT,resourceId TEXT,token TEXT);
    CREATE TRIGGER property_catalog_revision_update BEFORE UPDATE ON propertyCatalogRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;`)
  sqlite.exec(
    'CREATE TABLE feature(id TEXT PRIMARY KEY,isPublished INTEGER,isArchived INTEGER,isDraft INTEGER); CREATE TABLE image(id TEXT PRIMARY KEY);',
  )
  const featureMigration = readFileSync('migrations/0171_feature_revisions.sql', 'utf8')
  sqlite.exec(
    featureMigration.slice(featureMigration.indexOf('CREATE TABLE featureRevision (')),
  )
  sqlite.exec(readFileSync('migrations/0172_image_revisions.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0189_feature_private_capture.sql', 'utf8'))
  sqlite.exec(
    'CREATE TABLE featureRevisionWriteScope(featureId TEXT PRIMARY KEY,token TEXT);',
  )
  sqlite.exec(`CREATE TABLE imageIntentPolicyRevision(id TEXT PRIMARY KEY,scopeType TEXT,scopeId TEXT,actorId TEXT,createdAt TEXT,previous TEXT,current TEXT);
    CREATE TRIGGER image_intent_history_no_update BEFORE UPDATE ON imageIntentPolicyRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;`)
  sqlite.exec(
    'CREATE TABLE featureImageUploadRevision(candidateRevisionId TEXT); CREATE TABLE featureIdentityProposal(plan TEXT);',
  )
  sqlite.exec(readFileSync('migrations/0203_revision_edit_windows.sql', 'utf8'))
  return {
    sqlite,
    db: db as unknown as Database,
    advance: (ms: number) => {
      now += ms
    },
  }
}

/** Executes the same marker/capture/head sequence as the aggregate adapters. */
async function edit(
  f: ReturnType<typeof fixture>,
  resource: 'organisation' | 'project' | 'layer' | 'hub',
  name: string,
  actorId = 'alice',
  published = 0,
) {
  const owner = `${resource}Id`
  const revision = sqliteTable(`${resource}Revision`, {
    id: text('id'),
    [owner]: text(owner),
    previousRevisionId: text('previousRevisionId'),
    changeSetId: text('changeSetId'),
    content: text('content'),
    schemaVersion: integer('schemaVersion'),
  })
  const head = sqliteTable(`${resource}RevisionHead`, {
    [owner]: text(owner),
    currentRevisionId: text('currentRevisionId'),
    generation: integer('generation'),
  })
  const write = sqliteTable(`${resource}RevisionWrite`, {
    [owner]: text(owner),
    token: text('token'),
    revisionId: text('revisionId'),
    baselineRevisionId: text('baselineRevisionId'),
  })
  const id = crypto.randomUUID(),
    change = crypto.randomUUID(),
    token = crypto.randomUUID()
  const current = sql`SELECT json_object('record',json_object('name',name,'isPublished',isPublished)) FROM ${sql.identifier(resource)} WHERE id=w.${sql.identifier(owner)}`
  const changed = sql`NOT EXISTS(SELECT 1 FROM ${head} h JOIN ${revision} r ON r.id=h.currentRevisionId WHERE h.${sql.identifier(owner)}=w.${sql.identifier(owner)} AND r.content=(${current}))`
  const window = await prepareAggregateRevisionWindow(f.db, {
    resource,
    revision,
    head,
    write,
    token,
    actor: { actorId },
    current,
    changed,
  })
  const live = sqliteTable(resource, {
    id: text('id'),
    name: text('name'),
    isPublished: integer('isPublished'),
  })
  await f.db.batch([
    f.db
      .insert(write)
      .values({ [owner]: 'a', token, revisionId: id, baselineRevisionId: 'unused' }),
    f.db
      .insert(live)
      .values({ id: 'a', name, isPublished: published })
      .onConflictDoUpdate({ target: live.id, set: { name, isPublished: published } }),
    ...window.before,
    f.db
      .insert(revisionChangeSet)
      .select(
        sql`SELECT ${change},${actorId},'user',NULL,'now' WHERE EXISTS(SELECT 1 FROM ${write} w WHERE w.token=${token} AND ${changed})`,
      ),
    f.db
      .insert(revision)
      .select(
        sql`SELECT w.revisionId,w.${sql.identifier(owner)},h.currentRevisionId,${change},(${current}),1 FROM ${write} w LEFT JOIN ${head} h ON h.${sql.identifier(owner)}=w.${sql.identifier(owner)} WHERE w.token=${token} AND ${changed}`,
      ),
    f.db
      .insert(head)
      .select(
        sql`SELECT w.${sql.identifier(owner)},w.revisionId,0 FROM ${write} w JOIN ${revision} r ON r.id=w.revisionId WHERE w.token=${token}`,
      )
      .onConflictDoUpdate({
        target: getTableColumns(head)[owner],
        set: {
          currentRevisionId: sql`excluded.currentRevisionId`,
          generation: sql`${head}.generation+1`,
        },
      }),
    ...window.after,
    f.db.delete(write).where(sql`${write}.token=${token}`),
  ])
  return f.sqlite
    .prepare(`SELECT currentRevisionId id,generation FROM ${resource}RevisionHead`)
    .get()!
}

for (const resource of ['organisation', 'project', 'layer', 'hub'] as const)
  describe(`${resource} idle revisions`, () => {
    it('slides from the last edit, preserves identity and attribution, and closes at exactly five idle minutes', async () => {
      const f = fixture()
      try {
        const first = await edit(f, resource, 'one')
        f.advance(299_999)
        expect((await edit(f, resource, 'two')).id).toBe(first.id)
        f.advance(299_999)
        const third = await edit(f, resource, 'three')
        expect(third.id).toBe(first.id)
        expect(third.generation).toBe(2)
        expect(
          f.sqlite.prepare(`SELECT count(*) n FROM ${resource}Revision`).get()?.n,
        ).toBe(1)
        expect(
          f.sqlite.prepare('SELECT count(*) n FROM revisionChangeSet').get()?.n,
        ).toBe(1)
        f.advance(300_000)
        expect((await edit(f, resource, 'four')).id).not.toBe(first.id)
        expect(
          JSON.parse(
            String(
              f.sqlite
                .prepare(`SELECT content FROM ${resource}Revision WHERE id=?`)
                .get(first.id)?.content,
            ),
          ).record.name,
        ).toBe('three')
      } finally {
        f.sqlite.close()
      }
    })
    it('does not extend a window on no-op, splits on actor changes and seals publication changes', async () => {
      const f = fixture()
      try {
        const first = await edit(f, resource, 'one')
        f.advance(299_000)
        expect(await edit(f, resource, 'one')).toEqual(first)
        f.advance(1_000)
        const next = await edit(f, resource, 'two')
        expect(next.id).not.toBe(first.id)
        const bob = await edit(f, resource, 'three', 'bob')
        expect(bob.id).not.toBe(next.id)
        const published = await edit(f, resource, 'four', 'bob', 1)
        expect(published.id).not.toBe(bob.id)
        expect((await edit(f, resource, 'five', 'bob', 1)).id).not.toBe(published.id)
      } finally {
        f.sqlite.close()
      }
    })
    it('rejects direct snapshot changes outside the capture transaction', async () => {
      const f = fixture()
      try {
        await edit(f, resource, 'one')
        expect(() =>
          f.sqlite.exec(`UPDATE ${resource}Revision SET content='{}'`),
        ).toThrow(/immutable/)
        expect(
          f.sqlite.prepare(`SELECT count(*) n FROM ${resource}RevisionWrite`).get()?.n,
        ).toBe(0)
      } finally {
        f.sqlite.close()
      }
    })
  })

// FEATURE FIXTURES
import { prepareFeatureIdleRevision } from '#lib/db/services/featureRevisionIdleWindow.js'
import {
  prepareRevisionCheck,
  executeRevisionBatch,
} from '#lib/db/services/revisionBatch.js'
import {
  featureRevisionHead,
  featureRevisionPublication,
} from '#lib/db/schema/featureRevision.js'
import { featureRevisionWriteScope } from '#lib/db/schema/featureRevisionWriteScope.js'
import { featureRevisionContentFixture } from './fixtures/featureRevisionContent.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

/** Seeds frozen baseline evidence and a current accepted head. */
function featureFixture() {
  const f = fixture(),
    content = featureRevisionContentFixture()
  content.gallery = { entries: {}, order: [] }
  f.sqlite.exec(
    "INSERT INTO feature VALUES('f',1,0,0); INSERT INTO revisionChangeSet VALUES('baseline-change','migration','migration',NULL,'then');",
  )
  f.sqlite
    .prepare(
      'INSERT INTO featureRevision(id,featureId,changeSetId,content) VALUES(?,?,?,?)',
    )
    .run('base', 'f', 'baseline-change', JSON.stringify(content))
  f.sqlite.exec(
    "INSERT INTO featureRevisionHead(featureId,publishedRevisionId) VALUES('f','base'); INSERT INTO featureRevisionPublication(id,featureId,revisionId,generation,changeSetId) VALUES('base-publication','f','base',0,'baseline-change');",
  )
  return f
}

/** Prepares a guarded accepted edit so races can be tested before either batch executes. */
async function featureEdit(
  f: ReturnType<typeof fixture>,
  caption: string,
  actorId = 'alice',
  boundary = false,
) {
  const head = f.sqlite
    .prepare(
      'SELECT publishedRevisionId id,generation FROM featureRevisionHead WHERE featureId=?',
    )
    .get('f') as { id: string; generation: number }
  const previous = JSON.parse(
    String(
      f.sqlite.prepare('SELECT content FROM featureRevision WHERE id=?').get(head.id)
        ?.content,
    ),
  ) as FeatureRevisionContent
  const content = structuredClone(previous)
  content.translations.en.title.value = caption
  const guard = sql`EXISTS(SELECT 1 FROM featureRevisionHead WHERE featureId='f' AND publishedRevisionId=${head.id} AND generation=${head.generation})`
  const prepared = await prepareFeatureIdleRevision(f.db, {
    featureId: 'f',
    actorId,
    guard,
    previousRevisionId: head.id,
    previous,
    content,
    boundary,
  })
  const statements = [
    f.db
      .insert(featureRevisionWriteScope)
      .values({ featureId: 'f', token: crypto.randomUUID() }),
    ...prepared.write,
    ...(!prepared.noop
      ? [
          f.db
            .update(featureRevisionHead)
            .set({
              publishedRevisionId: prepared.revisionId,
              generation: head.generation + 1,
            })
            .where(sql`featureId='f'`),
          ...(prepared.reuse
            ? [
                f.db
                  .update(featureRevisionPublication)
                  .set({ generation: head.generation + 1 })
                  .where(sql`featureId='f' AND generation=${head.generation}`),
              ]
            : [
                f.db.insert(featureRevisionPublication).values({
                  id: crypto.randomUUID(),
                  featureId: 'f',
                  previousRevisionId: head.id,
                  revisionId: prepared.revisionId,
                  generation: head.generation + 1,
                  changeSetId: prepared.changeSetId!,
                }),
              ]),
        ]
      : []),
    ...prepared.finish,
    f.db.delete(featureRevisionWriteScope).where(sql`featureId='f'`),
  ]
  return { ...prepared, run: () => executeRevisionBatch(f.db, guard, statements) }
}

describe('Feature idle revisions', () => {
  it('coalesces snapshots and publication receipts while rejecting an overlapping stale save', async () => {
    const f = featureFixture()
    try {
      const first = await featureEdit(f, 'first')
      await first.run()
      const second = await featureEdit(f, 'second'),
        race = await featureEdit(f, 'stale')
      expect(second.reuse).toBe(true)
      expect(second.revisionId).toBe(first.revisionId)
      await second.run()
      expect(await race.run()).toBeNull()
      expect(f.sqlite.prepare('SELECT count(*) n FROM featureRevision').get()?.n).toBe(
        2,
      )
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureRevisionPublication').get()?.n,
      ).toBe(2)
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM revisionChangeSet').get()?.n,
      ).toBe(2)
      const noop = await featureEdit(f, 'second')
      expect(noop.noop).toBe(true)
      await noop.run()
      expect(
        f.sqlite.prepare('SELECT generation FROM featureRevisionHead').get()
          ?.generation,
      ).toBe(2)
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM revisionEditSelection').get()?.n,
      ).toBe(0)
      expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      f.sqlite.close()
    }
  })
  it('rejects a prepared edit that expires before execution and keeps the original snapshot', async () => {
    const f = featureFixture()
    try {
      const first = await featureEdit(f, 'first')
      await first.run()
      const expired = await featureEdit(f, 'expired')
      f.advance(300_000)
      expect(await expired.run()).toBeNull()
      const next = await featureEdit(f, 'next')
      expect(next.reuse).toBe(false)
      await next.run()
      expect(next.revisionId).not.toBe(first.revisionId)
      expect(
        f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()?.n,
      ).toBe(0)
    } finally {
      f.sqlite.close()
    }
  })
  it('closes at explicit boundaries, actor changes and proposal-base pinning', async () => {
    const f = featureFixture()
    try {
      const first = await featureEdit(f, 'first')
      await first.run()
      const bob = await featureEdit(f, 'second', 'bob')
      expect(bob.reuse).toBe(false)
      await bob.run()
      const publication = await featureEdit(f, 'published', 'bob', true)
      expect(publication.reuse).toBe(false)
      await publication.run()
      const after = await featureEdit(f, 'after', 'bob')
      expect(after.reuse).toBe(false)
      await after.run()
      f.sqlite
        .prepare(
          'INSERT INTO featureRevisionProposal(id,featureId,baseRevisionId,candidateRevisionId,contributorId,status,createdChangeSetId) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          'proposal',
          'f',
          after.revisionId,
          'base',
          'alice',
          'draft',
          'baseline-change',
        )
      const pinned = await featureEdit(f, 'pinned', 'bob')
      expect(pinned.reuse).toBe(false)
      await pinned.run()
    } finally {
      f.sqlite.close()
    }
  })
})

// CATALOGUE FIXTURES
import { getTableName } from 'drizzle-orm'
import {
  property,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '#lib/db/schema/property.js'
import { preparePropertyCatalogCapture } from '#lib/db/services/propertyCatalogRevision.js'

it('coalesces field-definition captures and keeps no-ops, generations and authors separate', async () => {
  const f = fixture()
  try {
    for (const table of [property, propertyI18n, propertyValue, propertyValueI18n])
      f.sqlite.exec(
        `CREATE TABLE "${getTableName(table)}" (${Object.values(getTableColumns(table))
          .map(column => `"${column.name}" ${column.getSQLType()}`)
          .join(',')})`,
      )
    f.sqlite.exec(`CREATE UNIQUE INDEX catalog_head ON propertyCatalogRevisionHead(scope,resourceId);
      CREATE UNIQUE INDEX catalog_write ON propertyCatalogRevisionWrite(scope,resourceId);
      INSERT INTO property(id,scope,organisationId,key) VALUES('field','organisation','org','original');`)
    const save = async (key: string, actorId = 'alice') => {
      const capture = await preparePropertyCatalogCapture(
        f.db,
        { scope: 'organisation', id: 'org' },
        { actorId },
      )
      await f.db.batch([
        prepareRevisionCheck(f.db, sql`1`),
        ...capture.before,
        f.db.update(property).set({ key }).where(sql`id='field'`),
        ...capture.after,
      ])
      return f.sqlite
        .prepare(
          'SELECT currentRevisionId id,generation FROM propertyCatalogRevisionHead',
        )
        .get()!
    }
    const first = await save('first')
    f.advance(200_000)
    const next = await save('second')
    expect(next.id).toBe(first.id)
    expect(next.generation).toBe(2)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM propertyCatalogRevision').get()?.n,
    ).toBe(2)
    expect(await save('second')).toEqual(next)
    f.advance(300_000)
    expect((await save('third')).id).not.toBe(first.id)
    expect((await save('fourth', 'bob')).id).not.toBe(first.id)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM revisionEditSelection').get()?.n,
    ).toBe(0)
  } finally {
    f.sqlite.close()
  }
})

it('keeps a revision family append-only until its matching write guards are installed', async () => {
  const f = fixture()
  try {
    const first = await edit(f, 'organisation', 'first')
    f.sqlite.exec(
      "DROP TRIGGER organisation_revision_immutable_update; CREATE TRIGGER organisation_revision_immutable_update BEFORE UPDATE ON organisationRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;",
    )
    const second = await edit(f, 'organisation', 'second')
    expect(second.id).not.toBe(first.id)
  } finally {
    f.sqlite.close()
  }
})
