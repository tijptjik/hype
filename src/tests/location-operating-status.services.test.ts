// @vitest-environment node
// TEST
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
// SCHEMA
import { feature as featureTable } from '#lib/db/schema/feature.js'
// SERVICES
import {
  createLocalLocation,
  updateLocalLocationAddress,
} from '#lib/db/services/locationLocal.js'
import { listLocationResources } from '#lib/db/services/locationDirectory.js'
import { getAcceptedFeatureLocation } from '#lib/db/services/location.js'
import { prepareFeatureLocationAssociationWrite } from '#lib/db/services/locationAssociation.js'
import { proposeFeatureLocationAdoption } from '#lib/db/services/locationAdoptionReview.js'
import { applyLocationAdoptionGroup } from '#lib/db/services/locationAdoptionApply.js'
import { processLocationRefresh } from '#lib/db/services/locationRefreshProcess.js'
import { featureLocationLifecycleSQL } from '#lib/db/services/locationLifecycleProjection.js'
import {
  LocationLifecycleSummarySchema,
  mapOperatingStatus,
} from '#lib/locations/lifecycle.js'
import { persistSaanSeoiPlace } from '#lib/db/services/locationSource.js'
// SNAPSHOT CONTRACT
import {
  readLocationFacts,
  serializeLocationFacts,
} from '#lib/locations/factsSnapshot.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { D1Database } from '@cloudflare/workers-types'
const stores: DatabaseSync[] = []
afterEach(() => {
  for (const db of stores.splice(0)) db.close()
})

