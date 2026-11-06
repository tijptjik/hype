// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
import { featureRevisionContentFixture } from './fixtures/featureRevisionContent'
// DRIZZLE
import { sql } from 'drizzle-orm'
// SERVICES
import {
  listResourceChangelog,
  buildChangelogRootGuard,
} from '#lib/db/services/resourceChangelog.js'
// PRESENTATION
import { historyOperation } from '#lib/bits/patterns/revisionHistory/presentation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { ChangelogScope } from '#lib/db/services/resourceChangelog.js'

let fixture: ReturnType<typeof publicationSqlite>
let db: Database
const scopes: Record<string, ChangelogScope> = {
  organisation: { resource: 'organisation', id: 'o', organisationId: 'o', hubId: 'h' },
  project: {
    resource: 'project',
    id: 'p',
    projectId: 'p',
    organisationId: 'o',
    hubId: 'h',
  },
  layer: {
    resource: 'layer',
    id: 'l',
    projectId: 'p',
    organisationId: 'o',
    hubId: 'h',
  },
}
beforeEach(() => {
  fixture = publicationSqlite({})
  db = fixture.db as unknown as Database
  fixture.sqlite.exec(`
    CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT,isArchived INTEGER);
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT,isArchived INTEGER);
    CREATE TABLE layer(id TEXT PRIMARY KEY,organisationId TEXT,projectId TEXT,isArchived INTEGER);
    CREATE TABLE feature(id TEXT PRIMARY KEY,organisationId TEXT,projectId TEXT,layerId TEXT,isArchived INTEGER);
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,displayUsername TEXT,username TEXT);
    CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,createdAt TEXT,actorId TEXT,origin TEXT,reason TEXT);
    CREATE TABLE featureRevision(id TEXT PRIMARY KEY,featureId TEXT,previousRevisionId TEXT,changeSetId TEXT,content TEXT);
    CREATE TABLE featureRevisionPublication(id TEXT PRIMARY KEY,featureId TEXT,previousRevisionId TEXT,revisionId TEXT,generation INTEGER,changeSetId TEXT);
    CREATE TABLE featureRevisionHead(featureId TEXT PRIMARY KEY,publishedRevisionId TEXT,generation INTEGER);
    CREATE TABLE featurePrivateCapture(featureId TEXT,revisionId TEXT,generation INTEGER);
    CREATE TABLE propertyCatalogRevision(id TEXT PRIMARY KEY,scope TEXT,resourceId TEXT,previousRevisionId TEXT,content TEXT,changeSetId TEXT);
    INSERT INTO organisation VALUES('o','h',0),('outside','h',0);
    INSERT INTO project VALUES('p','o',0),('sibling','o',0),('outside','outside',0);
    INSERT INTO layer VALUES('l','o','p',0),('sibling','o','sibling',0),('outside','outside','outside',0);
    INSERT INTO feature VALUES('f','o','p','l',0),('outside','outside','outside','outside',0);
    INSERT INTO user VALUES('editor','Editor',NULL,NULL);
  `)
  for (const resource of ['organisation', 'project', 'layer', 'feature']) {
    fixture.sqlite.exec(
      `CREATE TABLE ${resource}I18n(${resource}Id TEXT,locale TEXT,${resource === 'feature' ? 'title' : 'name'} TEXT)`,
    )
    const id =
      resource === 'organisation'
        ? 'o'
        : resource === 'project'
          ? 'p'
          : resource === 'layer'
            ? 'l'
            : 'f'
    fixture.sqlite
      .prepare(`INSERT INTO ${resource}I18n VALUES(?,?,?),(?,?,?)`)
      .run(id, 'en', `${resource} name`, id, 'zh-hant', `${resource} 中文名稱`)
    if (resource !== 'feature')
      fixture.sqlite.exec(
        `CREATE TABLE ${resource}Revision(id TEXT PRIMARY KEY,${resource}Id TEXT,previousRevisionId TEXT,content TEXT,changeSetId TEXT)`,
      )
  }
})
afterEach(() => fixture.sqlite.close())

