// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import {
  DEFAULT_FEATURE_TYPES,
  FeatureTypesSchema,
  requireFeatureType,
  resolveFeatureTypes,
} from '#lib/features/intents.js'
// SERVICES
import {
  readFeatureIntentPolicy,
  saveFeatureIntentPolicy,
  assertFeatureIntentLocation,
  assertFeatureIntentPublication,
} from '#lib/db/services/featureIntentPolicy.js'
// FIXTURES
import { prepareFeatureEditorialProjection } from '#lib/db/services/featureRevisionProjection.js'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import { publicationSqlite } from './fixtures/publicationSqlite'
// TYPES
import type { Database } from '#lib/types.js'

const connections: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const f of connections.splice(0)) f.sqlite.close()
})
/** Minimal relational fixture exercises real SQL, rollback and migration behavior. */
function fixture() {
  const f = publicationSqlite({})
  connections.push(f)
  f.sqlite.exec(`CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES('editor');
    CREATE TABLE hub(id TEXT PRIMARY KEY,code TEXT); INSERT INTO hub VALUES('hub','core');
    CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT); INSERT INTO organisation VALUES('org','hub');
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT); INSERT INTO project VALUES('project','org');
    CREATE TABLE layer(id TEXT PRIMARY KEY,projectId TEXT); INSERT INTO layer VALUES('layer','project');
    CREATE TABLE feature(id TEXT PRIMARY KEY,layerId TEXT,isPublished INTEGER DEFAULT 0); INSERT INTO feature(id,layerId) VALUES('f','layer');
    CREATE TABLE featureLocation(featureId TEXT,locationId TEXT);
    CREATE TABLE location(id TEXT PRIMARY KEY,kind TEXT); INSERT INTO location VALUES('bunker','building'),('shop','establishment');`)
  f.sqlite.exec(readFileSync('migrations/0211_feature_intent.sql', 'utf8'))
  f.sqlite.exec(
    readFileSync('migrations/0212_feature_intent_publication_guard.sql', 'utf8'),
  )
  return { ...f, db: f.db as unknown as Database }
}
const ghost = {
  id: 'ghost-sign',
  label: 'Ghost sign',
  locationKinds: ['building', 'premises', 'address'] as (
    | 'building'
    | 'premises'
    | 'address'
  )[],
  start: 'search' as const,
  associationRequired: false,
}

describe('Feature intent', () => {
  it('captures intent in immutable content and leaves legacy snapshots unclassified', async () => {
    const f = lifecycleFixture()
    try {
      const legacy = await f.initialize(false)
      expect(legacy.content.profile).not.toHaveProperty('featureType')
      f.sqlite.exec("UPDATE feature SET featureType='ghost-sign'")
      const { buildFeatureRevisionBaselineContent } = await import(
        '#lib/db/services/featureRevisionContent.js'
      )
      const content = buildFeatureRevisionBaselineContent(
        (await f.capture()).snapshot,
        {
          revisions: { photo: 'image-r1', research: 'private-r1' },
          order: ['photo', 'research'],
        },
      )
      expect(content.profile.featureType).toBe('ghost-sign')
      const source = await f.capture()
      const reclassified = structuredClone(content)
      reclassified.profile.featureType = 'business'
      expect(() =>
        prepareFeatureEditorialProjection(f.db, {
          featureId: 'f',
          source,
          previous: content,
          content: reclassified,
        }),
      ).toThrow('explicit reclassification')
    } finally {
      f.sqlite.close()
    }
  })
  it('keeps coordinates separate and infers a single subject', () => {
    expect(requireFeatureType([ghost]).id).toBe('ghost-sign')
    expect(() => requireFeatureType(DEFAULT_FEATURE_TYPES)).toThrow('Choose')
    expect(
      FeatureTypesSchema.safeParse([
        { ...ghost, locationKinds: [], associationRequired: true },
      ]).success,
    ).toBe(false)
    expect(resolveFeatureTypes([ghost], null, ['retired'])).toEqual([])
  })
  it('inherits hub defaults, overrides a project, narrows a layer and resets without changing features', async () => {
    const f = fixture()
    const save = async (
      type: 'hub' | 'project' | 'layer',
      id: string,
      definition: Parameters<typeof saveFeatureIntentPolicy>[1]['definition'],
    ) => {
      const current = await readFeatureIntentPolicy(f.db, { type, id })
      return saveFeatureIntentPolicy(f.db, {
        scope: { type, id },
        definition,
        version: current.version,
        guard: sql`1`,
        actorId: 'editor',
      })
    }
    await save('hub', 'hub', [ghost])
    expect(
      (await readFeatureIntentPolicy(f.db, { type: 'layer', id: 'layer' })).types,
    ).toEqual([ghost])
    await save('project', 'project', DEFAULT_FEATURE_TYPES)
    await save('layer', 'layer', ['natural'])
    expect(
      (await readFeatureIntentPolicy(f.db, { type: 'layer', id: 'layer' })).types.map(
        type => type.id,
      ),
    ).toEqual(['natural'])
    await save('layer', 'layer', null)
    await save('project', 'project', null)
    expect(
      (await readFeatureIntentPolicy(f.db, { type: 'layer', id: 'layer' })).types,
    ).toEqual([ghost])
    expect(
      f.sqlite.prepare('SELECT featureType FROM feature').get()?.featureType,
    ).toBeNull()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureIntentPolicyRevision').get()?.n,
    ).toBe(5)
  })
  it('rejects stale settings atomically', async () => {
    const f = fixture()
    const input = {
      scope: { type: 'hub' as const, id: 'hub' },
      definition: [ghost],
      version: 0,
      actorId: 'editor',
      guard: sql`1`,
    }
    expect(await saveFeatureIntentPolicy(f.db, input)).toBe(true)
    expect(await saveFeatureIntentPolicy(f.db, input)).toBe(false)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureIntentPolicyRevision').get()?.n,
    ).toBe(1)
  })
  it('permits addressless buildings, rejects incompatible links and gates required publication', async () => {
    const f = fixture()
    await saveFeatureIntentPolicy(f.db, {
      scope: { type: 'hub', id: 'hub' },
      definition: [{ ...ghost, associationRequired: true }],
      version: 0,
      actorId: 'editor',
      guard: sql`1`,
    })
    f.sqlite.exec("UPDATE feature SET featureType='ghost-sign'")
    await expect(
      assertFeatureIntentLocation(f.db, 'f', 'bunker'),
    ).resolves.toBeUndefined()
    await expect(assertFeatureIntentLocation(f.db, 'f', 'shop')).rejects.toThrow(
      'not permitted',
    )
    await expect(assertFeatureIntentLocation(f.db, 'f', null)).rejects.toThrow(
      'requires',
    )
    await expect(assertFeatureIntentPublication(f.db, 'f')).rejects.toThrow(
      'before publishing',
    )
    expect(() => f.sqlite.exec('UPDATE feature SET isPublished=1')).toThrow(
      'Link a Location',
    )
    f.sqlite.exec("INSERT INTO featureLocation VALUES('f','bunker')")
    f.sqlite.exec('UPDATE feature SET isPublished=1')
    await expect(assertFeatureIntentPublication(f.db, 'f')).resolves.toBeUndefined()
  })
})