function setup(includeScope = false, includeAddressKind = true) {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE organisation(id TEXT PRIMARY KEY,settings TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE organisationI18n(organisationId TEXT,locale TEXT,name TEXT,nameShort TEXT);
    INSERT INTO organisation(id) VALUES ('p'),('other');
    CREATE TABLE project(id TEXT PRIMARY KEY, modifiedAt TEXT DEFAULT 'original',
      organisationId TEXT, code TEXT, capabilities TEXT, markerStyleCode TEXT,
      cardStyleCode TEXT, useAllInOrgContext INTEGER);
    CREATE TABLE feature(id TEXT PRIMARY KEY, featureType TEXT, nameTemplate TEXT, kind TEXT, targetContext TEXT, associationRelation TEXT, layerId TEXT, isArchived INTEGER DEFAULT 0, projectId TEXT, isDraft INTEGER DEFAULT 0, modifiedAt TEXT DEFAULT 'original', geometry TEXT, addressMeta TEXT, isIntangible INTEGER DEFAULT 0);
    CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT,displayAddress TEXT);
    CREATE TABLE hub(id TEXT PRIMARY KEY,code TEXT);
    CREATE TABLE property(id TEXT PRIMARY KEY,key TEXT,scope TEXT,hubId TEXT,audience TEXT NOT NULL DEFAULT 'public');
    CREATE TABLE featureProperty(featureId TEXT,propertyId TEXT,propertyValueId TEXT,value TEXT,valueJson TEXT);
    CREATE TABLE propertyValue(id TEXT PRIMARY KEY,propertyId TEXT);
    CREATE TABLE propertyValueI18n(propertyValueId TEXT,locale TEXT,value TEXT);
    INSERT INTO project(id,organisationId) VALUES ('p','p'), ('other','other');
    INSERT INTO feature(id,projectId) VALUES ('f','p');`)
  sqlite.exec(readFileSync('migrations/0102_place_inheritance_foundation.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0110_feature_place_history.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0112_feature_place_detachment.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0113_place_adoption_review.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0116_place_identity_history.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0117_place_identity_review.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0118_place_merge_redirect.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0120_place_identity_rejection.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0123_place_owned_fields.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0124_place_adoption_decisions.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0125_place_identity_consolidation.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0135_place_organisation_ownership.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0137_location_kinds.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0114_place_refresh.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0115_place_refresh_processing.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0119_place_source_changes.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0121_place_refresh_identity_scan.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0122_simplify_place_refresh.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0138_location_storage.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0253_location_operator.sql', 'utf8'))
  // Legacy fixtures add current taxonomy columns later; install the new empty tables before that adaptation.
  sqlite.exec(
    readFileSync('migrations/0254_location_premises_map.sql', 'utf8').split(
      '-- Exact imported station identities',
    )[0],
  )
  sqlite.exec(readFileSync('migrations/0249_location_manual_match_attempt.sql', 'utf8'))
  sqlite.exec(
    readFileSync('migrations/0139_organisation_location_corrections.sql', 'utf8'),
  )
  sqlite.exec(
    readFileSync('migrations/0141_organisation_location_scope_guards.sql', 'utf8'),
  )
  if (includeAddressKind)
    sqlite.exec(readFileSync('migrations/0140_location_address_kind.sql', 'utf8'))
  // Keep legacy facts fixtures available for their explicit conversion tests while installing current relationship/correction storage.
  const relationships = readFileSync(
    'migrations/0148_location_relationships.sql',
    'utf8',
  )
  sqlite.exec(relationships.slice(relationships.indexOf('CREATE TABLE address (')))
  sqlite.exec(readFileSync('migrations/0149_location_correction_rows.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0150_location_placement_candidates.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0151_location_placement_acceptance.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0153_location_relationship_review.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0154_location_version_names.sql', 'utf8'))
  // Install the current taxonomy and revision contracts used by the real service writers.
  sqlite.exec(readFileSync('migrations/0157_location_rematching.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0155_location_accessibility.sql', 'utf8'))
  for (const [file, name] of [
    ['0142_location_facts_snapshots', 'location_revision_snapshot_insert'],
    ['0144_location_address_contract', 'location_revision_unknown_details'],
  ]) {
    const trigger = readFileSync(`migrations/${file}.sql`, 'utf8').match(
      new RegExp(`CREATE TRIGGER ${name}[\\s\\S]*?END;`),
    )?.[0]
    if (!trigger) throw new Error(`Missing fixture trigger ${name}`)
    sqlite.exec(trigger)
  }
  sqlite.exec('CREATE INDEX feature_target_context ON feature(layerId,targetContext)')
  for (const migration of [
    '0213_building_parts',
    '0215_location_physical_kinds',
    '0216_location_taxonomy',
    '0217_location_thoroughfare',
    '0218_location_address_service_classes',
    '0219_address_location_classification',
  ])
    sqlite.exec(readFileSync(`migrations/${migration}.sql`, 'utf8'))
  sqlite.exec(
    readFileSync('migrations/0238_location_i18n.sql', 'utf8').split(
      'DROP VIEW featureAcceptedNamingLocation;',
    )[0],
  )
  sqlite.exec(
    readFileSync(
      'migrations/0241_authoritative_revision_translations.sql',
      'utf8',
    ).split('DROP TRIGGER identity_catalogue_i18n_revision;')[0],
  )
  // Scope-focused cases explicitly install their guards after arranging legacy input.
  if (!includeScope)
    sqlite.exec(`DROP TRIGGER feature_location_scope_insert;
    DROP TRIGGER feature_location_scope_update; DROP TRIGGER feature_location_feature_scope;
    DROP TRIGGER feature_location_owner_scope;`)

  const prepare = (query: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => {
      if (args.length > 100) throw new Error('D1 parameter limit exceeded')
      return prepare(query, args)
    },
    first: async () => sqlite.prepare(query).get(...(values as never[])) ?? null,
    raw: async () => {
      const statement = sqlite.prepare(query)
      statement.setReturnArrays(true)
      return statement.all(...(values as never[]))
    },
    all: async () => ({
      results: sqlite.prepare(query).all(...(values as never[])),
      success: true,
      meta: { changes: Number(sqlite.prepare('SELECT changes() AS n').get()?.n ?? 0) },
    }),
    run: async () => ({
      success: true,
      meta: {
        changes: Number(sqlite.prepare(query).run(...(values as never[])).changes),
      },
    }),
  })
  const batch = async (statements: ReturnType<typeof prepare>[]) => {
    sqlite.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.all())
      sqlite.exec('COMMIT')
      return results
    } catch (cause) {
      sqlite.exec('ROLLBACK')
      throw cause
    }
  }
  return {
    sqlite,
    binding: { prepare, batch } as unknown as D1Database,
    db: drizzle({ prepare, batch } as unknown as D1Database, {
      schema: { feature: featureTable },
    }) as unknown as Database,
  }
}
const facts = {
  names: { en: 'Bakery' },
  phoneNumber: ['+85223456789', '+85291234567'],
  brands: [],
  location: {
    geometry: { type: 'Point', coordinates: [114.17, 22.3] },
    address: {
      status: 'unresolved',
      address2dId: null,
      address3dId: null,
      address3dUnitId: null,
      snapshotId: null,
      rawSource: {},
      fallbackDisplay: { en: 'Original address' },
    },
  },
}

const closure = 'permanently_closed' as const

async function linkedFixture(state: 'manual' | 'unresolved' = 'unresolved') {
  const fixture = setup(true)
  const { getTableColumns } = await import('drizzle-orm')
  const { feature, featureI18n } = await import('#lib/db/schema/feature.js')
  for (const [name, table] of [
    ['feature', feature],
    ['featureI18n', featureI18n],
  ] as const) {
    const existing = new Set(
      fixture.sqlite
        .prepare(`PRAGMA table_info(${name})`)
        .all()
        .map(row => row.name),
    )
    for (const column of Object.values(getTableColumns(table)))
      if (!existing.has(column.name))
        fixture.sqlite.exec(
          `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
        )
  }
  fixture.sqlite.exec(`CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER);
    INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES('f','en','Bakery','Original address');
    INSERT INTO hub VALUES('core','core');
    INSERT INTO property(id,key,scope,hubId) VALUES('phone','phoneNumber','hub','core');`)
  fixture.sqlite
    .prepare('UPDATE feature SET geometry=?')
    .run(JSON.stringify(facts.location.geometry))
  const created = await createLocalLocation(
    fixture.db,
    'p',
    { state, kind: 'establishment', facts },
    'actor',
  )
  const write = prepareFeatureLocationAssociationWrite(fixture.db, {
    featureId: 'f',
    projectId: 'p',
    actorId: 'actor',
    expectedFeatureModifiedAt: 'original',
    expectedRevision: null,
    locationId: created.locationId,
    factsRevisionId: created.revisionId,
    locationRevisionId: created.revisionId,
    overrides: {},
  })
  await write.query
  return { ...fixture, ...created, associationRevision: write.version }
}