/** Insert an attributed accepted profile revision in the isolated database.
 * @param resource Revision owner type.
 * @param owner Persisted identity.
 * @param id Revision and change-set identifier.
 * @param previous Optional predecessor.
 * @returns Nothing.
 */
function profile(
  resource: string,
  owner: string,
  id: string,
  previous: string | null = null,
): void {
  changeSet(id)
  fixture.sqlite
    .prepare(`INSERT INTO ${resource}Revision VALUES(?,?,?,?,?)`)
    .run(id, owner, previous, JSON.stringify({ i18n: { en: { name: id } } }), id)
}
/** Insert a shared-timestamp attribution receipt.
 * @param id Unique change-set identity.
 * @returns Nothing.
 */
function changeSet(id: string): void {
  fixture.sqlite
    .prepare('INSERT INTO revisionChangeSet VALUES(?,?,?,?,?)')
    .run(id, '2026-11-06T12:00:00.000Z', 'editor', 'user', null)
}
/** Read a page through the production D1 adapter with configurable scope and access.
 * @param scope Selected root.
 * @param rest Reader overrides.
 * @returns Bounded feed.
 */
function read(
  scope = scopes.organisation,
  rest: Partial<Parameters<typeof listResourceChangelog>[1]> = {},
): ReturnType<typeof listResourceChangelog> {
  return listResourceChangelog(db, {
    scope,
    locales: ['zhHant', 'en'],
    authorize: () => true,
    internalIds: new Set(),
    allowedInternalIds: new Set(),
    ...rest,
  })
}

