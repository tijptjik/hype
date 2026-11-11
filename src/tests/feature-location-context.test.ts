// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { describe, expect, it } from 'vitest'
// DOMAIN
import {
  generateFeatureName,
  nameBooleanValue,
  targetLocationKinds,
  targetSuggestionKinds,
  FeatureNameTemplateSchema,
} from '#lib/features/locationPolicy.js'
import { FeatureTypesSchema, DEFAULT_FEATURE_TYPES } from '#lib/features/intents.js'
import {
  createLocationFactsSnapshot,
  readLocationFacts,
} from '#lib/locations/factsSnapshot.js'
// SERVICES
import {
  readFeatureIntentPolicy,
  saveFeatureIntentPolicy,
  assertFeatureIntentLocation,
} from '#lib/db/services/featureIntentPolicy.js'
import { featureIndexFilterConditions } from '#lib/db/services/featureIndexFilters.js'
import { feature } from '#lib/db/schema/feature.js'
import { sql, and } from 'drizzle-orm'
// FIXTURES
import { publicationSqlite } from './fixtures/publicationSqlite'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
import type { Database } from '#lib/types.js'

const ghost = {
  ...DEFAULT_FEATURE_TYPES[0],
  id: 'ghost-sign',
  targetContexts: ['building_part', 'building'] as const,
}
const rule = {
  base: 'location' as const,
  conditions: [
    {
      propertyId: 'paid',
      locales: {
        en: {
          true: 'Paid',
          false: '',
          null: 'Unknown',
          placement: 'suffix' as const,
          separator: ' ',
        },
        'zh-hant': {
          true: '付費區',
          false: '',
          null: '',
          placement: 'prefix' as const,
          separator: '：',
        },
      },
    },
  ],
}