describe('operating state and historical adoption', () => {
  it('appends a status revision, retains every baseline, and does not mutate linked Features', async () => {
    const { db, sqlite, locationId, revisionId } = await linkedFixture()
    const features = sqlite.prepare('SELECT * FROM feature').all()
    const associations = sqlite.prepare('SELECT * FROM featureLocation').all()
    const baseline = sqlite
      .prepare('SELECT * FROM locationRevision WHERE id=?')
      .get(revisionId)
    const saved = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId,
      expectedRevisionId: revisionId,
      organisationId: 'p',
      actorId: 'actor',
      operatingStatus: closure,
    })
    expect(saved).not.toBeNull()
    expect(sqlite.prepare('SELECT * FROM feature').all()).toEqual(features)
    expect(sqlite.prepare('SELECT * FROM featureLocation').all()).toEqual(associations)
    expect(
      sqlite.prepare('SELECT * FROM locationRevision WHERE id=?').get(revisionId),
    ).toEqual(baseline)
    const resource = (
      await listLocationResources(db, { id: locationId, organisationId: 'p' })
    ).data[0]
    expect(resource.facts?.operatingStatus).toEqual(closure)
    expect(resource.facts?.location).toEqual(facts.location)
    expect(
      (await getAcceptedFeatureLocation(db, 'f', 'p'))?.effective.operatingStatus,
    ).toBeUndefined()
    expect(
      await updateLocalLocationAddress(db, {
        locationId,
        expectedRevisionId: revisionId,
        organisationId: 'p',
        actorId: 'actor',
        operatingStatus: 'open',
      }),
    ).toBeNull()
    expect(sqlite.prepare('SELECT count(*) AS n FROM locationRevision').get()?.n).toBe(
      2,
    )
  })

  it('requires explicit review, rejects stale acceptance and publishes only accepted operating status', async () => {
    const { db, locationId, revisionId } = await linkedFixture()
    const saved = (await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId,
      expectedRevisionId: revisionId,
      organisationId: 'p',
      actorId: 'actor',
      operatingStatus: closure,
    }))!
    const review = (await proposeFeatureLocationAdoption(db, {
      featureId: 'f',
      projectId: 'p',
      candidateRevisionId: saved.revisionId,
    }))!
    expect(review.proposal.evidence.plan.decision.facts).toBe('review')
    const accepted = (await getAcceptedFeatureLocation(db, 'f', 'p'))!
    const input = {
      featureId: 'f',
      projectId: 'p',
      proposalId: review.proposal.id,
      fieldGroup: 'facts' as const,
      expectedRevision: accepted.version,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
      reason: 'Verified closure notice',
    }
    expect(
      (await applyLocationAdoptionGroup(db, { ...input, mode: 'automatic' })).status,
    ).toBe('review')
    expect(
      (
        await applyLocationAdoptionGroup(db, {
          ...input,
          mode: 'reviewed',
          expectedRevision: 'stale',
        })
      ).status,
    ).toBe('conflict')
    expect(
      (await applyLocationAdoptionGroup(db, { ...input, mode: 'reviewed' })).status,
    ).toBe('applied')
    expect(
      (await getAcceptedFeatureLocation(db, 'f', 'p'))?.effective.operatingStatus,
    ).toEqual(closure)
    const row = await db.get<{ value: string }>(
      sql`SELECT ${featureLocationLifecycleSQL(false)} AS value FROM feature WHERE id='f'`,
    )
    expect(
      LocationLifecycleSummarySchema.parse(JSON.parse(row.value)).operatingStatus,
    ).toBe('permanently_closed')
    expect(row.value).not.toContain('internal-image-reference')
    expect(Object.keys(JSON.parse(row.value))).toEqual([
      'operatingStatus',
      'buildingStatus',
    ])
    expect(
      (await applyLocationAdoptionGroup(db, { ...input, mode: 'reviewed' })).status,
    ).toBe('conflict')
  })

  it('retains private status behind ownership and paginates filtered historical records correctly', async () => {
    const { db } = setup(true)
    await createLocalLocation(
      db,
      'p',
      {
        state: 'manual',
        kind: 'establishment',
        facts: { ...facts, operatingStatus: closure },
      },
      'actor',
    )
    const building = 'demolished' as const
    await createLocalLocation(
      db,
      'p',
      {
        state: 'unresolved',
        kind: 'building',
        facts: { ...facts, buildingStatus: building },
      },
      'actor',
    )
    const visible = (await listLocationResources(db, {})).data
    expect(visible).toHaveLength(1)
    expect(visible[0].facts?.buildingStatus).toBe('demolished')
    expect(
      (
        await listLocationResources(db, {
          organisationId: 'other',
          lifecycleStatus: 'permanently_closed',
        })
      ).data,
    ).toHaveLength(0)
    expect(
      (
        await listLocationResources(db, {
          organisationId: 'p',
          q: 'Bakery',
          lifecycleStatus: 'permanently_closed',
        })
      ).data,
    ).toHaveLength(1)
    expect(
      (await listLocationResources(db, { organisationId: 'p' })).data,
    ).toHaveLength(2)
    expect(
      (
        await listLocationResources(db, {
          organisationId: 'p',
          lifecycleStatus: 'unknown',
        })
      ).data,
    ).toHaveLength(0)
  })

  it('keeps historical records, associations and evidence when a source refresh omits the entity', async () => {
    const { db, sqlite, binding, locationId, revisionId } = await linkedFixture()
    await updateLocalLocationAddress(db, {
      locationId,
      expectedRevisionId: revisionId,
      organisationId: 'p',
      actorId: 'actor',
      operatingStatus: closure,
    })
    const before = Object.fromEntries(
      [
        'location',
        'locationRevision',
        'feature',
        'featureLocation',
        'featureLocationHistory',
      ].map(table => [table, sqlite.prepare(`SELECT * FROM ${table}`).all()]),
    )
    sqlite
      .prepare(
        "UPDATE locationRefresh SET phase='ready',target='{}',runId='run',lease='owner',leaseUntil=?",
      )
      .run(Date.now() + 60000)
    sqlite
      .prepare(
        "INSERT INTO locationRefreshItem(runId,locationId,ssId,status) VALUES('run',?,'historic-source','missing')",
      )
      .run(locationId)
    expect(
      await processLocationRefresh(binding, {
        runId: 'run',
        lease: 'owner',
        target: {} as never,
      }),
    ).toBe('review')
    for (const [table, rows] of Object.entries(before))
      expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual(rows)
    expect(
      sqlite
        .prepare("SELECT reviewReason FROM locationRefreshItem WHERE runId='run'")
        .get()?.reviewReason,
    ).toBe('source-missing')
  })

  it('keeps source-linked closure corrections over open and missing upstream assertions, and fences correction revisions', async () => {
    const { db, sqlite } = setup(true)
    const source = {
      ssId: 'canonical',
      apiVersion: 'v0.1',
      releaseId: 'release1',
      snapshotId: 'snapshot1',
      facts: {
        ...facts,
        operatingStatus: mapOperatingStatus('open'),
      },
      rawSource: {},
      issues: [],
    }
    const retained = await persistSaanSeoiPlace(db, source as never)
    const saved = (await updateLocalLocationAddress(db, {
      ...retained,
      expectedRevisionId: retained.revisionId,
      expectedOrganisationRevision: null,
      organisationId: 'p',
      actorId: 'actor',
      operatingStatus: closure,
    }))!
    expect(saved.organisationRevision).toBeTruthy()
    expect(
      await updateLocalLocationAddress(db, {
        ...retained,
        expectedRevisionId: retained.revisionId,
        expectedOrganisationRevision: null,
        organisationId: 'p',
        actorId: 'actor',
        operatingStatus: closure,
      }),
    ).toBeNull()
    for (const operatingStatus of [undefined, mapOperatingStatus('open')]) {
      await persistSaanSeoiPlace(db, {
        ...source,
        snapshotId: 'snapshot2',
        rawSource: { marker: operatingStatus ? 'open' : 'omitted' },
        facts: { ...facts, ...(operatingStatus ? { operatingStatus } : {}) },
      } as never)
      const scoped = (
        await listLocationResources(db, {
          id: retained.locationId,
          organisationId: 'p',
          lifecycleStatus: 'permanently_closed',
        })
      ).data[0]
      expect(scoped.facts?.operatingStatus).toEqual(closure)
      const shared = (await listLocationResources(db, { id: retained.locationId }))
        .data[0]
      expect(shared.facts?.operatingStatus).not.toBe('permanently_closed')
    }
    expect(
      JSON.stringify(
        sqlite.prepare('SELECT overrides FROM organisationLocation').all(),
      ),
    ).toContain('permanently_closed')
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('does not apply wrong-kind assertions or private writes from another Organisation', async () => {
    const { db, sqlite, locationId, revisionId } = await linkedFixture('manual')
    const before = sqlite.prepare('SELECT * FROM locationRevision').all()
    expect(
      await updateLocalLocationAddress(db, {
        locationId,
        expectedRevisionId: revisionId,
        organisationId: 'other',
        actorId: 'actor',
        operatingStatus: closure,
      }),
    ).toBeNull()
    await expect(
      updateLocalLocationAddress(db, {
        locationId,
        expectedRevisionId: revisionId,
        organisationId: 'p',
        actorId: 'actor',
        buildingStatus: 'demolished',
      }),
    ).rejects.toThrow('kind')
    expect(sqlite.prepare('SELECT * FROM locationRevision').all()).toEqual(before)
  })
  it('keeps successor edits revisioned, validates scope, and can remove a relation', async () => {
    const { db, sqlite, locationId, revisionId } = await linkedFixture('manual')
    const destination = await createLocalLocation(
      db,
      'p',
      { state: 'manual', kind: 'establishment', facts },
      'actor',
    )
    const hidden = await createLocalLocation(
      db,
      'other',
      { state: 'manual', kind: 'establishment', facts },
      'actor',
    )
    await expect(
      createLocalLocation(
        db,
        'p',
        {
          state: 'manual',
          kind: 'establishment',
          facts: { ...facts, successorLocationId: hidden.locationId },
        },
        'actor',
      ),
    ).rejects.toThrow('unavailable')

    await expect(
      createLocalLocation(
        db,
        'p',
        {
          state: 'unresolved',
          kind: 'establishment',
          facts: { ...facts, successorLocationId: destination.locationId },
        },
        'actor',
      ),
    ).rejects.toThrow('unavailable')
    const input = {
      locationId,
      expectedRevisionId: revisionId,
      organisationId: 'p',
      actorId: 'actor',
    }
    await expect(
      updateLocalLocationAddress(db, { ...input, successorLocationId: locationId }),
    ).rejects.toThrow('itself')
    await expect(
      updateLocalLocationAddress(db, {
        ...input,
        successorLocationId: hidden.locationId,
      }),
    ).rejects.toThrow('unavailable')
    await expect(
      updateLocalLocationAddress(db, { ...input, successorLocationId: 'missing' }),
    ).rejects.toThrow('unavailable')
    const saved = (await updateLocalLocationAddress(db, {
      ...input,
      successorLocationId: destination.locationId,
    }))!
    expect(
      (await listLocationResources(db, { id: locationId, organisationId: 'p' })).data[0]
        .facts?.successorLocationId,
    ).toBe(destination.locationId)
    expect(
      await updateLocalLocationAddress(db, { ...input, successorLocationId: null }),
    ).toBeNull()
    const removed = await updateLocalLocationAddress(db, {
      ...input,
      expectedRevisionId: saved.revisionId,
      expectedOrganisationRevision: saved.organisationRevision,
      successorLocationId: null,
    })
    expect(removed).toBeTruthy()
    expect(
      (await listLocationResources(db, { id: locationId, organisationId: 'p' })).data[0]
        .facts?.successorLocationId,
    ).toBeNull()
    expect(
      sqlite.prepare('SELECT * FROM locationRevision WHERE id=?').get(revisionId),
    ).toBeTruthy()
    expect(sqlite.prepare('SELECT * FROM featureLocation').all()).toHaveLength(1)
  })
  it('filters an explicit unknown correction as unknown instead of falling back to an open source', async () => {
    const { db } = setup(true)
    const retained = await persistSaanSeoiPlace(db, {
      ssId: 'unknown-filter',
      apiVersion: 'v0.1',
      releaseId: 'release1',
      snapshotId: 'snapshot1',
      facts: { ...facts, operatingStatus: 'open' },
      rawSource: {},
      issues: [],
    } as never)
    await updateLocalLocationAddress(db, {
      locationId: retained.locationId,
      expectedRevisionId: retained.revisionId,
      expectedOrganisationRevision: null,
      organisationId: 'p',
      actorId: 'actor',
      operatingStatus: null,
    })
    expect(
      (
        await listLocationResources(db, {
          id: retained.locationId,
          organisationId: 'p',
          lifecycleStatus: 'unknown',
        })
      ).data,
    ).toHaveLength(1)
    expect(
      (
        await listLocationResources(db, {
          id: retained.locationId,
          organisationId: 'p',
          lifecycleStatus: 'open',
        })
      ).data,
    ).toHaveLength(0)
    expect(
      (
        await listLocationResources(db, {
          id: retained.locationId,
          lifecycleStatus: 'open',
        })
      ).data,
    ).toHaveLength(1)
  })

  it('reads migrated legacy status and names alongside newer snapshots', async () => {
    const { db, sqlite, locationId, revisionId, associationRevision } =
      await linkedFixture()
    // Preserve the original flat evidence while writing its migrated content through the current contract.
    const legacyFacts = { ...facts, operatingStatus: closure }
    const migratedFacts = readLocationFacts(legacyFacts)
    expect(migratedFacts.operatingStatus).toBe(closure)
    sqlite
      .prepare(`INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts)
      SELECT 'legacy-operating',locationId,version+1,'local','legacy-operating',?,?
      FROM locationRevision WHERE id=?`)
      .run(
        JSON.stringify(legacyFacts),
        serializeLocationFacts(migratedFacts, 'establishment'),
        revisionId,
      )
    expect(
      JSON.parse(
        (
          sqlite
            .prepare(
              "SELECT rawSource FROM locationRevision WHERE id='legacy-operating'",
            )
            .get() as { rawSource: string }
        ).rawSource,
      ),
    ).toEqual(legacyFacts)
    const adoption = prepareFeatureLocationAssociationWrite(db, {
      featureId: 'f',
      projectId: 'p',
      actorId: 'actor',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: associationRevision,
      locationId,
      factsRevisionId: 'legacy-operating',
      locationRevisionId: 'legacy-operating',
      overrides: {},
    })
    await adoption.query
    const row = await db.get<{ value: string }>(
      sql`SELECT ${featureLocationLifecycleSQL(false)} AS value FROM feature WHERE id='f'`,
    )
    expect(
      LocationLifecycleSummarySchema.parse(JSON.parse(row.value)).operatingStatus,
    ).toBe(closure)
    const matches = await listLocationResources(db, {
      id: locationId,
      organisationId: 'p',
      q: 'Bakery',
      lifecycleStatus: closure,
    })
    expect(matches.data).toHaveLength(1)
    expect(matches.data[0].facts?.operatingStatus).toBe(closure)
  })

  it('rejects an edit if its successor becomes private between validation and the write batch', async () => {
    const { db, sqlite, locationId, revisionId } = await linkedFixture()
    const successor = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', kind: 'establishment', facts },
      'actor',
    )
    const before = sqlite.prepare('SELECT * FROM locationRevision ORDER BY id').all()
    const batch = db.batch.bind(db)
    vi.spyOn(db, 'batch').mockImplementationOnce(async queries => {
      sqlite
        .prepare("UPDATE location SET state='manual' WHERE id=?")
        .run(successor.locationId)
      return batch(queries)
    })
    expect(
      await updateLocalLocationAddress(db, {
        locationId,
        expectedRevisionId: revisionId,
        organisationId: 'p',
        actorId: 'actor',
        operatingStatus: 'permanently_closed',
        successorLocationId: successor.locationId,
      }),
    ).toBeNull()
    expect(sqlite.prepare('SELECT * FROM locationRevision ORDER BY id').all()).toEqual(
      before,
    )
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.factsRevisionId).toBe(
      revisionId,
    )
  })

  it('creates neither an identity nor a baseline if the successor becomes private during creation', async () => {
    const { db, sqlite } = setup(true)
    const successor = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', kind: 'establishment', facts },
      'actor',
    )
    const before = sqlite.prepare('SELECT * FROM locationRevision ORDER BY id').all()
    const batch = db.batch.bind(db)
    vi.spyOn(db, 'batch').mockImplementationOnce(async queries => {
      sqlite
        .prepare(
          "UPDATE location SET state='manual',ownerOrganisationId='other' WHERE id=?",
        )
        .run(successor.locationId)
      return batch(queries)
    })
    await expect(
      createLocalLocation(
        db,
        'p',
        {
          state: 'unresolved',
          kind: 'establishment',
          facts: { ...facts, successorLocationId: successor.locationId },
        },
        'actor',
      ),
    ).rejects.toThrow('unavailable')
    expect(sqlite.prepare('SELECT count(*) AS n FROM location').get()?.n).toBe(1)
    expect(sqlite.prepare('SELECT * FROM locationRevision ORDER BY id').all()).toEqual(
      before,
    )
  })

  it('keeps a repeated unchanged status save idempotent with absent optional fields', async () => {
    const { db, sqlite, locationId, revisionId } = await linkedFixture()
    const input = {
      locationId,
      expectedRevisionId: revisionId,
      organisationId: 'p',
      actorId: 'actor',
      operatingStatus: 'permanently_closed' as const,
    }
    const saved = await updateLocalLocationAddress(db, input)
    expect(saved).toBeTruthy()
    if (!saved) throw new Error('Expected saved status')
    const before = sqlite.prepare('SELECT * FROM locationRevision ORDER BY id').all()
    expect(
      await updateLocalLocationAddress(db, {
        ...input,
        expectedRevisionId: saved.revisionId,
        expectedOrganisationRevision: saved.organisationRevision,
      }),
    ).toEqual(saved)
    expect(sqlite.prepare('SELECT * FROM locationRevision ORDER BY id').all()).toEqual(
      before,
    )
  })
})