describe('hierarchy changelog', () => {
  it('links the initial Feature reviewer while preserving the migration operation actor', async () => {
    fixture.sqlite.exec(`ALTER TABLE feature ADD COLUMN contributorId TEXT;
      CREATE TABLE task(id TEXT,featureId TEXT,type TEXT,contributorId TEXT,reviewerId TEXT,isReviewed INTEGER,reviewOutcome TEXT,reviewAction TEXT);
      INSERT INTO task VALUES('task','f','newFeature','contributor','editor',1,'accepted','added-feature');
      UPDATE user SET username='editor' WHERE id='editor';
      INSERT INTO revisionChangeSet VALUES('baseline','2026-11-06T00:00:00.000Z','system:enrollment','migration',NULL);
      INSERT INTO featureRevisionHead VALUES('f',NULL,0);
      INSERT INTO featureRevisionPublication VALUES('initial','f',NULL,NULL,0,'baseline');`)
    fixture.sqlite.exec(
      readFileSync('migrations/0194_feature_baseline_attribution.sql', 'utf8'),
    )
    expect((await read()).entries[0]).toMatchObject({
      actorId: 'system:enrollment',
      origin: 'migration',
      baseline: true,
      baselineActor: { actorId: 'editor', actorUsername: 'editor', role: 'reviewer' },
    })
    expect(
      (await read(scopes.organisation, { authorize: () => false })).entries,
    ).toEqual([])
  })

  it('resolves current user handles without linking system actors or missing profiles', async () => {
    profile('layer', 'l', 'edit')
    fixture.sqlite.exec(
      "UPDATE user SET username='example.editor',displayUsername='Example.Editor' WHERE id='editor'",
    )
    expect((await read(scopes.layer)).entries[0]).toMatchObject({
      actorId: 'editor',
      actorUsername: 'example.editor',
      actorDisplayUsername: 'Example.Editor',
      actorName: 'Editor',
    })
    fixture.sqlite.exec("UPDATE revisionChangeSet SET origin='system' WHERE id='edit'")
    expect((await read(scopes.layer)).entries[0]).toMatchObject({
      actorId: 'editor',
      actorUsername: null,
      actorDisplayUsername: null,
      actorName: null,
    })
    fixture.sqlite.exec(
      "UPDATE revisionChangeSet SET origin='user' WHERE id='edit'; DELETE FROM user WHERE id='editor'",
    )
    expect((await read(scopes.layer)).entries[0]).toMatchObject({
      actorId: 'editor',
      actorUsername: null,
      actorName: null,
    })
  })

  it('filters the full history before pagination by resource, category, source, actor, dates and literal search', async () => {
    for (let index = 0; index < 30; index++) profile('layer', 'l', `new-${index}`)
    profile('project', 'p', 'match')
    fixture.sqlite.exec(
      "UPDATE revisionChangeSet SET createdAt='2026-10-01T23:59:59.999Z',reason='100%_review' WHERE id='match'",
    )
    const filters = {
      resourceType: 'project' as const,
      category: 'profile' as const,
      origin: 'user' as const,
      actor: { id: 'editor', origin: 'user' },
      from: '2026-10-01',
      to: '2026-10-01',
      search: '%_review',
    }
    const page = await read(scopes.organisation, { filters })
    expect(page.entries.map(entry => entry.key)).toEqual(['project:profile:match'])
    expect(page.nextCursor).toBeNull()
    expect(
      (
        await read(scopes.organisation, {
          filters: { ...filters, actor: { id: 'editor', origin: 'system' } },
        })
      ).entries,
    ).toEqual([])
    expect(
      (await read(scopes.organisation, { filters: { ...filters, to: '2026-09-30' } }))
        .entries,
    ).toEqual([])
    expect(
      (await read(scopes.organisation, { filters: { search: '%not-a-wildcard' } }))
        .entries,
    ).toEqual([])
  })

  it('keeps unfiltered actor options and date bounds scoped to authorized owners', async () => {
    profile('layer', 'l', 'visible')
    profile('project', 'p', 'hidden')
    profile('layer', 'outside', 'outside')
    fixture.sqlite.exec(
      "UPDATE revisionChangeSet SET actorId='hidden-person',createdAt='2020-01-01T00:00:00.000Z' WHERE id IN ('hidden','outside')",
    )
    const page = await read(scopes.organisation, {
      filters: { search: 'no matches' },
      includeFilterOptions: true,
      authorize: row => row.ownerType !== 'project',
    })
    expect(page.entries).toEqual([])
    expect(page.filterOptions).toEqual({
      actors: [
        {
          id: 'editor',
          origin: 'user',
          label: 'Editor',
          name: 'Editor',
          username: null,
          displayUsername: null,
        },
      ],
      period: { from: '2026-11-06T12:00:00.000Z', to: '2026-11-06T12:00:00.000Z' },
    })
    expect(
      (
        await read(scopes.organisation, {
          includeFilterOptions: true,
          authorize: () => false,
        })
      ).filterOptions,
    ).toEqual({ actors: [], period: null })
  })

  it('advances sparse action-filtered pages and finds older matching changes', async () => {
    profile('layer', 'l', 'a-base')
    profile('layer', 'l', 'b-update', 'a-base')
    for (let index = 0; index < 28; index++) profile('layer', 'l', `z-${index}`)
    const first = await read(scopes.layer, { filters: { action: 'updated' } })
    expect(first.entries).toEqual([])
    expect(first.nextCursor).not.toBeNull()
    const second = await read(scopes.layer, {
      before: first.nextCursor!,
      filters: { action: 'updated' },
    })
    expect(second.entries.map(entry => entry.key)).toEqual(['layer:profile:b-update'])
    expect(second.nextCursor).toBeNull()
  })

  it('rolls up only the selected hierarchy with localized names and attributed differences', async () => {
    profile('organisation', 'o', 'org')
    profile('project', 'p', 'project')
    profile('project', 'sibling', 'sibling-project')
    profile('layer', 'l', 'old')
    profile('layer', 'l', 'new', 'old')
    profile('layer', 'outside', 'outside')
    const org = await read()
    expect(org.entries).toHaveLength(5)
    expect(org.entries.every(entry => entry.actorName === 'Editor')).toBe(true)
    expect(org.entries.find(entry => entry.key === 'layer:profile:new')).toMatchObject({
      name: 'layer 中文名稱',
      changes: [
        {
          path: ['i18n', 'en', 'name'],
          before: { present: true, value: 'old' },
          after: { present: true, value: 'new' },
        },
      ],
    })
    expect((await read(scopes.project)).entries).toHaveLength(3)
    expect((await read(scopes.layer)).entries).toHaveLength(2)
  })

  it('pages across timestamp ties without duplicates or gaps and keeps baselines distinct', async () => {
    for (let i = 0; i < 57; i++) profile('layer', 'l', `r${String(i).padStart(3, '0')}`)
    fixture.sqlite.exec(
      "UPDATE revisionChangeSet SET origin='migration' WHERE id='r056'",
    )
    const first = await read(scopes.layer)
    const second = await read(scopes.layer, { before: first.nextCursor! })
    const third = await read(scopes.layer, { before: second.nextCursor! })
    const entries = [...first.entries, ...second.entries, ...third.entries]
    expect(entries).toHaveLength(57)
    expect(new Set(entries.map(row => row.key)).size).toBe(57)
    expect(first.entries[0].baseline).toBe(true)
    expect(third.nextCursor).toBeNull()
  })

  it('checks each child before projection, and advances the cursor past an unauthorized page', async () => {
    for (let i = 0; i < 27; i++) profile('layer', 'l', `r${i}`)
    const first = await read(scopes.layer, { authorize: () => false })
    expect(first.entries).toEqual([])
    expect(first.nextCursor).not.toBeNull()
    expect(
      (await read(scopes.layer, { before: first.nextCursor! })).entries,
    ).toHaveLength(2)
  })

  it('merges bounded D1 source pages in one global order across continuation boundaries', async () => {
    for (let i = 0; i < 20; i++) {
      profile('organisation', 'o', `o${i}`)
      profile('project', 'p', `p${i}`)
      profile('layer', 'l', `l${i}`)
    }
    const first = await read()
    const second = await read(scopes.organisation, { before: first.nextCursor! })
    const third = await read(scopes.organisation, { before: second.nextCursor! })
    const keys = [...first.entries, ...second.entries, ...third.entries].map(
      entry => entry.key,
    )
    expect(keys).toHaveLength(60)
    expect(new Set(keys).size).toBe(60)
    expect(keys).toEqual([...keys].sort().reverse())
    expect(third.nextCursor).toBeNull()
  })

  it('fails closed after root moves or inconsistent denormalized ancestry', async () => {
    profile('layer', 'l', 'edit')
    fixture.sqlite.exec("UPDATE organisation SET hubId='moved' WHERE id='o'")
    expect((await read(scopes.layer)).entries).toEqual([])
    fixture.sqlite.exec(
      "UPDATE organisation SET hubId='h' WHERE id='o'; UPDATE layer SET organisationId='outside' WHERE id='l'",
    )
    expect((await read(scopes.layer)).entries).toEqual([])
  })

  it('includes owned catalogues and handles absent revision sources without inventing history', async () => {
    changeSet('catalog')
    fixture.sqlite.exec(
      `INSERT INTO propertyCatalogRevision VALUES('catalog','project','p',NULL,'{"field":{"record":{"key":"field"},"i18n":{"en":{"label":"Field"}}}}','catalog'); DROP TABLE layerRevision`,
    )
    const project = await read(scopes.project)
    expect(project.entries).toHaveLength(1)
    expect(project.entries[0].category).toBe('fields')
    expect(project.entries[0]).toMatchObject({
      resourceType: 'property',
      name: 'Field',
      propertyKey: 'field',
      resourceId: 'field',
    })
    expect(project.unavailable).toContain('layer profile')
    expect((await read(scopes.layer)).entries).toEqual([])
  })

  it('presents changed catalogue fields with localized names, retaining removals and literal IDs', async () => {
    const field = (label: string, key: string) => ({
      record: { key },
      i18n: { 'zh-hant': { label } },
    })
    const before = {
      'literal.id': field('舊名稱', 'oldKey'),
      removed: field('已移除', 'removedKey'),
      unchanged: field('不變', 'unchangedKey'),
    }
    const after = {
      'literal.id': field('新名稱', 'renamedKey'),
      added: field('新欄位', 'preferredContactMethod'),
      unchanged: field('不變', 'unchangedKey'),
    }
    for (const [id, parent, content] of [
      ['catalog1', null, before],
      ['catalog2', 'catalog1', after],
    ] as const) {
      changeSet(id)
      fixture.sqlite
        .prepare('INSERT INTO propertyCatalogRevision VALUES(?,?,?,?,?,?)')
        .run(id, 'project', 'p', parent, JSON.stringify(content), id)
    }
    const page = await read(scopes.project)
    const changes = page.entries.filter(entry => entry.key.includes('catalog2'))
    expect(changes).toHaveLength(3)
    expect(changes.find(entry => entry.resourceId === 'literal.id')).toMatchObject({
      name: '新名稱',
      propertyKey: 'renamedKey',
      changes: [
        { path: ['literal.id', 'i18n', 'zh-hant', 'label'] },
        { path: ['literal.id', 'record', 'key'] },
      ],
    })
    expect(changes.find(entry => entry.resourceId === 'removed')).toMatchObject({
      name: '已移除',
      propertyKey: 'removedKey',
      changes: [{ path: ['removed'], after: { present: false } }],
    })
    expect(changes.find(entry => entry.resourceId === 'added')).toMatchObject({
      name: '新欄位',
      propertyKey: 'preferredContactMethod',
      changes: [{ path: ['added'], before: { present: false } }],
    })
  })

  it('includes publication and approved maintenance, excludes drafts/tasks, and redacts historical internal values', async () => {
    const before = featureRevisionContentFixture(),
      after = structuredClone(before)
    after.translations.en.title.value = 'Accepted name'
    after.properties.private.translations.en.value = 'private changed value'
    for (const [id, content] of [
      ['base', before],
      ['accepted', after],
      ['draft', after],
    ] as const) {
      changeSet(id)
      fixture.sqlite
        .prepare('INSERT INTO featureRevision VALUES(?,?,?,?,?)')
        .run(id, 'f', id === 'base' ? null : 'base', id, JSON.stringify(content))
    }
    fixture.sqlite.exec(`INSERT INTO featureRevisionPublication VALUES('published','f','base','accepted',1,'accepted');
      INSERT INTO featureRevisionHead VALUES('f','accepted',1);
      INSERT INTO featurePrivateCapture VALUES('f','accepted',1);
      CREATE TABLE task(id TEXT); INSERT INTO task VALUES('not-a-change')`)
    const page = await read(scopes.layer)
    expect(page.entries).toHaveLength(2)
    expect(page.entries.map(entry => entry.category).sort()).toEqual([
      'maintenance',
      'publication',
    ])
    expect(page.entries.every(entry => entry.redacted)).toBe(true)
    expect(JSON.stringify(page)).not.toContain('private changed value')
    expect(JSON.stringify(page)).not.toContain('draft')
    const allowed = await read(scopes.layer, {
      allowedInternalIds: new Set(['private']),
    })
    expect(JSON.stringify(allowed)).toContain('private changed value')
  })
})

