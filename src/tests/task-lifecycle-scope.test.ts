// @vitest-environment node
// TESTING
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { expect, it } from 'vitest'
// DATABASE
import * as schema from '#lib/db/schema/index.js'
import { taskLifecycleScopeCondition } from '#lib/db/services/task-scope.js'
// TYPES
import type { Database } from '#lib/types.js'

it('keeps creation ancestry inside task identity and authorization filters', async () => {
  const sqlite = new DatabaseSync(':memory:')
  try {
    sqlite.exec(`
      CREATE TABLE feature(id TEXT,projectId TEXT,currentRevisionId TEXT);
      CREATE TABLE organisation(id TEXT);
      CREATE TABLE project(id TEXT,organisationId TEXT);
      CREATE TABLE layer(id TEXT,projectId TEXT,organisationId TEXT);
      CREATE TABLE task(id TEXT,featureId TEXT,projectId TEXT,organisationId TEXT,contributorId TEXT,type TEXT,proposalId TEXT);
      CREATE TABLE featureRevisionProposal(id TEXT,kind TEXT,featureId TEXT,contributorId TEXT,creationScope TEXT);
      INSERT INTO organisation VALUES('allowed'),('other');
      INSERT INTO project VALUES('p','allowed'),('q','other');
      INSERT INTO layer VALUES('l','p','allowed'),('m','q','other');
      INSERT INTO feature VALUES('f','p','revision');
      INSERT INTO featureRevisionProposal VALUES
        ('a','create',NULL,'author','{"layerId":"l","projectId":"p","organisationId":"allowed"}'),
        ('b','create',NULL,'author','{"layerId":"m","projectId":"q","organisationId":"other"}');
      INSERT INTO task VALUES
        ('existing','f','p','allowed','author','newPhoto',NULL),
        ('creation',NULL,'p','allowed','author','newFeature','a'),
        ('foreign',NULL,'q','other','author','newFeature','b');
    `)
    const db = drizzle(
      {
        prepare: (text: string) => ({
          bind: (...params: unknown[]) => ({
            all: async () => ({
              results: sqlite.prepare(text).all(...(params as never[])),
            }),
            raw: async () => {
              const statement = sqlite.prepare(text)
              statement.setReturnArrays(true)
              return statement.all(...(params as never[]))
            },
          }),
        }),
      } as never,
      { schema },
    ) as Database
    const scope = await taskLifecycleScopeCondition(db)
    for (const id of ['existing', 'creation', 'missing']) {
      const rows = await db
        .select({ id: schema.task.id })
        .from(schema.task)
        .where(and(eq(schema.task.id, id), scope))
      expect(rows).toEqual(id === 'missing' ? [] : [{ id }])
    }
    const allowed = await db
      .select({ id: schema.task.id })
      .from(schema.task)
      .where(and(eq(schema.task.organisationId, 'allowed'), scope))
    expect(allowed.map(row => row.id).sort()).toEqual(['creation', 'existing'])
  } finally {
    sqlite.close()
  }
})
