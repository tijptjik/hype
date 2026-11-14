// @vitest-environment node
// TESTS
import { expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
// SERVICES
import { readFeatureNamingExamples } from '#lib/db/services/featureNamingExamples.js'
import { readCurrentFeatureRevision } from '#lib/db/services/featureLifecycle.js'
import { featureTemplateValues } from '#lib/templates/featureValues.js'
// FIXTURES
import { lifecycleFixture } from './fixtures/featureLifecycle'
import { publicationSqlite } from './fixtures/publicationSqlite'
import { required } from './fixtures/required'
// TYPES
import type { Database } from '#lib/types.js'

it('previews distinct real records, retains missing values and respects scope, type and archive boundaries', async () => {
  const fixture = lifecycleFixture(false, false, 100)
  const sample = publicationSqlite({})
  try {
    await fixture.initialize()
    const original = required(
      await readCurrentFeatureRevision(fixture.db, { featureId: 'f', guard: sql`1` }),
    ).content
    sample.sqlite.exec(`CREATE TABLE hub(id TEXT,code TEXT); INSERT INTO hub VALUES('hub','core');
      CREATE TABLE organisation(id TEXT,hubId TEXT); INSERT INTO organisation VALUES('org',NULL),('other','different');
      CREATE TABLE feature(id TEXT,projectId TEXT,layerId TEXT,organisationId TEXT,featureType TEXT,isArchived INTEGER,currentRevisionId TEXT);
      CREATE TABLE featureRevision(id TEXT,featureId TEXT,content TEXT);
      CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT);
      CREATE TABLE featureIdentityOperationMember(operationId TEXT,featureId TEXT,role TEXT);`)
    for (const [id, org, type, archived, address] of [
      ['full', 'org', 'object', 0, '123 Main Street'],
      ['missing', 'org', 'object', 0, ''],
      ['outside', 'other', 'object', 0, 'Outside'],
      ['archived', 'org', 'object', 1, 'Archived'],
      ['wrong-type', 'org', 'place', 0, 'Wrong type'],
    ] as const) {
      const content = structuredClone(original)
      content.placement.location = null
      content.profile.nameTemplate = null
      content.translations.en.title.value = id
      content.translations.en.address.value = address
      sample.sqlite
        .prepare('INSERT INTO feature VALUES(?,?,?,?,?,?,?)')
        .run(id, 'project', 'layer', org, type, archived, id)
      sample.sqlite
        .prepare('INSERT INTO featureRevision VALUES(?,?,?)')
        .run(id, id, JSON.stringify(content))
      sample.sqlite.prepare('INSERT INTO featureI18n VALUES(?,?,?)').run(id, 'en', id)
    }
    const rows = await readFeatureNamingExamples(sample.db as unknown as Database, {
      scope: { type: 'hub', id: 'hub' },
      paths: ['feature.name', 'address'],
      locale: 'en',
      featureType: 'object',
    })
    expect(rows.map(row => row.id)).toEqual(['full', 'missing'])
    expect(rows[0].values).toEqual({
      'feature.name': 'full',
      address: '123 Main Street',
    })
    expect(rows[1].values).toEqual({ 'feature.name': 'missing', address: '' })
    expect(rows[1].missing).toEqual(['address'])
    expect(
      await readFeatureNamingExamples(sample.db as unknown as Database, {
        scope: { type: 'layer', id: 'elsewhere' },
        paths: ['feature.name'],
        locale: 'en',
      }),
    ).toEqual([])
    const content = structuredClone(original)
    content.profile.nameTemplate = null
    content.translations = {
      zhHant: {
        ...content.translations.en,
        title: { ...content.translations.en.title, value: '真實名稱' },
      },
    }
    expect(featureTemplateValues(content, 'zh-Hant')['feature.name']).toBe('真實名稱')
    expect(featureTemplateValues(content, 'en')['feature.name']).toBe('')
  } finally {
    sample.sqlite.close()
    fixture.sqlite.close()
  }
})