it('extends shared operations to names and feature values without interpreting opaque IDs', () => {
  const change = {
    path: ['translations', 'en', 'title', 'value'],
    before: { present: true as const, value: 'Old' },
    after: { present: true as const, value: 'New' },
  }
  expect(historyOperation(change, false).label).toBe('Updated name')
  expect(
    historyOperation({ ...change, path: ['i18n', 'en', 'name'] }, false).label,
  ).toBe('Updated name')
  expect(
    historyOperation(
      {
        ...change,
        path: ['properties', 'opaque', 'translations', 'en', 'value'],
        before: { present: false },
      },
      false,
    ).label,
  ).toBe('New value')
})

it.each(['organisation', 'project', 'layer'])(
  'fences the %s checkpoint root against post-authorization ancestry changes',
  async resource => {
    const scope = scopes[resource]
    const guard = buildChangelogRootGuard(scope)
    expect(await db.get(sql`SELECT ${guard} AS allowed`)).toEqual({ allowed: 1 })
    fixture.sqlite.exec("UPDATE organisation SET hubId='moved' WHERE id='o'")
    expect(await db.get(sql`SELECT ${guard} AS allowed`)).toEqual({ allowed: 0 })
  },
)
it('requires agreeing layer and project ancestry in the changelog checkpoint guard', async () => {
  fixture.sqlite.exec("UPDATE layer SET organisationId='outside' WHERE id='l'")
  expect(
    await db.get(sql`SELECT ${buildChangelogRootGuard(scopes.layer)} AS allowed`),
  ).toEqual({ allowed: 0 })
})