describe('Location directory index filters', () => {
  it('narrows organisation results to owned or currently associated Locations', async () => {
    const { db, sqlite, locationId } = await linkedFixture()
    // Prove association membership independently of who authored the shared record.
    sqlite
      .prepare("UPDATE location SET ownerOrganisationId='other' WHERE id=?")
      .run(locationId)
    const owned = await createLocalLocation(
      db,
      'p',
      {
        state: 'manual',
        kind: 'building',
        facts: { ...facts, buildingStatus: 'standing' },
      },
      'actor',
    )
    const unrelated = await createLocalLocation(
      db,
      'other',
      {
        state: 'unresolved',
        kind: 'building',
        facts: { ...facts, buildingStatus: 'demolished' },
      },
      'actor',
    )
    const result = await listLocationResources(db, {
      organisationId: 'p',
      restrictToOrganisation: true,
    })
    expect(result.data.map(row => row.id).sort()).toEqual(
      [locationId, owned.locationId].sort(),
    )
    expect(result.data.some(row => row.id === unrelated.locationId)).toBe(false)
    // Detail reads still permit shared identities outside the selected index subset.
    expect(
      (
        await listLocationResources(db, {
          id: unrelated.locationId,
          organisationId: 'p',
        })
      ).data,
    ).toHaveLength(1)
    expect(
      (
        await listLocationResources(db, {
          organisationId: 'p',
          restrictToOrganisation: true,
          kind: 'building',
          lifecycleStatus: 'demolished',
        })
      ).data,
    ).toEqual([])
  })

  it('applies kind and lifecycle before pagination, retaining the filters on subsequent pages', async () => {
    const { db } = setup(true)
    for (let index = 0; index < 28; index++) {
      await createLocalLocation(
        db,
        'p',
        {
          state: 'unresolved',
          kind: 'building',
          facts: { ...facts, buildingStatus: index < 2 ? 'standing' : 'demolished' },
        },
        'actor',
      )
    }
    const filters = { kind: 'building', lifecycleStatus: 'demolished' } as const
    const first = await listLocationResources(db, { ...filters, includeCount: true })
    expect(first.totalCount).toBe(26)
    expect(first.data).toHaveLength(25)
    expect(
      first.data.every(
        row => row.kind === 'building' && row.facts?.buildingStatus === 'demolished',
      ),
    ).toBe(true)
    const second = await listLocationResources(db, {
      ...filters,
      after: first.nextCursor!,
      includeCount: true,
    })
    expect(second.totalCount).toBe(26)
    expect(second.data).toHaveLength(1)
    expect(second.nextCursor).toBeNull()
    expect(new Set([...first.data, ...second.data].map(row => row.id)).size).toBe(26)
    expect(
      (
        await listLocationResources(db, {
          kind: 'establishment',
          lifecycleStatus: 'demolished',
        })
      ).data,
    ).toEqual([])
  })
})
