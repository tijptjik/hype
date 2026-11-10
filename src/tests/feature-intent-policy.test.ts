import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
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
  featureTypeLabel,
  requireFeatureType,
  resolveFeatureTypes,
} from '#lib/features/intents.js'
// SERVICES
import {
  readFeatureIntentPolicy,
  prepareFeatureIntentPolicySave,
  prepareFeatureNameDependencyChecks,
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
    CREATE TABLE location(id TEXT PRIMARY KEY,kind TEXT,class TEXT,matchingType TEXT GENERATED ALWAYS AS (COALESCE(class,kind)) VIRTUAL); INSERT INTO location(id,kind,class) VALUES('bunker','built','building'),('shop','operational','establishment');`)
  f.sqlite.exec(readFileSync('migrations/0211_feature_intent.sql', 'utf8'))
  f.sqlite.exec(
    readFileSync('migrations/0212_feature_intent_publication_guard.sql', 'utf8'),
  )
  f.sqlite.exec(
    'CREATE TABLE featureCountRevision(id INTEGER PRIMARY KEY, revision INTEGER); INSERT INTO featureCountRevision VALUES(1,0)',
  )
  f.sqlite.exec(readFileSync('migrations/0214_feature_location_context.sql', 'utf8'))
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
  it('validates naming dependencies against fields supplied in the same parent save', async () => {
    const f = fixture()
    const policy = await readFeatureIntentPolicy(f.db, {
      type: 'project',
      id: 'project',
    })
    const input = {
      scope: { type: 'project' as const, id: 'project' },
      actorId: 'editor',
      version: policy.version,
      fingerprint: policy.fingerprint,
      definition: [
        {
          ...DEFAULT_FEATURE_TYPES[0],
          nameRule: {
            base: 'location' as const,
            conditions: [
              {
                propertyId: 'new-boolean',
                locales: {
                  en: {
                    true: 'Paid',
                    false: '',
                    null: '',
                    placement: 'suffix' as const,
                    separator: ' ',
                  },
                },
              },
            ],
          },
        },
      ],
    }
    expect(
      await prepareFeatureIntentPolicySave(f.db, {
        ...input,
        nameProperties: [
          { id: 'new-boolean', dataType: 'boolean', audience: 'public' },
        ],
      }),
    ).not.toBeNull()
    await expect(
      prepareFeatureIntentPolicySave(f.db, {
        ...input,
        nameProperties: [
          { id: 'new-boolean', dataType: 'boolean', audience: 'internal' },
        ],
      }),
    ).rejects.toThrow('public boolean')
  })

  it('checks retained model dependencies when only Fields are supplied', async () => {
    const f = fixture()
    await saveFeatureIntentPolicy(f.db, {
      scope: { type: 'project', id: 'project' },
      actorId: 'editor',
      version: 0,
      guard: sql`1`,
      definition: [
        {
          ...DEFAULT_FEATURE_TYPES[0],
          nameRule: {
            base: 'location',
            conditions: [
              {
                propertyId: 'paid',
                locales: {
                  en: {
                    true: 'Paid',
                    false: '',
                    null: '',
                    placement: 'suffix',
                    separator: ' ',
                  },
                },
              },
            ],
          },
        },
      ],
    })
    await expect(
      prepareFeatureNameDependencyChecks(f.db, 'project', []),
    ).rejects.toThrow('public boolean')
    expect(
      await prepareFeatureNameDependencyChecks(f.db, 'project', [
        { id: 'paid', dataType: 'boolean', audience: 'public' },
      ]),
    ).toHaveLength(2)
  })
  it('commits model policy with its parent and rolls back both on a stale ancestor', async () => {
    const f = fixture()
    const current = await readFeatureIntentPolicy(f.db, {
      type: 'project',
      id: 'project',
    })
    const statements = await prepareFeatureIntentPolicySave(f.db, {
      scope: { type: 'project', id: 'project' },
      definition: DEFAULT_FEATURE_TYPES,
      version: current.version,
      fingerprint: current.fingerprint,
      actorId: 'editor',
    })
    expect(statements).not.toBeNull()
    if (!statements) throw new Error('Missing prepared statements')
    await saveFeatureIntentPolicy(f.db, {
      scope: { type: 'hub', id: 'hub' },
      definition: [ghost],
      version: 0,
      actorId: 'editor',
      guard: sql`1`,
    })
    expect(
      await executeRevisionBatch(f.db, sql`1`, [
        f.db.run(sql`UPDATE project SET organisationId='changed' WHERE id='project'`),
        ...statements,
      ]),
    ).toBeNull()
    expect(f.sqlite.prepare('SELECT organisationId FROM project').get()).toEqual({
      organisationId: 'org',
    })
    expect(
      (await readFeatureIntentPolicy(f.db, { type: 'project', id: 'project' })).version,
    ).toBe(0)
    const fresh = await readFeatureIntentPolicy(f.db, {
      type: 'project',
      id: 'project',
    })
    const next = await prepareFeatureIntentPolicySave(f.db, {
      scope: { type: 'project', id: 'project' },
      definition: DEFAULT_FEATURE_TYPES,
      version: fresh.version,
      fingerprint: fresh.fingerprint,
      actorId: 'editor',
    })
    if (!next) throw new Error('Missing fresh statements')
    expect(
      await executeRevisionBatch(f.db, sql`1`, [
        ...next,
        f.db.run(sql`UPDATE project SET organisationId='changed' WHERE id='project'`),
      ]),
    ).not.toBeNull()
    expect(
      f.sqlite
        .prepare("SELECT version FROM featureIntentPolicy WHERE scopeType='project'")
        .get(),
    ).toEqual({ version: 1 })
  })

  it('keeps future types configured but excludes them from new feature selection', () => {
    expect(
      DEFAULT_FEATURE_TYPES.filter(type => type.enabled !== false).map(type => type.id),
    ).toEqual(['object', 'place'])
    expect(() => requireFeatureType(DEFAULT_FEATURE_TYPES, 'area')).toThrow()
    expect(requireFeatureType(DEFAULT_FEATURE_TYPES, 'area', true).id).toBe('area')
    expect(
      requireFeatureType([{ ...DEFAULT_FEATURE_TYPES[0], enabled: undefined }]).id,
    ).toBe('object')
    expect(FeatureTypesSchema.parse(DEFAULT_FEATURE_TYPES)[2].enabled).toBe(false)
    expect(DEFAULT_FEATURE_TYPES[0].targetContexts).toEqual([
      'building_part',
      'building',
      'premises',
      'address',
    ])
    expect(DEFAULT_FEATURE_TYPES[2].targetContexts).toEqual(['premises', 'address'])
  })

  it('preserves translated display names through hub inheritance and rejects locale collisions', async () => {
    const f = fixture()
    const types = FeatureTypesSchema.parse([
      {
        ...ghost,
        labels: { zhHant: '舊招牌', 'zh-hans': '旧招牌', ja: '昔の看板', fr: '' },
      },
    ])
    expect(types[0].labels).toEqual({
      'zh-Hant': '舊招牌',
      'zh-Hans': '旧招牌',
      ja: '昔の看板',
      fr: '',
    })
    await saveFeatureIntentPolicy(f.db, {
      scope: { type: 'hub', id: 'hub' },
      definition: types,
      version: 0,
      guard: sql`1`,
      actorId: 'editor',
    })
    const inherited = (
      await readFeatureIntentPolicy(f.db, { type: 'layer', id: 'layer' })
    ).types[0]
    expect(inherited.labels).toEqual(types[0].labels)
    expect(featureTypeLabel(inherited, 'zhHant')).toBe('舊招牌')
    expect(featureTypeLabel(inherited, 'ja')).toBe('昔の看板')
    expect(featureTypeLabel(inherited, 'fr')).toBe('Ghost sign')
    expect(featureTypeLabel(ghost, 'zh-Hans')).toBe('Ghost sign')
    expect(
      FeatureTypesSchema.safeParse([
        { ...ghost, labels: { zhHant: 'A', 'zh-Hant': 'B' } },
      ]).success,
    ).toBe(false)
  })
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
    await save('layer', 'layer', ['area'])
    expect(
      (await readFeatureIntentPolicy(f.db, { type: 'layer', id: 'layer' })).types.map(
        type => type.id,
      ),
    ).toEqual(['area'])
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
  it('saves and reads service and address class permissions', async () => {
    const f = fixture()
    const scope = { type: 'hub' as const, id: 'hub' }
    const current = await readFeatureIntentPolicy(f.db, scope)
    const definition = [
      {
        ...DEFAULT_FEATURE_TYPES[0],
        targetContexts: [
          'service_point',
          'premises_address',
          'cadastral_address',
          'linear_reference',
        ] as const,
      },
    ]
    const parsed = FeatureTypesSchema.parse(definition)
    await saveFeatureIntentPolicy(f.db, {
      scope,
      definition: parsed,
      version: current.version,
      guard: sql`1`,
      actorId: 'editor',
    })
    expect(
      (await readFeatureIntentPolicy(f.db, scope)).types[0].targetContexts,
    ).toEqual(definition[0].targetContexts)
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
  it('permits addressless buildings, rejects incompatible links and allows missing associations', async () => {
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
    await expect(assertFeatureIntentLocation(f.db, 'f', null)).resolves.toBeUndefined()
    await expect(assertFeatureIntentPublication(f.db, 'f')).resolves.toBeUndefined()
    expect(() => f.sqlite.exec('UPDATE feature SET isPublished=1')).not.toThrow()
    f.sqlite.exec("INSERT INTO featureLocation VALUES('f','bunker')")
    f.sqlite.exec('UPDATE feature SET isPublished=1')
    await expect(assertFeatureIntentPublication(f.db, 'f')).resolves.toBeUndefined()
  })
})