describe('new feature location intent', () => {
  it('separates establishment discovery from physical targets and validates configured contexts', () => {
    expect(targetSuggestionKinds('building_part')).toContain('establishment')
    expect(targetLocationKinds('building_part')).toEqual(['building_part'])
    expect(targetLocationKinds('service_point')).toEqual(['service_point'])
    expect(targetSuggestionKinds('service_point')).toEqual([
      'service_point',
      'establishment',
      'building_part',
      'building',
      'premises',
      'address',
    ])
    expect(targetLocationKinds('establishment')).toEqual(['establishment'])
    expect(
      FeatureTypesSchema.parse([
        { ...ghost, targetContexts: [...ghost.targetContexts] },
      ])[0].kind,
    ).toBe('object')
    expect(
      FeatureTypesSchema.safeParse([
        { ...ghost, targetContexts: ['building', 'building'] },
      ]).success,
    ).toBe(false)
  })
  it('evaluates localized true, false, unset and explicit overrides without code execution', () => {
    const input = {
      rule,
      locale: 'en',
      locationName: 'Bakery',
      properties: { paid: true },
    }
    expect(generateFeatureName(input)).toBe('Bakery Paid')
    expect(generateFeatureName({ ...input, properties: { paid: false } })).toBe(
      'Bakery',
    )
    expect(generateFeatureName({ ...input, properties: {} })).toBe('Bakery Unknown')
    expect(generateFeatureName({ ...input, locale: 'zh-hant' })).toBe('付費區：Bakery')
    expect(generateFeatureName({ ...input, override: 'My name' })).toBe('My name')
    expect(generateFeatureName({ ...input, override: '' })).toBe('')
    expect(nameBooleanValue('false')).toBe(false)
    expect(nameBooleanValue(null)).toBeNull()
    expect(FeatureNameTemplateSchema.parse({ rule }).rule).toEqual(rule)
  })
  it('persists layer overrides, keeps legacy rows untouched and rejects establishment targets for parts', async () => {
    const f = publicationSqlite({})
    const db = f.db as unknown as Database
    try {
      f.sqlite.exec(`CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES('editor');
        CREATE TABLE hub(id TEXT PRIMARY KEY,code TEXT); INSERT INTO hub VALUES('hub','core');
        CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT); INSERT INTO organisation VALUES('org','hub');
        CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT); INSERT INTO project VALUES('project','org');
        CREATE TABLE layer(id TEXT PRIMARY KEY,projectId TEXT); INSERT INTO layer VALUES('layer','project');
        CREATE TABLE feature(id TEXT PRIMARY KEY,layerId TEXT,isPublished INTEGER DEFAULT 0); INSERT INTO feature(id,layerId) VALUES('legacy','layer');
        CREATE TABLE featureLocation(featureId TEXT,locationId TEXT);
        CREATE TABLE featureCountRevision(id INTEGER PRIMARY KEY,revision INTEGER); INSERT INTO featureCountRevision VALUES(1,0);
        CREATE TABLE location(id TEXT PRIMARY KEY,kind TEXT,class TEXT,matchingType TEXT GENERATED ALWAYS AS (COALESCE(class,kind)) VIRTUAL); INSERT INTO location(id,kind,class) VALUES('part','built','building_part'),('shop','operational','establishment'),('building','built','building');`)
      for (const migration of [
        '0211_feature_intent',
        '0212_feature_intent_publication_guard',
        '0214_feature_location_context',
        '0221_feature_naming_policy',
      ])
        f.sqlite.exec(readFileSync(`migrations/${migration}.sql`, 'utf8'))
      expect(f.sqlite.prepare('SELECT kind,targetContext FROM feature').get()).toEqual({
        kind: null,
        targetContext: null,
      })
      const types = FeatureTypesSchema.parse([
        { ...ghost, targetContexts: [...ghost.targetContexts] },
      ])
      await saveFeatureIntentPolicy(db, {
        scope: { type: 'layer', id: 'layer' },
        definition: types,
        version: 0,
        actorId: 'editor',
        guard: sql`1`,
      })
      expect(
        (await readFeatureIntentPolicy(db, { type: 'layer', id: 'layer' })).types,
      ).toEqual(types)
      f.sqlite.exec(
        "INSERT INTO feature(id,layerId,featureType,kind,targetContext,associationRelation) VALUES('sign','layer','ghost-sign','object','building_part','locatedAt')",
      )
      await expect(
        assertFeatureIntentLocation(db, 'sign', 'part'),
      ).resolves.toBeUndefined()
      await expect(assertFeatureIntentLocation(db, 'sign', 'building')).rejects.toThrow(
        'not permitted',
      )
      await expect(assertFeatureIntentLocation(db, 'sign', 'shop')).rejects.toThrow(
        'not permitted',
      )
      await expect(
        assertFeatureIntentLocation(db, 'sign', null),
      ).resolves.toBeUndefined()
      f.sqlite.exec("INSERT INTO featureLocation VALUES('sign','part')")
      const missing = await db
        .select({ id: feature.id })
        .from(feature)
        .where(and(...featureIndexFilterConditions({ hasLocation: false })))
      expect(missing).toEqual([{ id: 'legacy' }])
      expect(
        f.sqlite.prepare('SELECT revision FROM featureCountRevision').get()?.revision,
      ).toBe(1)
      f.sqlite.exec("UPDATE feature SET featureType='retired' WHERE id='sign'")
      await expect(
        assertFeatureIntentLocation(db, 'sign', null),
      ).resolves.toBeUndefined()
    } finally {
      f.sqlite.close()
    }
  })
  it('widens physical location storage without changing existing building-part membership', () => {
    const f = setupLifecycleDatabase()
    try {
      f.sqlite.exec(readFileSync('migrations/0155_location_accessibility.sql', 'utf8'))
      f.sqlite.exec(
        readFileSync('migrations/0144_location_address_contract.sql', 'utf8').match(
          /CREATE TRIGGER location_revision_unknown_details[\s\S]*?END;/,
        )![0],
      )
      f.sqlite.exec(readFileSync('migrations/0213_building_parts.sql', 'utf8'))
      f.sqlite.exec(readFileSync('migrations/0215_location_physical_kinds.sql', 'utf8'))
      for (const kind of ['street', 'infrastructure'] as const) {
        f.sqlite
          .prepare(
            'INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES(?,?,?,?)',
          )
          .run(kind, kind, 'unresolved', 'p')
        const snapshot = createLocationFactsSnapshot(
          {
            names: { en: kind },
            brands: [],
            phoneNumber: [],
            location: {
              geometry: { type: 'Point', coordinates: [114, 22] },
              address: {
                status: 'unresolved',
                address2dId: null,
                address3dId: null,
                address3dUnitId: null,
                snapshotId: null,
                rawSource: {},
                fallbackDisplay: {},
              },
            },
          },
          kind,
        )
        expect(readLocationFacts(snapshot).entity?.kind).toBe(kind)
      }
      expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      f.sqlite.close()
    }
  })
})

it('returns persisted titles without evaluating naming rules on reads', async () => {
  const { toEntityResponseShape } = await import('#lib/api/services/feature.js')
  const response = await toEntityResponseShape(
    {
      id: 'f',
      organisationId: 'o',
      projectId: 'p',
      layerId: 'l',
      isPublished: false,
      isArchived: false,
      modifiedAt: '2026-11-10',
      nameTemplate: { rule },
      nameValues: '{"paid":"false"}',
      locationNames: '{"en":"Different venue"}',
      i18n: [{ locale: 'en', baseName: 'Authored', title: 'Stored final title' }],
    } as never,
    'compact',
  )
  expect(response.data?.i18n?.en.title).toBe('Stored final title')
})

it('keeps address and service point permissions independent', () => {
  expect(targetLocationKinds('service_point')).toEqual(['service_point'])
  expect(targetLocationKinds('address')).toEqual(['address'])
})
