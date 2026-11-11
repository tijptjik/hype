// @vitest-environment node
// TESTS
import { afterEach, expect, it } from 'vitest'
// SERVICES
import { readDisplayTemplateConsumers } from '../lib/db/services/displayTemplateConsumers'
// FIXTURES
import { publicationSqlite } from './fixtures/publicationSqlite'
// TYPES
import type { Database } from '#lib/types.js'

const connections: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const f of connections.splice(0)) f.sqlite.close()
})
/** Minimal accepted snapshots exercise SQL paging and scope isolation.
 * @returns SQLite database with two Organisation consumers and a central template.
 */
function fixture() {
  const f = publicationSqlite({})
  connections.push(f)
  f.sqlite.exec(`CREATE TABLE feature(id TEXT PRIMARY KEY,organisationId TEXT,currentRevisionId TEXT,revisionVersion INTEGER);
    CREATE TABLE featureRevision(id TEXT PRIMARY KEY,featureId TEXT,content TEXT);
    CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT);
    CREATE TABLE displayTemplate(id TEXT PRIMARY KEY,organisationId TEXT);
    CREATE TABLE featureIdentityOperationMember(operationId TEXT,featureId TEXT,role TEXT);
    INSERT INTO displayTemplate VALUES('central',NULL),('private','other');`)
  for (let index = 0; index < 23; index++) {
    const id = `f${String(index).padStart(2, '0')}`
    f.sqlite.prepare('INSERT INTO feature VALUES(?,?,?,?)').run(id, 'org', `r${id}`, 4)
    f.sqlite.prepare('INSERT INTO featureRevision VALUES(?,?,?)').run(
      `r${id}`,
      id,
      JSON.stringify({
        profile: {
          nameTemplate: { rule: { registry: { id: 'central', version: 1 } } },
        },
      }),
    )
    f.sqlite
      .prepare('INSERT INTO featureI18n VALUES(?,?,?)')
      .run(id, 'en', `Place ${index}`)
  }
  return { ...f, db: f.db as unknown as Database }
}
it('paginates accepted consumers without missing or repeating the boundary row', async () => {
  const f = fixture()
  const first = await readDisplayTemplateConsumers(f.db, {
    organisationId: 'org',
    templateId: 'central',
    after: null,
  })
  expect(first.consumers).toHaveLength(20)
  expect(first.next).toBe('f19')
  expect(first.consumers[0]).toEqual({
    featureId: 'f00',
    revisionId: 'rf00',
    version: 4,
    templateVersion: 1,
    title: 'Place 0',
  })
  const second = await readDisplayTemplateConsumers(f.db, {
    organisationId: 'org',
    templateId: 'central',
    after: first.next,
  })
  expect(second.consumers.map(value => value.featureId)).toEqual(['f20', 'f21', 'f22'])
  expect(second.next).toBeNull()
})
it('excludes foreign owners, foreign catalogues and retired identities', async () => {
  const f = fixture()
  f.sqlite.exec(`UPDATE feature SET organisationId='other' WHERE id='f00';
    UPDATE featureRevision SET content=json_set(content,'$.profile.nameTemplate.rule.registry.id','private') WHERE featureId='f01';
    INSERT INTO featureIdentityOperationMember VALUES('retire','f02','input');
    INSERT INTO featureIdentityOperationMember VALUES('retain','f03','input'),('retain','f03','output');`)
  const page = await readDisplayTemplateConsumers(f.db, {
    organisationId: 'org',
    templateId: 'central',
    after: null,
  })
  expect(page.consumers.map(value => value.featureId)).not.toContain('f00')
  expect(page.consumers.map(value => value.featureId)).not.toContain('f01')
  expect(page.consumers.map(value => value.featureId)).not.toContain('f02')
  expect(page.consumers.map(value => value.featureId)).toContain('f03')
  expect(
    await readDisplayTemplateConsumers(f.db, {
      organisationId: 'org',
      templateId: 'private',
      after: null,
    }),
  ).toEqual({ consumers: [], next: null })
})
