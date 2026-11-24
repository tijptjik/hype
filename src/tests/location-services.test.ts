import {
  readLocationCorrectionContext,
  applyLocationCorrection,
  proposeLocationCorrection,
  decideLocationCorrection,
} from '#lib/db/services/locationCorrectionReview.js'
import {
  rejectLocationIdentityReview,
  rejectedFeatureLocationSourceIds,
} from '#lib/db/services/locationIdentityRejection.js'
import { listLocationResources } from '#lib/db/services/locationDirectory.js'
import {
  readLocationFacts,
  serializeLocationFacts,
  LocationFactsSnapshotSchema,
} from '#lib/locations/factsSnapshot.js'
// @vitest-environment node
import { FeatureListProfileAPI } from '#lib/db/zod/schema/feature.js'
import { feature as featureTable } from '#lib/db/schema/feature.js'
import { featureLocationBrandsSQL } from '#lib/db/services/locationBrandProjection.js'
import { DatabaseSync } from 'node:sqlite'
import { sql } from 'drizzle-orm'
import { processLocationRefresh } from '#lib/db/services/locationRefreshProcess.js'
import { readLocationPublicationMetadata } from '#lib/locations/publication.js'
import { adoptRefreshedLocationForFeature } from '#lib/db/services/locationRefreshAdoption.js'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import {
  getAcceptedFeatureLocation,
  getProjectLocationSettings,
  saveProjectLocationSettings,
} from '#lib/db/services/location.js'
import { updateProjectByIdWithConcurrency } from '#lib/db/services/project.js'
import {
  resolveLocationCandidate,
  persistLocationCandidate,
  searchLocalLocationCandidates,
  nearbyLocalLocationCandidates,
} from '#lib/db/services/locationCandidate.js'
import {
  readLocationIdentityBaseline,
  captureLocationIdentityReview,
  captureMirroredLocationIdentityReview,
  readLocationIdentityReview,
  acceptLocationIdentityReview,
} from '#lib/db/services/locationIdentityReview.js'
import {
  captureLocationMergeReview,
  probeLocationMergeSource,
  probeLocationMergeReview,
  readLocationMergeReview,
  applyLocationMergeReview,
} from '#lib/db/services/locationMerge.js'
import { resolveLocationRedirect } from '#lib/db/services/locationRedirect.js'
import { acceptLocationIdentity } from '#lib/db/services/locationIdentity.js'
import {
  persistSaanSeoiPlace,
  persistForwardSaanSeoiPlace,
} from '#lib/db/services/locationSource.js'
import type { SaanSeoiPlaceProjection } from '#lib/locations/saanseoi.js'
import { prepareFeatureLocationAssociationWrite } from '#lib/db/services/locationAssociation.js'
import {
  prepareFeatureFormRelations,
  prepareFeatureLocationRelations,
} from '#lib/db/services/locationRelations.js'
import {
  createFeatureForm,
  saveUnlinkedFeatureForm,
} from '#lib/db/services/featureFormSave.js'
import { saveLinkedFeatureForm } from '#lib/db/services/locationEdit.js'
import { readFeatureLocationBaseline } from '#lib/db/services/locationBaseline.js'
import { applyUnresolvedFeatureSplit } from '#lib/db/services/locationSplit.js'
import { planUnresolvedFeatureSplit } from '#lib/locations/migrationPlan.js'
import {
  listLocationAdoptionReviews,
  proposeFeatureLocationAdoption,
  proposeLatestLocalLocationAdoption,
  readLocationAdoptionReview,
  rejectLocationAdoptionGroup,
} from '#lib/db/services/locationAdoptionReview.js'
import { applyLocationAdoptionGroup } from '#lib/db/services/locationAdoptionApply.js'
import { previewFeatureLocationAdoption } from '#lib/db/services/locationAdoption.js'
import { getDetachedFeatureBrands } from '#lib/db/services/locationDetached.js'
import { unlinkFeatureLocation } from '#lib/db/services/locationUnlink.js'
import { relinkFeatureLocation } from '#lib/db/services/locationRelink.js'
import { linkInitialFeatureLocation } from '#lib/db/services/locationLink.js'
import {
  createLocalLocation,
  updateLocalLocationAddress,
} from '#lib/db/services/locationLocal.js'
import { LocalLocationInputSchema } from '#lib/locations/local.js'
import { ProjectLocationPolicyFormData } from '#lib/db/zod/schema/project.js'
import { DEFAULT_PROJECT_LOCATION_POLICY } from '#lib/locations/model.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { parseAddressContent } from '@saanseoi/address'
import {
  authorizeFeatureUpdateForSubmission,
  authorizeProjectUpdateForSubmission,
} from '#lib/api/services/authz/index.js'
import type { Database, UserRoleDisco } from '#lib/types.js'
import type { D1Database } from '@cloudflare/workers-types'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const db of stores.splice(0)) db.close()
})

function setup(
  includeScope = false,
  includeAddressKind = true,
  includeLifecycle = true,
) {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE organisation(id TEXT PRIMARY KEY,settings TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE organisationI18n(organisationId TEXT,locale TEXT,name TEXT,nameShort TEXT);
    INSERT INTO organisation(id) VALUES ('p'),('other');
    CREATE TABLE project(id TEXT PRIMARY KEY, modifiedAt TEXT DEFAULT 'original',
      organisationId TEXT, code TEXT, capabilities TEXT, markerStyleCode TEXT,
      cardStyleCode TEXT, useAllInOrgContext INTEGER);
    CREATE TABLE feature(id TEXT PRIMARY KEY, featureType TEXT, nameTemplate TEXT, kind TEXT, targetContext TEXT, associationRelation TEXT, layerId TEXT, projectId TEXT, isDraft INTEGER DEFAULT 0, isArchived INTEGER DEFAULT 0, modifiedAt TEXT DEFAULT 'original', geometry TEXT, addressMeta TEXT, isIntangible INTEGER DEFAULT 0);
    CREATE TABLE featureI18n(featureId TEXT,locale TEXT,baseName TEXT,nameOverride TEXT,title TEXT,displayAddress TEXT);
    CREATE VIEW featureComputedName AS SELECT featureId,locale,coalesce(nameOverride,baseName,title) AS title FROM featureI18n;
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
  if (includeLifecycle) {
    sqlite.exec(relationships.slice(relationships.indexOf('CREATE TABLE address (')))
    sqlite.exec(readFileSync('migrations/0149_location_correction_rows.sql', 'utf8'))
    sqlite.exec(
      readFileSync('migrations/0150_location_placement_candidates.sql', 'utf8'),
    )
    sqlite.exec(
      readFileSync('migrations/0151_location_placement_acceptance.sql', 'utf8'),
    )
    sqlite.exec(
      readFileSync('migrations/0153_location_relationship_review.sql', 'utf8'),
    )
  }
  sqlite.exec(readFileSync('migrations/0154_location_version_names.sql', 'utf8'))
  if (includeAddressKind)
    sqlite.exec(readFileSync('migrations/0157_location_rematching.sql', 'utf8'))
  // Current service writes require the taxonomy schema; historical migration cases opt out.
  if (includeLifecycle) {
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
    // Install the Location portions of the translation migrations before exercising current services.
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
    for (const name of [
      '0250_location_canonical_drafts',
      '0252_location_mutable_drafts',
      '0253_location_operator',
      '0254_location_premises_map',
      '0255_premises_map_releases',
      '0256_premises_map_draft_history',
      '0257_premises_map_correction',
    ])
      sqlite.exec(readFileSync('migrations/' + name + '.sql', 'utf8'))
  }
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

describe('project Location settings persistence', () => {
  it('defaults to review and rejects stale initial and subsequent saves', async () => {
    const { db } = setup()
    expect(await getProjectLocationSettings(db, 'p')).toEqual({
      policy: DEFAULT_PROJECT_LOCATION_POLICY,
      revision: 0,
    })
    const automatic = {
      ...DEFAULT_PROJECT_LOCATION_POLICY,
      coordinates: { mode: 'follow' },
      discoveryRadiusMetres: 500,
    }
    expect(await saveProjectLocationSettings(db, 'p', automatic, 0)).toMatchObject({
      revision: 1,
    })
    expect(
      (await getProjectLocationSettings(db, 'p')).policy.discoveryRadiusMetres,
    ).toBe(500)
    expect(
      await saveProjectLocationSettings(db, 'p', DEFAULT_PROJECT_LOCATION_POLICY, 0),
    ).toBeNull()
    expect(
      await saveProjectLocationSettings(db, 'p', DEFAULT_PROJECT_LOCATION_POLICY, 1),
    ).toMatchObject({ revision: 2 })
    expect(await saveProjectLocationSettings(db, 'p', automatic, 1)).toBeNull()
    expect(await getProjectLocationSettings(db, 'other')).toMatchObject({ revision: 0 })
  })
  it.each([
    ['maintainer', 'p', false, true],
    ['owner', 'p', false, true],
    ['translator', 'p', false, false],
    ['member', 'p', false, false],
    ['maintainer', 'other', false, false],
    ['owner', 'p', true, false],
  ])('authorizes %s on %s anonymous=%s', (role, projectId, isAnonymous, allowed) => {
    const decision = authorizeProjectUpdateForSubmission({
      user: { id: 'u', isAnonymous: isAnonymous as boolean },
      userRoles: [{ type: 'project', role, projectId, userId: 'u' } as UserRoleDisco],
      resource: { id: 'p', organisationId: 'org', hubId: 'hub' },
      submittedData: { locationUpdatePolicy: true },
    })
    expect(decision.allowed).toBe(allowed)
  })
})

describe('accepted Location reads', () => {
  it('uses accepted revisions, preserves overrides, and prevents private cross-project reads', async () => {
    const { sqlite, db } = setup()
    sqlite.exec(
      "INSERT INTO location(id,state,ownerOrganisationId) VALUES ('location','unresolved','p')",
    )
    for (const [id, version, value] of [
      ['old', 1, facts],
      [
        'new',
        2,
        {
          ...facts,
          names: { en: 'New bakery' },
          location: {
            ...facts.location,
            geometry: { type: 'Point', coordinates: [114.18, 22.3] },
          },
        },
      ],
    ] as const) {
      sqlite
        .prepare(
          "INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts) VALUES (?,'location',?,'local','hash',?,?)",
        )
        .run(
          id,
          version,
          JSON.stringify({ privateEvidence: 'secret' }),
          serializeLocationFacts(LocationFactsSchema.parse(value), 'establishment'),
        )
    }
    sqlite
      .prepare(
        'INSERT INTO featureLocation(featureId,locationId,factsRevisionId,locationRevisionId,acceptedOverrides) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        'f',
        'location',
        'new',
        'old',
        JSON.stringify({ phoneNumber: { mode: 'clear' } }),
      )
    const result = await getAcceptedFeatureLocation(db, 'f', 'p')
    expect(result?.effective.names.en).toBe('New bakery')
    expect(result?.effective.location).toEqual(facts.location)
    expect(result?.effective.phoneNumber).toBeNull()
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(await getAcceptedFeatureLocation(db, 'f', 'other')).toBeNull()
    sqlite.exec("UPDATE location SET ownerOrganisationId='other',state='manual'")
    expect(await getAcceptedFeatureLocation(db, 'f', 'p')).toBeNull()
    sqlite.exec(
      "UPDATE location SET ownerOrganisationId='p'; UPDATE feature SET isDraft=1",
    )
    expect(await getAcceptedFeatureLocation(db, 'f', 'p')).toBeNull()
  })
  it('rejects invalid geometry and unpinned resolved addresses', () => {
    expect(
      LocationFactsSchema.safeParse({
        ...facts,
        location: {
          ...facts.location,
          geometry: { type: 'Point', coordinates: [181, 22] },
        },
      }).success,
    ).toBe(false)
    expect(
      LocationFactsSchema.safeParse({
        ...facts,
        location: {
          ...facts.location,
          address: { ...facts.location.address, status: 'resolved', address2dId: 'a' },
        },
      }).success,
    ).toBe(false)
  })
})

describe('local Location creation', () => {
  it('persists sharing consent and its author without changing matching state or ownership', async () => {
    const { sqlite, db } = setup()
    const created = await createLocalLocation(
      db,
      'p',
      {
        state: 'unresolved',
        sharingPreference: 'allow-sharing',
        facts,
      },
      'author',
    )
    const row = sqlite
      .prepare('SELECT rawSource FROM locationRevision WHERE id=?')
      .get(created.revisionId)!
    expect(JSON.parse(row.rawSource as string)).toMatchObject({
      actorId: 'author',
      organisationId: 'p',
      input: { state: 'unresolved', sharingPreference: 'allow-sharing' },
    })
    expect(
      sqlite
        .prepare('SELECT ownerOrganisationId,state FROM location WHERE id=?')
        .get(created.locationId),
    ).toEqual({ ownerOrganisationId: 'p', state: 'unresolved' })
  })
  it.each(['manual', 'unresolved'] as const)(
    'creates a private %s identity with immutable provenance',
    async state => {
      const { sqlite, db } = setup()
      const created = await createLocalLocation(
        db,
        'p',
        { state, facts: { ...facts, phoneNumber: ['2345 6789', '91234567'] } },
        'author',
      )
      expect(
        sqlite
          .prepare('SELECT state,ownerOrganisationId,ssId FROM location WHERE id=?')
          .get(created.locationId),
      ).toEqual({ state, ownerOrganisationId: 'p', ssId: null })
      const revision = sqlite
        .prepare(
          'SELECT facts,rawSource,origin,contentHash FROM locationRevisionContent WHERE id=?',
        )
        .get(created.revisionId)
      if (!revision) throw new Error('Missing local baseline')
      const snapshot = LocationFactsSnapshotSchema.parse(
        JSON.parse(revision.facts as string),
      )
      expect(snapshot.schemaVersion).toBe(1)
      expect(snapshot.kind).toBe('establishment')
      expect(snapshot.i18n).toMatchObject(
        Object.fromEntries(
          Object.entries(facts.names).map(([locale, name]) => [locale, { name }]),
        ),
      )
      expect(readLocationFacts(revision.facts).phoneNumber).toEqual([
        '+85223456789',
        '+85291234567',
      ])
      expect(JSON.parse(revision.rawSource as string).actorId).toBe('author')
      expect(revision.origin).toBe('local')
      expect(revision.contentHash).toMatch(/^[a-f0-9]{64}$/)
      expect(
        sqlite.prepare('SELECT count(*) AS count FROM featureLocation').get()?.count,
      ).toBe(0)
    },
  )
  it('rolls back the identity if its baseline cannot be stored', async () => {
    const { sqlite, db } = setup()
    sqlite.exec(
      "CREATE TRIGGER fail_baseline BEFORE INSERT ON locationRevision BEGIN SELECT RAISE(ABORT,'test failure'); END",
    )
    await expect(
      createLocalLocation(db, 'p', { state: 'manual', facts }, 'author'),
    ).rejects.toThrow()
    expect(sqlite.prepare('SELECT count(*) AS count FROM location').get()?.count).toBe(
      0,
    )
  })
  it('rejects invalid phones and unverified canonical addresses', () => {
    expect(
      LocalLocationInputSchema.safeParse({
        state: 'manual',
        facts: { ...facts, phoneNumber: ['bad'] },
      }).success,
    ).toBe(false)
    expect(
      LocalLocationInputSchema.safeParse({
        state: 'manual',
        facts: {
          ...facts,
          location: {
            ...facts.location,
            address: {
              ...facts.location.address,
              address2dId: 'claimed-source-address',
            },
          },
        },
      }).success,
    ).toBe(false)
  })
})

describe('Project form atomic Location settings', () => {
  const data = {
    organisationId: 'p',
    code: 'updated',
    capabilities: {
      manageBakeries: false,
      manageVolunteers: false,
      manageDropOffs: false,
    },
    markerStyleCode: null,
    cardStyleCode: 'full',
    useAllInOrgContext: false,
  } as Parameters<typeof updateProjectByIdWithConcurrency>[1]['data']

  it('saves core and first policy together, then rejects either stale revision', async () => {
    const { db, sqlite } = setup()
    const saved = await updateProjectByIdWithConcurrency(db, {
      id: 'p',
      updatedAt: 'original',
      data,
      locationUpdatePolicy: {
        policy: DEFAULT_PROJECT_LOCATION_POLICY,
        expectedRevision: 0,
      },
    })
    expect(saved).not.toBeNull()
    if (!saved) throw new Error('Expected saved Project')
    expect((await getProjectLocationSettings(db, 'p')).revision).toBe(1)
    for (const [updatedAt, expectedRevision] of [
      ['original', 1],
      [saved.modifiedAt, 0],
    ] as const) {
      expect(
        await updateProjectByIdWithConcurrency(db, {
          id: 'p',
          updatedAt,
          data: { ...data, code: 'must-not-save' },
          locationUpdatePolicy: {
            policy: DEFAULT_PROJECT_LOCATION_POLICY,
            expectedRevision,
          },
        }),
      ).toBeNull()
      expect(sqlite.prepare('SELECT code FROM project WHERE id=?').get('p')?.code).toBe(
        'updated',
      )
      expect((await getProjectLocationSettings(db, 'p')).revision).toBe(1)
    }
    expect(
      await updateProjectByIdWithConcurrency(db, {
        id: 'p',
        updatedAt: saved.modifiedAt,
        data,
        locationUpdatePolicy: {
          policy: DEFAULT_PROJECT_LOCATION_POLICY,
          expectedRevision: 1,
        },
      }),
    ).not.toBeNull()
    expect((await getProjectLocationSettings(db, 'p')).revision).toBe(2)
  })

  it('rolls back core changes if the policy write fails', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(
      "CREATE TRIGGER fail_policy BEFORE UPDATE OF locationPolicy ON project BEGIN SELECT RAISE(ABORT, 'policy failure'); END;",
    )
    await expect(
      updateProjectByIdWithConcurrency(db, {
        id: 'p',
        updatedAt: 'original',
        data,
        locationUpdatePolicy: {
          policy: DEFAULT_PROJECT_LOCATION_POLICY,
          expectedRevision: 0,
        },
      }),
    ).rejects.toThrow()
    expect(
      sqlite.prepare('SELECT modifiedAt,code FROM project WHERE id=?').get('p'),
    ).toMatchObject({
      modifiedAt: 'original',
      code: null,
    })
    expect((await getProjectLocationSettings(db, 'p')).revision).toBe(0)
  })
})

describe('Project Locations form transport', () => {
  it('accepts serialized policy drafts and rejects incomplete or invalid settings', () => {
    const draft = { policy: DEFAULT_PROJECT_LOCATION_POLICY, expectedRevision: 0 }
    expect(ProjectLocationPolicyFormData.parse(JSON.stringify(draft))).toEqual(draft)
    expect(ProjectLocationPolicyFormData.parse(undefined)).toBeUndefined()
    expect(ProjectLocationPolicyFormData.safeParse('{invalid').success).toBe(false)
    expect(
      ProjectLocationPolicyFormData.safeParse({
        ...draft,
        policy: { ...draft.policy, coordinates: { mode: 'withinDistance' } },
      }).success,
    ).toBe(false)
    expect(
      ProjectLocationPolicyFormData.safeParse({ ...draft, expectedRevision: -1 })
        .success,
    ).toBe(false)
  })
})

describe('immutable SaanSeoi Place ingestion', () => {
  const projection = (): SaanSeoiPlaceProjection => ({
    ssId: 'canonical-shop',
    apiVersion: 'api-places-v0.1',
    releaseId: 'release',
    snapshotId: 'snapshot',
    facts: LocationFactsSchema.parse(facts),
    issues: [],
    rawSource: {
      resource: { id: 'canonical-shop', sources: ['retained-attribution'] },
      meta: { apiReleaseSet: 'pinned-release' },
    },
  })

  it('accepts Location identity without waiting for a canonical address and retains local display', async () => {
    const { db, sqlite } = setup()
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts },
      'creator',
    )
    const baseline = await readLocationIdentityBaseline(db, local.locationId, 'p')
    if (!baseline) throw new Error('Missing baseline')
    const accepted = await acceptLocationIdentity(
      db,
      { ...baseline, actorId: 'reviewer', reason: 'Verified establishment' },
      projection(),
    )
    expect(accepted.status).toBe('applied')
    const latest = sqlite
      .prepare(
        'SELECT facts,rawSource FROM locationRevisionContent WHERE locationId=? ORDER BY version DESC LIMIT 1',
      )
      .get(local.locationId)!
    const address = readLocationFacts(latest.facts).location.address
    expect(address).toEqual(projection().facts.location.address)
    expect(address.authored).toBeUndefined()
    expect(address.address2dId).toBeNull()
    expect(JSON.parse(latest.rawSource as string).localAddress).toBeUndefined()
    expect(
      sqlite.prepare('SELECT ssId FROM location WHERE id=?').get(local.locationId)
        ?.ssId,
    ).toBe('canonical-shop')
  })

  it('fences a late revision race inside the identity batch without leaving a new revision or history', async () => {
    const { db, sqlite } = setup()
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'creator',
    )
    const baseline = await readLocationIdentityBaseline(db, local.locationId, 'p')
    if (!baseline) throw new Error('Missing baseline')
    const reviewId = await captureLocationIdentityReview(
      db,
      baseline,
      projection(),
      'reviewer',
    )
    if (!reviewId) throw new Error('Missing review')
    db.batch = new Proxy(db.batch, {
      apply(target, receiver, args) {
        sqlite
          .prepare(`INSERT INTO locationRevisionContent
        SELECT 'race-revision',locationId,version+1,origin,ssId,apiVersion,releaseId,snapshotId,
          contentHash,rawSource,facts,createdAt FROM locationRevisionContent WHERE id=?`)
          .run(local.revisionId)
        return Reflect.apply(target, receiver, args)
      },
    })
    expect(
      await acceptLocationIdentityReview(db, {
        locationId: local.locationId,
        ownerOrganisationId: 'p',
        reviewId,
        actorId: 'reviewer',
        reason: 'Reviewed before the concurrent change',
      }),
    ).toEqual({ status: 'conflict' })
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(2)
    expect(
      sqlite.prepare('SELECT count(*) n FROM locationIdentityHistory').get()?.n,
    ).toBe(0)
    expect(sqlite.prepare('SELECT state,ssId FROM location').get()).toEqual({
      state: 'manual',
      ssId: null,
    })
  })

  /** Arrange two Locations with independent accepted groups and explicit Feature corrections. */
  async function mergeFixture() {
    const { db, sqlite } = setup(true)
    const target = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts },
      'creator',
    )
    const source = await persistSaanSeoiPlace(db, projection())
    const newer = await persistSaanSeoiPlace(db, {
      ...projection(),
      facts: {
        ...projection().facts,
        names: { en: 'Newer source' },
        location: {
          ...projection().facts.location,
          geometry: { type: 'Point', coordinates: [114.18, 22.31] },
        },
      },
    })
    sqlite.exec("INSERT INTO feature(id,projectId) VALUES('g','p')")
    const associate =
      sqlite.prepare(`INSERT INTO featureLocation(featureId,locationId,factsRevisionId,locationRevisionId,acceptedOverrides)
      VALUES(?,?,?,?,?)`)
    associate.run(
      'f',
      target.locationId,
      target.revisionId,
      target.revisionId,
      JSON.stringify({
        names: { en: { mode: 'override', value: 'Target correction' } },
      }),
    )
    associate.run(
      'g',
      source.locationId,
      source.revisionId,
      newer.revisionId,
      JSON.stringify({
        names: { en: { mode: 'override', value: 'Source correction' } },
      }),
    )
    const baseline = await readLocationIdentityBaseline(db, target.locationId, 'p')
    if (!baseline) throw new Error('Missing baseline')
    const identityReviewId = await captureMirroredLocationIdentityReview(
      db,
      baseline,
      source.revisionId,
      'reviewer',
    )
    if (!identityReviewId) throw new Error('Missing identity review')
    const captured = await captureLocationMergeReview(db, {
      locationId: target.locationId,
      identityReviewId,
      ownerOrganisationId: 'p',
      sourceLocationId: source.locationId,
      sourceOwnerOrganisationId: null,
      actorId: 'reviewer',
    })
    if (captured.status !== 'ready')
      throw new Error('Missing merge review: ' + captured.status)
    return {
      db,
      sqlite,
      target,
      source,
      newer,
      identityReviewId,
      captured,
      input: {
        locationId: target.locationId,
        sourceLocationId: source.locationId,
        ownerOrganisationId: 'p',
        sourceOwnerOrganisationId: null,
        reviewId: captured.reviewId,
        actorId: 'reviewer',
        reason: 'Verified same shop and premises',
      },
    }
  }

  it('records merged Location bindings in Feature history and rolls the identity merge back on receipt failure', async () => {
    const f = await mergeFixture()
    const { getTableColumns, getTableName } = await import('drizzle-orm')
    const schema = await import('#lib/db/schema/index.js')
    const { readFeatureRevisionSource } = await import(
      '#lib/db/services/featureRevisionSource.js'
    )
    const { buildFeatureRevisionBaselineContent } = await import(
      '#lib/db/services/featureRevisionContent.js'
    )
    const { initializeFeatureRevision } = await import(
      '#lib/db/services/featureRevision.js'
    )
    // Extend the real Location-trigger fixture with the current Feature content contract.
    for (const table of [
      schema.feature,
      schema.featureI18n,
      schema.featurePropertyI18n,
      schema.image,
      schema.featureImage,
      schema.property,
      schema.propertyI18n,
      schema.propertyValue,
      schema.propertyValueI18n,
      schema.featureLocationMembership,
    ]) {
      const name = getTableName(table)
      const existing = new Set(
        f.sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map(row => row.name),
      )
      if (!existing.size)
        f.sqlite.exec(
          `CREATE TABLE ${name} (${Object.values(getTableColumns(table))
            .map(
              column =>
                `"${column.name}" ${column.getSQLType()}${column.name === 'id' ? ' PRIMARY KEY' : ''}`,
            )
            .join(',')})`,
        )
      else
        for (const column of Object.values(getTableColumns(table)))
          if (!existing.has(column.name))
            f.sqlite.exec(
              `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
            )
    }
    f.sqlite.exec(`UPDATE feature SET organisationId='p',layerId='l',isPublished=1,localIsPublished=1,isVisitable=0,
      geometry='{"type":"Point","coordinates":[114,22]}',addressMeta='{}';`)
    f.sqlite.exec(readFileSync('migrations/0171_feature_revisions.sql', 'utf8'))
    f.sqlite.exec(readFileSync('migrations/0172_image_revisions.sql', 'utf8'))
    const captured = (await readFeatureRevisionSource(f.db, 'g', sql`1`))!
    const content = buildFeatureRevisionBaselineContent(captured.snapshot, {
      revisions: {},
      order: [],
    })
    const baseline = await initializeFeatureRevision(f.db, {
      featureId: 'g',
      actorId: 'baseline',
      guard: captured.unchanged,
      content,
      published: true,
    })
    f.sqlite.exec(
      "CREATE TRIGGER fail_merge_revision BEFORE INSERT ON featureRevisionPublication WHEN NEW.generation>0 BEGIN SELECT RAISE(ABORT,'merge receipt failed'); END",
    )
    await expect(applyLocationMergeReview(f.db, f.input)).rejects.toThrow()
    expect(
      f.sqlite
        .prepare('SELECT redirectTargetId FROM location WHERE id=?')
        .get(f.source.locationId)?.redirectTargetId,
    ).toBeNull()
    expect(
      f.sqlite
        .prepare(
          "SELECT publishedRevisionId FROM featureRevisionHead WHERE featureId='g'",
        )
        .get()?.publishedRevisionId,
    ).toBe(baseline)
    f.sqlite.exec('DROP TRIGGER fail_merge_revision')
    expect(await applyLocationMergeReview(f.db, f.input)).toMatchObject({
      status: 'applied',
    })
    const revision = f.sqlite
      .prepare(`SELECT r.content,r.previousRevisionId,c.actorId FROM featureRevisionHead h
      JOIN featureRevision r ON r.id=h.publishedRevisionId JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE h.featureId='g'`)
      .get()!
    expect(revision.previousRevisionId).toBe(baseline)
    expect(revision.actorId).toBe('reviewer')
    const accepted = JSON.parse(String(revision.content))
    expect(accepted.placement.location.locationId).toBe(f.target.locationId)
    expect(accepted.placement.location.acceptedOverrides).toEqual(
      content.placement.location?.acceptedOverrides,
    )
    expect(accepted.placement.geometry).toEqual(content.placement.geometry)
  })

  it('reviews relationship dependencies and preserves their historical endpoint after merge', async () => {
    const { db, sqlite, source, target, input, identityReviewId } = await mergeFixture()
    sqlite.exec(`INSERT INTO address(id,sourceKey) VALUES('merge-a',json_object('provider','fixture','family','addresses','id','merge-a'));
      INSERT INTO addressRevision(id,addressId,scope,contentHash,components,sourceReferences,rawSource) VALUES('merge-ar','merge-a','building','hash','{}','[]','{}');`)
    sqlite
      .prepare(
        "INSERT INTO locationAddress(id,relationshipId,locationId,addressRevisionId,addressState) VALUES('merge-address','merge-address',?,'merge-ar','current')",
      )
      .run(source.locationId)
    expect(await applyLocationMergeReview(db, input)).toEqual({ status: 'conflict' })
    const reviewed = await captureLocationMergeReview(db, {
      ...input,
      identityReviewId,
    })
    if (reviewed.status !== 'ready') throw new Error('Expected review')
    const review = await readLocationMergeReview(db, {
      ...input,
      reviewId: reviewed.reviewId,
    })
    expect(review?.dependencies?.relationshipVersions).toBe(1)
    expect(review?.canApply).toBe(true)
    expect(
      await applyLocationMergeReview(db, { ...input, reviewId: reviewed.reviewId }),
    ).toMatchObject({ status: 'applied' })
    expect(
      sqlite
        .prepare("SELECT locationId FROM locationAddress WHERE id='merge-address'")
        .get()?.locationId,
    ).toBe(source.locationId)
    expect(
      sqlite
        .prepare('SELECT locationId FROM locationCanonical WHERE aliasId=?')
        .get(source.locationId)?.locationId,
    ).toBe(target.locationId)
    expect(
      sqlite
        .prepare(
          "SELECT count(*) n FROM locationTransition WHERE basis='identity_correction'",
        )
        .get()?.n,
    ).toBe(1)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('retains every source correction version and the exact older accepted correction through a merge', async () => {
    const { db, sqlite, source, target, input, identityReviewId } = await mergeFixture()
    const insert = sqlite.prepare(
      "INSERT INTO organisationLocation(id,organisationId,locationId,previousRevisionId,overrides,actorId,createdAt) VALUES(?,'p',?,?,?,'editor','2020-01-01')",
    )
    insert.run(
      'merge-c1',
      source.locationId,
      null,
      JSON.stringify({
        names: { en: { mode: 'override', value: 'Historic correction' } },
      }),
    )
    insert.run('merge-c2', source.locationId, 'merge-c1', '{}')
    sqlite.exec(
      "UPDATE featureLocation SET factsOrganisationRevision='merge-c1',version='accepted-old-correction' WHERE featureId='g'",
    )
    const reviewed = await captureLocationMergeReview(db, {
      ...input,
      identityReviewId,
    })
    if (reviewed.status !== 'ready') throw new Error('Expected review')
    expect(
      await applyLocationMergeReview(db, { ...input, reviewId: reviewed.reviewId }),
    ).toMatchObject({ status: 'applied' })
    expect(
      sqlite
        .prepare('SELECT count(*) n FROM organisationLocation WHERE locationId=?')
        .get(source.locationId)?.n,
    ).toBe(2)
    expect(
      sqlite
        .prepare('SELECT count(*) n FROM organisationLocation WHERE locationId=?')
        .get(target.locationId)?.n,
    ).toBe(2)
    const accepted = sqlite
      .prepare(
        "SELECT o.overrides FROM featureLocation b JOIN organisationLocation o ON o.id=b.factsOrganisationRevision WHERE b.featureId='g'",
      )
      .get()
    expect(JSON.parse(String(accepted?.overrides)).names.en.value).toBe(
      'Historic correction',
    )
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('invalidates a prepared merge when its underlying identity review is rejected', async () => {
    const { db, sqlite, identityReviewId, input } = await mergeFixture()
    const before = sqlite
      .prepare('SELECT * FROM featureLocation ORDER BY featureId')
      .all()
    expect(
      await rejectLocationIdentityReview(db, {
        ...input,
        reviewId: identityReviewId,
        reason: 'Different premises',
      }),
    ).toEqual({ status: 'rejected' })
    expect(await applyLocationMergeReview(db, input)).toEqual({ status: 'conflict' })
    expect(
      sqlite.prepare('SELECT * FROM featureLocation ORDER BY featureId').all(),
    ).toEqual(before)
    expect(
      sqlite.prepare('SELECT count(*) n FROM location WHERE redirect IS NOT NULL').get()
        ?.n,
    ).toBe(0)
  })

  it('merges reviewed identities atomically while preserving Feature values, overrides and source history', async () => {
    const { db, sqlite, target, source, captured, input } = await mergeFixture()
    expect(captured.affectedFeatures).toBe(1)
    expect(await probeLocationMergeReview(db, input)).toEqual({
      sourceLocationId: source.locationId,
    })
    const reviewRecord = sqlite
      .prepare(
        `SELECT r.id AS identityReviewId FROM locationIdentityReview r,json_each(r.mergeReviews) m WHERE json_extract(m.value,'$.id')=?`,
      )
      .get(input.reviewId)
    expect(
      await probeLocationMergeSource(db, {
        locationId: target.locationId,
        ownerOrganisationId: 'p',
        identityReviewId: String(reviewRecord?.identityReviewId),
      }),
    ).toEqual({ sourceLocationId: source.locationId })
    expect(await readLocationMergeReview(db, input)).toMatchObject({
      reviewId: input.reviewId,
      affectedFeatures: 1,
      visibility: 'private',
      stale: false,
      applied: false,
    })
    expect(
      await readLocationMergeReview(db, { ...input, ownerOrganisationId: 'other' }),
    ).toBeNull()

    const beforeFeatures = sqlite.prepare('SELECT * FROM feature ORDER BY id').all()
    const beforeTarget = await getAcceptedFeatureLocation(db, 'f', 'p')
    const beforeSource = await getAcceptedFeatureLocation(db, 'g', 'p')
    const sourceHistory = sqlite
      .prepare('SELECT * FROM locationRevision WHERE locationId=? ORDER BY version')
      .all(source.locationId)
    expect(await applyLocationMergeReview(db, input)).toMatchObject({
      status: 'applied',
      affectedFeatures: 1,
    })
    expect(sqlite.prepare('SELECT * FROM feature ORDER BY id').all()).toEqual(
      beforeFeatures,
    )
    expect(await getAcceptedFeatureLocation(db, 'f', 'p')).toEqual(
      beforeTarget && {
        ...beforeTarget,
        state: 'linked',
        ssId: 'canonical-shop',
        sourceReference: {
          provider: 'saanseoi',
          family: 'places',
          id: 'canonical-shop',
        },
      },
    )
    const afterSource = await getAcceptedFeatureLocation(db, 'g', 'p')
    expect(afterSource?.locationId).toBe(target.locationId)
    expect(afterSource?.effective).toEqual(beforeSource?.effective)
    expect(afterSource?.version).not.toBe(beforeSource?.version)
    expect(
      sqlite
        .prepare('SELECT * FROM locationRevision WHERE locationId=? ORDER BY version')
        .all(source.locationId),
    ).toEqual(sourceHistory)
    expect(
      sqlite
        .prepare('SELECT state,ssId FROM location WHERE id=?')
        .get(source.locationId),
    ).toEqual({ state: 'redirect', ssId: null })
    expect(await resolveLocationRedirect(db, source.locationId, 'p')).toEqual({
      locationId: target.locationId,
      ssId: 'canonical-shop',
    })
    expect(await resolveLocationRedirect(db, source.locationId, 'other')).toEqual({
      locationId: target.locationId,
      ssId: 'canonical-shop',
    })
    const replay = await persistSaanSeoiPlace(db, projection())
    expect(replay.locationId).toBe(target.locationId)
    expect(
      sqlite
        .prepare('SELECT count(*) n FROM locationRevision WHERE locationId=?')
        .get(target.locationId)?.n,
    ).toBe(3)
    expect(
      sqlite
        .prepare('SELECT count(*) n FROM featureLocationHistory WHERE featureId=?')
        .get('g')?.n,
    ).toBe(2)
    expect(await applyLocationMergeReview(db, input)).toEqual({ status: 'conflict' })
    expect(await readLocationMergeReview(db, input)).toMatchObject({
      stale: true,
      applied: true,
    })
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(() =>
      sqlite.exec('DELETE FROM location WHERE redirect IS NOT NULL'),
    ).toThrow()
    expect(() =>
      sqlite
        .prepare("UPDATE location SET state='linked',ssId='reactivated' WHERE id=?")
        .run(source.locationId),
    ).toThrow()
  })

  it('rejects a merge after an affected Feature changes and fences the same race inside its batch', async () => {
    for (const late of [false, true]) {
      const { db, sqlite, input, target } = await mergeFixture()
      const change = () =>
        sqlite
          .prepare(
            "UPDATE featureLocation SET version='concurrent',acceptedOverrides=? WHERE featureId='g'",
          )
          .run(
            JSON.stringify({
              names: { en: { mode: 'override', value: 'Concurrent correction' } },
            }),
          )
      if (late)
        db.batch = new Proxy(db.batch, {
          apply(fn, receiver, args) {
            change()
            return Reflect.apply(fn, receiver, args)
          },
        })
      else change()
      expect(await applyLocationMergeReview(db, input)).toEqual({ status: 'conflict' })
      expect(
        sqlite
          .prepare('SELECT count(*) n FROM location WHERE redirect IS NOT NULL')
          .get()?.n,
      ).toBe(0)
      expect(
        sqlite
          .prepare('SELECT count(*) n FROM locationRevision WHERE locationId=?')
          .get(target.locationId)?.n,
      ).toBe(1)
      expect(
        sqlite.prepare('SELECT count(*) n FROM locationIdentityHistory').get()?.n,
      ).toBe(0)
    }
  })

  it('rolls back copied revisions, associations, redirects and identities after a late history failure', async () => {
    const { db, sqlite, input } = await mergeFixture()
    const tables = [
      'location',
      'locationRevision',
      'featureLocation',
      'featureLocationHistory',
      'locationIdentityHistory',
    ]
    const before = tables.map(table => sqlite.prepare(`SELECT * FROM ${table}`).all())
    sqlite.exec(
      "CREATE TRIGGER reject_merge BEFORE INSERT ON locationIdentityHistory BEGIN SELECT RAISE(ABORT,'late merge failure'); END",
    )
    await expect(applyLocationMergeReview(db, input)).rejects.toThrow(
      'late merge failure',
    )
    for (const [index, table] of tables.entries())
      expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual(before[index])
  })

  it('does not move another project into a private Location or widen private history into a shared survivor', async () => {
    const { db, sqlite, input, identityReviewId, source } = await mergeFixture()
    sqlite.exec("UPDATE feature SET projectId='other' WHERE id='g'")
    expect(
      await captureLocationMergeReview(db, { ...input, identityReviewId }),
    ).toEqual({
      status: 'scope-conflict',
    })
    sqlite.exec("UPDATE feature SET projectId='p' WHERE id='g'")
    expect(() =>
      sqlite
        .prepare("UPDATE location SET ownerOrganisationId='p' WHERE id=?")
        .run(source.locationId),
    ).toThrow('Source-linked Locations must be shared')
  })

  it('resolves multi-step redirects and retains historical identity claims with the survivor', async () => {
    const { db, sqlite, input, source, target } = await mergeFixture()
    expect(await applyLocationMergeReview(db, input)).toMatchObject({
      status: 'applied',
    })
    const next = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'creator',
    )
    const baseline = await readLocationIdentityBaseline(db, next.locationId, 'p')
    if (!baseline) throw new Error('Missing baseline')
    const identityReviewId = await captureLocationIdentityReview(
      db,
      baseline,
      projection(),
      'reviewer',
    )
    if (!identityReviewId) throw new Error('Missing review')
    const captured = await captureLocationMergeReview(db, {
      locationId: next.locationId,
      identityReviewId,
      ownerOrganisationId: 'p',
      sourceLocationId: target.locationId,
      sourceOwnerOrganisationId: null,
      actorId: 'reviewer',
    })
    expect(captured).toMatchObject({ status: 'ready', affectedFeatures: 2 })
    if (captured.status !== 'ready') throw new Error('Missing merge')
    expect(
      await applyLocationMergeReview(db, {
        ...input,
        locationId: next.locationId,
        sourceLocationId: target.locationId,
        sourceOwnerOrganisationId: null,
        reviewId: captured.reviewId,
      }),
    ).toMatchObject({ status: 'applied' })
    expect(await resolveLocationRedirect(db, source.locationId, 'p')).toEqual({
      locationId: next.locationId,
      ssId: 'canonical-shop',
    })
    const current = await readLocationIdentityBaseline(db, next.locationId, null)
    if (!current) throw new Error('Missing current baseline')
    expect(
      await acceptLocationIdentity(
        db,
        { ...current, actorId: 'reviewer', reason: 'Reviewed source replacement' },
        { ...projection(), ssId: 'new-canonical-shop' },
      ),
    ).toMatchObject({ status: 'applied' })
    expect(await resolveLocationRedirect(db, target.locationId, 'p')).toEqual({
      locationId: next.locationId,
      ssId: 'new-canonical-shop',
    })
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('captures only a current accessible canonical mirror for identity review', async () => {
    const { db, sqlite } = setup()
    const target = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts },
      'actor',
    )
    const baseline = await readLocationIdentityBaseline(db, target.locationId, 'p')
    if (!baseline) throw new Error('Missing baseline')
    expect(
      await captureMirroredLocationIdentityReview(
        db,
        baseline,
        target.revisionId,
        'actor',
      ),
    ).toBeNull()
    const source = await persistSaanSeoiPlace(db, projection())
    const reviewId = await captureMirroredLocationIdentityReview(
      db,
      baseline,
      source.revisionId,
      'actor',
    )
    expect(reviewId).toBeTruthy()
    const view = await readLocationIdentityReview(db, {
      locationId: target.locationId,
      ownerOrganisationId: 'p',
      reviewId: reviewId!,
    })
    expect(view?.candidate.facts).toEqual(projection().facts)
    expect(
      await acceptLocationIdentityReview(db, {
        locationId: target.locationId,
        ownerOrganisationId: 'p',
        reviewId: reviewId!,
        actorId: 'actor',
        reason: 'Same establishment',
      }),
    ).toEqual({ status: 'merge-required' })
    expect(() =>
      sqlite
        .prepare("UPDATE location SET ownerOrganisationId='other' WHERE id=?")
        .run(source.locationId),
    ).toThrow('Source-linked Locations must be shared')
    sqlite
      .prepare(
        "UPDATE location SET ownerOrganisationId=NULL,sourceAvailability='missing' WHERE id=?",
      )
      .run(source.locationId)
    expect(
      await captureMirroredLocationIdentityReview(
        db,
        baseline,
        source.revisionId,
        'actor',
      ),
    ).toBeNull()
    sqlite
      .prepare(
        "UPDATE location SET sourceAvailability='current',ssId='changed' WHERE id=?",
      )
      .run(source.locationId)
    expect(
      await captureMirroredLocationIdentityReview(
        db,
        baseline,
        source.revisionId,
        'actor',
      ),
    ).toBeNull()
  })

  it('rejects identity acceptance when shared draft content changes under the same revision ID', async () => {
    const { db, sqlite } = setup()
    const local = await persistSaanSeoiPlace(db, projection())
    sqlite
      .prepare("UPDATE location SET state='unresolved',ssId=NULL WHERE id=?")
      .run(local.locationId)
    const baseline = await readLocationIdentityBaseline(db, local.locationId, null)
    if (!baseline?.expectedLatestContentHash) throw new Error('Missing draft hash')
    const reviewId = await captureLocationIdentityReview(
      db,
      baseline,
      { ...projection(), ssId: 'new-source' },
      'reviewer',
    )
    if (!reviewId) throw new Error('Missing comparison')
    // This historical fixture models a mutable draft edit without advancing its revision ID.
    sqlite.exec('DROP TRIGGER location_revision_no_update')
    sqlite
      .prepare('UPDATE locationRevision SET contentHash=? WHERE id=?')
      .run('edited-draft', baseline.expectedLatestRevisionId)
    const input = { locationId: local.locationId, ownerOrganisationId: null, reviewId }
    expect(await readLocationIdentityReview(db, input)).toMatchObject({ stale: true })
    expect(
      await acceptLocationIdentityReview(db, {
        ...input,
        actorId: 'reviewer',
        reason: 'Stale preview',
      }),
    ).toEqual({ status: 'conflict' })
    expect(
      sqlite.prepare('SELECT ssId FROM location WHERE id=?').get(local.locationId)
        ?.ssId,
    ).toBeNull()
  })

  it('captures immutable review evidence, accepts it, and keeps source ingestion idempotent', async () => {
    const { db, sqlite } = setup()
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'creator',
    )
    const baseline = await readLocationIdentityBaseline(db, local.locationId, 'p')
    if (!baseline) throw new Error('Missing baseline')
    const reviewId = await captureLocationIdentityReview(
      db,
      baseline,
      projection(),
      'reviewer',
    )
    if (!reviewId) throw new Error('Missing review')
    const input = { locationId: local.locationId, ownerOrganisationId: 'p', reviewId }
    const view = await readLocationIdentityReview(db, input)
    expect(view).toMatchObject({
      stale: false,
      previousState: 'manual',
      candidate: { ssId: 'canonical-shop' },
    })
    expect(view).not.toHaveProperty('projection')
    expect(view?.candidate).not.toHaveProperty('rawSource')
    expect(
      await readLocationIdentityReview(db, { ...input, ownerOrganisationId: 'other' }),
    ).toBeNull()
    expect(
      await acceptLocationIdentityReview(db, {
        ...input,
        actorId: 'approver',
        reason: 'Verified unit',
      }),
    ).toMatchObject({ status: 'applied' })
    expect(
      sqlite
        .prepare('SELECT actorId,reason,reviewId FROM locationIdentityHistory')
        .get(),
    ).toEqual({ actorId: 'approver', reason: 'Verified unit', reviewId })
    await persistSaanSeoiPlace(db, projection())
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(2)
    expect(await readLocationIdentityReview(db, input)).toBeNull()
    expect(
      await acceptLocationIdentityReview(db, {
        ...input,
        actorId: 'approver',
        reason: 'Repeat',
      }),
    ).toEqual({ status: 'conflict' })
    expect(() =>
      sqlite.exec("UPDATE locationIdentityReview SET actorId='changed'"),
    ).toThrow()
    expect(() => sqlite.exec('DELETE FROM locationIdentityReview')).toThrow()
  })

  it('rejects a captured comparison after source revisions advance, without orphan evidence', async () => {
    const { db, sqlite } = setup()
    const original = await persistSaanSeoiPlace(db, projection())
    const baseline = await readLocationIdentityBaseline(db, original.locationId, null)
    if (!baseline) throw new Error('Missing baseline')
    const candidate = { ...projection(), ssId: 'replacement' }
    const reviewId = await captureLocationIdentityReview(
      db,
      baseline,
      candidate,
      'reviewer',
    )
    if (!reviewId) throw new Error('Missing review')
    await persistSaanSeoiPlace(db, {
      ...projection(),
      facts: { ...projection().facts, names: { en: 'Updated' } },
    })
    expect(
      await captureLocationIdentityReview(db, baseline, candidate, 'reviewer'),
    ).toBeNull()
    const input = {
      locationId: original.locationId,
      ownerOrganisationId: null,
      reviewId,
    }
    expect(await readLocationIdentityReview(db, input)).toMatchObject({ stale: true })
    expect(
      await acceptLocationIdentityReview(db, {
        ...input,
        actorId: 'reviewer',
        reason: 'Stale review',
      }),
    ).toEqual({ status: 'conflict' })
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(2)
    expect(
      sqlite.prepare('SELECT count(*) n FROM locationIdentityHistory').get()?.n,
    ).toBe(0)
  })

  it.each(['manual', 'unresolved'] as const)(
    'promotes %s to a shared source-controlled identity without changing accepted values',
    async state => {
      const { db, sqlite } = setup()
      const local = await createLocalLocation(db, 'p', { state, facts }, 'actor')
      sqlite
        .prepare(`INSERT INTO featureLocation(featureId,locationId,factsRevisionId,locationRevisionId,acceptedOverrides)
      VALUES ('f',?,?,?,?)`)
        .run(
          local.locationId,
          local.revisionId,
          local.revisionId,
          JSON.stringify({ names: { en: { mode: 'override', value: 'Our name' } } }),
        )
      const before = sqlite.prepare('SELECT * FROM featureLocation').all()
      const input = {
        locationId: local.locationId,
        expectedState: state,
        expectedSsId: null,
        expectedHistoryId: null,
        expectedOwnerOrganisationId: 'p',
        actorId: 'reviewer',
        reason: 'Verified establishment and unit',
      }
      const result = await acceptLocationIdentity(db, input, projection())
      expect(result.status).toBe('applied')
      expect(
        sqlite.prepare('SELECT id,ssId,state,ownerOrganisationId FROM location').get(),
      ).toEqual({
        id: local.locationId,
        ssId: 'canonical-shop',
        state: 'linked',
        ownerOrganisationId: null,
      })
      expect(sqlite.prepare('SELECT * FROM featureLocation').all()).toEqual(before)
      expect(
        sqlite.prepare('SELECT count(*) n FROM featureLocationHistory').get()?.n,
      ).toBe(1)
      const next = await persistSaanSeoiPlace(db, projection())
      expect(next.locationId).toBe(local.locationId)
      expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(2)
      expect(await acceptLocationIdentity(db, input, projection())).toEqual({
        status: 'conflict',
      })
      expect(() =>
        sqlite.exec("UPDATE locationIdentityHistory SET reason='rewritten'"),
      ).toThrow()
      expect(() => sqlite.exec('DELETE FROM locationIdentityHistory')).toThrow()
    },
  )

  it('fences source ID corrections with history and preserves the original HYPE ID', async () => {
    const { db, sqlite } = setup()
    const original = await persistSaanSeoiPlace(db, projection())
    const input = {
      locationId: original.locationId,
      expectedState: 'linked' as const,
      expectedSsId: 'canonical-shop',
      expectedHistoryId: null,
      expectedOwnerOrganisationId: null,
      actorId: 'steward',
      reason: 'Confirmed upstream replacement',
    }
    const changed = { ...projection(), ssId: 'replacement' }
    const first = await acceptLocationIdentity(db, input, changed)
    expect(first.status).toBe('applied')
    if (first.status !== 'applied') throw new Error('Expected identity change')
    await expect(persistSaanSeoiPlace(db, projection())).rejects.toThrow(
      'Retired source identity requires review',
    )

    expect(
      await acceptLocationIdentity(
        db,
        { ...input, expectedSsId: 'replacement' },
        projection(),
      ),
    ).toEqual({ status: 'conflict' })
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(2)
    expect(
      await acceptLocationIdentity(
        db,
        { ...input, expectedSsId: 'replacement', expectedHistoryId: first.historyId },
        projection(),
      ),
    ).toMatchObject({ status: 'applied' })
    // Even a complete ssId round trip cannot make the original review token valid again.
    expect(await acceptLocationIdentity(db, input, changed)).toEqual({
      status: 'conflict',
    })
    expect(
      sqlite.prepare('SELECT count(*) n FROM locationIdentityHistory').get()?.n,
    ).toBe(2)
    expect(sqlite.prepare('SELECT id FROM location').get()?.id).toBe(
      original.locationId,
    )
  })

  it('requires explicit merge review for an occupied source ID and rejects ownership drift', async () => {
    const { db, sqlite } = setup()
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'actor',
    )
    const canonical = await persistSaanSeoiPlace(db, projection())
    const input = {
      locationId: local.locationId,
      expectedState: 'manual' as const,
      expectedSsId: null,
      expectedHistoryId: null,
      expectedOwnerOrganisationId: 'p',
      actorId: 'actor',
      reason: 'Reviewed',
    }
    expect(await acceptLocationIdentity(db, input, projection())).toEqual({
      status: 'merge-required',
    })
    expect(
      await acceptLocationIdentity(
        db,
        { ...input, expectedOwnerOrganisationId: 'other' },
        projection(),
      ),
    ).toEqual({ status: 'conflict' })
    expect(
      sqlite.prepare('SELECT count(*) n FROM locationIdentityHistory').get()?.n,
    ).toBe(0)
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(2)
    expect(
      await acceptLocationIdentity(
        db,
        {
          ...input,
          locationId: canonical.locationId,
          expectedState: 'linked',
          expectedSsId: 'canonical-shop',
          expectedOwnerOrganisationId: null,
        },
        { ...projection(), ssId: 'replacement' },
      ),
    ).toMatchObject({ status: 'applied' })
    expect(await acceptLocationIdentity(db, input, projection())).toEqual({
      status: 'merge-required',
    })
  })

  it('rolls back the revision and history if the final identity write fails', async () => {
    const { db, sqlite } = setup()
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts },
      'actor',
    )
    sqlite.exec(
      "CREATE TRIGGER reject_identity BEFORE UPDATE ON location BEGIN SELECT RAISE(ABORT,'injected failure'); END",
    )
    await expect(
      acceptLocationIdentity(
        db,
        {
          locationId: local.locationId,
          expectedState: 'unresolved',
          expectedSsId: null,
          expectedHistoryId: null,
          expectedOwnerOrganisationId: 'p',
          actorId: 'actor',
          reason: 'Reviewed',
        },
        projection(),
      ),
    ).rejects.toThrow('injected failure')
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(1)
    expect(
      sqlite.prepare('SELECT count(*) n FROM locationIdentityHistory').get()?.n,
    ).toBe(0)
    expect(sqlite.prepare('SELECT ssId FROM location').get()?.ssId).toBeNull()
  })

  it('replays idempotently and appends changes without altering accepted Features', async () => {
    const { db, sqlite } = setup()
    const source = projection()
    const first = await persistSaanSeoiPlace(db, source)
    const replay = await persistSaanSeoiPlace(db, {
      ...source,
      rawSource: { meta: source.rawSource.meta, resource: source.rawSource.resource },
    })
    expect(replay).toEqual(first)
    source.facts.names.en = 'Updated bakery'
    const next = await persistSaanSeoiPlace(db, source)
    expect(next.locationId).toBe(first.locationId)
    expect(next.revisionId).not.toBe(first.revisionId)
    expect(
      sqlite.prepare('SELECT version FROM locationRevision ORDER BY version').all(),
    ).toEqual([{ version: 1 }, { version: 2 }])
    const original = sqlite
      .prepare('SELECT facts,rawSource FROM locationRevisionContent WHERE id=?')
      .get(first.revisionId)
    expect(readLocationFacts(original?.facts).names.en).toBe('Bakery')
    expect(JSON.parse(String(original?.rawSource)).resource.sources).toEqual([
      'retained-attribution',
    ])
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureLocation').get()?.count,
    ).toBe(0)
  })

  it('resolves exact source releases without leaking raw snapshots or linking Features', async () => {
    const { db, sqlite } = setup()
    const source = projection()
    const first = await persistSaanSeoiPlace(db, source)
    const input = {
      projectId: 'p',
      ssId: source.ssId,
      resourceReleaseId: source.releaseId,
    }
    expect(await resolveLocationCandidate(db, input)).toEqual({
      status: 'ready',
      ...first,
      ssId: source.ssId,
      resourceReleaseId: source.releaseId,
      snapshotId: source.snapshotId,
      facts: source.facts,
    })
    await persistSaanSeoiPlace(db, {
      ...source,
      releaseId: 'new-release',
      facts: { ...source.facts, names: { en: 'Changed' } },
    })
    expect(await resolveLocationCandidate(db, input)).toMatchObject({
      revisionId: first.revisionId,
      facts: source.facts,
    })
    expect(
      await resolveLocationCandidate(db, { ...input, resourceReleaseId: 'absent' }),
    ).toEqual({ status: 'source-import-needed' })
    expect(await resolveLocationCandidate(db, { ...input, ssId: 'absent' })).toEqual({
      status: 'source-import-needed',
    })
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureLocation').get()?.count,
    ).toBe(0)
  })

  it('does not expose private, missing, or review-required source candidates', async () => {
    const { db, sqlite } = setup()
    const source = projection()
    const mirrored = await persistSaanSeoiPlace(db, source)
    const input = {
      projectId: 'p',
      ssId: source.ssId,
      resourceReleaseId: source.releaseId,
    }
    expect(() =>
      sqlite
        .prepare('UPDATE location SET ownerOrganisationId=? WHERE id=?')
        .run('other', mirrored.locationId),
    ).toThrow('Source-linked Locations must be shared')
    expect(await resolveLocationCandidate(db, input)).toMatchObject({ status: 'ready' })
    for (const availability of ['missing', 'review']) {
      sqlite
        .prepare('UPDATE location SET sourceAvailability=? WHERE id=?')
        .run(availability, mirrored.locationId)
      expect(await resolveLocationCandidate(db, input)).toEqual({
        status: 'source-import-needed',
      })
    }
  })

  it('retains an existing HYPE identity and rolls back failed new ingestion', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(
      "INSERT INTO location(id,ssId,state) VALUES ('permanent-id','canonical-shop','linked')",
    )
    expect((await persistSaanSeoiPlace(db, projection())).locationId).toBe(
      'permanent-id',
    )
    sqlite.exec(
      "CREATE TRIGGER fail_source BEFORE INSERT ON locationRevision BEGIN SELECT RAISE(ABORT,'failed'); END",
    )
    await expect(
      persistSaanSeoiPlace(db, { ...projection(), ssId: 'other-shop' }),
    ).rejects.toThrow()
    expect(
      sqlite
        .prepare("SELECT count(*) AS count FROM location WHERE ssId='other-shop'")
        .get()?.count,
    ).toBe(0)
  })
  describe('scoped canonical candidate ingestion', () => {
    it('creates an idempotent preview without changing Features', async () => {
      const { db, sqlite } = setup()
      const result = await persistLocationCandidate(db, 'p', projection())
      expect(result).toMatchObject({ status: 'ready' })
      expect(await persistLocationCandidate(db, 'p', projection())).toEqual(result)
      expect(
        sqlite.prepare('SELECT count(*) AS n FROM locationRevision').get()?.n,
      ).toBe(1)
      expect(sqlite.prepare('SELECT count(*) AS n FROM featureLocation').get()?.n).toBe(
        0,
      )
    })
    it('forbids private canonical identities before source persistence', async () => {
      const { db, sqlite } = setup()
      const original = await persistSaanSeoiPlace(db, projection())
      const before = sqlite.prepare('SELECT * FROM location').all()
      expect(() =>
        sqlite
          .prepare("UPDATE location SET ownerOrganisationId='other' WHERE id=?")
          .run(original.locationId),
      ).toThrow('Source-linked Locations must be shared')
      expect(sqlite.prepare('SELECT * FROM location').all()).toEqual(before)
      expect(await persistLocationCandidate(db, 'other', projection())).toMatchObject({
        status: 'ready',
        locationId: original.locationId,
      })
    })
  })
})

describe('conditional association writes and immutable history', () => {
  it('gates effective writes on the winning token and leaves stale batches unchanged', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(
      readFileSync('migrations/0139_organisation_location_corrections.sql', 'utf8')
        .match(
          /CREATE TRIGGER feature_location_(?:scope_insert|scope_update|feature_scope|owner_scope)[\s\S]*?END;/g,
        )!
        .join('\n'),
    )
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'actor',
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      locationId: local.locationId,
      factsRevisionId: local.revisionId,
      locationRevisionId: local.revisionId,
      overrides: {},
      actorId: 'actor',
    }
    const { feature } = await import('#lib/db/schema/feature.js')
    const { sql } = await import('drizzle-orm')
    const winner = prepareFeatureLocationAssociationWrite(db, input)
    const stale = prepareFeatureLocationAssociationWrite(db, input)
    const materialize = (revision: string, modifiedAt: string) =>
      db
        .update(feature)
        .set({ modifiedAt })
        .where(sql`id = 'f' AND EXISTS
        (SELECT 1 FROM featureLocation WHERE featureId = 'f' AND version = ${revision})`)
        .returning({ id: feature.id })
    const accepted = await db.batch([
      winner.query,
      materialize(winner.version, 'accepted'),
    ])
    expect(accepted[0]).toEqual([{ version: winner.version }])
    expect(accepted[1]).toEqual([{ id: 'f' }])
    expect(await db.batch([stale.query, materialize(stale.version, 'stale')])).toEqual([
      [],
      [],
    ])
    expect(sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='f'").get()).toEqual(
      { modifiedAt: 'accepted' },
    )
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM featureLocationHistory').get(),
    ).toEqual({ n: 1 })
  })

  it('rejects stale saves, retains immutable snapshots and prevents token reuse after unlink', async () => {
    const { db, sqlite } = setup()
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'actor',
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      locationId: local.locationId,
      factsRevisionId: local.revisionId,
      locationRevisionId: local.revisionId,
      overrides: {},
      actorId: 'actor',
    }
    const [initial] = await db.batch([
      prepareFeatureLocationAssociationWrite(db, input).query,
    ])
    expect(initial).toHaveLength(1)
    expect(await prepareFeatureLocationAssociationWrite(db, input).query).toEqual([])
    const edit = {
      ...input,
      expectedRevision: initial[0].version,
      overrides: { phoneNumber: { mode: 'clear' as const } },
    }
    const updated = await prepareFeatureLocationAssociationWrite(db, edit).query
    expect(updated).toHaveLength(1)
    expect(await prepareFeatureLocationAssociationWrite(db, edit).query).toEqual([])
    sqlite.exec("UPDATE feature SET modifiedAt='later' WHERE id='f'")
    expect(
      await prepareFeatureLocationAssociationWrite(db, {
        ...edit,
        expectedRevision: updated[0].version,
      }).query,
    ).toEqual([])
    const history = sqlite
      .prepare(
        'SELECT action, previousRevision, acceptedOverrides AS overrides, actorId FROM featureLocationHistory ORDER BY id',
      )
      .all()
    expect(history).toEqual([
      { action: 'link', previousRevision: null, overrides: '{}', actorId: 'actor' },
      {
        action: 'update',
        previousRevision: initial[0].version,
        overrides: '{"phoneNumber":{"mode":"clear"}}',
        actorId: 'actor',
      },
    ])
    expect(() =>
      sqlite.exec(
        "UPDATE featureLocation SET acceptedOverrides='{}' WHERE featureId='f'",
      ),
    ).toThrow('new revision')
    expect(() => sqlite.exec('DELETE FROM featureLocationHistory')).toThrow('immutable')
    expect(() =>
      sqlite.exec("UPDATE featureLocationHistory SET actorId='someone'"),
    ).toThrow('immutable')
    sqlite.exec("DELETE FROM featureLocation WHERE featureId='f'")
    expect(
      sqlite
        .prepare(
          'SELECT action,actorId FROM featureLocationHistory ORDER BY id DESC LIMIT 1',
        )
        .get(),
    ).toEqual({ action: 'unlink', actorId: null })
    expect(() =>
      sqlite
        .prepare(`INSERT INTO featureLocation(featureId,locationId,factsRevisionId,locationRevisionId,version)
      VALUES ('f',?,?,?,?)`)
        .run(local.locationId, local.revisionId, local.revisionId, initial[0].version),
    ).toThrow()
    expect(sqlite.prepare('SELECT count(*) AS n FROM featureLocation').get()).toEqual({
      n: 0,
    })
    expect(
      await prepareFeatureLocationAssociationWrite(db, {
        ...input,
        expectedFeatureModifiedAt: 'later',
      }).query,
    ).toHaveLength(1)
    sqlite.exec("DELETE FROM feature WHERE id='f'")
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM featureLocationHistory').get(),
    ).toEqual({ n: 5 })
  })

  it('rolls back association and history if the surrounding materialization batch fails', async () => {
    const { db, sqlite } = setup()
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts },
      'actor',
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      locationId: local.locationId,
      factsRevisionId: local.revisionId,
      locationRevisionId: local.revisionId,
      overrides: {},
      actorId: 'actor',
    }
    const { featureLocation } = await import('#lib/db/schema/location.js')
    await expect(
      db.batch([
        prepareFeatureLocationAssociationWrite(db, input).query,
        db.insert(featureLocation).values({
          featureId: 'f',
          locationId: local.locationId,
          factsRevisionId: local.revisionId,
          locationRevisionId: local.revisionId,
        }),
      ]),
    ).rejects.toThrow()
    expect(sqlite.prepare('SELECT count(*) AS n FROM featureLocation').get()).toEqual({
      n: 0,
    })
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM featureLocationHistory').get(),
    ).toEqual({ n: 0 })
  })
})

describe('persisted Feature baseline and initial linking', () => {
  it('retains structured address corrections and ordered phone arrays', async () => {
    const { db, sqlite } = setup()
    const { emptyFeatureAddress } = await import('#lib/addresses/featureAddress.js')
    const address = emptyFeatureAddress({ en: 'Old address' })
    address.overrides.en = {
      formattedAddress: 'Corrected address',
      premisesName: 'Collection room',
    }
    sqlite
      .prepare("UPDATE feature SET geometry=?, addressMeta=? WHERE id='f'")
      .run(JSON.stringify(facts.location.geometry), JSON.stringify({ address }))
    sqlite.exec(`INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES ('f','en','Bakery','Old address');
      INSERT INTO hub VALUES ('core','core');
      INSERT INTO property(id,key,scope,hubId) VALUES ('phone','phoneNumber','hub','core');
      INSERT INTO featureProperty(featureId,propertyId,propertyValueId,value) VALUES ('f','phone',NULL,'["9123 4567","2345 6789"]');`)
    const result = await readFeatureLocationBaseline(db, 'f', 'p')
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error('Expected ready baseline')
    expect(result.baseline.address).toEqual(address)
    expect(result.baseline.effective.location?.address.fallbackDisplay.en).toBe(
      'Corrected address',
    )
    expect(result.baseline.effective.phoneNumber).toEqual(['9123 4567', '2345 6789'])
  })

  it('preserves names, universal phone, brand identities and existing columns when linking', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(
      readFileSync('migrations/0139_organisation_location_corrections.sql', 'utf8')
        .match(
          /CREATE TRIGGER feature_location_(?:scope_insert|scope_update|feature_scope|owner_scope)[\s\S]*?END;/g,
        )!
        .join('\n'),
    )
    sqlite
      .prepare("UPDATE feature SET geometry=? WHERE id='f'")
      .run(JSON.stringify(facts.location.geometry))
    sqlite.exec(`INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES ('f','en','Collection counter','Original address'), ('f','zh-hant','麵包店',NULL);
      INSERT INTO hub VALUES ('core','core');
      INSERT INTO property(id,key,scope,hubId) VALUES ('phone','phoneNumber','hub','core'),('brand','brand','organisation',NULL);
      INSERT INTO featureProperty(featureId,propertyId,propertyValueId,value) VALUES ('f','phone',NULL,'2345 6789'),('f','brand','legacy-brand',NULL);
      INSERT INTO propertyValue VALUES ('legacy-brand','brand');
      INSERT INTO propertyValueI18n VALUES ('legacy-brand','en','Bakery brand'),('legacy-brand','zh-hant','品牌');`)
    const baseline = await readFeatureLocationBaseline(db, 'f', 'p')
    expect(baseline.status).toBe('ready')
    if (baseline.status !== 'ready') throw new Error('Expected persisted baseline')
    expect(baseline.baseline.effective).toMatchObject({
      names: { en: 'Collection counter', 'zh-hant': '麵包店' },
      phoneNumber: ['2345 6789'],
      brands: [
        {
          identifiers: { hypePropertyValueId: 'legacy-brand' },
          names: { en: 'Bakery brand', 'zh-hant': '品牌' },
        },
      ],
    })
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts },
      'actor',
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      locationId: local.locationId,
      revisionId: local.revisionId,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
    }
    const before = ['feature', 'featureI18n', 'featureProperty'].map(table =>
      sqlite.prepare(`SELECT * FROM ${table}`).all(),
    )
    const linked = await linkInitialFeatureLocation(db, input)
    expect(linked.status).toBe('linked')
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.effective).toEqual(
      baseline.baseline.effective,
    )
    expect(
      ['feature', 'featureI18n', 'featureProperty'].map(table =>
        sqlite.prepare(`SELECT * FROM ${table}`).all(),
      ),
    ).toEqual(before)
    expect(await linkInitialFeatureLocation(db, input)).toEqual({ status: 'conflict' })
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM featureLocationHistory').get(),
    ).toEqual({ n: 1 })
  })

  it('excludes non-place Features and refuses invalid phones and private cross-project sources', async () => {
    const { db, sqlite } = setup()
    sqlite
      .prepare("UPDATE feature SET geometry=? WHERE id='f'")
      .run(JSON.stringify(facts.location.geometry))
    sqlite.exec(
      "INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES ('f','en','Bakery',NULL)",
    )
    expect(await readFeatureLocationBaseline(db, 'f', 'other')).toEqual({
      status: 'ineligible',
      reason: 'not-found',
    })
    sqlite.exec('UPDATE feature SET isIntangible=1')
    expect(await readFeatureLocationBaseline(db, 'f', 'p')).toEqual({
      status: 'ineligible',
      reason: 'intangible',
    })
    sqlite.exec(`UPDATE feature SET isIntangible=0;
      INSERT INTO hub VALUES ('core','core');
      INSERT INTO property(id,key,scope,hubId) VALUES ('phone','phoneNumber','hub','core');
      INSERT INTO featureProperty(featureId,propertyId,propertyValueId,value) VALUES ('f','phone',NULL,'call the manager');`)
    expect(await readFeatureLocationBaseline(db, 'f', 'p')).toEqual({
      status: 'review',
      reason: 'invalid-phone',
    })
    sqlite.exec('DELETE FROM featureProperty')
    const local = await createLocalLocation(
      db,
      'other',
      { state: 'manual', facts },
      'actor',
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      locationId: local.locationId,
      revisionId: local.revisionId,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
    }
    expect(await linkInitialFeatureLocation(db, input)).toEqual({
      status: 'place-unavailable',
    })
    expect(
      await linkInitialFeatureLocation(db, {
        ...input,
        expectedFeatureModifiedAt: 'stale',
      }),
    ).toEqual({ status: 'conflict' })
    expect(sqlite.prepare('SELECT count(*) AS n FROM featureLocation').get()).toEqual({
      n: 0,
    })
  })
})

describe('atomic linked Feature relation replacement', () => {
  it('gates all deletes/inserts, retains other Features, and rolls back a late error', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(`ALTER TABLE featureI18n ADD COLUMN titleGen INTEGER;
      ALTER TABLE featureI18n ADD COLUMN isAutomaticOnly INTEGER DEFAULT 0;
      ALTER TABLE featureI18n ADD COLUMN autoTranslated TEXT;
      ALTER TABLE featureI18n ADD COLUMN translationProvenance TEXT;
      ALTER TABLE featureI18n ADD COLUMN description TEXT;
      ALTER TABLE featureI18n ADD COLUMN descriptionGen INTEGER;
      ALTER TABLE featureI18n ADD COLUMN displayAddressGen INTEGER;
      ALTER TABLE featureI18n ADD COLUMN addressProperties TEXT;
      CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER,isAutomaticOnly INTEGER DEFAULT 0,autoTranslated TEXT,translationProvenance TEXT);
      INSERT INTO featureI18n(featureId,locale,title) VALUES ('f','en','Old name'),('unrelated','en','Keep me');
      INSERT INTO featureProperty(featureId,propertyId,propertyValueId,value) VALUES ('f','old',NULL,'old value'),('unrelated','other',NULL,'Keep me');
      INSERT INTO featurePropertyI18n(featureId,propertyId,locale,value,valueGen) VALUES ('f','old','en','old translation',0);`)
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'actor',
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      locationId: local.locationId,
      factsRevisionId: local.revisionId,
      locationRevisionId: local.revisionId,
      overrides: {},
      actorId: 'actor',
    }
    const snapshot = () =>
      [
        'featureI18n',
        'featureProperty',
        'featurePropertyI18n',
        'featureLocation',
        'featureLocationHistory',
      ].map(table => sqlite.prepare(`SELECT * FROM ${table}`).all())
    const properties = Array.from({ length: 150 }, (_, i) => ({
      propertyId: `new-${i}`,
      value: `value-${i}`,
    }))
    const submittedProperties = [
      ...properties,
      {
        propertyId: 'checkbox',
        propertyValueId: 'true',
        value: null,
        i18n: { en: { value: 'Checked', valueGen: false } },
      },
    ]
    const before = snapshot()
    const stale = prepareFeatureLocationAssociationWrite(db, {
      ...input,
      expectedFeatureModifiedAt: 'stale',
    })
    await db.batch([
      stale.query,
      ...prepareFeatureLocationRelations(
        db,
        'f',
        stale.version,
        { en: { title: 'Do not save' } },
        submittedProperties,
      ),
    ])
    expect(snapshot()).toEqual(before)
    sqlite.exec(`CREATE TRIGGER reject_last BEFORE INSERT ON featureProperty WHEN NEW.propertyId='new-149'
      BEGIN SELECT RAISE(ABORT,'injected late failure'); END;`)
    const failing = prepareFeatureLocationAssociationWrite(db, input)
    await expect(
      db.batch([
        failing.query,
        ...prepareFeatureLocationRelations(
          db,
          'f',
          failing.version,
          { en: { title: 'New name' } },
          submittedProperties,
        ),
      ]),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
    sqlite.exec('DROP TRIGGER reject_last')
    const winner = prepareFeatureLocationAssociationWrite(db, input)
    await db.batch([
      winner.query,
      ...prepareFeatureLocationRelations(
        db,
        'f',
        winner.version,
        { en: { title: 'New name' }, zhHant: { title: '新名稱' } },
        submittedProperties,
      ),
    ])
    expect(
      sqlite
        .prepare(
          "SELECT locale,title FROM featureI18n WHERE featureId='f' ORDER BY locale",
        )
        .all(),
    ).toEqual([
      { locale: 'en', title: 'New name' },
      { locale: 'zh-hant', title: '新名稱' },
    ])
    expect(
      sqlite
        .prepare("SELECT count(*) AS n FROM featureProperty WHERE featureId='f'")
        .get(),
    ).toEqual({ n: 151 })
    expect(
      sqlite
        .prepare("SELECT value FROM featureProperty WHERE featureId='unrelated'")
        .get(),
    ).toEqual({ value: 'Keep me' })
    expect(
      sqlite
        .prepare("SELECT count(*) AS n FROM featurePropertyI18n WHERE featureId='f'")
        .get(),
    ).toEqual({ n: 1 })
    expect(
      sqlite
        .prepare(
          "SELECT propertyValueId,value FROM featureProperty WHERE featureId='f' AND propertyId='checkbox'",
        )
        .get(),
    ).toEqual({ propertyValueId: null, value: 'true' })
    expect(
      sqlite
        .prepare(
          "SELECT locale,value,valueGen FROM featurePropertyI18n WHERE featureId='f'",
        )
        .all(),
    ).toEqual([{ locale: 'en', value: 'Checked', valueGen: 0 }])
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM featureLocationHistory').get(),
    ).toEqual({ n: 1 })
  })
})

describe('linked Feature form persistence', () => {
  it('updates edited overrides and materialized rows atomically while preserving inherited names', async () => {
    const { db, sqlite } = setup()
    const { getTableColumns } = await import('drizzle-orm')
    const { feature, featureI18n } = await import('#lib/db/schema/feature.js')
    // Add the real schema columns to this lightweight D1 fixture for full-row RETURNING.
    for (const [name, table] of [
      ['feature', feature],
      ['featureI18n', featureI18n],
    ] as const) {
      const existing = new Set(
        sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map(row => row.name),
      )
      for (const column of Object.values(getTableColumns(table)))
        if (!existing.has(column.name))
          sqlite.exec(
            `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
    }
    sqlite.exec(`CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER);
      INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES ('f','en','Bakery','Original address');
      INSERT INTO hub VALUES ('core','core');
      INSERT INTO property(id,key,scope,hubId) VALUES ('phone','phoneNumber','hub','core');
      INSERT INTO property(id,key,scope,hubId) VALUES ('brand','brand','organisation',NULL);`)
    sqlite
      .prepare("UPDATE feature SET geometry=? WHERE id='f'")
      .run(JSON.stringify(facts.location.geometry))
    sqlite.exec(
      readFileSync('migrations/0139_organisation_location_corrections.sql', 'utf8')
        .match(
          /CREATE TRIGGER feature_location_(?:scope_insert|scope_update|feature_scope|owner_scope)[\s\S]*?END;/g,
        )!
        .join('\n'),
    )
    const local = await createLocalLocation(
      db,
      'other',
      { state: 'unresolved', facts: { ...facts, phoneNumber: [] } },
      'actor',
    )
    const link = await linkInitialFeatureLocation(db, {
      featureId: 'f',
      projectId: 'p',
      locationId: local.locationId,
      revisionId: local.revisionId,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
    })
    expect(link.status).toBe('linked')
    const input = {
      featureId: 'f',
      projectId: 'p',
      actorId: 'editor',
      updatedAt: 'original',
      data: { isVisitable: true },
      i18n: {
        en: {
          title: 'Bakery',
          description: 'Collection instructions',
          displayAddress: 'Original address',
        },
      },
      properties: [
        { propertyId: 'phone', value: '["+85291234567","+85223456789"]' },
        { propertyId: 'brand', value: '', propertyValueId: null },
      ],
    }
    const saved = await saveLinkedFeatureForm(db, input)
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') throw new Error('Expected save')
    const accepted = await getAcceptedFeatureLocation(db, 'f', 'p')
    expect(accepted?.effective.phoneNumber).toEqual(['+85291234567', '+85223456789'])
    const stored = sqlite
      .prepare('SELECT acceptedOverrides AS overrides FROM featureLocation')
      .get()
    expect(JSON.parse(stored!.overrides as string)).toEqual({
      phoneNumber: { mode: 'override', value: ['+85291234567', '+85223456789'] },
    })
    const correction = sqlite
      .prepare(
        "SELECT overrides FROM organisationLocationHead WHERE organisationId='p' AND locationId=?",
      )
      .get(local.locationId)!
    expect(JSON.parse(correction.overrides as string)).toEqual(
      JSON.parse(stored!.overrides as string),
    )
    expect(
      sqlite
        .prepare("SELECT title,description FROM featureI18n WHERE featureId='f'")
        .get(),
    ).toEqual({ title: 'Bakery', description: 'Collection instructions' })
    expect(
      sqlite
        .prepare(
          "SELECT value FROM featureProperty WHERE featureId='f' AND propertyId='phone'",
        )
        .get(),
    ).toEqual({ value: '["+85291234567","+85223456789"]' })
    expect(await saveLinkedFeatureForm(db, input)).toEqual({ status: 'conflict' })
    const snapshot = () =>
      [
        'feature',
        'featureI18n',
        'featureProperty',
        'featureLocation',
        'featureLocationHistory',
      ].map(table => sqlite.prepare(`SELECT * FROM ${table}`).all())
    const before = snapshot()
    sqlite.exec(`CREATE TRIGGER reject_title BEFORE UPDATE ON featureI18n WHEN NEW.title='Failure'
      BEGIN SELECT RAISE(ABORT,'injected save failure'); END`)
    await expect(
      saveLinkedFeatureForm(db, {
        ...input,
        updatedAt: saved.feature.modifiedAt,
        i18n: { en: { title: 'Failure', displayAddress: 'Original address' } },
      }),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
    expect(
      await saveLinkedFeatureForm(db, {
        ...input,
        updatedAt: saved.feature.modifiedAt,
        data: { projectId: 'other' },
      }),
    ).toMatchObject({ status: 'review' })
    expect(snapshot()).toEqual(before)
    // A reported-missing task owns the Feature flag, not the physical Location identity.
    const reportedAt = new Date(Date.parse(saved.feature.modifiedAt) + 1).toISOString()
    sqlite
      .prepare("UPDATE feature SET isIntangible=1, modifiedAt=? WHERE id='f'")
      .run(reportedAt)
    expect(await readFeatureLocationBaseline(db, 'f', 'p')).toEqual({
      status: 'ineligible',
      reason: 'intangible',
    })
    const editedMissing = await saveLinkedFeatureForm(db, {
      ...input,
      updatedAt: reportedAt,
      data: {},
      i18n: {
        en: { title: 'Retained historical donor', displayAddress: 'Original address' },
      },
    })
    expect(editedMissing.status).toBe('saved')
    if (editedMissing.status !== 'saved') throw new Error('Expected save')
    const customBrands = [
      { identifiers: {}, names: { en: 'Local brand', 'zh-hant': '品牌' } },
    ]
    let timestamp = editedMissing.feature.modifiedAt
    for (const choice of [
      { mode: 'override', value: customBrands },
      { mode: 'clear' },
      { mode: 'inherit' },
    ] as const) {
      const revision = (await getAcceptedFeatureLocation(db, 'f', 'p'))!.version
      const brandInput = {
        ...input,
        updatedAt: timestamp,
        i18n: {
          en: {
            title: 'Retained historical donor',
            displayAddress: 'Original address',
          },
        },
        locationBrandEdit: {
          expectedRevision: revision,
          choice: structuredClone(
            choice,
          ) as import('#lib/locations/brandEdit.js').LocationBrandEdit['choice'],
        },
      }
      const beforeBrand = snapshot()
      await expect(
        saveLinkedFeatureForm(db, {
          ...brandInput,
          i18n: { en: { title: 'Failure', displayAddress: 'Original address' } },
        }),
      ).rejects.toThrow()
      expect(snapshot()).toEqual(beforeBrand)
      expect(
        await saveLinkedFeatureForm(db, {
          ...brandInput,
          locationBrandEdit: {
            ...brandInput.locationBrandEdit,
            expectedRevision: 'stale',
          },
        }),
      ).toEqual({ status: 'conflict' })
      expect(snapshot()).toEqual(beforeBrand)
      const result = await saveLinkedFeatureForm(db, brandInput)
      expect(result.status).toBe('saved')
      if (result.status !== 'saved') throw new Error('Expected brand save')
      timestamp = result.feature.modifiedAt
      const current = await getAcceptedFeatureLocation(db, 'f', 'p')
      expect(current?.brandMode).toBe(choice.mode)
      expect(current?.effective.brands).toEqual(
        choice.mode === 'override' ? customBrands : choice.mode === 'clear' ? null : [],
      )
      expect(current?.factsRevisionId).toBe(local.revisionId)
    }
    sqlite.exec(
      "INSERT INTO propertyValue VALUES ('legacy-brand','brand'); INSERT INTO propertyValueI18n VALUES ('legacy-brand','en','Legacy brand');",
    )
    const beforeLegacy = snapshot()
    expect(
      await saveLinkedFeatureForm(db, {
        ...input,
        updatedAt: timestamp,
        properties: [
          { propertyId: 'brand', propertyValueId: 'legacy-brand', value: null },
        ],
      }),
    ).toEqual({
      status: 'review',
      reason: 'Edit brands through the Location association',
    })
    expect(snapshot()).toEqual(beforeLegacy)
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.effective.names.en).toBe(
      'Retained historical donor',
    )
    expect(
      sqlite.prepare("SELECT isIntangible FROM feature WHERE id='f'").get(),
    ).toEqual({ isIntangible: 1 })
    // Independent accepted fact/location revisions must win over both the draft and latest source.
    const sourceFacts = {
      ...facts,
      names: { en: 'Accepted bakery' },
      phoneNumber: ['+85223456789'],
    }
    const locationFacts = {
      ...facts,
      location: {
        ...facts.location,
        geometry: { type: 'Point', coordinates: [114.18, 22.31] },
        address: {
          ...facts.location.address,
          fallbackDisplay: { en: 'Accepted location' },
        },
      },
    }
    for (const [id, version, value] of [
      ['reset-facts', 2, sourceFacts],
      ['reset-location', 3, locationFacts],
      ['future', 4, { ...facts, names: { en: 'Do not adopt' } }],
    ] as const)
      sqlite
        .prepare(
          "INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts) VALUES (?,?,?,'local',?,'{}',?)",
        )
        .run(
          id,
          local.locationId,
          version,
          id,
          serializeLocationFacts(LocationFactsSchema.parse(value), 'establishment'),
        )
    const resetLink = prepareFeatureLocationAssociationWrite(db, {
      featureId: 'f',
      projectId: 'p',
      actorId: 'actor',
      expectedFeatureModifiedAt: timestamp,
      expectedRevision: (await getAcceptedFeatureLocation(db, 'f', 'p'))!.version,
      locationId: local.locationId,
      factsRevisionId: 'reset-facts',
      locationRevisionId: 'reset-location',
      overrides: {
        names: { en: { mode: 'override', value: 'Retained historical donor' } },
      },
    })
    await resetLink.query
    // Use the real MTR triggers after the fixture has added their columns.
    const mtrMigration = readFileSync('migrations/0096_feature_mtr_access.sql', 'utf8')
    sqlite.exec(mtrMigration.slice(mtrMigration.indexOf('CREATE TABLE featureMtrJob')))
    sqlite.exec(
      "UPDATE feature SET mtrStation='OLD',mtrExit='OLD'; DELETE FROM featureMtrJob;",
    )
    const resetInput = {
      ...input,
      updatedAt: timestamp,
      i18n: {
        en: {
          title: 'Draft title',
          description: 'Keep this description',
          displayAddress: 'Draft address',
        },
      },
      locationReset: {
        expectedRevision: resetLink.version,
        names: ['en'] as Array<'en'>,
        phoneNumber: true,
        location: true,
      },
    }
    const beforeReset = snapshot()
    sqlite.exec(`CREATE TRIGGER reject_reset_phone BEFORE INSERT ON featureProperty
      WHEN NEW.propertyId='phone' AND NEW.value='["+85223456789"]'
      BEGIN SELECT RAISE(ABORT,'injected phone reset failure'); END`)
    await expect(saveLinkedFeatureForm(db, resetInput)).rejects.toThrow()
    expect(snapshot()).toEqual(beforeReset)
    expect(sqlite.prepare('SELECT * FROM featureMtrJob').all()).toEqual([])
    sqlite.exec('DROP TRIGGER reject_reset_phone')
    expect(
      await saveLinkedFeatureForm(db, {
        ...resetInput,
        locationReset: { ...resetInput.locationReset, expectedRevision: 'stale' },
      }),
    ).toEqual({ status: 'conflict' })
    expect(snapshot()).toEqual(beforeReset)
    const resetSaved = await saveLinkedFeatureForm(db, resetInput)
    expect(resetSaved).toMatchObject({ status: 'saved', geometryChanged: true })
    const restored = await getAcceptedFeatureLocation(db, 'f', 'p')
    expect(restored?.effective.names.en).toBe('Accepted bakery')
    expect(restored?.effective.phoneNumber).toEqual(sourceFacts.phoneNumber)
    expect(restored?.effective.location).toEqual(locationFacts.location)
    expect(
      sqlite
        .prepare(
          "SELECT title,description,displayAddress FROM featureI18n WHERE locale='en'",
        )
        .get(),
    ).toEqual({
      title: 'Accepted bakery',
      description: 'Keep this description',
      displayAddress: 'Accepted location',
    })
    expect(
      sqlite
        .prepare("SELECT value FROM featureProperty WHERE propertyId='phone'")
        .get(),
    ).toEqual({ value: JSON.stringify(sourceFacts.phoneNumber) })
    const storedLocation = sqlite
      .prepare(
        "SELECT geometry,spatialIndex,mtrStation,mtrExit FROM feature WHERE id='f'",
      )
      .get()!
    expect(JSON.parse(storedLocation.geometry as string)).toEqual(
      locationFacts.location.geometry,
    )
    expect(storedLocation.spatialIndex).toBeTruthy()
    expect(storedLocation.mtrStation).toBeNull()
    expect(storedLocation.mtrExit).toBeNull()
    expect(
      JSON.parse(
        sqlite.prepare('SELECT geometry FROM featureMtrJob').get()!.geometry as string,
      ),
    ).toEqual(locationFacts.location.geometry)
    if (resetSaved.status !== 'saved') throw new Error('Expected reset')
    sqlite.exec(
      "INSERT INTO featureProperty(featureId,propertyId,propertyValueId,value) VALUES ('f','unrelated',NULL,'keep'); INSERT INTO featurePropertyI18n VALUES ('f','unrelated','en','Keep translation',0); DELETE FROM featureMtrJob;",
    )
    const sourceSnapshot = sqlite.prepare('SELECT * FROM locationRevision').all()
    const phoneOnly = await saveLinkedFeatureForm(db, {
      ...input,
      updatedAt: resetSaved.feature.modifiedAt,
      properties: undefined,
      i18n: {
        en: {
          title: 'Accepted bakery',
          description: 'Keep this description',
          displayAddress: 'Accepted location',
        },
      },
      locationReset: {
        expectedRevision: restored!.version,
        names: [],
        phoneNumber: true,
        location: false,
      },
    })
    expect(phoneOnly).toMatchObject({ status: 'saved', geometryChanged: false })
    expect(
      sqlite
        .prepare("SELECT value FROM featureProperty WHERE propertyId='unrelated'")
        .get(),
    ).toEqual({ value: 'keep' })
    expect(
      sqlite
        .prepare("SELECT value FROM featurePropertyI18n WHERE propertyId='unrelated'")
        .get(),
    ).toEqual({ value: 'Keep translation' })
    expect(sqlite.prepare('SELECT * FROM featureMtrJob').all()).toEqual([])
    expect(sqlite.prepare('SELECT * FROM locationRevision').all()).toEqual(
      sourceSnapshot,
    )
  })
})

describe('initial association versus unlinked form saves', () => {
  it('serializes either winner and rolls back the complete unlinked form on failure', async () => {
    const { db, sqlite } = setup()
    const { getTableColumns } = await import('drizzle-orm')
    const { feature, featureI18n } = await import('#lib/db/schema/feature.js')
    for (const [name, table] of [
      ['feature', feature],
      ['featureI18n', featureI18n],
    ] as const) {
      const existing = new Set(
        sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map(row => row.name),
      )
      for (const column of Object.values(getTableColumns(table)))
        if (!existing.has(column.name))
          sqlite.exec(
            `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
    }
    sqlite.exec(`CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER);
      INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES ('f','en','Bakery','Original address');`)
    sqlite
      .prepare("UPDATE feature SET geometry=? WHERE id='f'")
      .run(JSON.stringify(facts.location.geometry))
    const snapshot = () =>
      [
        'feature',
        'featureI18n',
        'featureProperty',
        'featureLocation',
        'featureLocationHistory',
      ].map(table => sqlite.prepare(`SELECT * FROM ${table}`).all())
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts: { ...facts, phoneNumber: [] } },
      'actor',
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      updatedAt: 'original',
      data: { isVisitable: true },
      i18n: { en: { title: 'Edited bakery', displayAddress: 'Original address' } },
      properties: [],
    }
    const original = snapshot()
    sqlite.exec(`CREATE TRIGGER fail_form BEFORE UPDATE ON featureI18n
      BEGIN SELECT RAISE(ABORT,'injected form failure'); END`)
    await expect(saveUnlinkedFeatureForm(db, input)).rejects.toThrow()
    expect(snapshot()).toEqual(original)
    sqlite.exec('DROP TRIGGER fail_form')
    const saved = await saveUnlinkedFeatureForm(db, input)
    expect(saved).toBeDefined()
    expect(
      sqlite.prepare("SELECT title FROM featureI18n WHERE featureId='f'").get(),
    ).toEqual({ title: 'Edited bakery' })
    expect(await saveUnlinkedFeatureForm(db, input)).toBeUndefined()
    const link = {
      featureId: 'f',
      projectId: 'p',
      locationId: local.locationId,
      revisionId: local.revisionId,
      actorId: 'actor',
      expectedFeatureModifiedAt: 'original',
    }
    expect(await linkInitialFeatureLocation(db, link)).toEqual({ status: 'conflict' })
    expect(
      await linkInitialFeatureLocation(db, {
        ...link,
        expectedFeatureModifiedAt: saved!.modifiedAt,
      }),
    ).toMatchObject({ status: 'linked' })
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.effective.names.en).toBe(
      'Edited bakery',
    )
    const linked = snapshot()
    // Initial linking preserves modifiedAt, so the association guard is essential here.
    expect(
      await saveUnlinkedFeatureForm(db, {
        ...input,
        updatedAt: saved!.modifiedAt,
        i18n: { en: { title: 'Must not overwrite' } },
      }),
    ).toBeUndefined()
    expect(snapshot()).toEqual(linked)
  })
})

describe('atomic Feature creation and draft lifecycle', () => {
  it('rolls back incomplete creation and refuses to overwrite a finalized draft', async () => {
    const { db, sqlite } = setup()
    const { getTableColumns } = await import('drizzle-orm')
    const { feature, featureI18n } = await import('#lib/db/schema/feature.js')
    const { FeatureInsert } = await import('#lib/db/zod/schema/feature.js')
    for (const [name, table] of [
      ['feature', feature],
      ['featureI18n', featureI18n],
    ] as const) {
      const existing = new Set(
        sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map(row => row.name),
      )
      for (const column of Object.values(getTableColumns(table)))
        if (!existing.has(column.name))
          sqlite.exec(
            `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
    }
    sqlite.exec(
      'CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER)',
    )
    const input = {
      data: FeatureInsert.parse({
        id: 'created',
        organisationId: 'org',
        projectId: 'p',
        layerId: 'layer',
        geometry: facts.location.geometry,
        isDraft: true,
      }),
      i18n: { en: { title: 'New draft' } },
      properties: [],
    }
    const snapshot = () =>
      ['feature', 'featureI18n', 'featureProperty'].map(table =>
        sqlite.prepare(`SELECT * FROM ${table}`).all(),
      )
    const before = snapshot()
    sqlite.exec(`CREATE TRIGGER reject_creation BEFORE INSERT ON featureI18n WHEN NEW.featureId='created'
      BEGIN SELECT RAISE(ABORT,'injected creation failure'); END`)
    await expect(createFeatureForm(db, input)).rejects.toThrow()
    expect(snapshot()).toEqual(before)
    sqlite.exec('DROP TRIGGER reject_creation')
    const created = await createFeatureForm(db, input)
    expect(created).toMatchObject({ id: 'created', isDraft: true })
    expect(
      sqlite.prepare("SELECT title FROM featureI18n WHERE featureId='created'").get(),
    ).toEqual({ title: 'New draft' })
    const complete = snapshot()
    await expect(createFeatureForm(db, input)).rejects.toThrow()
    expect(snapshot()).toEqual(complete)
    const finalized = await saveUnlinkedFeatureForm(db, {
      featureId: created.id,
      projectId: 'p',
      updatedAt: created.modifiedAt,
      expectedDraftState: true,
      data: { isDraft: false },
      i18n: { en: { title: 'Submitted feature' } },
    })
    expect(finalized?.isDraft).toBe(false)
    const finalState = snapshot()
    expect(
      await saveUnlinkedFeatureForm(db, {
        featureId: created.id,
        projectId: 'p',
        updatedAt: finalized!.modifiedAt,
        expectedDraftState: true,
        data: { isDraft: true },
        i18n: { en: { title: 'Late draft edit' } },
      }),
    ).toBeUndefined()
    expect(snapshot()).toEqual(finalState)
  })
})

describe('Location link field authorization', () => {
  it.each([
    ['maintainer', 'p', false, true],
    ['owner', 'p', false, true],
    ['translator', 'p', false, false],
    ['maintainer', 'other', false, false],
    ['owner', 'p', true, false],
  ] as const)(
    'checks %s in %s anonymous=%s',
    (role, projectId, isAnonymous, allowed) => {
      const decision = authorizeFeatureUpdateForSubmission({
        user: { id: 'u', isAnonymous },
        userRoles: [{ type: 'project', role, projectId, userId: 'u' } as UserRoleDisco],
        resource: {
          id: 'f',
          projectId: 'p',
          organisationId: 'org',
          resourceHubId: 'hub',
        },
        submittedData: {
          i18n: true,
          properties: true,
          geometry: true,
          addressMeta: true,
        },
      })
      expect(decision.allowed).toBe(allowed)
    },
  )
})

describe('private local Location discovery', () => {
  it('scopes results and treats wildcard characters as literal name text', async () => {
    const { db } = setup()
    const local = await createLocalLocation(
      db,
      'p',
      {
        state: 'manual',
        facts: { ...facts, names: { en: 'Shop 100%_ local', 'zh-hant': '本地麵包' } },
      },
      'u',
    )
    await createLocalLocation(db, 'other', { state: 'unresolved', facts }, 'other-u')
    expect(
      await searchLocalLocationCandidates(db, { projectId: 'p', q: '100%_' }),
    ).toMatchObject([{ ...local, state: 'manual' }])
    expect(
      await searchLocalLocationCandidates(db, { projectId: 'p', q: '麵包' }),
    ).toHaveLength(1)
    expect(
      await searchLocalLocationCandidates(db, { projectId: 'p', q: 'SHOP' }),
    ).toHaveLength(1)
    expect(
      await searchLocalLocationCandidates(db, { projectId: 'p', q: 'Bakery' }),
    ).toHaveLength(1)
    expect(
      await searchLocalLocationCandidates(db, { projectId: 'other', q: '100%_' }),
    ).toEqual([])
  })
  it('matches only the latest baseline and returns no raw provenance', async () => {
    const { db, sqlite } = setup()
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts },
      'u',
    )
    sqlite
      .prepare(
        "INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts) VALUES(?,?,2,'local','new','{}',?)",
      )
      .run(
        'new-revision',
        local.locationId,
        serializeLocationFacts(
          LocationFactsSchema.parse({ ...facts, names: { en: 'Renamed shop' } }),
          'establishment',
        ),
      )
    expect(
      await searchLocalLocationCandidates(db, { projectId: 'p', q: 'Bakery' }),
    ).toEqual([])
    const results = await searchLocalLocationCandidates(db, {
      projectId: 'p',
      q: 'renamed',
    })
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ revisionId: 'new-revision' })
    expect(results[0]).not.toHaveProperty('rawSource')
  })
  it('bounds results and rejects blank or oversized queries', async () => {
    const { db } = setup()
    for (let i = 0; i < 22; i++)
      await createLocalLocation(db, 'p', { state: 'unresolved', facts }, 'u')
    expect(
      await searchLocalLocationCandidates(db, { projectId: 'p', q: 'Bakery' }),
    ).toHaveLength(20)
    await expect(
      searchLocalLocationCandidates(db, { projectId: 'p', q: ' ' }),
    ).rejects.toThrow()
    await expect(
      searchLocalLocationCandidates(db, { projectId: 'p', q: 'x'.repeat(201) }),
    ).rejects.toThrow()
  })
})

describe('explicit Location reassociation', () => {
  it('preserves effective facts and explicit choices, records the actor, and rejects stale retries', async () => {
    const { db, sqlite } = setup()
    sqlite
      .prepare('UPDATE feature SET geometry=? WHERE id=?')
      .run(JSON.stringify(facts.location.geometry), 'f')
    const original = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts },
      'creator',
    )
    const destination = await createLocalLocation(
      db,
      'p',
      {
        state: 'manual',
        facts: { ...facts, names: { en: 'Different', 'zh-hant': '新名稱' } },
      },
      'creator',
    )
    const write = prepareFeatureLocationAssociationWrite(db, {
      featureId: 'f',
      projectId: 'p',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      locationId: original.locationId,
      factsRevisionId: original.revisionId,
      locationRevisionId: original.revisionId,
      actorId: 'first-editor',
      overrides: {
        phoneNumber: { mode: 'override', value: facts.phoneNumber },
        brands: { mode: 'clear' },
      },
    })
    await write.query
    const before = await getAcceptedFeatureLocation(db, 'f', 'p')
    const featureBefore = sqlite.prepare('SELECT * FROM feature').all()
    const input = {
      featureId: 'f',
      projectId: 'p',
      ...destination,
      expectedFeatureModifiedAt: 'original',
      expectedRevision: write.version,
      actorId: 'second-editor',
    }
    const changed = await relinkFeatureLocation(db, input)
    expect(changed.status).toBe('linked')
    const after = await getAcceptedFeatureLocation(db, 'f', 'p')
    expect(after?.effective).toEqual({
      ...before?.effective,
      names: { ...before?.effective.names, 'zh-hant': null },
    })
    expect(after?.locationId).toBe(destination.locationId)
    const overrides = JSON.parse(
      String(
        sqlite
          .prepare('SELECT acceptedOverrides AS overrides FROM featureLocation')
          .get()?.overrides,
      ),
    )
    expect(overrides.phoneNumber).toEqual({
      mode: 'override',
      value: facts.phoneNumber,
    })
    expect(overrides.brands).toEqual({ mode: 'clear' })
    expect(overrides.names.en).toEqual({ mode: 'override', value: 'Bakery' })
    expect(overrides.names['zh-hant']).toEqual({ mode: 'clear' })
    expect(sqlite.prepare('SELECT * FROM feature').all()).toEqual(featureBefore)
    expect(
      sqlite
        .prepare(
          'SELECT actorId,previousRevision,locationId FROM featureLocationHistory ORDER BY id DESC LIMIT 1',
        )
        .get(),
    ).toEqual({
      actorId: 'second-editor',
      previousRevision: write.version,
      locationId: destination.locationId,
    })
    expect(await relinkFeatureLocation(db, input)).toEqual({ status: 'conflict' })
    expect(sqlite.prepare('SELECT count(*) AS n FROM location').get()?.n).toBe(2)
  })
  it('rejects inaccessible destinations and stale Feature timestamps without history writes', async () => {
    const { db, sqlite } = setup()
    sqlite
      .prepare('UPDATE feature SET geometry=? WHERE id=?')
      .run(JSON.stringify(facts.location.geometry), 'f')
    const original = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'creator',
    )
    const destination = await createLocalLocation(
      db,
      'other',
      { state: 'manual', facts },
      'creator',
    )
    const linked = await linkInitialFeatureLocation(db, {
      featureId: 'f',
      projectId: 'p',
      ...original,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
    })
    if (linked.status !== 'linked') throw new Error('Expected link')
    const input = {
      featureId: 'f',
      projectId: 'p',
      ...destination,
      expectedFeatureModifiedAt: 'original',
      expectedRevision: linked.revision,
      actorId: 'actor',
    }
    expect(await relinkFeatureLocation(db, input)).toEqual({
      status: 'place-unavailable',
    })
    expect(
      await relinkFeatureLocation(db, {
        ...input,
        ...original,
        expectedFeatureModifiedAt: 'stale',
      }),
    ).toEqual({ status: 'conflict' })
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM featureLocationHistory').get()?.n,
    ).toBe(1)
  })
})

describe('atomic unresolved Feature split application', () => {
  async function fixture() {
    const { db, sqlite } = setup()
    sqlite
      .prepare('UPDATE feature SET geometry=? WHERE id=?')
      .run(JSON.stringify(facts.location.geometry), 'f')
    sqlite.exec(
      "INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES ('f','en','Shop','Original address')",
    )
    const baseline = await readFeatureLocationBaseline(db, 'f', 'p')
    if (baseline.status !== 'ready') throw new Error('Expected baseline')
    const result = planUnresolvedFeatureSplit(baseline.baseline)
    if (result.status !== 'planned') throw new Error('Expected plan')
    return { db, sqlite, plan: result.plan, baseline: baseline.baseline }
  }
  it('applies once, preserves values and replays without duplicate history', async () => {
    const { db, sqlite, plan, baseline } = await fixture()
    const before = ['feature', 'featureI18n', 'featureProperty'].map(t =>
      sqlite.prepare(`SELECT * FROM ${t}`).all(),
    )
    expect(await applyUnresolvedFeatureSplit(db, plan, 'actor')).toEqual({
      status: 'applied',
    })
    expect(await applyUnresolvedFeatureSplit(db, plan, 'actor')).toEqual({
      status: 'already-applied',
    })
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.effective).toEqual(
      baseline.effective,
    )
    expect(
      ['feature', 'featureI18n', 'featureProperty'].map(t =>
        sqlite.prepare(`SELECT * FROM ${t}`).all(),
      ),
    ).toEqual(before)
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM featureLocationHistory').get()?.n,
    ).toBe(1)
    expect(
      sqlite.prepare('SELECT actorId FROM featureLocationHistory').get()?.actorId,
    ).toBe('actor')
  })
  it('rejects altered manifests, changed baselines and identity collisions', async () => {
    const { db, sqlite, plan } = await fixture()
    expect(
      await applyUnresolvedFeatureSplit(
        db,
        { ...plan, facts: { ...plan.facts, names: { en: 'Injected' } } },
        'actor',
      ),
    ).toEqual({ status: 'conflict' })
    sqlite.exec("UPDATE featureI18n SET title='Changed without timestamp'")
    expect(await applyUnresolvedFeatureSplit(db, plan, 'actor')).toEqual({
      status: 'conflict',
    })
    sqlite.exec("UPDATE featureI18n SET title='Shop'")
    sqlite
      .prepare(
        "INSERT INTO location(id,state,ownerOrganisationId) VALUES (?,'manual','p')",
      )
      .run(plan.locationId)
    expect(await applyUnresolvedFeatureSplit(db, plan, 'actor')).toEqual({
      status: 'conflict',
    })
    expect(sqlite.prepare('SELECT count(*) AS n FROM featureLocation').get()?.n).toBe(0)
  })
  it('leaves no orphan when a concurrent save wins after baseline validation', async () => {
    const { db, sqlite, plan } = await fixture()
    const originalBatch = db.batch.bind(db)
    db.batch = ((queries: Parameters<Database['batch']>[0]) => {
      sqlite.exec("UPDATE feature SET modifiedAt='concurrent-save' WHERE id='f'")
      return originalBatch(queries)
    }) as unknown as Database['batch']
    expect(await applyUnresolvedFeatureSplit(db, plan, 'actor')).toEqual({
      status: 'conflict',
    })
    for (const table of [
      'location',
      'locationRevision',
      'featureLocation',
      'featureLocationHistory',
    ])
      expect(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0)
    expect(
      sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='f'").get()?.modifiedAt,
    ).toBe('concurrent-save')
  })

  it('rolls back Location and revision when association/history insertion fails', async () => {
    const { db, sqlite, plan } = await fixture()
    sqlite.exec(
      "CREATE TRIGGER fail_split BEFORE INSERT ON featureLocationHistory BEGIN SELECT RAISE(ABORT,'injected failure'); END",
    )
    await expect(applyUnresolvedFeatureSplit(db, plan, 'actor')).rejects.toThrow(
      'injected failure',
    )
    for (const table of [
      'location',
      'locationRevision',
      'featureLocation',
      'featureLocationHistory',
    ])
      expect(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0)
  })
  it('does not replay over later user overrides', async () => {
    const { db, sqlite, plan } = await fixture()
    await applyUnresolvedFeatureSplit(db, plan, 'actor')
    sqlite.exec(
      `UPDATE featureLocation SET acceptedOverrides='{"names":{"en":{"mode":"override","value":"Later"}}}',version='later'`,
    )
    expect(await applyUnresolvedFeatureSplit(db, plan, 'actor')).toEqual({
      status: 'conflict',
    })
  })
})

describe('accepted Location brand read projection', () => {
  it('uses accepted revisions and honors override/clear without extra reads or legacy fallback', async () => {
    const { db, sqlite } = setup()
    const query = async () => {
      const row = await db.query.feature.findFirst({
        columns: { id: true },
        extras: {
          locationBrands: featureLocationBrandsSQL(false).as('locationBrands'),
        },
      })
      return {
        locationBrands: FeatureListProfileAPI.shape.locationBrands.parse(
          row?.locationBrands,
        ),
      }
    }
    expect((await query())?.locationBrands).toBeNull()
    const brands = [
      {
        identifiers: { breadlineBrand: 'kayser' },
        names: { en: 'Maison Kayser', 'zh-hant': '品牌' },
      },
    ]
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts: { ...facts, brands } },
      'actor',
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      locationId: local.locationId,
      factsRevisionId: local.revisionId,
      locationRevisionId: local.revisionId,
      overrides: {},
      actorId: 'actor',
    }
    const write = prepareFeatureLocationAssociationWrite(db, input)
    await write.query
    expect((await query())?.locationBrands).toEqual(brands)
    sqlite
      .prepare(
        "INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts) VALUES ('future',?,2,'local','hash','{}',?)",
      )
      .run(
        local.locationId,
        serializeLocationFacts(
          LocationFactsSchema.parse({ ...facts, brands: [] }),
          'establishment',
        ),
      )
    expect((await query())?.locationBrands).toEqual(brands)
    const changed = prepareFeatureLocationAssociationWrite(db, {
      ...input,
      expectedRevision: write.version,
      overrides: {
        brands: {
          mode: 'override',
          value: [{ identifiers: {}, names: { en: 'Correction' } }],
        },
      },
    })
    await changed.query
    expect((await query())?.locationBrands).toEqual([
      { identifiers: {}, names: { en: 'Correction' } },
    ])
    await prepareFeatureLocationAssociationWrite(db, {
      ...input,
      expectedRevision: changed.version,
      overrides: { brands: { mode: 'clear' } },
    }).query
    expect((await query())?.locationBrands).toEqual([])
    sqlite.exec('UPDATE feature SET isDraft=1')
    expect((await query())?.locationBrands).toBeNull()
    sqlite.exec(
      "UPDATE feature SET isDraft=0; UPDATE location SET ownerOrganisationId='other',state='manual'",
    )
    expect((await query())?.locationBrands).toBeNull()
  })
})

describe('explicit Location unlink preservation', () => {
  async function linked() {
    const store = setup()
    const brands = [
      { identifiers: { wikidata: 'Q1' }, names: { en: 'First', 'zh-hant': '一' } },
      { identifiers: {}, names: { en: 'Second' } },
    ]
    store.sqlite
      .prepare('UPDATE feature SET geometry=?')
      .run(JSON.stringify(facts.location.geometry))
    const local = await createLocalLocation(
      store.db,
      'p',
      { state: 'manual', facts: { ...facts, brands } },
      'creator',
    )
    const write = prepareFeatureLocationAssociationWrite(store.db, {
      featureId: 'f',
      projectId: 'p',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      ...local,
      factsRevisionId: local.revisionId,
      locationRevisionId: local.revisionId,
      overrides: {},
      actorId: 'linker',
    })
    await write.query
    return {
      ...store,
      brands,
      local,
      input: {
        featureId: 'f',
        projectId: 'p',
        expectedFeatureModifiedAt: 'original',
        expectedRevision: write.version,
        actorId: 'unlinker',
      },
    }
  }

  it('retains ordered localized brands and fields, records the actor, and relinks without loss', async () => {
    const { db, sqlite, input, brands, local } = await linked()
    const before = sqlite.prepare('SELECT geometry,addressMeta FROM feature').get()
    expect(await unlinkFeatureLocation(db, input)).toMatchObject({ status: 'unlinked' })
    expect(await getAcceptedFeatureLocation(db, 'f', 'p')).toBeNull()
    const row = await db.query.feature.findFirst({
      columns: { id: true },
      extras: { locationBrands: featureLocationBrandsSQL(false).as('locationBrands') },
    })
    expect(JSON.parse(row!.locationBrands!)).toEqual(brands)
    expect(sqlite.prepare('SELECT geometry,addressMeta FROM feature').get()).toEqual(
      before,
    )
    expect(
      sqlite
        .prepare("SELECT actorId FROM featureLocationHistory WHERE action='unlink'")
        .get(),
    ).toMatchObject({ actorId: 'unlinker' })
    expect(await unlinkFeatureLocation(db, input)).toEqual({ status: 'conflict' })
    const baseline = await readFeatureLocationBaseline(db, 'f', 'p')
    expect(baseline.status).toBe('ready')
    if (baseline.status !== 'ready') throw new Error('Missing baseline')
    expect(baseline.baseline.effective.brands).toEqual(brands)
    expect(
      await linkInitialFeatureLocation(db, {
        ...input,
        ...local,
        expectedFeatureModifiedAt: baseline.baseline.modifiedAt,
      }),
    ).toMatchObject({ status: 'linked' })
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.effective.brands).toEqual(
      brands,
    )
    expect(
      sqlite
        .prepare(
          'SELECT localLocationBrands FROM feature WHERE localLocationBrands IS NOT NULL',
        )
        .all(),
    ).toHaveLength(0)
  })

  it('saves detached brand edits with the regular form, rejects stale and inherit, and rolls back late failures', async () => {
    const { db, sqlite, input } = await linked()
    const { getTableColumns } = await import('drizzle-orm')
    const { feature, featureI18n } = await import('#lib/db/schema/feature.js')
    for (const [name, table] of [
      ['feature', feature],
      ['featureI18n', featureI18n],
    ] as const) {
      const existing = new Set(
        sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map(row => row.name),
      )
      for (const column of Object.values(getTableColumns(table)))
        if (!existing.has(column.name))
          sqlite.exec(
            `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
    }
    const result = await unlinkFeatureLocation(db, input)
    if (result.status !== 'unlinked') throw new Error('Unlink failed')
    const updatedAt = (
      sqlite.prepare('SELECT modifiedAt FROM feature').get() as { modifiedAt: string }
    ).modifiedAt
    const edit = {
      featureId: 'f',
      projectId: 'p',
      actorId: 'editor',
      updatedAt,
      data: { isVisitable: true },
      i18n: { en: { title: 'Edited' } },
      locationBrandEdit: {
        expectedRevision: result.revision,
        choice: {
          mode: 'override' as const,
          value: [
            {
              identifiers: { wikidata: 'Q2' },
              names: { en: 'Corrected', 'zh-hant': '修正' },
            },
          ],
        },
      },
    }
    expect(await saveLinkedFeatureForm(db, edit)).toEqual({ status: 'unlinked' })
    expect(
      await saveUnlinkedFeatureForm(db, {
        ...edit,
        locationBrandEdit: { ...edit.locationBrandEdit, expectedRevision: 'stale' },
      }),
    ).toBeUndefined()
    await expect(
      saveUnlinkedFeatureForm(db, {
        ...edit,
        locationBrandEdit: { ...edit.locationBrandEdit, choice: { mode: 'inherit' } },
      }),
    ).rejects.toThrow('cannot inherit')
    const before = await getDetachedFeatureBrands(db, 'f', 'p')
    sqlite.exec(
      "CREATE TRIGGER fail_detached_form BEFORE INSERT ON featureI18n BEGIN SELECT RAISE(ABORT,'late failure'); END;",
    )
    await expect(saveUnlinkedFeatureForm(db, edit)).rejects.toThrow()
    expect(await getDetachedFeatureBrands(db, 'f', 'p')).toEqual(before)
    expect(sqlite.prepare('SELECT modifiedAt FROM feature').get()).toMatchObject({
      modifiedAt: updatedAt,
    })
    sqlite.exec('DROP TRIGGER fail_detached_form')
    expect(await saveUnlinkedFeatureForm(db, edit)).toBeDefined()
    const saved = await getDetachedFeatureBrands(db, 'f', 'p')
    expect(saved?.brands).toEqual(edit.locationBrandEdit.choice.value)
    expect(saved?.revision).not.toBe(result.revision)
    expect(await getDetachedFeatureBrands(db, 'f', 'other')).toBeNull()
    expect(await saveUnlinkedFeatureForm(db, edit)).toBeUndefined()
  })

  it('keeps an explicit brand clear empty after unlink and leaves source facts intact', async () => {
    const { db, sqlite, input, brands, local } = await linked()
    sqlite.exec(
      `UPDATE featureLocation SET acceptedOverrides='{"brands":{"mode":"clear"}}',version='cleared'`,
    )
    expect(
      await unlinkFeatureLocation(db, { ...input, expectedRevision: 'cleared' }),
    ).toMatchObject({ status: 'unlinked' })
    const row = await db.query.feature.findFirst({
      columns: { id: true },
      extras: { locationBrands: featureLocationBrandsSQL(false).as('locationBrands') },
    })
    expect(JSON.parse(row!.locationBrands!)).toEqual([])
    const source = sqlite
      .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
      .get(local.revisionId) as { facts: string }
    expect(readLocationFacts(source.facts).brands).toEqual(brands)
    expect(sqlite.prepare('SELECT id FROM location').all()).toHaveLength(1)
  })

  it('rejects stale Feature tokens and private scope without adding evidence', async () => {
    const { db, sqlite, input } = await linked()
    expect(
      await unlinkFeatureLocation(db, { ...input, expectedFeatureModifiedAt: 'stale' }),
    ).toEqual({ status: 'conflict' })
    expect(await unlinkFeatureLocation(db, { ...input, projectId: 'other' })).toEqual({
      status: 'conflict',
    })
    expect(
      sqlite
        .prepare(
          'SELECT localLocationBrands FROM feature WHERE localLocationBrands IS NOT NULL',
        )
        .all(),
    ).toHaveLength(0)
    expect(
      sqlite
        .prepare("SELECT * FROM featureLocationHistory WHERE action='unlink'")
        .all(),
    ).toHaveLength(0)
    expect(await getAcceptedFeatureLocation(db, 'f', 'p')).not.toBeNull()
  })

  it('rolls back preserved brands and the Feature timestamp when deletion fails', async () => {
    const { db, sqlite, input } = await linked()
    sqlite.exec(
      "CREATE TRIGGER fail_unlink BEFORE DELETE ON featureLocation BEGIN SELECT RAISE(ABORT,'injected unlink failure'); END;",
    )
    await expect(unlinkFeatureLocation(db, input)).rejects.toThrow()
    expect(
      sqlite
        .prepare(
          'SELECT localLocationBrands FROM feature WHERE localLocationBrands IS NOT NULL',
        )
        .all(),
    ).toHaveLength(0)
    expect(sqlite.prepare('SELECT modifiedAt FROM feature').get()).toMatchObject({
      modifiedAt: 'original',
    })
    expect(
      sqlite
        .prepare("SELECT * FROM featureLocationHistory WHERE action='unlink'")
        .all(),
    ).toHaveLength(0)
    expect(await getAcceptedFeatureLocation(db, 'f', 'p')).not.toBeNull()
  })
})

describe('persisted Location adoption preview', () => {
  it('uses stored policy and accepted revisions without mutating the Feature or source', async () => {
    const { db, sqlite } = setup()
    const projection: SaanSeoiPlaceProjection = {
      ssId: 'shop',
      apiVersion: 'v0.1',
      releaseId: 'release1',
      snapshotId: 'snapshot1',
      facts: LocationFactsSchema.parse(facts),
      issues: [],
      rawSource: {
        resource: {
          attributes: {
            basicCategory: 'bakery',
            taxonomy: { primary: 'bakery' },
            operatingStatus: 'open',
          },
        },
      },
    }
    const first = await persistSaanSeoiPlace(db, projection)
    const association = prepareFeatureLocationAssociationWrite(db, {
      featureId: 'f',
      projectId: 'p',
      locationId: first.locationId,
      factsRevisionId: first.revisionId,
      locationRevisionId: first.revisionId,
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      actorId: 'actor',
      overrides: {},
    })
    await association.query
    const nextFacts = structuredClone(projection.facts)
    nextFacts.location.geometry.coordinates[0] += 0.01
    const next = await persistSaanSeoiPlace(db, {
      ...projection,
      facts: nextFacts,
      releaseId: 'release2',
      snapshotId: 'snapshot2',
    })
    const snapshot = () =>
      ['feature', 'featureLocation', 'featureLocationHistory', 'locationRevision'].map(
        table => sqlite.prepare(`SELECT * FROM ${table}`).all(),
      )
    const before = snapshot()
    const input = {
      featureId: 'f',
      projectId: 'p',
      candidateRevisionId: next.revisionId,
    }
    const result = await previewFeatureLocationAdoption(db, input)
    expect(result).toMatchObject({
      expectedRevision: association.version,
      expectedFeatureModifiedAt: 'original',
      settings: { revision: 0 },
      plan: { factsRevisionId: next.revisionId, locationRevisionId: first.revisionId },
    })
    expect(snapshot()).toEqual(before)
    expect(
      await previewFeatureLocationAdoption(db, { ...input, projectId: 'other' }),
    ).toBeNull()
    await saveProjectLocationSettings(
      db,
      'p',
      { ...DEFAULT_PROJECT_LOCATION_POLICY, coordinates: { mode: 'follow' } },
      0,
    )
    expect(
      (await previewFeatureLocationAdoption(db, input))?.plan.locationRevisionId,
    ).toBe(next.revisionId)
    expect(
      await proposeFeatureLocationAdoption(db, { ...input, additionalGuard: sql`0` }),
    ).toBeNull()
    let proposed = await proposeFeatureLocationAdoption(db, input)
    expect(proposed?.proposal.policyRevision).toBe(1)
    expect(proposed?.decisions).toEqual([])
    if (!proposed) throw new Error('Missing proposal')
    const originalProposal = proposed
    await saveProjectLocationSettings(db, 'p', DEFAULT_PROJECT_LOCATION_POLICY, 1)
    expect((await proposeFeatureLocationAdoption(db, input))?.proposal.id).toBe(
      originalProposal.proposal.id,
    )
    proposed = await proposeFeatureLocationAdoption(db, {
      ...input,
      reevaluatePending: true,
    })
    if (!proposed) throw new Error('Missing refreshed proposal')
    expect(proposed.proposal.id).not.toBe(originalProposal.proposal.id)
    expect(proposed.proposal.policyRevision).toBe(2)
    const rejection = {
      featureId: 'f',
      projectId: 'p',
      proposalId: proposed.proposal.id,
      fieldGroup: 'location' as const,
      expectedRevision: association.version,
      expectedFeatureModifiedAt: 'original',
      actorId: 'reviewer',
      reason: 'Wrong premises',
    }
    expect(
      await rejectLocationAdoptionGroup(db, {
        ...rejection,
        expectedRevision: 'stale',
      }),
    ).toBeNull()
    expect(
      await rejectLocationAdoptionGroup(db, { ...rejection, projectId: 'other' }),
    ).toBeNull()
    expect(
      await rejectLocationAdoptionGroup(db, {
        ...rejection,
        proposalId: originalProposal.proposal.id,
      }),
    ).toBeNull()
    expect(await rejectLocationAdoptionGroup(db, rejection)).toMatchObject({
      fieldGroup: 'location',
      action: 'rejected',
      actorId: 'reviewer',
      reason: 'Wrong premises',
    })
    expect(
      await rejectLocationAdoptionGroup(db, { ...rejection, reason: 'Overwrite' }),
    ).toBeNull()
    await saveProjectLocationSettings(db, 'p', DEFAULT_PROJECT_LOCATION_POLICY, 2)
    const replay = await proposeFeatureLocationAdoption(db, input)
    expect(replay?.proposal).toEqual({
      ...proposed.proposal,
      locationDecision: replay?.decisions[0],
    })
    const refreshedPending = await proposeFeatureLocationAdoption(db, {
      ...input,
      reevaluatePending: true,
    })
    expect(refreshedPending?.proposal.id).not.toBe(proposed.proposal.id)
    expect(refreshedPending?.decisions).toEqual(replay?.decisions)
    expect(replay?.decisions).toHaveLength(1)
    expect(replay?.decisions[0].fieldGroup).toBe('location')
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM locationAdoptionProposal').get(),
    ).toEqual({ n: 3 })
    expect(
      await readLocationAdoptionReview(db, { ...rejection, projectId: 'other' }),
    ).toBeNull()
    expect(() =>
      sqlite.exec(
        "UPDATE locationAdoptionProposal SET factsDecision=json_set(factsDecision,'$.reason','changed'),locationDecision=json_set(locationDecision,'$.reason','changed')",
      ),
    ).toThrow('immutable')
    expect(() => sqlite.exec('DELETE FROM locationAdoptionProposal')).toThrow(
      'immutable',
    )
    expect(snapshot()).toEqual(before)
    sqlite.exec("UPDATE location SET sourceAvailability='missing'")
    expect(await previewFeatureLocationAdoption(db, input)).toBeNull()
    expect((await proposeFeatureLocationAdoption(db, input))?.decisions).toHaveLength(1)
    sqlite.exec("DELETE FROM feature WHERE id='f'")
    expect(await readLocationAdoptionReview(db, rejection)).toBeNull()
    expect(
      sqlite
        .prepare(
          `SELECT count(*) AS n FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .get(),
    ).toEqual({ n: 1 })
  })
})

describe('atomic source group application', () => {
  async function fixture(automaticLocation = false) {
    const { db, sqlite, binding } = setup()
    const { getTableColumns } = await import('drizzle-orm')
    const { feature, featureI18n } = await import('#lib/db/schema/feature.js')
    for (const [name, table] of [
      ['feature', feature],
      ['featureI18n', featureI18n],
    ] as const) {
      const existing = new Set(
        sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map(row => row.name),
      )
      for (const column of Object.values(getTableColumns(table)))
        if (!existing.has(column.name))
          sqlite.exec(
            `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
    }
    sqlite.exec(`CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER);
      INSERT INTO hub VALUES ('core','core');
      INSERT INTO property(id,key,scope,hubId) VALUES ('phone','phoneNumber','hub','core');
      INSERT INTO featureProperty(featureId,propertyId,propertyValueId,value) VALUES ('f','phone',NULL,'["+85223456789"]');
      INSERT INTO featureI18n(featureId,locale,title,description,displayAddress)
        VALUES ('f','en','Local correction','Keep description','Original address'),
               ('f','zh-hant','舊名稱','保留說明','舊地址');`)
    sqlite
      .prepare('UPDATE feature SET geometry=?')
      .run(JSON.stringify(facts.location.geometry))
    const source: SaanSeoiPlaceProjection = {
      ssId: 'shop',
      apiVersion: 'v0.1',
      releaseId: 'release1',
      snapshotId: 'snapshot1',
      facts: LocationFactsSchema.parse({
        ...facts,
        names: { en: 'Bakery', 'zh-hant': '舊名稱' },
      }),
      issues: [],
      rawSource: {
        meta: {
          apiReleaseSet: 'publication-one',
          apiCatalogRevision: 'catalog-one',
          catalogPublishedAt: '2026-09-01T00:00:00Z',
          cohort: '2026-08-23.0',
          resolvedApiVersion: 'api-places-v0.1',
          domain: 'overture',
          region: 'hk',
        },
        resource: {
          attributes: {
            basicCategory: 'bakery',
            taxonomy: { primary: 'bakery' },
            operatingStatus: 'open',
          },
        },
      },
    }
    const first = await persistSaanSeoiPlace(db, source)
    const link = prepareFeatureLocationAssociationWrite(db, {
      featureId: 'f',
      projectId: 'p',
      locationId: first.locationId,
      factsRevisionId: first.revisionId,
      locationRevisionId: first.revisionId,
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      actorId: 'actor',
      overrides: {
        names: { en: { mode: 'override', value: 'Local correction' } },
        brands: { mode: 'clear' },
      },
    })
    await link.query
    const nextFacts = structuredClone(source.facts)
    nextFacts.phoneNumber = ['+85291234567']
    nextFacts.location.geometry.coordinates[0] += 0.01
    const nextSource: SaanSeoiPlaceProjection = {
      ...source,
      facts: nextFacts,
      releaseId: 'release2',
      snapshotId: 'snapshot2',
      rawSource: {
        ...source.rawSource,
        meta: {
          apiReleaseSet: 'publication-two',
          apiCatalogRevision: 'catalog-two',
          catalogPublishedAt: '2026-10-01T00:00:00Z',
          cohort: '2026-09-23.0',
          resolvedApiVersion: 'api-places-v0.1',
          domain: 'overture',
          region: 'hk',
        },
      },
    }
    const next = await persistSaanSeoiPlace(db, nextSource)
    if (automaticLocation)
      await saveProjectLocationSettings(
        db,
        'p',
        { ...DEFAULT_PROJECT_LOCATION_POLICY, coordinates: { mode: 'follow' } },
        0,
      )
    const proposal = await proposeFeatureLocationAdoption(db, {
      featureId: 'f',
      projectId: 'p',
      candidateRevisionId: next.revisionId,
    })
    if (!proposal) throw new Error('Missing proposal')
    const migration = readFileSync('migrations/0096_feature_mtr_access.sql', 'utf8')
    sqlite.exec(migration.slice(migration.indexOf('CREATE TABLE featureMtrJob')))
    sqlite.exec(
      "DELETE FROM featureMtrJob; UPDATE feature SET mtrStation='OLD',mtrExit='OLD'",
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      proposalId: proposal.proposal.id,
      expectedRevision: link.version,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
      reason: 'Reviewed source',
      fieldGroup: 'facts' as const,
      mode: 'automatic' as const,
    }
    return { db, sqlite, binding, input, first, next, nextSource }
  }

  it('records policy-approved adoption and its source decision in one Feature revision transaction', async () => {
    const f = await fixture(true)
    const { getTableColumns, getTableName } = await import('drizzle-orm')
    const schema = await import('#lib/db/schema/index.js')
    const { readFeatureRevisionSource } = await import(
      '#lib/db/services/featureRevisionSource.js'
    )
    const { buildFeatureRevisionBaselineContent } = await import(
      '#lib/db/services/featureRevisionContent.js'
    )
    const { initializeFeatureRevision } = await import(
      '#lib/db/services/featureRevision.js'
    )
    // Complete the older Location fixture with current content columns and real revision triggers.
    for (const table of [
      schema.feature,
      schema.featureI18n,
      schema.featureProperty,
      schema.featurePropertyI18n,
      schema.featureLocation,
      schema.image,
      schema.featureImage,
      schema.property,
      schema.propertyI18n,
      schema.propertyValue,
      schema.propertyValueI18n,
      schema.featureLocationMembership,
    ]) {
      const name = getTableName(table)
      const existing = new Set(
        f.sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map(row => row.name),
      )
      if (!existing.size) {
        f.sqlite.exec(
          `CREATE TABLE ${name} (${Object.values(getTableColumns(table))
            .map(
              column =>
                `"${column.name}" ${column.getSQLType()}${column.name === 'id' ? ' PRIMARY KEY' : ''}`,
            )
            .join(',')})`,
        )
      } else
        for (const column of Object.values(getTableColumns(table))) {
          if (!existing.has(column.name))
            f.sqlite.exec(
              `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
            )
        }
    }
    f.sqlite.exec(`UPDATE feature SET organisationId='p',layerId='l',isPublished=1,localIsPublished=1,isVisitable=0;
      UPDATE featureI18n SET titleGen=1,descriptionGen=1,displayAddressGen=1;
      UPDATE property SET type='specifier',component='PhoneField',dataType='text',dateResolution='day',timeMaxHour=24,
        cardinality='many',presentation='text',isTranslatable=0;
    `)
    f.sqlite.exec(readFileSync('migrations/0171_feature_revisions.sql', 'utf8'))
    f.sqlite.exec(readFileSync('migrations/0172_image_revisions.sql', 'utf8'))
    const source = (await readFeatureRevisionSource(f.db, 'f', sql`1`))!
    const content = buildFeatureRevisionBaselineContent(source.snapshot, {
      revisions: {},
      order: [],
    })
    const baseline = await initializeFeatureRevision(f.db, {
      featureId: 'f',
      actorId: 'baseline',
      guard: source.unchanged,
      content,
      published: true,
    })
    expect(baseline).not.toBeNull()
    f.sqlite.exec(
      "CREATE TRIGGER fail_adoption_revision BEFORE INSERT ON featureRevisionPublication WHEN NEW.generation>0 BEGIN SELECT RAISE(ABORT,'adoption receipt failure'); END",
    )
    await expect(applyLocationAdoptionGroup(f.db, f.input)).rejects.toThrow()
    expect(
      f.sqlite.prepare('SELECT publishedRevisionId FROM featureRevisionHead').get(),
    ).toEqual({ publishedRevisionId: baseline })
    expect(
      f.sqlite.prepare('SELECT factsDecision FROM locationAdoptionProposal').get(),
    ).toEqual({ factsDecision: null })
    f.sqlite.exec('DROP TRIGGER fail_adoption_revision')
    expect((await applyLocationAdoptionGroup(f.db, f.input)).status).toBe('applied')
    const accepted = f.sqlite
      .prepare(`SELECT r.content,cs.origin,cs.actorId,cs.reason FROM featureRevisionHead h
      JOIN featureRevision r ON r.id=h.publishedRevisionId JOIN revisionChangeSet cs ON cs.id=r.changeSetId`)
      .get()!
    expect(accepted.origin).toBe('system')
    expect(accepted.actorId).toBe(f.input.actorId)
    expect(accepted.reason).toContain(f.input.proposalId)
    const after = (await readFeatureRevisionSource(f.db, 'f', sql`1`))!
    expect(JSON.parse(String(accepted.content))).toEqual(
      buildFeatureRevisionBaselineContent(after.snapshot, { revisions: {}, order: [] }),
    )
  })

  it.each(['success', 'mismatch', 'retry', 'expired'])(
    'hydrates a bounded refresh item before fenced ingestion: %s',
    async mode => {
      const { sqlite, binding, nextSource, first } = await fixture(true)

      nextSource.facts.location.address = {
        ...nextSource.facts.location.address,
        status: 'unresolved',
        snapshotId: 'address-snapshot',
        address2dId: 'building',
      }
      nextSource.issues.push({ kind: 'addressRecordsPending' })
      const target = readLocationPublicationMetadata(nextSource.rawSource.meta)
      sqlite
        .prepare(
          "UPDATE locationRefresh SET phase='ready',target=?,runId='run',lease='owner',leaseUntil=?",
        )
        .run(JSON.stringify(target), Date.now() + 60000)
      sqlite
        .prepare(
          "INSERT INTO locationRefreshItem(runId,locationId,ssId,projection,status) VALUES('run',?,'shop',?,'pending')",
        )
        .run(first.locationId, JSON.stringify(nextSource))
      const response = {
        data: {
          type: 'addresses',
          id: 'building',
          attributes: {
            snapshotId: mode === 'mismatch' ? 'other-snapshot' : 'address-snapshot',
            address3dCoverage: { kind: 'none' },
            sources: [],
            i18n: { en: { formattedAddress: 'Building' } },
          },
        },
        meta: {
          apiReleaseSet: 'addresses',
          apiCatalogRevision: 'address-catalog',
          catalogPublishedAt: '2026-09-30T00:00:00Z',
          cohort: '2026-09-23.0',
          domain: 'saanseoi',
          profile: 'full',
          resolvedApiVersion: 'api-addresses-v0.1',
        },
        links: {
          permalink:
            'https://source.example/addresses/v0.1/building?releaseSet=addresses&catalogRevision=address-catalog&knownAt=2026-09-30T00%3A00%3A00Z&cohort=2026-09-23.0&domain=saanseoi',
        },
      }
      let requests = 0
      const fetcher = async () => {
        requests++
        if (mode === 'expired' && requests === 2)
          sqlite.exec('UPDATE locationRefresh SET leaseUntil=0')
        return mode === 'retry'
          ? new Response(null, { status: 503 })
          : Response.json(response)
      }
      const before = sqlite.prepare('SELECT * FROM feature').all()
      const tick = () =>
        processLocationRefresh(
          binding,
          { runId: 'run', lease: 'owner', target },
          {
            baseUrl: 'https://source.example',
            apiKey: 'test',
            fetch: fetcher as unknown as typeof fetch,
          },
        )
      if (mode === 'retry') await expect(tick()).rejects.toThrow('503')
      else expect(await tick()).toBe(mode === 'expired' ? 'superseded' : 'ingested')
      expect(sqlite.prepare('SELECT * FROM feature').all()).toEqual(before)
      const saved = sqlite
        .prepare('SELECT revisionId FROM locationRefreshItem')
        .get()?.revisionId
      if (mode === 'retry' || mode === 'expired') {
        expect(saved).toBeNull()
        expect(
          sqlite.prepare('SELECT count(*) AS n FROM locationRevision').get()?.n,
        ).toBe(2)
      } else {
        const row = sqlite
          .prepare('SELECT facts,rawSource FROM locationRevisionContent WHERE id=?')
          .get(saved as string)
        expect(readLocationFacts(row?.facts).location.address.status).toBe(
          mode === 'success' ? 'resolved' : 'unresolved',
        )
        if (mode === 'mismatch')
          expect(JSON.parse(String(row?.rawSource)).addressHydration.reason).toBe(
            'address-dependency-mismatch',
          )
      }
      if (mode === 'mismatch') {
        expect(await tick()).toBe('assessed')
        expect(
          sqlite
            .prepare(
              `SELECT fieldGroup FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
            )
            .all(),
        ).toEqual([{ fieldGroup: 'facts' }])
        expect(
          sqlite
            .prepare(
              "SELECT json_extract(value,'$.outcome') AS outcome FROM locationRefreshItem,json_each(outcomes)",
            )
            .get()?.outcome,
        ).toBe('review')
      }
      expect(requests).toBe(mode === 'retry' ? 1 : 2)
    },
  )

  it('retains a source review when a scan is older than the latest mirrored publication', async () => {
    const { sqlite, binding, first } = await fixture(true)

    const original = sqlite
      .prepare('SELECT * FROM locationRevisionContent WHERE id=?')
      .get(first.revisionId)
    if (!original) throw new Error('Missing original source fixture')
    const projection = {
      ssId: 'shop',
      apiVersion: original.apiVersion,
      releaseId: original.releaseId,
      snapshotId: original.snapshotId,
      facts: readLocationFacts(original.facts),
      rawSource: JSON.parse(String(original.rawSource)),
      issues: [],
    }
    projection.rawSource.meta.page = { offset: 100, limit: 100 }
    const target = readLocationPublicationMetadata(projection.rawSource.meta)
    sqlite
      .prepare(
        "UPDATE locationRefresh SET phase='ready',target=?,runId='run',lease='owner',leaseUntil=?",
      )
      .run(JSON.stringify(target), Date.now() + 60000)
    sqlite
      .prepare(
        "INSERT INTO locationRefreshItem(runId,locationId,ssId,projection,status) VALUES('run',?,'shop',?,'pending')",
      )
      .run(first.locationId, JSON.stringify(projection))
    const before = sqlite
      .prepare('SELECT * FROM locationRevision ORDER BY version')
      .all()
    expect(
      await processLocationRefresh(binding, { runId: 'run', lease: 'owner', target }),
    ).toBe('review')
    expect(
      sqlite.prepare('SELECT * FROM locationRevision ORDER BY version').all(),
    ).toEqual(before)
    expect(
      sqlite.prepare('SELECT status,reviewReason FROM locationRefreshItem').get(),
    ).toEqual({
      status: 'review',
      reviewReason: 'source-evidence-conflict',
    })
    expect(
      sqlite
        .prepare(
          `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .all(),
    ).toHaveLength(0)
  })

  it('drains ingestion and Feature assessment before completing a durable run', async () => {
    const { sqlite, binding, nextSource, first } = await fixture(true)

    const target = readLocationPublicationMetadata(nextSource.rawSource.meta)
    sqlite
      .prepare(
        "UPDATE locationRefresh SET phase='ready',target=?,runId='run',lease='owner',leaseUntil=?",
      )
      .run(JSON.stringify(target), Date.now() + 60000)
    sqlite
      .prepare(
        "INSERT INTO locationRefreshItem(runId,locationId,ssId,projection,status) VALUES('run',?,'shop',?,'pending')",
      )
      .run(first.locationId, JSON.stringify(nextSource))
    const tick = () =>
      processLocationRefresh(binding, { runId: 'run', lease: 'owner', target })
    expect(await tick()).toBe('ingested')
    expect(
      sqlite.prepare('SELECT accepted FROM locationRefresh').get()?.accepted,
    ).toBeNull()
    expect(await tick()).toBe('assessed')
    expect(
      sqlite
        .prepare(
          "SELECT json_extract(value,'$.outcome') AS outcome FROM locationRefreshItem,json_each(outcomes)",
        )
        .get()?.outcome,
    ).toBe('processed')
    expect(
      sqlite.prepare('SELECT accepted FROM locationRefresh').get()?.accepted,
    ).toBeNull()
    expect(await tick()).toBe('processed')
    expect(await tick()).toBe('complete')
    const state = sqlite.prepare('SELECT phase,accepted FROM locationRefresh').get()
    expect(state?.phase).toBe('idle')
    expect(JSON.parse(String(state?.accepted))).toEqual(target)
    expect(
      sqlite
        .prepare(
          `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .all(),
    ).toHaveLength(2)
    expect(await tick()).toBe('superseded')
  })

  it('does not downgrade a hydrated latest revision during scheduled ingestion', async () => {
    const { db, sqlite, binding, nextSource, first } = await fixture(true)
    const hydrated = structuredClone(nextSource)
    hydrated.facts.location.address = {
      ...hydrated.facts.location.address,
      status: 'resolved',
      address2dId: 'building',
      snapshotId: 'address-snapshot',
      rawSource: { verified: true },
    }
    await persistForwardSaanSeoiPlace(db, hydrated)

    const target = readLocationPublicationMetadata(nextSource.rawSource.meta)
    sqlite
      .prepare(
        "UPDATE locationRefresh SET phase='ready',target=?,runId='run',lease='owner',leaseUntil=?",
      )
      .run(JSON.stringify(target), Date.now() + 60000)
    sqlite
      .prepare(
        "INSERT INTO locationRefreshItem(runId,locationId,ssId,projection,status) VALUES('run',?,'shop',?,'pending')",
      )
      .run(first.locationId, JSON.stringify(nextSource))
    const before = sqlite
      .prepare('SELECT * FROM locationRevision ORDER BY version')
      .all()
    expect(
      await processLocationRefresh(binding, { runId: 'run', lease: 'owner', target }),
    ).toBe('review')
    expect(
      sqlite.prepare('SELECT * FROM locationRevision ORDER BY version').all(),
    ).toEqual(before)
    expect(
      sqlite.prepare('SELECT revisionId,reviewReason FROM locationRefreshItem').get(),
    ).toEqual({
      revisionId: null,
      reviewReason: 'source-evidence-conflict',
    })
  })

  it('replays a failed outcome checkpoint without repeating already applied groups', async () => {
    const { sqlite, binding, nextSource, first } = await fixture(true)

    const target = readLocationPublicationMetadata(nextSource.rawSource.meta)
    sqlite
      .prepare(
        "UPDATE locationRefresh SET phase='ready',target=?,runId='run',lease='owner',leaseUntil=?",
      )
      .run(JSON.stringify(target), Date.now() + 60000)
    sqlite
      .prepare(
        "INSERT INTO locationRefreshItem(runId,locationId,ssId,projection,status) VALUES('run',?,'shop',?,'pending')",
      )
      .run(first.locationId, JSON.stringify(nextSource))
    const tick = () =>
      processLocationRefresh(binding, { runId: 'run', lease: 'owner', target })
    await tick()
    sqlite.exec(
      "CREATE TRIGGER fail_cursor BEFORE UPDATE OF featureCursor ON locationRefreshItem BEGIN SELECT RAISE(ABORT,'cursor failure'); END",
    )
    await expect(tick()).rejects.toThrow('cursor failure')
    expect(
      sqlite.prepare('SELECT value FROM locationRefreshItem,json_each(outcomes)').all(),
    ).toHaveLength(0)
    expect(
      sqlite.prepare('SELECT featureCursor FROM locationRefreshItem').get()
        ?.featureCursor,
    ).toBe('')
    expect(
      sqlite
        .prepare(
          `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .all(),
    ).toHaveLength(2)
    const jobs = sqlite.prepare('SELECT * FROM featureMtrJob').all()
    sqlite.exec('DROP TRIGGER fail_cursor')
    expect(await tick()).toBe('assessed')
    expect(
      sqlite
        .prepare(
          `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .all(),
    ).toHaveLength(2)
    expect(sqlite.prepare('SELECT * FROM featureMtrJob').all()).toEqual(jobs)
  })

  it('fences source ingestion without appending revisions or changing availability', async () => {
    const { db, sqlite, nextSource } = await fixture()
    sqlite.exec("UPDATE location SET sourceAvailability='missing'")
    const before = sqlite.prepare('SELECT * FROM locationRevision').all()
    await persistSaanSeoiPlace(
      db,
      {
        ...nextSource,
        snapshotId: 'new-snapshot',
        rawSource: { ...nextSource.rawSource, marker: 'new' },
      },
      sql`0`,
    )
    expect(sqlite.prepare('SELECT * FROM locationRevision').all()).toEqual(before)
    expect(
      sqlite.prepare('SELECT sourceAvailability FROM location').get()
        ?.sourceAvailability,
    ).toBe('missing')
  })

  it('holds missing sources and expired processing leases without changing Features', async () => {
    const { sqlite, binding, nextSource, first } = await fixture()

    const target = readLocationPublicationMetadata(nextSource.rawSource.meta)
    sqlite
      .prepare(
        "UPDATE locationRefresh SET phase='ready',target=?,runId='run',lease='owner',leaseUntil=0",
      )
      .run(JSON.stringify(target))
    sqlite
      .prepare(
        "INSERT INTO locationRefreshItem(runId,locationId,ssId) VALUES('run',?,'shop')",
      )
      .run(first.locationId)
    const tick = () =>
      processLocationRefresh(binding, { runId: 'run', lease: 'owner', target })
    expect(await tick()).toBe('superseded')
    sqlite.prepare('UPDATE locationRefresh SET leaseUntil=?').run(Date.now() + 60000)
    expect(await tick()).toBe('review')
    expect(
      sqlite.prepare('SELECT status,reviewReason FROM locationRefreshItem').get(),
    ).toEqual({ status: 'review', reviewReason: 'source-missing' })
    expect(await tick()).toBe('complete')
    expect(
      sqlite
        .prepare(
          `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .all(),
    ).toHaveLength(0)
  })

  it('accepts same-publication page metadata changes but holds conflicting canonical records', async () => {
    const { db, first, next, nextSource } = await fixture(true)
    const input = {
      featureId: 'f',
      projectId: 'p',
      locationId: first.locationId,
      candidateRevisionId: next.revisionId,
      guard: sql`1`,
    }
    await adoptRefreshedLocationForFeature(db, input)
    const replay = await persistSaanSeoiPlace(db, {
      ...nextSource,
      rawSource: {
        ...nextSource.rawSource,
        meta: {
          ...(nextSource.rawSource.meta as Record<string, unknown>),
          page: { offset: 100, limit: 100 },
        },
      },
    })
    expect(
      await adoptRefreshedLocationForFeature(db, {
        ...input,
        candidateRevisionId: replay.revisionId,
      }),
    ).toMatchObject({ status: 'processed', geometryChanged: false })
    const conflict = await persistSaanSeoiPlace(db, {
      ...nextSource,
      rawSource: {
        ...nextSource.rawSource,
        resource: {
          attributes: {
            basicCategory: 'other',
            taxonomy: { primary: 'other' },
            operatingStatus: 'open',
          },
        },
      },
    })
    expect(
      await adoptRefreshedLocationForFeature(db, {
        ...input,
        candidateRevisionId: conflict.revisionId,
      }),
    ).toMatchObject({ status: 'review', reason: 'publication-order' })
  })

  it('holds per-Feature chronology regressions despite later local ingestion version', async () => {
    const { db, sqlite, first, nextSource } = await fixture(true)
    const older = await persistSaanSeoiPlace(db, {
      ...nextSource,
      rawSource: {
        ...nextSource.rawSource,
        meta: {
          ...(nextSource.rawSource.meta as Record<string, unknown>),
          apiReleaseSet: 'older-publication',
          apiCatalogRevision: 'older-catalog',
          catalogPublishedAt: '2026-08-01T00:00:00Z',
          cohort: '2026-07-23.0',
        },
      },
    })
    expect(
      await adoptRefreshedLocationForFeature(db, {
        featureId: 'f',
        projectId: 'p',
        locationId: first.locationId,
        candidateRevisionId: older.revisionId,
        guard: sql`1`,
      }),
    ).toMatchObject({ status: 'review' })
    expect(
      sqlite
        .prepare(
          `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .all(),
    ).toHaveLength(0)
  })

  it('processes both automatic groups and replays without duplicate writes or routing', async () => {
    const { db, sqlite, next, first } = await fixture(true)
    const input = {
      featureId: 'f',
      projectId: 'p',
      locationId: first.locationId,
      candidateRevisionId: next.revisionId,
      guard: sql`1`,
    }
    expect(await adoptRefreshedLocationForFeature(db, input)).toMatchObject({
      status: 'processed',
      geometryChanged: true,
      groups: { facts: 'applied', location: 'applied' },
    })
    const decisions = sqlite
      .prepare(
        `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
      )
      .all()
    const jobs = sqlite.prepare('SELECT * FROM featureMtrJob').all()
    expect(decisions).toHaveLength(2)
    expect(jobs).toHaveLength(1)
    expect(await adoptRefreshedLocationForFeature(db, input)).toMatchObject({
      status: 'processed',
      geometryChanged: false,
      groups: { facts: 'unchanged', location: 'unchanged' },
    })
    expect(
      sqlite
        .prepare(
          `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .all(),
    ).toEqual(decisions)
    expect(sqlite.prepare('SELECT * FROM featureMtrJob').all()).toEqual(jobs)
  })

  it('retains policy review and never reopens a rejected location on retry', async () => {
    const { db, sqlite, next, first, input: original } = await fixture()
    const input = {
      featureId: 'f',
      projectId: 'p',
      locationId: first.locationId,
      candidateRevisionId: next.revisionId,
      guard: sql`1`,
    }
    const outcome = await adoptRefreshedLocationForFeature(db, input)
    expect(outcome).toMatchObject({
      status: 'review',
      geometryChanged: false,
      groups: { facts: 'applied', location: 'review' },
    })
    const state = await getAcceptedFeatureLocation(db, 'f', 'p')
    if (!state) throw new Error('Missing association')
    const parent = sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='f'").get()
    await rejectLocationAdoptionGroup(db, {
      ...original,
      fieldGroup: 'location',
      expectedRevision: state.version,
      expectedFeatureModifiedAt: String(parent?.modifiedAt),
    })
    expect(await adoptRefreshedLocationForFeature(db, input)).toMatchObject({
      status: 'processed',
      groups: { facts: 'applied', location: 'rejected' },
    })
    expect(
      sqlite
        .prepare(
          `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .all(),
    ).toHaveLength(2)
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.locationRevisionId).toBe(
      first.revisionId,
    )
  })

  it('stops after lease loss between groups and resumes the durable partial decision', async () => {
    const { db, sqlite, first, next } = await fixture(true)
    sqlite.exec(`CREATE TABLE testLease(owned INTEGER); INSERT INTO testLease VALUES(1);
      CREATE TRIGGER lose_lease AFTER UPDATE OF factsDecision,locationDecision ON locationAdoptionProposal BEGIN UPDATE testLease SET owned=0; END;`)
    const input = {
      featureId: 'f',
      projectId: 'p',
      locationId: first.locationId,
      candidateRevisionId: next.revisionId,
      guard: sql`EXISTS(SELECT 1 FROM testLease WHERE owned=1)`,
    }
    expect(await adoptRefreshedLocationForFeature(db, input)).toMatchObject({
      status: 'superseded',
      groups: { facts: 'applied' },
    })
    expect(
      sqlite
        .prepare(
          `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .all(),
    ).toHaveLength(1)
    expect(sqlite.prepare('SELECT * FROM featureMtrJob').all()).toHaveLength(0)
    sqlite.exec('DROP TRIGGER lose_lease; UPDATE testLease SET owned=1')
    expect(await adoptRefreshedLocationForFeature(db, input)).toMatchObject({
      status: 'processed',
      geometryChanged: true,
      groups: { facts: 'applied', location: 'applied' },
    })
    expect(
      sqlite
        .prepare(
          `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .all(),
    ).toHaveLength(2)
  })

  it('does not silently reassess a proposal after a Project policy edit', async () => {
    const { db, sqlite, first, next } = await fixture(true)
    await saveProjectLocationSettings(db, 'p', DEFAULT_PROJECT_LOCATION_POLICY, 1)
    const result = await adoptRefreshedLocationForFeature(db, {
      featureId: 'f',
      projectId: 'p',
      locationId: first.locationId,
      candidateRevisionId: next.revisionId,
      guard: sql`1`,
    })
    expect(result).toMatchObject({
      status: 'review',
      groups: { facts: 'review', location: 'review' },
    })
    expect(
      sqlite
        .prepare(
          `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .all(),
    ).toHaveLength(0)
    expect(sqlite.prepare('SELECT * FROM locationAdoptionProposal').all()).toHaveLength(
      1,
    )
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.factsRevisionId).toBe(
      first.revisionId,
    )
  })

  it('fences atomic applications and skips lost leases or changed association scope', async () => {
    const { db, sqlite, first, next, input: original } = await fixture(true)
    const before = sqlite.prepare('SELECT * FROM featureLocation').all()
    expect(
      await applyLocationAdoptionGroup(db, { ...original, additionalGuard: sql`0` }),
    ).toEqual({ status: 'conflict' })
    const input = {
      featureId: 'f',
      projectId: 'p',
      locationId: first.locationId,
      candidateRevisionId: next.revisionId,
      guard: sql`0`,
    }
    expect(await adoptRefreshedLocationForFeature(db, input)).toMatchObject({
      status: 'superseded',
    })
    expect(
      await adoptRefreshedLocationForFeature(db, {
        ...input,
        guard: sql`1`,
        locationId: 'different',
      }),
    ).toMatchObject({ status: 'unlinked' })
    expect(sqlite.prepare('SELECT * FROM featureLocation').all()).toEqual(before)
    expect(
      sqlite
        .prepare(
          `SELECT * FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL)`,
        )
        .all(),
    ).toHaveLength(0)
  })

  it('adopts facts without routing, then location with independent review and atomic routing', async () => {
    const { db, sqlite, input, next, first } = await fixture()
    const result = await applyLocationAdoptionGroup(db, input)
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error(JSON.stringify(result))
    expect(result.geometryChanged).toBe(false)
    expect(sqlite.prepare('SELECT * FROM featureMtrJob').all()).toHaveLength(0)
    const accepted = await getAcceptedFeatureLocation(db, 'f', 'p')
    expect(accepted).toMatchObject({
      factsRevisionId: next.revisionId,
      locationRevisionId: first.revisionId,
    })
    expect(accepted?.effective.names.en).toBe('Local correction')
    expect(accepted?.effective.brands).toBeNull()
    expect(
      sqlite
        .prepare("SELECT title,description FROM featureI18n WHERE locale='zh-hant'")
        .get(),
    ).toEqual({ title: '舊名稱', description: '保留說明' })
    expect(
      sqlite
        .prepare("SELECT value FROM featureProperty WHERE propertyId='phone'")
        .get(),
    ).toEqual({ value: '["+85291234567"]' })
    expect(await applyLocationAdoptionGroup(db, input)).toEqual({ status: 'conflict' })
    const locationInput = {
      ...input,
      fieldGroup: 'location' as const,
      expectedRevision: result.revision,
      expectedFeatureModifiedAt: result.feature.modifiedAt,
    }
    expect(await applyLocationAdoptionGroup(db, locationInput)).toMatchObject({
      status: 'review',
    })
    const moved = await applyLocationAdoptionGroup(db, {
      ...locationInput,
      mode: 'reviewed',
    })
    expect(moved).toMatchObject({ status: 'applied', geometryChanged: true })
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.locationRevisionId).toBe(
      next.revisionId,
    )
    expect(sqlite.prepare('SELECT * FROM featureMtrJob').all()).toHaveLength(1)
    expect(sqlite.prepare('SELECT mtrStation,mtrExit FROM feature').get()).toEqual({
      mtrStation: null,
      mtrExit: null,
    })
    expect(
      sqlite
        .prepare(
          "SELECT fieldGroup FROM (SELECT json_extract(d.value,'$.fieldGroup') AS fieldGroup,json_extract(d.value,'$.action') AS action,d.value FROM locationAdoptionProposal p,json_each(json_array(json(p.factsDecision),json(p.locationDecision))) d WHERE d.value IS NOT NULL) WHERE action='applied' ORDER BY fieldGroup",
        )
        .all(),
    ).toEqual([{ fieldGroup: 'facts' }, { fieldGroup: 'location' }])
  })

  it('rolls back all projections, association history and jobs when the final decision fails', async () => {
    const { db, sqlite, input } = await fixture()
    const snapshot = () =>
      [
        'feature',
        'featureI18n',
        'featureProperty',
        'featureLocation',
        'featureLocationHistory',
        'featureMtrJob',
      ].map(table => sqlite.prepare(`SELECT * FROM ${table}`).all())
    const before = snapshot()
    sqlite.exec(
      "CREATE TRIGGER fail_adoption BEFORE UPDATE OF factsDecision,locationDecision ON locationAdoptionProposal BEGIN SELECT RAISE(ABORT,'injected final decision failure'); END",
    )
    await expect(
      applyLocationAdoptionGroup(db, {
        ...input,
        fieldGroup: 'location',
        mode: 'reviewed',
      }),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('allows location rejection after facts apply and never applies a rejected group', async () => {
    const { db, input } = await fixture()
    const applied = await applyLocationAdoptionGroup(db, input)
    if (applied.status !== 'applied') throw new Error(JSON.stringify(applied))
    const current = {
      ...input,
      fieldGroup: 'location' as const,
      expectedRevision: applied.revision,
      expectedFeatureModifiedAt: applied.feature.modifiedAt,
    }
    expect(await rejectLocationAdoptionGroup(db, current)).toMatchObject({
      action: 'rejected',
    })
    expect(
      await applyLocationAdoptionGroup(db, { ...current, mode: 'reviewed' }),
    ).toEqual({ status: 'conflict' })
  })

  it('accepting a changed location releases its customization and updates geometry and routing', async () => {
    const { db, sqlite, input, first, next } = await fixture()
    const corrected = prepareFeatureLocationAssociationWrite(db, {
      featureId: 'f',
      projectId: 'p',
      locationId: first.locationId,
      factsRevisionId: first.revisionId,
      locationRevisionId: first.revisionId,
      expectedFeatureModifiedAt: 'original',
      expectedRevision: input.expectedRevision,
      actorId: 'editor',
      overrides: {
        location: {
          mode: 'override',
          value: LocationFactsSchema.parse(facts).location,
        },
      },
    })
    await corrected.query
    const proposed = await proposeFeatureLocationAdoption(db, {
      featureId: 'f',
      projectId: 'p',
      candidateRevisionId: next.revisionId,
      reevaluatePending: true,
    })
    if (!proposed) throw new Error('Missing re-evaluation')
    const before = sqlite.prepare('SELECT geometry,addressMeta FROM feature').get()
    expect(
      await applyLocationAdoptionGroup(db, {
        ...input,
        proposalId: proposed.proposal.id,
        expectedRevision: corrected.version,
        fieldGroup: 'location',
        mode: 'reviewed',
      }),
    ).toMatchObject({ status: 'applied', geometryChanged: true })
    expect(
      sqlite.prepare('SELECT geometry,addressMeta FROM feature').get(),
    ).not.toEqual(before)
    expect(sqlite.prepare('SELECT * FROM featureMtrJob').all()).toHaveLength(1)
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.locationRevisionId).toBe(
      next.revisionId,
    )
  })

  it('blocks a remaining group after an unrelated association edit', async () => {
    const { db, input, next } = await fixture()
    const applied = await applyLocationAdoptionGroup(db, input)
    if (applied.status !== 'applied') throw new Error('Facts failed')
    const current = await getAcceptedFeatureLocation(db, 'f', 'p')
    if (!current) throw new Error('Missing association')
    const edit = prepareFeatureLocationAssociationWrite(db, {
      featureId: 'f',
      projectId: 'p',
      locationId: current.locationId,
      factsRevisionId: current.factsRevisionId,
      locationRevisionId: current.locationRevisionId,
      expectedFeatureModifiedAt: applied.feature.modifiedAt,
      expectedRevision: applied.revision,
      actorId: 'editor',
      overrides: { brands: { mode: 'clear' } },
    })
    await edit.query
    expect(
      await applyLocationAdoptionGroup(db, {
        ...input,
        fieldGroup: 'location',
        mode: 'reviewed',
        expectedRevision: edit.version,
        expectedFeatureModifiedAt: applied.feature.modifiedAt,
      }),
    ).toEqual({ status: 'conflict' })
    const refreshed = await proposeFeatureLocationAdoption(db, {
      featureId: 'f',
      projectId: 'p',
      candidateRevisionId: next.revisionId,
      reevaluatePending: true,
    })
    if (!refreshed) throw new Error('Missing refreshed pending location')
    expect(refreshed.decisions).toHaveLength(1)
    expect(refreshed.decisions[0].fieldGroup).toBe('facts')
    expect(
      await applyLocationAdoptionGroup(db, {
        ...input,
        proposalId: refreshed.proposal.id,
        fieldGroup: 'location',
        mode: 'reviewed',
        expectedRevision: edit.version,
        expectedFeatureModifiedAt: applied.feature.modifiedAt,
      }),
    ).toMatchObject({ status: 'applied' })
    expect(
      (
        await readLocationAdoptionReview(db, {
          ...input,
          proposalId: refreshed.proposal.id,
        })
      )?.decisions,
    ).toHaveLength(2)
  })

  it('rejects stale writes and holds automatic adoption after policy changes', async () => {
    const { db, input } = await fixture()
    expect(
      await applyLocationAdoptionGroup(db, { ...input, expectedRevision: 'stale' }),
    ).toEqual({ status: 'conflict' })
    expect(
      await applyLocationAdoptionGroup(db, { ...input, projectId: 'other' }),
    ).toEqual({ status: 'conflict' })
    await saveProjectLocationSettings(db, 'p', DEFAULT_PROJECT_LOCATION_POLICY, 0)
    expect(await applyLocationAdoptionGroup(db, input)).toMatchObject({
      status: 'review',
    })
  })
})

describe('bounded Location review discovery', () => {
  it('paginates newest candidate assessments without duplicates and carries group status', async () => {
    const { db, sqlite } = setup()
    const insert =
      sqlite.prepare(`INSERT INTO locationAdoptionProposal(id,featureId,projectId,locationId,
      candidateRevisionId,associationRevision,featureModifiedAt,policyRevision,evidence)
      VALUES (?,'f','p','location',?,?, 'timestamp',0,'{}')`)
    for (let i = 0; i < 23; i++)
      insert.run('proposal-' + i, 'candidate-' + i, 'association')
    insert.run('replacement', 'candidate-22', 'revised-association')
    sqlite.exec(
      "UPDATE locationAdoptionProposal SET locationDecision=json_object('id','d','proposalId','proposal-22','fieldGroup','location','action','rejected','actorId','actor','reason','wrong premises','associationRevision','association','createdAt','now') WHERE id='proposal-22'",
    )
    const first = await listLocationAdoptionReviews(db, {
      featureId: 'f',
      projectId: 'p',
    })
    expect(first.reviews).toHaveLength(20)
    expect(first.reviews[0]).toMatchObject({ id: 'replacement', decidedGroups: 1 })
    expect(first.reviews.some(row => row.id === 'proposal-22')).toBe(false)
    expect(first.nextCursor).not.toBeNull()
    const second = await listLocationAdoptionReviews(db, {
      featureId: 'f',
      projectId: 'p',
      beforeRow: first.nextCursor!,
    })
    expect(second.reviews).toHaveLength(3)
    expect(second.nextCursor).toBeNull()
    expect(
      new Set([...first.reviews, ...second.reviews].map(row => row.candidateRevisionId))
        .size,
    ).toBe(23)
    expect(
      await listLocationAdoptionReviews(db, { featureId: 'f', projectId: 'other' }),
    ).toEqual({ reviews: [], nextCursor: null })
    await expect(
      listLocationAdoptionReviews(db, {
        featureId: 'f',
        projectId: 'p',
        beforeRow: -1,
      }),
    ).rejects.toThrow()
  })
})

describe('standalone Location directory', () => {
  it('fences owners before pagination and only searches latest names', async () => {
    const { db, sqlite } = setup()
    for (let n = 0; n < 29; n++) {
      const id = `directory-${String(n).padStart(2, '0')}`
      const owner = n < 2 ? 'other' : n < 28 ? 'p' : null
      sqlite
        .prepare(
          'INSERT INTO location(id,ssId,state,ownerOrganisationId) VALUES (?,?,?,?)',
        )
        .run(id, owner ? null : 'shared-ss', owner ? 'manual' : 'linked', owner)
      for (let version = 1; version <= 2; version++) {
        const value = {
          ...facts,
          names: { en: version === 1 ? 'Old name' : 'Latest % shop' },
        }
        sqlite
          .prepare(
            "INSERT INTO locationRevisionContent(id,locationId,version,origin,ssId,apiVersion,releaseId,snapshotId,contentHash,rawSource,facts) VALUES (?,?,?,?,?,?,?,?,?,'{}',?)",
          )
          .run(
            `${id}-${version}`,
            id,
            version,
            owner ? 'local' : 'saanseoi',
            owner ? null : 'shared-ss',
            owner ? null : 'v0.1',
            owner ? null : 'release',
            owner ? null : 'snapshot',
            `${version}`,
            serializeLocationFacts(LocationFactsSchema.parse(value), 'establishment'),
          )
      }
    }
    const shared = await listLocationResources(db, { includeCount: true })
    expect(shared.totalCount).toBe(1)
    expect(shared.data.map(row => row.id)).toEqual(['directory-28'])
    const first = await listLocationResources(db, {
      organisationId: 'p',
      q: '%',
      includeCount: true,
    })
    expect(first.totalCount).toBe(27)
    expect(first.data).toHaveLength(25)
    expect(first.data[0].id).toBe('directory-02')
    expect(first.data.every(row => row.facts?.names.en === 'Latest % shop')).toBe(true)
    const last = await listLocationResources(db, {
      organisationId: 'p',
      q: '%',
      after: first.nextCursor!,
    })
    expect(last.data.map(row => row.id)).toEqual(['directory-27', 'directory-28'])
    expect(last.nextCursor).toBeNull()
    expect(last.totalCount).toBeNull()
    expect(
      (await listLocationResources(db, { organisationId: 'p', q: 'Old name' })).data,
    ).toEqual([])
    expect(
      (await listLocationResources(db, { organisationId: 'p', id: 'directory-00' }))
        .data,
    ).toEqual([])
    expect(first.data[0]).not.toHaveProperty('rawSource')
  })
})

describe('retained negative Location identity decisions', () => {
  const projection = (): SaanSeoiPlaceProjection => ({
    ssId: 'canonical-shop',
    apiVersion: 'api-places-v0.1',
    releaseId: 'release',
    snapshotId: 'snapshot',
    facts: LocationFactsSchema.parse(facts),
    issues: [],
    rawSource: {
      resource: { id: 'canonical-shop', sources: ['retained-attribution'] },
      meta: { apiReleaseSet: 'pinned-release' },
    },
  })
  async function fixture() {
    const state = setup()
    const local = await createLocalLocation(
      state.db,
      'p',
      { state: 'manual', facts },
      'creator',
    )
    const baseline = await readLocationIdentityBaseline(state.db, local.locationId, 'p')
    if (!baseline) throw new Error('Missing baseline')
    const candidate = projection()
    const reviewId = await captureLocationIdentityReview(
      state.db,
      baseline,
      candidate,
      'reviewer',
    )
    if (!reviewId) throw new Error('Missing review')
    state.sqlite
      .prepare(
        'INSERT INTO featureLocation(featureId,locationId,factsRevisionId,locationRevisionId) VALUES (?,?,?,?)',
      )
      .run('f', local.locationId, local.revisionId, local.revisionId)
    return {
      ...state,
      local,
      baseline,
      candidate,
      input: {
        locationId: local.locationId,
        ownerOrganisationId: 'p',
        reviewId,
        actorId: 'reviewer',
        reason: 'Different premises',
      },
    }
  }
  it('fences a rejection that arrives after acceptance reads but before its batch', async () => {
    const { db, sqlite, candidate, input } = await fixture()
    db.batch = new Proxy(db.batch, {
      apply(target, receiver, args) {
        sqlite
          .prepare(
            `UPDATE locationIdentityReview SET rejection=json_object('reviewId',?,'locationId',?,'ssId',?,'actorId',?,'reason',?,'createdAt','now') WHERE id=?`,
          )
          .run(
            input.reviewId,
            input.locationId,
            candidate.ssId,
            'other-reviewer',
            'Different shop',
            input.reviewId,
          )
        return Reflect.apply(target, receiver, args)
      },
    })
    expect(await acceptLocationIdentityReview(db, input)).toEqual({
      status: 'conflict',
    })
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(1)
    expect(
      sqlite.prepare('SELECT count(*) n FROM locationIdentityHistory').get()?.n,
    ).toBe(0)
    expect(sqlite.prepare('SELECT state FROM location').get()?.state).toBe('manual')
  })
  it('retains an immutable rejection, suppresses only its scoped source, and permits deliberate new review', async () => {
    const { db, sqlite, baseline, candidate, input } = await fixture()
    const before = sqlite.prepare('SELECT * FROM featureLocation').all()
    expect(await rejectLocationIdentityReview(db, input)).toEqual({
      status: 'rejected',
    })
    expect(await rejectLocationIdentityReview(db, input)).toEqual({
      status: 'rejected',
    })
    expect(
      await rejectLocationIdentityReview(db, { ...input, reason: 'Changed' }),
    ).toEqual({ status: 'conflict' })
    expect(await readLocationIdentityReview(db, input)).toMatchObject({
      rejected: true,
      stale: false,
    })
    expect(await acceptLocationIdentityReview(db, input)).toEqual({
      status: 'conflict',
    })
    expect([...(await rejectedFeatureLocationSourceIds(db, 'f', 'p'))]).toEqual([
      candidate.ssId,
    ])
    expect([...(await rejectedFeatureLocationSourceIds(db, 'f', 'other'))]).toEqual([])
    expect(sqlite.prepare('SELECT * FROM featureLocation').all()).toEqual(before)
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(1)
    expect(() =>
      sqlite.exec('DELETE FROM locationIdentityReview WHERE rejection IS NOT NULL'),
    ).toThrow(/immutable/)
    expect(() =>
      sqlite.exec(
        "UPDATE locationIdentityReview SET rejection=json_set(rejection,'$.reason','Changed') WHERE rejection IS NOT NULL",
      ),
    ).toThrow(/immutable/)
    const reviewId = await captureLocationIdentityReview(
      db,
      baseline,
      candidate,
      'reviewer',
    )
    if (!reviewId || reviewId === input.reviewId)
      throw new Error('Expected a fresh explicit review')
    expect(
      await acceptLocationIdentityReview(db, {
        ...input,
        reviewId,
        reason: 'New evidence confirms premises',
      }),
    ).toMatchObject({ status: 'applied' })
    expect([...(await rejectedFeatureLocationSourceIds(db, 'f', 'p'))]).toEqual([])
    expect(
      sqlite
        .prepare(
          'SELECT count(*) n FROM locationIdentityReview WHERE rejection IS NOT NULL',
        )
        .get()?.n,
    ).toBe(1)
  })
  it('rejects wrong ownership, stale source baselines, and already accepted reviews', async () => {
    const { db, input } = await fixture()
    expect(
      await rejectLocationIdentityReview(db, {
        ...input,
        ownerOrganisationId: 'other',
      }),
    ).toEqual({ status: 'conflict' })
    expect(await acceptLocationIdentityReview(db, input)).toMatchObject({
      status: 'applied',
    })
    expect(await rejectLocationIdentityReview(db, input)).toEqual({
      status: 'conflict',
    })
  })
})

describe('forward-only bulk source persistence', () => {
  function source(month = 8): SaanSeoiPlaceProjection {
    return {
      ssId: 'forward-shop',
      apiVersion: 'v0.1',
      releaseId: `release-${month}`,
      snapshotId: `snapshot-${month}`,
      facts: LocationFactsSchema.parse(facts),
      issues: [],
      rawSource: {
        resource: { id: 'forward-shop', attributes: { name: 'Bakery' } },
        meta: {
          apiReleaseSet: `publication-${month}`,
          apiCatalogRevision: `catalog-${month}`,
          catalogPublishedAt: `2026-${String(month + 1).padStart(2, '0')}-01T00:00:00Z`,
          cohort: `2026-${String(month).padStart(2, '0')}-23.0`,
          resolvedApiVersion: 'api-places-v0.1',
          domain: 'overture',
          region: 'hk',
        },
      },
    }
  }
  it('retains Organisation-authored addresses independently of clean source refreshes', async () => {
    const { db, sqlite } = setup()
    const first = await persistForwardSaanSeoiPlace(db, source())
    const address = {
      scope: 'unit',
      i18n: { en: { formattedAddress: 'Reviewed local address' } },
      unit: null,
      unitI18n: {},
    }
    expect(
      await updateLocalLocationAddress(db, {
        allowSharedBaseline: true,
        locationId: first.locationId,
        organisationId: null,
        expectedRevisionId: first.revisionId,
        address,
        actorId: 'actor',
      }),
    ).toBeNull()
    const edit = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: first.locationId,
      organisationId: 'p',
      expectedRevisionId: first.revisionId,
      address,
      actorId: 'actor',
    })
    expect(edit?.revisionId).toBe(first.revisionId)
    expect(edit?.organisationRevision).toBeTruthy()
    const refreshed = await persistForwardSaanSeoiPlace(db, source(9))
    const row = sqlite
      .prepare('SELECT * FROM locationRevisionContent WHERE id=?')
      .get(refreshed.revisionId)!
    expect(readLocationFacts(row.facts)).toEqual(source(9).facts)
    expect(JSON.parse(row.rawSource as string).localAddress).toBeUndefined()
    const scoped = await listLocationResources(db, {
      id: first.locationId,
      organisationId: 'p',
    })
    expect(scoped.data[0].facts?.location.address.authored).toEqual(address)
    expect(
      (
        await listLocationResources(db, {
          id: first.locationId,
          organisationId: 'other',
        })
      ).data[0].facts,
    ).toEqual(source(9).facts)
    expect(await persistForwardSaanSeoiPlace(db, source(9))).toEqual(refreshed)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('creates, replays and advances while refusing older publications', async () => {
    const { db, sqlite } = setup()
    const first = await persistForwardSaanSeoiPlace(db, source())
    expect(await persistForwardSaanSeoiPlace(db, source())).toEqual(first)
    const next = await persistForwardSaanSeoiPlace(db, source(9))
    expect(next.locationId).toBe(first.locationId)
    expect(next.revisionId).not.toBe(first.revisionId)
    await expect(persistForwardSaanSeoiPlace(db, source())).rejects.toThrow(
      'older or ambiguous',
    )
    expect(sqlite.prepare('SELECT count(*) AS n FROM locationRevision').get()?.n).toBe(
      2,
    )
    expect(
      sqlite
        .prepare('SELECT id FROM locationRevision ORDER BY version DESC LIMIT 1')
        .get()?.id,
    ).toBe(next.revisionId)
  })
  it('allows same-publication hydration but not canonical drift or lost Address evidence', async () => {
    const { db, sqlite } = setup()
    await persistForwardSaanSeoiPlace(db, source())
    const hydrated = source()
    hydrated.facts.location.address = {
      ...hydrated.facts.location.address,
      status: 'resolved',
      address2dId: 'address',
      snapshotId: 'address-snapshot',
      rawSource: { verified: true },
    }
    await persistForwardSaanSeoiPlace(db, hydrated)
    await expect(persistForwardSaanSeoiPlace(db, source())).rejects.toThrow(
      'discard resolved',
    )
    const drift = structuredClone(hydrated)
    drift.rawSource.resource = {
      id: 'forward-shop',
      attributes: { name: 'Different establishment' },
    }
    await expect(persistForwardSaanSeoiPlace(db, drift)).rejects.toThrow(
      'canonical evidence changed',
    )
    expect(sqlite.prepare('SELECT count(*) AS n FROM locationRevision').get()?.n).toBe(
      2,
    )
  })
  it('requires forward evidence to restore a missing source', async () => {
    const { db, sqlite } = setup()
    const first = await persistForwardSaanSeoiPlace(db, source())
    sqlite
      .prepare("UPDATE location SET sourceAvailability='missing' WHERE id=?")
      .run(first.locationId)
    await expect(persistForwardSaanSeoiPlace(db, source())).rejects.toThrow(
      'canonical evidence changed',
    )
    await persistForwardSaanSeoiPlace(db, source(9))
    expect(
      sqlite
        .prepare('SELECT sourceAvailability FROM location WHERE id=?')
        .get(first.locationId)?.sourceAvailability,
    ).toBe('current')
  })
  it.each([false, true])(
    'fences a concurrent newer publication, with existing receipt=%s',
    async existing => {
      const { db, sqlite } = setup()
      if (existing) await persistForwardSaanSeoiPlace(db, source())
      const originalBatch = db.batch.bind(db)
      db.batch = (async (queries: Parameters<Database['batch']>[0]) => {
        db.batch = originalBatch
        await persistSaanSeoiPlace(db, source(9))
        return originalBatch(queries)
      }) as unknown as Database['batch']
      await expect(persistForwardSaanSeoiPlace(db, source())).rejects.toThrow(
        'changed during persistence',
      )
      expect(
        sqlite.prepare('SELECT count(*) AS n FROM locationRevision').get()?.n,
      ).toBe(existing ? 2 : 1)
      const latest = sqlite
        .prepare('SELECT rawSource FROM locationRevision ORDER BY version DESC LIMIT 1')
        .get()
      expect(JSON.parse(String(latest?.rawSource)).meta.apiReleaseSet).toBe(
        'publication-9',
      )
    },
  )
})

describe('structured feature property snapshots', () => {
  it('round trips ordered links, preserves omitted internal rows, and ignores stale writes', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(`ALTER TABLE featureI18n ADD COLUMN titleGen INTEGER;
      ALTER TABLE featureI18n ADD COLUMN description TEXT;
      ALTER TABLE featureI18n ADD COLUMN descriptionGen INTEGER;
      ALTER TABLE featureI18n ADD COLUMN displayAddressGen INTEGER;
      ALTER TABLE featureI18n ADD COLUMN addressProperties TEXT;
      CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER);
      INSERT INTO property(id,key,audience) VALUES ('links','links','public'),('isbn','isbn','internal');
      INSERT INTO featureProperty(featureId,propertyId,value) VALUES ('f','isbn','private');`)
    const items = [
      { id: 'a', url: 'https://example.org/a', label: { en: 'A' } },
      { id: 'b', url: 'https://example.org/b', label: { zhHant: '乙' } },
    ]
    const valueJson = JSON.stringify({ version: 1, items })
    await db.batch(
      prepareFeatureFormRelations(db, 'f', sql`1`, {}, [
        { propertyId: 'links', valueJson },
      ]) as never,
    )
    expect(
      sqlite
        .prepare("SELECT valueJson,value FROM featureProperty WHERE propertyId='links'")
        .get(),
    ).toEqual({ valueJson, value: null })
    const reordered = JSON.stringify({ version: 1, items: [...items].reverse() })
    await db.batch(
      prepareFeatureFormRelations(db, 'f', sql`0`, {}, [
        { propertyId: 'links', valueJson: reordered },
      ]) as never,
    )
    expect(
      sqlite
        .prepare("SELECT valueJson FROM featureProperty WHERE propertyId='links'")
        .get()?.valueJson,
    ).toBe(valueJson)
    await db.batch(
      prepareFeatureFormRelations(db, 'f', sql`1`, {}, [
        { propertyId: 'links', valueJson: reordered },
      ]) as never,
    )
    expect(
      sqlite
        .prepare("SELECT valueJson FROM featureProperty WHERE propertyId='links'")
        .get()?.valueJson,
    ).toBe(reordered)
    await db.batch(prepareFeatureFormRelations(db, 'f', sql`1`, {}, []) as never)
    expect(
      sqlite.prepare('SELECT propertyId,value FROM featureProperty').all(),
    ).toEqual([{ propertyId: 'isbn', value: 'private' }])
  })
})

describe('Organisation-owned private Locations', () => {
  it('shares local discovery and linking across sibling Projects while fencing other Organisations', async () => {
    const { db, sqlite } = setup(true)
    sqlite.exec(
      "INSERT INTO project(id,organisationId) VALUES('sibling','p'); INSERT INTO feature(id,projectId) VALUES('sibling-feature','sibling'),('outside','other')",
    )
    sqlite
      .prepare('UPDATE feature SET geometry=?')
      .run(JSON.stringify(facts.location.geometry))
    const local = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'actor',
    )
    expect(
      await searchLocalLocationCandidates(db, {
        projectId: 'sibling',
        q: facts.names.en,
      }),
    ).toHaveLength(1)
    expect(
      await searchLocalLocationCandidates(db, {
        projectId: 'other',
        q: facts.names.en,
      }),
    ).toHaveLength(0)
    expect(
      (
        await nearbyLocalLocationCandidates(db, {
          projectId: 'sibling',
          coordinates: [
            facts.location.geometry.coordinates[0],
            facts.location.geometry.coordinates[1],
          ],
          radius: 300,
        })
      ).candidates,
    ).toHaveLength(1)
    expect(
      (
        await nearbyLocalLocationCandidates(db, {
          projectId: 'other',
          coordinates: [
            facts.location.geometry.coordinates[0],
            facts.location.geometry.coordinates[1],
          ],
          radius: 300,
        })
      ).candidates,
    ).toHaveLength(0)
    expect(
      (
        await nearbyLocalLocationCandidates(db, {
          projectId: 'sibling',
          coordinates: [114.5, 22.5],
          radius: 50,
        })
      ).candidates,
    ).toHaveLength(0)
    const input = {
      locationId: local.locationId,
      revisionId: local.revisionId,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
    }
    expect(
      await linkInitialFeatureLocation(db, {
        ...input,
        featureId: 'sibling-feature',
        projectId: 'sibling',
      }),
    ).toMatchObject({ status: 'linked' })
    expect(
      await linkInitialFeatureLocation(db, {
        ...input,
        featureId: 'outside',
        projectId: 'other',
      }),
    ).toEqual({ status: 'place-unavailable' })
    expect(
      await getAcceptedFeatureLocation(db, 'sibling-feature', 'sibling'),
    ).not.toBeNull()
    expect(await getAcceptedFeatureLocation(db, 'sibling-feature', 'other')).toBeNull()
    expect(() =>
      sqlite.exec("UPDATE project SET organisationId='other' WHERE id='sibling'"),
    ).toThrow('Feature Location scope mismatch')
    expect(() =>
      sqlite.exec("UPDATE feature SET projectId='other' WHERE id='sibling-feature'"),
    ).toThrow('Feature Location scope mismatch')
    sqlite.exec("UPDATE feature SET projectId='p' WHERE id='sibling-feature'")
    expect(await getAcceptedFeatureLocation(db, 'sibling-feature', 'p')).not.toBeNull()
    expect(() =>
      sqlite
        .prepare("UPDATE location SET ownerOrganisationId='other' WHERE id=?")
        .run(local.locationId),
    ).toThrow('Feature Location scope mismatch')
  })
})

describe('local Location address revisions', () => {
  it('keeps Organisation name corrections out of the shared local baseline', async () => {
    const { db, sqlite } = setup()
    const created = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'actor',
    )
    const baseline = sqlite
      .prepare('SELECT * FROM locationRevision WHERE id=?')
      .get(created.revisionId)
    const saved = await updateLocalLocationAddress(db, {
      locationId: created.locationId,
      organisationId: 'p',
      expectedRevisionId: created.revisionId,
      expectedOrganisationRevision: null,
      actorId: 'org-editor',
      names: { en: 'Organisation name' },
      branch: { en: 'Central', 'zh-Hant': '中環' },
      format: { en: 'AROME Bakery' },
      branchId: '0012',
    })
    expect(saved).not.toBeNull()
    expect(
      sqlite
        .prepare('SELECT * FROM locationRevision WHERE id=?')
        .get(created.revisionId),
    ).toEqual(baseline)
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(1)
    expect(
      (await listLocationResources(db, { id: created.locationId, organisationId: 'p' }))
        .data[0].facts?.names,
    ).toEqual({ en: 'Organisation name' })
    expect(
      (await listLocationResources(db, { id: created.locationId, organisationId: 'p' }))
        .data[0].facts,
    ).toMatchObject({
      branch: { en: 'Central', 'zh-Hant': '中環' },
      format: { en: 'AROME Bakery' },
      branchId: '0012',
    })
  })

  it('preserves the old revision and fences stale edits and other owners', async () => {
    const { db, sqlite } = setup()
    const created = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'actor',
    )
    const old = sqlite
      .prepare('SELECT * FROM locationRevision WHERE id=?')
      .get(created.revisionId)
    const input = {
      locationId: created.locationId,
      organisationId: 'p',
      expectedRevisionId: created.revisionId,
      actorId: 'editor',
      address: {
        scope: 'building',
        i18n: {
          en: {
            formattedAddress: '',
            buildingName: 'New Building',
            streetName: 'New Road',
          },
        },
        unit: null,
        unitI18n: {},
      },
    }
    expect(
      await updateLocalLocationAddress(db, {
        allowSharedBaseline: true,
        ...input,
        organisationId: 'other',
      }),
    ).toBeNull()
    const updated = await updateLocalLocationAddress(db, {
      ...input,
      allowSharedBaseline: true,
    })
    expect(updated?.revisionId).toBeTruthy()
    expect(
      await updateLocalLocationAddress(db, { ...input, allowSharedBaseline: true }),
    ).toBeNull()
    expect(
      sqlite
        .prepare('SELECT * FROM locationRevision WHERE id=?')
        .get(created.revisionId),
    ).toEqual(old)
    const row = sqlite
      .prepare('SELECT facts,rawSource FROM locationRevisionContent WHERE id=?')
      .get(updated!.revisionId)!
    expect(readLocationFacts(row.facts).location.address.authored).toEqual(
      input.address,
    )
    expect(JSON.parse(row.rawSource as string)).toMatchObject({
      actorId: 'editor',
      previousRevisionId: created.revisionId,
    })
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(2)
  })
})

it.each([false, true])(
  'prepares a local address review with matched identity %s and leaves accepted revisions pinned',
  async matched => {
    const { db, sqlite } = setup()
    const created = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'actor',
    )
    if (matched) {
      const baseline = await readLocationIdentityBaseline(db, created.locationId, 'p')
      if (!baseline) throw new Error('Missing identity baseline')
      const accepted = await acceptLocationIdentity(
        db,
        { ...baseline, actorId: 'actor', reason: 'Verified match' },
        {
          ssId: 'matched',
          apiVersion: 'api-places-v0.1',
          releaseId: 'release',
          snapshotId: 'snapshot',
          facts: LocationFactsSchema.parse(facts),
          issues: [],
          rawSource: {
            resource: {
              id: 'matched',
              attributes: {
                basicCategory: 'bakery',
                taxonomy: { primary: 'bakery' },
                operatingStatus: 'open',
              },
            },
          },
        },
      )
      expect(accepted.status).toBe('applied')
      created.revisionId = sqlite
        .prepare(
          'SELECT id FROM locationRevision WHERE locationId=? ORDER BY version DESC LIMIT 1',
        )
        .get(created.locationId)!.id as string
    }
    const association = prepareFeatureLocationAssociationWrite(db, {
      featureId: 'f',
      projectId: 'p',
      locationId: created.locationId,
      factsRevisionId: created.revisionId,
      locationRevisionId: created.revisionId,
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      actorId: 'actor',
      overrides: {},
    })
    await association.query
    const address = {
      scope: 'building',
      i18n: { en: { formattedAddress: 'New address' } },
      unit: null,
      unitI18n: {},
    }
    const updated = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: created.locationId,
      organisationId: 'p',
      expectedRevisionId: created.revisionId,
      actorId: 'editor',
      address,
    })
    expect(
      await proposeLatestLocalLocationAdoption(db, {
        featureId: 'f',
        projectId: 'other',
      }),
    ).toBeNull()
    const review = await proposeLatestLocalLocationAdoption(db, {
      featureId: 'f',
      projectId: 'p',
    })
    expect(review?.proposal.candidateRevisionId).toBe(updated?.revisionId)
    expect(review?.proposal.evidence.plan.blockers).toEqual([])
    expect(
      sqlite.prepare('SELECT locationRevisionId FROM featureLocation').get()
        ?.locationRevisionId,
    ).toBe(created.revisionId)
  },
)

it.each([null, '', 'Use the side entrance'])(
  'retains local structured Feature corrections and complete label %s without duplicating unit labels',
  async label => {
    const { db, sqlite } = setup()
    const authored = {
      scope: 'building',
      i18n: {
        en: {
          formattedAddress: '',
          buildingName: 'Shared Building',
          streetName: 'Example Road',
        },
      },
      unit: {
        unitRef: 'A',
        unitType: 'U',
        floorRef: '2',
        floorType: 'F',
        unitPortion: null,
      },
      unitI18n: {},
    }
    const address = {
      version: 1,
      source: { ...facts.location.address, fallbackDisplay: {}, authored },
      coordinates: facts.location.geometry.coordinates,
      matchStatus: 'unresolved',
      overrides: { en: { buildingName: 'Feature Building' } },
    }
    sqlite
      .prepare('UPDATE feature SET geometry=?,addressMeta=? WHERE id=?')
      .run(JSON.stringify(facts.location.geometry), JSON.stringify({ address }), 'f')
    sqlite
      .prepare(
        'INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES (?,?,?,?)',
      )
      .run('f', 'en', 'Bakery', 'Unit A, 2/F, Feature Building, Example Road')
    const baseline = await readFeatureLocationBaseline(db, 'f', 'p')
    expect(baseline.status).toBe('ready')
    if (baseline.status !== 'ready') throw new Error('Missing baseline')
    const { getAddressDisplay } = await import('#lib/addresses/featureAddress.js')
    const effective = {
      ...baseline.baseline.address,
      source: baseline.baseline.effective.location!.address,
      overrides: {},
    }
    expect(getAddressDisplay(effective, 'en')).toBe(
      'Unit A, 2/F, Feature Building, Example Road',
    )
    expect(
      baseline.baseline.effective.location?.address.authored?.i18n.en.buildingName,
    ).toBe('Feature Building')
    const clear = { ...address, overrides: { en: { formattedAddress: label } } }
    sqlite
      .prepare('UPDATE feature SET addressMeta=? WHERE id=?')
      .run(JSON.stringify({ address: clear }), 'f')
    const cleared = await readFeatureLocationBaseline(db, 'f', 'p')
    if (cleared.status !== 'ready') throw new Error('Missing clear baseline')
    expect(
      getAddressDisplay(
        {
          ...cleared.baseline.address,
          source: cleared.baseline.effective.location!.address,
          overrides: {},
        },
        'en',
      ),
    ).toBe(label ?? '')
    expect(cleared.baseline.effective.location!.address.authored).toEqual(authored)
  },
)

describe('structured Location address editor writes', () => {
  it('keeps building authoring free of unit and floor details', async () => {
    const { db } = setup()
    const content = parseAddressContent({
      en: 'Flat A, 2/F, Example Building, Example Road',
    }).content
    const buildingFacts = {
      ...facts,
      location: {
        ...facts.location,
        address: { ...facts.location.address, authored: content },
      },
    }
    const created = await createLocalLocation(
      db,
      'p',
      { state: 'manual', kind: 'building', facts: buildingFacts },
      'actor',
    )
    const initial = (
      await listLocationResources(db, { id: created.locationId, organisationId: 'p' })
    ).data[0]
    expect(initial.facts?.location.address.authored?.unit).toBeNull()
    expect(initial.facts?.location.address.authored?.unitI18n).toEqual({})
    const saved = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: created.locationId,
      organisationId: 'p',
      expectedRevisionId: created.revisionId,
      address: content,
      actorId: 'actor',
    })
    expect(saved).not.toBeNull()
    const updated = (
      await listLocationResources(db, { id: created.locationId, organisationId: 'p' })
    ).data[0]
    expect(updated.facts?.location.address.authored?.unit).toBeNull()
  })

  it('changes an owned unmatched type atomically, fences stale kinds and rejects source reclassification', async () => {
    const { db, sqlite } = setup()
    const created = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', kind: 'unknown', facts },
      'actor',
    )
    const input = {
      locationId: created.locationId,
      organisationId: 'p',
      expectedRevisionId: created.revisionId,
      expectedKind: 'unknown' as const,
      kind: 'address' as const,
      actorId: 'actor',
    }
    expect(
      await updateLocalLocationAddress(db, {
        allowSharedBaseline: true,
        ...input,
        organisationId: 'other',
      }),
    ).toBeNull()
    const saved = await updateLocalLocationAddress(db, {
      ...input,
      allowSharedBaseline: true,
    })
    expect(saved).not.toBeNull()
    expect(
      JSON.parse(
        sqlite
          .prepare('SELECT rawSource FROM locationRevision WHERE id=?')
          .get(saved!.revisionId)?.rawSource as string,
      ).typeChange,
    ).toEqual({ before: 'unknown', after: 'address' })
    expect(
      (await listLocationResources(db, { id: created.locationId, organisationId: 'p' }))
        .data[0],
    ).toMatchObject({ kind: 'address', facts })
    expect(
      await updateLocalLocationAddress(db, {
        allowSharedBaseline: true,
        ...input,
        expectedRevisionId: saved!.revisionId,
      }),
    ).toBeNull()
    sqlite.exec(
      `CREATE TRIGGER reject_kind BEFORE UPDATE OF kind ON location BEGIN SELECT RAISE(ABORT,'kind update rejected'); END;`,
    )
    await expect(
      updateLocalLocationAddress(db, {
        allowSharedBaseline: true,
        ...input,
        expectedRevisionId: saved!.revisionId,
        expectedKind: 'address',
        kind: 'building',
      }),
    ).rejects.toThrow('kind update rejected')
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(2)
    expect(sqlite.prepare('SELECT kind FROM location').get()?.kind).toBe('address')
    const source = await persistSaanSeoiPlace(db, {
      ssId: 'kind-source',
      apiVersion: 'v0.1',
      releaseId: 'release',
      snapshotId: 'snapshot',
      facts: LocationFactsSchema.parse(facts),
      issues: [],
      rawSource: {},
    })
    expect(
      await updateLocalLocationAddress(db, {
        allowSharedBaseline: true,
        locationId: source.locationId,
        organisationId: 'p',
        expectedRevisionId: source.revisionId,
        kind: 'building',
        actorId: 'actor',
      }),
    ).toBeNull()
  })

  it('preserves populated lifecycle rows, associations and guards when extending the kind constraint', async () => {
    const { sqlite } = setup(true, false, false)
    const created = { locationId: 'migration-local', revisionId: 'migration-revision' }
    sqlite
      .prepare(
        "INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES(?,'unknown','manual','p')",
      )
      .run(created.locationId)
    sqlite
      .prepare(
        "INSERT INTO locationRevision(id,locationId,version,origin,contentHash,rawSource,facts) VALUES(?,?,1,'local','test','{}',?)",
      )
      .run(created.revisionId, created.locationId, JSON.stringify(facts))
    sqlite
      .prepare(
        'INSERT INTO featureLocation(featureId,locationId,factsRevisionId,locationRevisionId) VALUES(?,?,?,?)',
      )
      .run('f', created.locationId, created.revisionId, created.revisionId)
    const before = sqlite.prepare('SELECT * FROM location').get()
    const association = sqlite.prepare('SELECT * FROM featureLocation').get()
    const triggers = sqlite
      .prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name")
      .all()
    sqlite.exec(readFileSync('migrations/0140_location_address_kind.sql', 'utf8'))
    expect(sqlite.prepare('SELECT * FROM location').get()).toEqual(before)
    expect(sqlite.prepare('SELECT * FROM featureLocation').get()).toEqual(association)
    expect(
      sqlite
        .prepare(
          "SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name",
        )
        .all(),
    ).toEqual(triggers)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    sqlite.prepare("UPDATE location SET kind='address'").run()
    expect(() => sqlite.prepare("UPDATE location SET kind='invented'").run()).toThrow()
    expect(() =>
      sqlite.prepare('UPDATE locationRevision SET version=5').run(),
    ).toThrow()
  })

  it('projects localized owner short names separately from Organisation correction revision tokens', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(
      "INSERT INTO organisationI18n VALUES('p','en','Organisation full name','Short name'),('p','zh-hant','機構全名','機構簡稱');",
    )
    const created = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'actor',
    )
    const resource = (
      await listLocationResources(db, { id: created.locationId, organisationId: 'p' })
    ).data[0]
    expect(resource.ownerOrganisationNames).toEqual({
      en: 'Short name',
      'zh-hant': '機構簡稱',
    })
    expect(resource.editingOrganisationNames).toEqual(resource.ownerOrganisationNames)
    expect(resource.organisationRevision).toBeNull()
  })

  it('saves localized names without changing address evidence and rejects stale or empty names', async () => {
    const { db, sqlite } = setup()
    const originalFacts = { ...facts, names: { en: 'Bakery', ja: 'パン屋' } }
    const created = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts: originalFacts },
      'actor',
    )
    const input = {
      locationId: created.locationId,
      organisationId: 'p',
      expectedRevisionId: created.revisionId,
      expectedOrganisationRevision: null,
      actorId: 'actor',
      names: { en: ' Updated bakery ', ja: 'パン屋', 'zh-hant': '麵包店' },
    }
    const saved = await updateLocalLocationAddress(db, {
      ...input,
      allowSharedBaseline: true,
    })
    expect(saved).not.toBeNull()
    const resource = (
      await listLocationResources(db, { id: created.locationId, organisationId: 'p' })
    ).data[0]
    expect(resource.facts?.names).toEqual({ ...input.names, en: 'Updated bakery' })
    expect(resource.facts?.location).toEqual(originalFacts.location)
    expect(
      await updateLocalLocationAddress(db, { ...input, allowSharedBaseline: true }),
    ).toBeNull()
    const invalidNames: Record<string, string>[] = [{}, { en: '  ' }]
    for (const names of invalidNames) {
      await expect(
        updateLocalLocationAddress(db, {
          allowSharedBaseline: true,
          ...input,
          expectedRevisionId: saved!.revisionId,
          names,
        }),
      ).rejects.toThrow()
    }
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(2)
  })

  it('keeps source names immutable while adding, relabeling and clearing Organisation translations', async () => {
    const { db, sqlite } = setup()
    const sourceFacts = LocationFactsSchema.parse({
      ...facts,
      names: { en: 'Bakery', 'zh-hant': '麵包店', ja: 'パン屋' },
      location: {
        ...facts.location,
        address: {
          ...facts.location.address,
          status: 'resolved',
          address2dId: 'source-address',
          snapshotId: 'names-address-snapshot',
          rawSource: {
            data: { type: 'address2d', id: 'source-address', attributes: {} },
          },
        },
      },
    })
    const source = await persistSaanSeoiPlace(db, {
      ssId: 'names-source',
      apiVersion: 'v0.1',
      releaseId: 'names-release',
      snapshotId: 'names-snapshot',
      facts: sourceFacts,
      issues: [],
      rawSource: { resource: { id: 'names-source' } },
    })
    const input = {
      locationId: source.locationId,
      organisationId: 'p',
      expectedRevisionId: source.revisionId,
      expectedOrganisationRevision: null,
      actorId: 'actor',
      names: { en: 'Reviewed bakery', 'zh-hans': '面包店', ja: 'パン屋' },
    }
    const saved = await updateLocalLocationAddress(db, {
      ...input,
      allowSharedBaseline: true,
    })
    expect(saved?.revisionId).toBe(source.revisionId)
    expect(saved?.organisationRevision).toBeTruthy()
    expect(
      await updateLocalLocationAddress(db, { ...input, allowSharedBaseline: true }),
    ).toBeNull()
    const scoped = (
      await listLocationResources(db, { id: source.locationId, organisationId: 'p' })
    ).data[0]
    expect(scoped.facts?.names).toEqual(input.names)
    expect(scoped.facts?.location).toEqual(sourceFacts.location)
    const shared = (await listLocationResources(db, { id: source.locationId })).data[0]
    expect(shared.facts).toEqual(sourceFacts)
    const correction = sqlite
      .prepare('SELECT overrides FROM organisationLocationHead WHERE locationId=?')
      .get(source.locationId)
    expect(JSON.parse(correction?.overrides as string)).toEqual({
      names: {
        en: { mode: 'override', value: 'Reviewed bakery' },
        'zh-hant': { mode: 'clear' },
        'zh-hans': { mode: 'override', value: '面包店' },
      },
    })
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(1)
  })

  it('saves marker, components and subjective selections atomically and rejects stale editor revisions', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(`CREATE TABLE divisionRefresh(id INTEGER PRIMARY KEY,catalogueRelease TEXT); CREATE TABLE divisionDefinition(id TEXT PRIMARY KEY, apiReleaseSet TEXT, attributes TEXT);
      INSERT INTO divisionDefinition VALUES ('hood','release','{"class":"neighbourhood","names":{"en":{"name":"Neighbourhood"}}}'), ('district','release','{"class":"district"}');`)
    const created = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'actor',
    )
    const address = {
      scope: 'building' as const,
      districtId: 'client-must-not-override-factual-geography',
      i18n: {
        en: {
          formattedAddress: '',
          streetName: 'Example Road',
          buildingNumberExpression: '12-14',
          buildingNumberFrom: '12',
          buildingNumberTo: '14',
        },
      },
      unit: null,
      unitI18n: {},
    }
    const saved = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: created.locationId,
      organisationId: 'p',
      expectedRevisionId: created.revisionId,
      expectedOrganisationRevision: null,
      actorId: 'actor',
      address,
      names: { en: 'New name', 'zh-hant': '新名稱' },
      coordinates: [114.18, 22.31],
      divisionOverrides: { localityPath: ['hood'] },
    })
    expect(saved).not.toBeNull()
    const resource = (
      await listLocationResources(db, { id: created.locationId, organisationId: 'p' })
    ).data[0]
    expect(resource.facts?.location.geometry.coordinates).toEqual([114.18, 22.31])
    expect(resource.facts?.names).toEqual({ en: 'New name', 'zh-hant': '新名稱' })
    expect(resource.facts?.location.address.authored?.i18n.en).toMatchObject({
      buildingNumberFrom: '12',
      buildingNumberTo: '14',
    })
    expect(resource.facts?.location.address.authored).not.toHaveProperty('districtId')
    expect(resource.facts?.location.address.divisionOverrides).toEqual({
      localityPath: ['hood'],
    })
    expect(resource.metadata?.version).toBe(2)
    const original = sqlite
      .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
      .get(created.revisionId)
    expect(readLocationFacts(original?.facts).location.geometry.coordinates).toEqual(
      facts.location.geometry.coordinates,
    )
    expect(
      await updateLocalLocationAddress(db, {
        allowSharedBaseline: true,
        locationId: created.locationId,
        organisationId: 'p',
        expectedRevisionId: created.revisionId,
        expectedOrganisationRevision: null,
        actorId: 'actor',
        address,
      }),
    ).toBeNull()
    const revisionsBefore = sqlite
      .prepare('SELECT count(*) n FROM locationRevision')
      .get()?.n
    await expect(
      updateLocalLocationAddress(db, {
        allowSharedBaseline: true,
        locationId: created.locationId,
        organisationId: 'p',
        expectedRevisionId: saved!.revisionId,
        actorId: 'actor',
        address,
        divisionOverrides: { localityPath: ['district'] },
      }),
    ).rejects.toThrow('INVALID_ADDRESS_DIVISION')
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(
      revisionsBefore,
    )
  })
})

describe('Organisation-wide Location corrections', () => {
  /** Build real SQL projections so adoption and rollback exercise the same columns as production. */
  async function fixture() {
    const state = setup(true)
    const { getTableColumns } = await import('drizzle-orm')
    const { feature, featureI18n } = await import('#lib/db/schema/feature.js')
    for (const [name, table] of [
      ['feature', feature],
      ['featureI18n', featureI18n],
    ] as const) {
      const existing = new Set(
        state.sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map(row => row.name),
      )
      for (const column of Object.values(getTableColumns(table)))
        if (!existing.has(column.name))
          state.sqlite.exec(
            `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
    }
    state.sqlite.exec(`CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER);
      INSERT INTO hub VALUES('core','core');
      INSERT INTO property(id,key,scope,hubId) VALUES('phone','phoneNumber','hub','core');
      INSERT INTO project(id,organisationId) VALUES('sibling','other');`)
    const local = await createLocalLocation(
      state.db,
      'p',
      { state: 'unresolved', facts: { ...facts, phoneNumber: [] } },
      'curator',
    )
    /** Link a Feature with the same physical facts; its project defines the correction scope. */
    async function link(id: string, projectId: string) {
      if (id !== 'f')
        state.sqlite
          .prepare('INSERT INTO feature(id,projectId) VALUES(?,?)')
          .run(id, projectId)
      state.sqlite
        .prepare('UPDATE feature SET geometry=? WHERE id=?')
        .run(JSON.stringify(facts.location.geometry), id)
      state.sqlite
        .prepare(
          "INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES(?,'en','Bakery','Original address')",
        )
        .run(id)
      const result = await linkInitialFeatureLocation(state.db, {
        featureId: id,
        projectId,
        locationId: local.locationId,
        revisionId: local.revisionId,
        expectedFeatureModifiedAt: 'original',
        actorId: 'linker',
      })
      expect(result.status).toBe('linked')
      return result
    }
    return { ...state, local, link }
  }

  it('adopts an Organisation footprint through review and does not carry it to a different Location', async () => {
    const { db, sqlite, local, link } = await fixture()
    const footprint = {
      mode: 'inline' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [114.17, 22.3],
            [114.171, 22.3],
            [114.171, 22.301],
            [114.17, 22.3],
          ],
        ],
      },
    }
    await link('g', 'other')
    const correction = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: local.locationId,
      organisationId: 'other',
      expectedRevisionId: local.revisionId,
      footprint,
      actorId: 'editor',
    })
    const { processLocalLocationChanges } = await import(
      '#lib/db/services/locationLocalRefresh.js'
    )
    expect(await processLocalLocationChanges(db)).toBe('review')
    const accepted = await getAcceptedFeatureLocation(db, 'g', 'other')
    expect(accepted?.effective.footprint).toBeUndefined()
    const proposal = sqlite
      .prepare(
        "SELECT id FROM locationAdoptionProposal WHERE featureId='g' ORDER BY rowid DESC LIMIT 1",
      )
      .get()!
    const applied = await applyLocationAdoptionGroup(db, {
      featureId: 'g',
      projectId: 'other',
      proposalId: String(proposal.id),
      fieldGroup: 'facts',
      mode: 'reviewed',
      expectedRevision: accepted!.version,
      expectedFeatureModifiedAt: String(
        sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='g'").get()?.modifiedAt,
      ),
      actorId: 'reviewer',
      reason: 'Accept our footprint',
    })
    expect(applied.status).toBe('applied')
    const current = await getAcceptedFeatureLocation(db, 'g', 'other')
    expect(current?.effective.footprint).toEqual(footprint)
    expect(
      sqlite
        .prepare(
          "SELECT factsOrganisationRevision FROM featureLocation WHERE featureId='g'",
        )
        .get()?.factsOrganisationRevision,
    ).toBe(correction?.organisationRevision)
    expect(
      (await listLocationResources(db, { id: local.locationId })).data[0].facts
        ?.footprint,
    ).toBeUndefined()
    const destinationFootprint = {
      ...footprint,
      geometry: {
        ...footprint.geometry,
        coordinates: [
          [
            [114.18, 22.3],
            [114.182, 22.3],
            [114.182, 22.302],
            [114.18, 22.3],
          ],
        ],
      },
    }
    const destination = await createLocalLocation(
      db,
      'other',
      {
        state: 'unresolved',
        kind: 'building',
        facts: { ...facts, phoneNumber: [], footprint: destinationFootprint },
      },
      'editor',
    )
    const moved = await relinkFeatureLocation(db, {
      featureId: 'g',
      projectId: 'other',
      ...destination,
      expectedRevision: current!.version,
      expectedFeatureModifiedAt: String(
        sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='g'").get()?.modifiedAt,
      ),
      actorId: 'editor',
    })
    expect(moved.status).toBe('linked')
    expect(
      (await getAcceptedFeatureLocation(db, 'g', 'other'))?.effective.footprint,
    ).toEqual(destinationFootprint)
  })

  it('lets the unmatched owner change the baseline and keeps non-owner corrections independent', async () => {
    const { db, sqlite, local } = await fixture()
    const edit = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      ...local,
      organisationId: 'p',
      expectedRevisionId: local.revisionId,
      names: { en: 'Curated baseline' },
      actorId: 'owner',
    })
    expect(edit).not.toBeNull()
    expect(edit!.revisionId).not.toBe(local.revisionId)
    expect(sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n).toBe(
      0,
    )
    const other = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: local.locationId,
      organisationId: 'other',
      expectedRevisionId: edit!.revisionId,
      names: { en: 'Our correction' },
      actorId: 'other',
    })
    expect(other?.revisionId).toBe(edit!.revisionId)
    expect(other?.organisationRevision).toBeTruthy()
    expect(
      (await listLocationResources(db, { id: local.locationId, organisationId: 'p' }))
        .data[0].facts?.names.en,
    ).toBe('Curated baseline')
    expect(
      (
        await listLocationResources(db, {
          id: local.locationId,
          organisationId: 'other',
        })
      ).data[0].facts?.names.en,
    ).toBe('Our correction')
    const next = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: local.locationId,
      organisationId: 'p',
      expectedRevisionId: edit!.revisionId,
      names: { en: 'New baseline' },
      actorId: 'owner',
    })
    expect(next).not.toBeNull()
    expect(
      (
        await listLocationResources(db, {
          id: local.locationId,
          organisationId: 'other',
        })
      ).data[0].facts?.names.en,
    ).toBe('Our correction')
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('reuses corrections across Projects and lets Project policy hold or adopt revisions', async () => {
    const { db, sqlite, local, link } = await fixture()
    await link('f', 'p')
    await link('g', 'other')
    const correction = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: local.locationId,
      organisationId: 'other',
      expectedRevisionId: local.revisionId,
      names: { en: 'Organisation name' },
      actorId: 'editor',
    })
    expect(correction?.organisationRevision).toBeTruthy()
    expect(
      (await getAcceptedFeatureLocation(db, 'g', 'other'))?.effective.names.en,
    ).toBe('Bakery')
    await link('h', 'sibling')
    expect(
      (await getAcceptedFeatureLocation(db, 'h', 'sibling'))?.effective.names.en,
    ).toBe('Organisation name')
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.effective.names.en).toBe(
      'Bakery',
    )
    const { processLocalLocationChanges } = await import(
      '#lib/db/services/locationLocalRefresh.js'
    )
    expect(await processLocalLocationChanges(db)).toBe('review')
    const proposal = sqlite
      .prepare("SELECT id FROM locationAdoptionProposal WHERE featureId='g'")
      .get()!
    const accepted = await getAcceptedFeatureLocation(db, 'g', 'other')
    expect(
      await rejectLocationAdoptionGroup(db, {
        featureId: 'g',
        projectId: 'other',
        proposalId: String(proposal.id),
        fieldGroup: 'facts',
        expectedRevision: accepted!.version,
        expectedFeatureModifiedAt: 'original',
        actorId: 'reviewer',
        reason: 'Keep accepted name',
      }),
    ).not.toBeNull()
    await saveProjectLocationSettings(
      db,
      'other',
      {
        ...DEFAULT_PROJECT_LOCATION_POLICY,
        coordinates: { mode: 'follow' },
        address: 'follow',
        unit: 'follow',
        establishment: 'follow',
      },
      0,
    )
    // Retrying this item retains the explicit rejection even after a policy change.
    sqlite.exec("UPDATE locationRefreshItem SET featureCursor='' WHERE origin='local'")
    await processLocalLocationChanges(db)
    expect(
      (await getAcceptedFeatureLocation(db, 'g', 'other'))?.effective.names.en,
    ).toBe('Bakery')
    expect(sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n).toBe(
      1,
    )
  })

  it('queues and adopts distinct Hype shared revisions without changing the publisher snapshot', async () => {
    const { db, sqlite, local, link } = await fixture()
    sqlite.exec(readFileSync('migrations/0209_shared_location_corrections.sql', 'utf8'))
    await link('g', 'other')
    await saveProjectLocationSettings(
      db,
      'other',
      {
        ...DEFAULT_PROJECT_LOCATION_POLICY,
        sameSources: true,
        coordinates: { mode: 'follow' },
        address: 'follow',
        unit: 'follow',
        establishment: 'follow',
      },
      0,
    )
    const { prepareSharedLocationCorrection } = await import(
      '#lib/db/services/locationShared.js'
    )
    const { executeRevisionBatch } = await import('#lib/db/services/revisionBatch.js')
    const { processLocalLocationChanges } = await import(
      '#lib/db/services/locationLocalRefresh.js'
    )
    let expectedRevision: string | null = null
    for (const name of ['Shared name one', 'Shared name two']) {
      const write = await prepareSharedLocationCorrection(db, {
        locationId: local.locationId,
        sourceRevisionId: local.revisionId,
        expectedRevision,
        actorId: 'superadmin',
        rights: { canEdit: true, superAdmin: true },
        guard: sql`1`,
        patch: { names: { mode: 'override', value: { en: name } } },
      })
      expect(await executeRevisionBatch(db, write.guard, write.queries)).toBeTruthy()
      expect(await processLocalLocationChanges(db)).toBe('progress')
      expect(
        (await getAcceptedFeatureLocation(db, 'g', 'other'))?.effective.names.en,
      ).toBe(name)
      expect(await processLocalLocationChanges(db)).toBe('processed')
      expectedRevision = write.id
    }
    expect(
      readLocationFacts(
        sqlite
          .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
          .get(local.revisionId)!.facts,
      ).names.en,
    ).toBe('Bakery')
    expect(
      sqlite.prepare('SELECT count(*) n FROM locationAdoptionProposal').get()?.n,
    ).toBe(2)
  })

  it('automatically adopts shared baseline edits under the consuming Project policy', async () => {
    const { db, local, link } = await fixture()
    await link('g', 'other')
    await saveProjectLocationSettings(
      db,
      'other',
      {
        ...DEFAULT_PROJECT_LOCATION_POLICY,
        sameSources: true,
        coordinates: { mode: 'follow' },
        address: 'follow',
        unit: 'follow',
        establishment: 'follow',
      },
      0,
    )
    await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: local.locationId,
      organisationId: 'p',
      expectedRevisionId: local.revisionId,
      names: { en: 'New shared name' },
      actorId: 'owner',
    })
    const { processLocalLocationChanges } = await import(
      '#lib/db/services/locationLocalRefresh.js'
    )
    expect(await processLocalLocationChanges(db)).toBe('progress')
    expect(
      (await getAcceptedFeatureLocation(db, 'g', 'other'))?.effective.names.en,
    ).toBe('New shared name')
    expect(await processLocalLocationChanges(db)).toBe('processed')
  })

  it('prevents accepted corrections from leaking through a cross-Organisation move', async () => {
    const { db, sqlite, local, link } = await fixture()
    await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: local.locationId,
      organisationId: 'other',
      expectedRevisionId: local.revisionId,
      names: { en: 'Our correction' },
      actorId: 'editor',
    })
    await link('g', 'other')
    expect(() => sqlite.exec("UPDATE feature SET projectId='p' WHERE id='g'")).toThrow(
      'reconcile accepted Organisation corrections',
    )
    expect(() =>
      sqlite.exec("UPDATE project SET organisationId='p' WHERE id='other'"),
    ).toThrow('reconcile accepted Organisation corrections')
    sqlite.exec("UPDATE feature SET projectId='sibling' WHERE id='g'")
    expect(
      (await getAcceptedFeatureLocation(db, 'g', 'sibling'))?.effective.names.en,
    ).toBe('Our correction')
    expect(() =>
      sqlite.exec(
        "UPDATE featureLocation SET factsOrganisationRevision='foreign-token' WHERE featureId='g'",
      ),
    ).toThrow('correction scope mismatch')
  })

  it('automatically materializes an Organisation correction without changing the shared baseline', async () => {
    const { db, sqlite, local, link } = await fixture()
    await link('g', 'other')
    await saveProjectLocationSettings(
      db,
      'other',
      {
        ...DEFAULT_PROJECT_LOCATION_POLICY,
        sameSources: true,
        coordinates: { mode: 'follow' },
        address: 'follow',
        unit: 'follow',
        establishment: 'follow',
      },
      0,
    )
    const edit = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: local.locationId,
      organisationId: 'other',
      expectedRevisionId: local.revisionId,
      names: { en: 'Corrected for us' },
      actorId: 'editor',
    })
    const { processLocalLocationChanges } = await import(
      '#lib/db/services/locationLocalRefresh.js'
    )
    expect(await processLocalLocationChanges(db)).toBe('progress')
    expect(
      (await getAcceptedFeatureLocation(db, 'g', 'other'))?.effective.names.en,
    ).toBe('Corrected for us')
    expect(
      sqlite.prepare("SELECT title FROM featureI18n WHERE featureId='g'").get()?.title,
    ).toBe('Corrected for us')
    expect(
      sqlite
        .prepare(
          "SELECT factsOrganisationRevision FROM featureLocation WHERE featureId='g'",
        )
        .get()?.factsOrganisationRevision,
    ).toBe(edit!.organisationRevision)
    expect(
      (await listLocationResources(db, { id: local.locationId })).data[0].facts?.names
        .en,
    ).toBe('Bakery')
  })

  it('does not let another Organisation read, link or edit a manual Location', async () => {
    const { db, sqlite } = await fixture()
    const privateLocation = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'owner',
    )
    expect(
      (
        await listLocationResources(db, {
          id: privateLocation.locationId,
          organisationId: 'other',
        })
      ).data,
    ).toEqual([])
    expect(
      await updateLocalLocationAddress(db, {
        allowSharedBaseline: true,
        locationId: privateLocation.locationId,
        organisationId: 'other',
        expectedRevisionId: privateLocation.revisionId,
        names: { en: 'Forbidden' },
        actorId: 'other',
      }),
    ).toBeNull()
    sqlite
      .prepare('UPDATE feature SET projectId=?,geometry=? WHERE id=?')
      .run('other', JSON.stringify(facts.location.geometry), 'f')
    expect(
      await linkInitialFeatureLocation(db, {
        featureId: 'f',
        projectId: 'other',
        ...privateLocation,
        expectedFeatureModifiedAt: 'original',
        actorId: 'other',
      }),
    ).toEqual({ status: 'place-unavailable' })
    expect(sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n).toBe(
      0,
    )
  })

  it('rejects stale correction heads and rolls back all writes after a late failure', async () => {
    const { db, sqlite, local } = await fixture()
    const input = {
      locationId: local.locationId,
      organisationId: 'other',
      expectedRevisionId: local.revisionId,
      expectedOrganisationRevision: null,
      names: { en: 'Our name' },
      actorId: 'editor',
    }
    const edit = await updateLocalLocationAddress(db, {
      ...input,
      allowSharedBaseline: true,
    })
    expect(edit?.organisationRevision).toBeTruthy()
    const before = sqlite.prepare('SELECT * FROM organisationLocation').all()
    expect(
      await updateLocalLocationAddress(db, {
        allowSharedBaseline: true,
        ...input,
        names: { en: 'Stale' },
      }),
    ).toBeNull()
    sqlite.exec(
      "CREATE TRIGGER fail_correction AFTER INSERT ON organisationLocation BEGIN SELECT RAISE(ABORT,'late failure'); END",
    )
    await expect(
      updateLocalLocationAddress(db, {
        allowSharedBaseline: true,
        ...input,
        expectedOrganisationRevision: edit!.organisationRevision,
        names: { en: 'Fail' },
      }),
    ).rejects.toThrow('late failure')
    expect(sqlite.prepare('SELECT * FROM organisationLocation').all()).toEqual(before)
    expect(sqlite.prepare('SELECT count(*) n FROM locationRevision').get()?.n).toBe(1)
  })

  it('fences a baseline race inside a non-owner correction batch', async () => {
    const { db, sqlite, local } = await fixture()
    db.batch = new Proxy(db.batch, {
      apply(target, receiver, args) {
        sqlite
          .prepare(
            "INSERT INTO locationRevisionContent SELECT 'raced',locationId,version+1,origin,ssId,apiVersion,releaseId,snapshotId,'raced',rawSource,facts,createdAt FROM locationRevisionContent WHERE id=?",
          )
          .run(local.revisionId)
        return Reflect.apply(target, receiver, args)
      },
    })
    expect(
      await updateLocalLocationAddress(db, {
        allowSharedBaseline: true,
        locationId: local.locationId,
        organisationId: 'other',
        expectedRevisionId: local.revisionId,
        names: { en: 'Stale correction' },
        actorId: 'other',
      }),
    ).toBeNull()
    expect(sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n).toBe(
      0,
    )
  })
})

it('persists one existing neighbourhood path in immutable Location revisions', async () => {
  const { db, sqlite } = setup()
  sqlite.exec(
    'CREATE TABLE divisionRefresh(id INTEGER PRIMARY KEY,catalogueRelease TEXT); CREATE TABLE divisionDefinition(id TEXT PRIMARY KEY, apiReleaseSet TEXT, attributes TEXT)',
  )
  const insert = sqlite.prepare('INSERT INTO divisionDefinition VALUES (?,?,?)')
  for (const [id, kind, level] of [
    ['source-parent', 'macrohood', 4],
    ['child', 'neighbourhood', 5],
    ['same-level', 'neighbourhood', 5],
  ] as const)
    insert.run(
      id,
      'release',
      JSON.stringify({
        class: kind,
        category: 'hood',
        level,
        ...(id === 'child'
          ? {
              hierarchies: {
                locality: [
                  [{ id: 'source-parent', class: 'macrohood', fullContainment: true }],
                ],
              },
            }
          : {}),
      }),
    )
  const registry = sqlite.prepare('SELECT * FROM divisionDefinition ORDER BY id').all()
  const created = await createLocalLocation(
    db,
    'p',
    { state: 'manual', facts },
    'actor',
  )
  const original = sqlite
    .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
    .get(created.revisionId)
  const address = {
    scope: 'building',
    i18n: { en: { formattedAddress: 'Example Road' } },
    unit: null,
    unitI18n: {},
  }
  const divisionOverrides = { localityPath: ['source-parent', 'child'] }
  const saved = await updateLocalLocationAddress(db, {
    allowSharedBaseline: true,
    locationId: created.locationId,
    organisationId: 'p',
    expectedRevisionId: created.revisionId,
    expectedOrganisationRevision: null,
    actorId: 'actor',
    address,
    divisionOverrides,
  })
  expect(saved).not.toBeNull()
  const resource = (
    await listLocationResources(db, { id: created.locationId, organisationId: 'p' })
  ).data[0]
  expect(resource.facts?.location.address.divisionOverrides).toEqual(divisionOverrides)
  expect(
    sqlite
      .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
      .get(created.revisionId),
  ).toEqual(original)
  await expect(
    updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: created.locationId,
      organisationId: 'p',
      expectedRevisionId: saved?.revisionId ?? '',
      actorId: 'actor',
      address,
      divisionOverrides: { localityPath: ['child', 'same-level'] },
    }),
  ).rejects.toThrow('INVALID_ADDRESS_DIVISION')
  expect(sqlite.prepare('SELECT * FROM divisionDefinition ORDER BY id').all()).toEqual(
    registry,
  )
})

describe('shared Location footprint persistence', () => {
  const footprint = {
    mode: 'inline' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [114.17, 22.3],
          [114.171, 22.3],
          [114.171, 22.301],
          [114.17, 22.3],
        ],
      ],
    },
  }
  const correctedFootprint = {
    ...footprint,
    geometry: {
      ...footprint.geometry,
      coordinates: [
        [
          [114.17, 22.3],
          [114.172, 22.3],
          [114.172, 22.302],
          [114.17, 22.3],
        ],
      ],
    },
  }

  it.each([
    ['manual', 'building'],
    ['unresolved', 'building'],
    ['manual', 'establishment'],
    ['unresolved', 'establishment'],
    ['manual', 'natural'],
    ['unresolved', 'natural'],
  ] as const)(
    'creates a %s %s with authored geometry and no upstream source',
    async (state, kind) => {
      const { db, sqlite } = setup(true)
      const created = await createLocalLocation(
        db,
        'p',
        { state, kind, facts: { ...facts, footprint } },
        'curator',
      )
      const stored = sqlite
        .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
        .get(created.revisionId)!
      expect(
        LocationFactsSnapshotSchema.parse(JSON.parse(String(stored.facts))),
      ).toMatchObject({ schemaVersion: 1, kind, common: { footprint } })
      const directory = await listLocationResources(db, {
        id: created.locationId,
        organisationId: 'p',
      })
      expect(directory.data[0]).toMatchObject({
        ssId: null,
        kind,
        state,
        facts: { footprint },
      })
      const other = await listLocationResources(db, {
        id: created.locationId,
        organisationId: 'other',
      })
      expect(other.data).toHaveLength(state === 'manual' ? 0 : 1)
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    },
  )

  it('retains footprints on ordinary saves and scopes geometry corrections and clears to their Organisation', async () => {
    const { db, sqlite } = setup(true)
    const created = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', kind: 'building', facts: { ...facts, footprint } },
      'curator',
    )
    const original = sqlite
      .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
      .get(created.revisionId)!
    const saved = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      ...created,
      organisationId: 'p',
      expectedRevisionId: created.revisionId,
      names: { en: 'Corrected building name' },
      actorId: 'curator',
    })
    expect(saved).not.toBeNull()
    const latest = sqlite
      .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
      .get(saved!.revisionId)!
    expect(
      LocationFactsSnapshotSchema.parse(JSON.parse(String(latest.facts))),
    ).toMatchObject({
      kind: 'building',
      common: { footprint },
      i18n: { en: { name: 'Corrected building name' } },
    })
    const corrected = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: created.locationId,
      organisationId: 'other',
      expectedRevisionId: saved!.revisionId,
      names: { en: 'Our building label' },
      footprint: correctedFootprint,
      actorId: 'other-curator',
    })
    expect(corrected?.revisionId).toBe(saved!.revisionId)
    expect(corrected?.organisationRevision).toBeTruthy()
    const directory = await listLocationResources(db, {
      id: created.locationId,
      organisationId: 'other',
    })
    expect(directory.data[0].facts).toMatchObject({
      names: { en: 'Our building label' },
      footprint: correctedFootprint,
    })
    const shared = await listLocationResources(db, { id: created.locationId })
    expect(shared.data[0].facts).toMatchObject({
      names: { en: 'Corrected building name' },
      footprint,
    })
    const cleared = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: created.locationId,
      organisationId: 'other',
      expectedRevisionId: saved!.revisionId,
      expectedOrganisationRevision: corrected?.organisationRevision,
      footprint: null,
      actorId: 'other-curator',
    })
    expect(cleared?.organisationRevision).toBeTruthy()
    expect(
      (
        await listLocationResources(db, {
          id: created.locationId,
          organisationId: 'other',
        })
      ).data[0].facts?.footprint,
    ).toBeNull()
    expect(
      sqlite
        .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
        .get(created.revisionId),
    ).toEqual(original)
    expect(
      sqlite
        .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
        .get(saved!.revisionId),
    ).toEqual(latest)
    const ownerEdit = await updateLocalLocationAddress(db, {
      allowSharedBaseline: true,
      locationId: created.locationId,
      organisationId: 'p',
      expectedRevisionId: saved!.revisionId,
      footprint: correctedFootprint,
      actorId: 'curator',
    })
    expect(ownerEdit?.revisionId).not.toBe(saved!.revisionId)
    expect(
      (await listLocationResources(db, { id: created.locationId })).data[0].facts
        ?.footprint,
    ).toEqual(correctedFootprint)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})

it('rehearses the address contract migration with the real Location tables and guards', async () => {
  const { sqlite } = setup(false, true, false)
  const created = { locationId: 'migration-local', revisionId: 'migration-revision' }
  sqlite
    .prepare(
      "INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES(?,'unknown','manual','p')",
    )
    .run(created.locationId)
  sqlite
    .prepare(
      "INSERT INTO locationRevision(id,locationId,version,origin,contentHash,rawSource,facts) VALUES(?,?,1,'local','test','{}',?)",
    )
    .run(created.revisionId, created.locationId, JSON.stringify(facts))
  const before = sqlite
    .prepare('SELECT id,contentHash,rawSource FROM locationRevision')
    .all()
  sqlite.exec('BEGIN')
  sqlite.exec(
    readFileSync('migrations/0144_location_address_contract.sql', 'utf8')
      .replaceAll('payload', 'rawSource')
      .replaceAll('sequence', 'version'),
  )
  sqlite.exec('COMMIT')
  expect(
    sqlite.prepare('SELECT id,contentHash,rawSource FROM locationRevision').all(),
  ).toEqual(before)
  expect(
    readLocationFacts(
      sqlite
        .prepare('SELECT facts FROM locationRevision WHERE id=?')
        .get(created.revisionId)?.facts,
    ).names,
  ).toEqual(facts.names)
  expect(() => sqlite.exec("UPDATE locationRevision SET facts='{}'")).toThrow(
    'immutable',
  )
})

it('classifies an unknown local identity when building status is first established', async () => {
  const { db, sqlite } = setup()
  const created = await createLocalLocation(
    db,
    'p',
    { state: 'manual', kind: 'unknown', facts: { ...facts, brands: [] } },
    'actor',
  )
  const updated = await updateLocalLocationAddress(db, {
    allowSharedBaseline: true,
    locationId: created.locationId,
    organisationId: 'p',
    expectedRevisionId: created.revisionId,
    expectedKind: 'unknown',
    actorId: 'actor',
    buildingStatus: 'standing',
  })
  expect(updated).not.toBeNull()
  expect(
    sqlite
      .prepare('SELECT kind,class FROM location WHERE id=?')
      .get(created.locationId),
  ).toEqual({ kind: 'built', class: 'building' })
  const snapshot = JSON.parse(
    String(
      sqlite
        .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
        .get(updated!.revisionId)?.facts,
    ),
  )
  expect(snapshot).toMatchObject({
    kind: 'building',
    details: { buildingStatus: 'standing' },
  })
})

describe('Feature-owned names on a linked Place', () => {
  /** Build complete Feature columns while retaining the existing transactional fixture. */
  async function namedFeature() {
    const { db, sqlite } = setup()
    const { getTableColumns } = await import('drizzle-orm')
    const { feature, featureI18n } = await import('#lib/db/schema/feature.js')
    for (const [name, table] of [
      ['feature', feature],
      ['featureI18n', featureI18n],
    ] as const) {
      const existing = new Set(
        sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map(row => row.name),
      )
      for (const column of Object.values(getTableColumns(table)))
        if (!existing.has(column.name))
          sqlite.exec(
            `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
    }
    sqlite.exec(
      "CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER); INSERT INTO featureI18n(featureId,locale,title) VALUES ('f','en','My independent feature'); INSERT INTO hub VALUES ('core','core'); INSERT INTO property(id,key,scope,hubId) VALUES ('phone','phoneNumber','hub','core');",
    )
    sqlite
      .prepare("UPDATE feature SET geometry=? WHERE id='f'")
      .run(JSON.stringify(facts.location.geometry))
    const local = await createLocalLocation(
      db,
      'p',
      {
        state: 'unresolved',
        facts: { ...facts, names: { en: 'Source place' }, phoneNumber: [], brands: [] },
      },
      'actor',
    )
    return { db, sqlite, local }
  }
  it('keeps names independent during initial linking, later projections and Feature edits', async () => {
    const { db, sqlite, local } = await namedFeature()
    const linked = await linkInitialFeatureLocation(db, {
      featureId: 'f',
      projectId: 'p',
      locationId: local.locationId,
      revisionId: local.revisionId,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
      nameMode: 'independent',
    })
    expect(linked.status).toBe('linked')
    if (linked.status !== 'linked') throw Error('Expected linked')
    const title = () =>
      sqlite
        .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
        .get()?.title
    expect(title()).toBe('My independent feature')
    await db.batch(
      prepareFeatureLocationRelations(db, 'f', linked.revision, {
        en: { title: 'Renamed source', displayAddress: 'New address' },
        'zh-hant': { title: '來源名稱' },
      }) as never,
    )
    expect(title()).toBe('My independent feature')
    expect(
      sqlite
        .prepare(
          "SELECT title FROM featureI18n WHERE featureId='f' AND locale='zh-hant'",
        )
        .get()?.title,
    ).toBe('')
    const saved = await saveLinkedFeatureForm(db, {
      featureId: 'f',
      projectId: 'p',
      actorId: 'actor',
      updatedAt: String(
        sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='f'").get()?.modifiedAt,
      ),
      data: {},
      i18n: { en: { title: 'Edited independent name', displayAddress: 'New address' } },
    })
    expect(saved.status).toBe('saved')
    expect(title()).toBe('Edited independent name')
    const binding = sqlite
      .prepare(
        "SELECT acceptancePolicy,acceptedOverrides AS overrides FROM featureLocation WHERE featureId='f'",
      )
      .get()!
    expect(JSON.parse(String(binding.acceptancePolicy)).nameMode).toBe('independent')
    expect(JSON.parse(String(binding.overrides)).names).toBeUndefined()
  })
  it('links an address-kind Location while retaining canonical address evidence, the pin and independent Feature title', async () => {
    const { db, sqlite } = await namedFeature()
    const { emptyFeatureAddress } = await import('#lib/addresses/featureAddress.js')
    const { localIdentityFromAddress } = await import(
      '#lib/locations/addressIdentity.js'
    )
    const address = emptyFeatureAddress({ en: '35 Hollywood Road' })
    address.coordinates = [114.15, 22.3]
    address.source = {
      ...address.source,
      status: 'resolved',
      address2dId: 'canonical-address',
      snapshotId: 'snapshot',
      rawSource: {
        data: {
          type: 'addresses',
          id: 'canonical-address',
          attributes: {
            snapshotId: 'snapshot',
            i18n: { en: { formattedAddress: '35 Hollywood Road' } },
          },
        },
      },
    }
    address.overrides.en = { formattedAddress: '3/F, 35 Hollywood Road' }
    sqlite
      .prepare("UPDATE feature SET geometry=?,addressMeta=? WHERE id='f'")
      .run(
        JSON.stringify({ type: 'Point', coordinates: address.coordinates }),
        JSON.stringify({ address }),
      )
    const local = await createLocalLocation(
      db,
      'p',
      localIdentityFromAddress('address', {}, address),
      'actor',
    )
    const linked = await linkInitialFeatureLocation(db, {
      featureId: 'f',
      projectId: 'p',
      ...local,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
      nameMode: 'independent',
    })
    expect(linked.status).toBe('linked')
    expect(
      sqlite.prepare('SELECT kind FROM location WHERE id=?').get(local.locationId)
        ?.kind,
    ).toBe('address')
    expect(
      sqlite.prepare("SELECT locationId FROM featureLocation WHERE featureId='f'").get()
        ?.locationId,
    ).toBe(local.locationId)
    expect(
      sqlite
        .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
        .get()?.title,
    ).toBe('My independent feature')
    const saved = sqlite
      .prepare("SELECT geometry,addressMeta FROM feature WHERE id='f'")
      .get()!
    expect(JSON.parse(String(saved.geometry))).toEqual({
      type: 'Point',
      coordinates: address.coordinates,
    })
    expect(JSON.parse(String(saved.addressMeta)).address).toMatchObject({
      source: {
        status: 'resolved',
        address2dId: 'canonical-address',
        snapshotId: 'snapshot',
        rawSource: address.source.rawSource,
      },
    })
    expect(
      sqlite
        .prepare(
          "SELECT displayAddress FROM featureI18n WHERE featureId='f' AND locale='en'",
        )
        .get()?.displayAddress,
    ).toBe('3/F, 35 Hollywood Road')
  })
  it('reassociates to the selected source without promoting custom Feature names into Location corrections', async () => {
    const { db, sqlite, local } = await namedFeature()
    sqlite.exec(
      "UPDATE featureI18n SET nameOverride='Custom branch name' WHERE featureId='f' AND locale='en'",
    )
    const linked = await linkInitialFeatureLocation(db, {
      featureId: 'f',
      projectId: 'p',
      ...local,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
      nameMode: 'inherit',
    })
    if (linked.status !== 'linked') throw Error('Expected linked')
    const destination = await createLocalLocation(
      db,
      'p',
      {
        state: 'unresolved',
        facts: {
          ...facts,
          names: { en: 'Selected source' },
          phoneNumber: [],
          brands: [],
        },
      },
      'actor',
    )
    const moved = await relinkFeatureLocation(db, {
      featureId: 'f',
      projectId: 'p',
      ...destination,
      expectedFeatureModifiedAt: String(
        sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='f'").get()?.modifiedAt,
      ),
      expectedRevision: linked.revision,
      actorId: 'actor',
      nameMode: 'inherit',
    })
    expect(moved.status).toBe('linked')
    expect(
      sqlite
        .prepare(
          "SELECT nameOverride FROM featureI18n WHERE featureId='f' AND locale='en'",
        )
        .get()?.nameOverride,
    ).toBe('Custom branch name')
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.locationId).toBe(
      destination.locationId,
    )
    const corrections = sqlite
      .prepare('SELECT overrides FROM organisationLocationHead WHERE locationId=?')
      .get(destination.locationId)
    expect(JSON.parse(String(corrections?.overrides ?? '{}')).names).toBeUndefined()
    expect(
      sqlite.prepare('SELECT state FROM location WHERE id=?').get(local.locationId)
        ?.state,
    ).toBe('unresolved')
  })
  it('adopts a shared local shop without assigning an upstream identity and rejects stale revisions', async () => {
    const { acceptReconciliationLocation } = await import(
      '#lib/db/services/locationReconciliationAcceptance.js'
    )
    const { db, sqlite } = await namedFeature()
    sqlite.exec(readFileSync('migrations/0209_shared_location_corrections.sql', 'utf8'))
    sqlite.exec(
      "INSERT INTO featureProperty(featureId,propertyId,value) VALUES ('f','phone','[\"+85227743090\"]')",
    )
    const shop = await persistSaanSeoiPlace(db, {
      ssId: 'local-shop-fixture',
      apiVersion: 'api-places-v0.1',
      releaseId: 'release',
      snapshotId: 'snapshot',
      issues: [],
      rawSource: {},
      facts: LocationFactsSchema.parse({
        ...facts,
        names: { en: 'Local station shop' },
        phoneNumber: [],
      }),
    })
    sqlite
      .prepare("UPDATE location SET state='unresolved',ssId=NULL WHERE id=?")
      .run(shop.locationId)
    const input = {
      featureId: 'f',
      projectId: 'p',
      locationId: shop.locationId,
      revisionId: shop.revisionId,
      expectedSourceHash: sqlite
        .prepare('SELECT contentHash FROM locationRevisionContent WHERE id=?')
        .get(shop.revisionId)?.contentHash as string,
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      actorId: 'reviewer',
      scopeGuard: sql`1`,
      authorizePhoneCuration: async () => {
        throw new Error('Unexpected phone curation')
      },
    }
    expect(
      await acceptReconciliationLocation(db, { ...input, revisionId: 'stale' }),
    ).toBeNull()
    expect(
      await acceptReconciliationLocation(db, { ...input, expectedSourceHash: 'stale' }),
    ).toBeNull()
    expect(
      await acceptReconciliationLocation(db, { ...input, scopeGuard: sql`0` }),
    ).toBeNull()
    expect(await acceptReconciliationLocation(db, input)).not.toBeNull()
    expect(
      sqlite.prepare('SELECT ssId,state FROM location WHERE id=?').get(shop.locationId),
    ).toEqual({ ssId: null, state: 'unresolved' })
    expect((await getAcceptedFeatureLocation(db, 'f', 'p'))?.effective.names.en).toBe(
      'Local station shop',
    )
    expect(
      (await getAcceptedFeatureLocation(db, 'f', 'p'))?.effective.phoneNumber,
    ).toEqual(['+85227743090'])
    expect(await acceptReconciliationLocation(db, input)).toBeNull()
  })
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    'adopts upstream facts and curates only an absent upstream phone (source phone: %s, existing association: %s)',
    async (sourceHasPhone, alreadyLinked) => {
      const { acceptReconciliationLocation } = await import(
        '#lib/db/services/locationReconciliationAcceptance.js'
      )
      const { db, sqlite, local } = await namedFeature()
      sqlite.exec(
        readFileSync('migrations/0209_shared_location_corrections.sql', 'utf8'),
      )
      sqlite.exec(
        `UPDATE featureI18n SET nameOverride='Custom branch name' WHERE featureId='f' AND locale='en'; INSERT INTO featureProperty(featureId,propertyId,value) VALUES ('f','phone','["+85227743090"]')`,
      )
      const source = await persistSaanSeoiPlace(db, {
        ssId: 'reconciliation-source',
        apiVersion: 'api-places-v0.1',
        releaseId: 'release',
        snapshotId: 'snapshot',
        issues: [],
        rawSource: {},
        facts: LocationFactsSchema.parse({
          ...facts,
          names: { en: 'Upstream shop' },
          phoneNumber: sourceHasPhone ? ['+85221111111'] : [],
        }),
      })
      let expectedRevision: string | null = null
      if (alreadyLinked) {
        const old = prepareFeatureLocationAssociationWrite(db, {
          featureId: 'f',
          projectId: 'p',
          locationId: local.locationId,
          factsRevisionId: local.revisionId,
          locationRevisionId: local.revisionId,
          expectedFeatureModifiedAt: 'original',
          expectedRevision: null,
          actorId: 'old-editor',
          overrides: {
            websites: { mode: 'override', value: ['https://old.example.com'] },
          },
        })
        await old.query
        expectedRevision = old.version
      }
      const beforeSource = sqlite
        .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
        .get(source.revisionId)
      let authorizations = 0
      const input = {
        featureId: 'f',
        projectId: 'p',
        locationId: source.locationId,
        revisionId: source.revisionId,
        expectedFeatureModifiedAt: 'original',
        expectedRevision,
        actorId: 'signed-in-editor',
        scopeGuard: sql`1`,
        authorizePhoneCuration: async () => {
          authorizations++
          return {
            organisationId: 'hk-foodworks',
            rights: { canEdit: true, superAdmin: false },
          }
        },
      }
      if (!sourceHasPhone) {
        sqlite.exec(
          `CREATE TRIGGER fail_reconciliation BEFORE ${alreadyLinked ? 'UPDATE' : 'INSERT'} ON featureLocation BEGIN SELECT RAISE(ABORT,'controlled reconciliation failure'); END`,
        )
        await expect(acceptReconciliationLocation(db, input)).rejects.toThrow()
        expect(
          sqlite.prepare('SELECT count(*) n FROM locationSharedRevision').get()?.n,
        ).toBe(0)
        expect(
          sqlite
            .prepare("SELECT version FROM featureLocation WHERE featureId='f'")
            .get()?.version ?? null,
        ).toBe(expectedRevision)
        sqlite.exec('DROP TRIGGER fail_reconciliation')
        authorizations = 0
      }
      const result = await acceptReconciliationLocation(db, input)
      expect(result).not.toBeNull()
      expect(authorizations).toBe(sourceHasPhone ? 0 : 1)
      expect(
        sqlite
          .prepare('SELECT facts FROM locationRevisionContent WHERE id=?')
          .get(source.revisionId),
      ).toEqual(beforeSource)
      expect(
        sqlite
          .prepare(
            "SELECT nameOverride FROM featureI18n WHERE featureId='f' AND locale='en'",
          )
          .get()?.nameOverride,
      ).toBe('Custom branch name')
      const accepted = await getAcceptedFeatureLocation(db, 'f', 'p')
      expect(accepted?.effective.names.en).toBe('Upstream shop')
      expect(accepted?.effective.phoneNumber).toEqual(
        sourceHasPhone ? ['+85221111111'] : ['+85227743090'],
      )
      const curation = sqlite
        .prepare(
          'SELECT corrections,provenance,actorId FROM locationSharedRevision WHERE locationId=?',
        )
        .get(source.locationId)
      if (sourceHasPhone) expect(curation).toBeUndefined()
      else {
        expect(curation?.actorId).toBe('signed-in-editor')
        expect(JSON.parse(String(curation?.provenance)).authorOrganisationId).toBe(
          'hk-foodworks',
        )
        expect(Object.keys(JSON.parse(String(curation?.corrections)))).toEqual([
          'phoneNumber',
        ])
      }
      expect(await acceptReconciliationLocation(db, input)).toBeNull()
    },
  )
  it('explicitly links names and permits later source name projection', async () => {
    const { db, sqlite, local } = await namedFeature()
    const linked = await linkInitialFeatureLocation(db, {
      featureId: 'f',
      projectId: 'p',
      locationId: local.locationId,
      revisionId: local.revisionId,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
      nameMode: 'inherit',
    })
    if (linked.status !== 'linked') throw Error('Expected linked')
    expect(
      sqlite
        .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
        .get()?.title,
    ).toBe('Source place')
    await db.batch(
      prepareFeatureLocationRelations(db, 'f', linked.revision, {
        en: { title: 'Updated place' },
      }) as never,
    )
    expect(
      sqlite
        .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
        .get()?.title,
    ).toBe('Updated place')
  })
  it('rejects shared name resets for an independently named Feature without writing', async () => {
    const { db, sqlite, local } = await namedFeature()
    const linked = await linkInitialFeatureLocation(db, {
      featureId: 'f',
      projectId: 'p',
      locationId: local.locationId,
      revisionId: local.revisionId,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
      nameMode: 'independent',
    })
    if (linked.status !== 'linked') throw Error('Expected linked')
    const before = sqlite
      .prepare("SELECT * FROM featureLocation WHERE featureId='f'")
      .get()!
    const saved = await saveLinkedFeatureForm(db, {
      featureId: 'f',
      projectId: 'p',
      actorId: 'actor',
      updatedAt: String(
        sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='f'").get()?.modifiedAt,
      ),
      data: {},
      i18n: { en: { title: 'My independent feature' } },
      locationReset: {
        expectedRevision: String(before.version),
        names: ['en'],
        phoneNumber: false,
        location: false,
      },
    })
    expect(saved).toMatchObject({
      status: 'review',
      reason: expect.stringContaining('independent names'),
    })
    expect(
      sqlite.prepare("SELECT * FROM featureLocation WHERE featureId='f'").get(),
    ).toEqual(before)
    expect(
      sqlite
        .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
        .get()?.title,
    ).toBe('My independent feature')
  })
})

describe('separate shared Location correction review', () => {
  /** Arrange a shared source with a Feature whose accepted values remain independently pinned. */
  async function correctionFixture() {
    const { db, sqlite } = setup(true)
    sqlite.exec(
      "ALTER TABLE feature ADD COLUMN organisationId TEXT; UPDATE feature SET organisationId='p';",
    )
    sqlite.exec(
      readFileSync('migrations/0185_location_correction_proposals.sql', 'utf8'),
    )
    const source = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts },
      'creator',
    )
    sqlite
      .prepare(
        'INSERT INTO featureLocation(featureId,locationId,factsRevisionId,locationRevisionId) VALUES(?,?,?,?)',
      )
      .run('f', source.locationId, source.revisionId, source.revisionId)
    const context = await readLocationCorrectionContext(db, {
      featureId: 'f',
      projectId: 'p',
      organisationId: 'p',
      guard: sql`1`,
    })
    if (!context) throw new Error('Expected correction context')
    const command = {
      featureId: 'f',
      projectId: 'p',
      organisationId: 'p',
      guard: sql`1`,
      actorId: 'contributor',
      reason: 'Correct spelling',
      expectedAssociationVersion: context.association.version,
      expectedOrganisationRevision: null,
      patch: { names: { en: { mode: 'override' as const, value: 'Reviewed bakery' } } },
    }
    return { db, sqlite, command, source }
  }
  it('merges only selected proposal fields and retains the exact staff decision', async () => {
    const f = await correctionFixture()
    f.sqlite.exec(readFileSync('migrations/0210_location_correction_merge.sql', 'utf8'))
    const patch = { ...f.command.patch, brands: { mode: 'clear' as const } }
    const id = await proposeLocationCorrection(f.db, { ...f.command, patch })
    expect(
      await decideLocationCorrection(f.db, {
        ...f.command,
        proposalId: id!,
        actorId: 'reviewer',
        outcome: 'accepted',
        selectedFields: ['names'],
      }),
    ).toBe(true)
    const applied = JSON.parse(
      f.sqlite.prepare('SELECT patch FROM locationCorrectionMerge').get()!
        .patch as string,
    )
    expect(applied).toEqual(f.command.patch)
    const overrides = JSON.parse(
      f.sqlite.prepare('SELECT overrides FROM organisationLocationHead').get()!
        .overrides as string,
    )
    expect(overrides.names.en.value).toBe('Reviewed bakery')
    expect(overrides.brands).toBeUndefined()
    expect(() =>
      f.sqlite.exec("UPDATE locationCorrectionMerge SET actorId='forged'"),
    ).toThrow('immutable')
    expect(
      await decideLocationCorrection(f.db, {
        ...f.command,
        proposalId: id!,
        actorId: 'reviewer',
        outcome: 'accepted',
        selectedFields: ['brands'],
      }),
    ).toBe(false)
  })
  it('rejects field selections not present in the immutable proposal', async () => {
    const f = await correctionFixture()
    const id = await proposeLocationCorrection(f.db, f.command)
    await expect(
      decideLocationCorrection(f.db, {
        ...f.command,
        proposalId: id!,
        actorId: 'reviewer',
        outcome: 'accepted',
        selectedFields: ['phoneNumber'],
      }),
    ).rejects.toThrow('INVALID_CORRECTION_SELECTION')
  })
  it('applies manager corrections directly, preserves Feature pins and rejects stale saves', async () => {
    const f = await correctionFixture()
    const before = f.sqlite.prepare('SELECT * FROM featureLocation').all()
    const revision = await applyLocationCorrection(f.db, {
      ...f.command,
      actorId: 'manager',
    })
    expect(revision).toBeTruthy()
    expect(f.sqlite.prepare('SELECT * FROM featureLocation').all()).toEqual(before)
    expect(
      f.sqlite.prepare('SELECT actorId FROM organisationLocation').get()?.actorId,
    ).toBe('manager')
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM locationCorrectionProposal').get()?.n,
    ).toBe(0)
    expect(await applyLocationCorrection(f.db, f.command)).toBeNull()
    expect(
      f.sqlite
        .prepare(
          'SELECT count(*) n FROM locationRefreshItem WHERE organisationRevision IS NOT NULL',
        )
        .get()?.n,
    ).toBe(1)
  })
  it('rolls direct shared corrections back when the refresh receipt fails', async () => {
    const f = await correctionFixture()
    f.sqlite.exec(
      "CREATE TRIGGER fail_staff_refresh BEFORE INSERT ON locationRefreshItem BEGIN SELECT RAISE(ABORT,'refresh failed'); END",
    )
    await expect(applyLocationCorrection(f.db, f.command)).rejects.toThrow()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n,
    ).toBe(0)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM locationCorrectionProposal').get()?.n,
    ).toBe(0)
  })
  it('keeps proposals isolated and requires fresh comparison after another shared acceptance', async () => {
    const f = await correctionFixture()
    const first = await proposeLocationCorrection(f.db, f.command)
    const second = await proposeLocationCorrection(f.db, {
      ...f.command,
      patch: { phoneNumber: { mode: 'inherit' } },
    })
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n,
    ).toBe(0)
    const before = f.sqlite.prepare('SELECT * FROM featureLocation').all()
    expect(
      await decideLocationCorrection(f.db, {
        ...f.command,
        proposalId: first!,
        actorId: 'reviewer',
        outcome: 'accepted',
      }),
    ).toBe(true)
    expect(f.sqlite.prepare('SELECT * FROM featureLocation').all()).toEqual(before)
    expect(
      f.sqlite.prepare('SELECT actorId FROM organisationLocation').get()?.actorId,
    ).toBe('reviewer')
    expect(
      f.sqlite
        .prepare('SELECT actorId FROM locationCorrectionProposal WHERE id=?')
        .get(first!)?.actorId,
    ).toBe('contributor')
    expect(
      await decideLocationCorrection(f.db, {
        ...f.command,
        proposalId: second!,
        actorId: 'reviewer',
        outcome: 'accepted',
      }),
    ).toBe(false)
    expect(
      await decideLocationCorrection(f.db, {
        ...f.command,
        proposalId: second!,
        actorId: 'reviewer',
        outcome: 'rejected',
      }),
    ).toBe(true)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n,
    ).toBe(1)
    expect(
      f.sqlite
        .prepare(
          "SELECT count(*) n FROM locationRefreshItem WHERE origin='local' AND organisationRevision IS NOT NULL",
        )
        .get()?.n,
    ).toBe(1)
  })
  it('rolls back correction and refresh work when its review receipt fails', async () => {
    const f = await correctionFixture()
    const id = await proposeLocationCorrection(f.db, f.command)
    f.sqlite.exec(
      "CREATE TRIGGER fail_correction_decision BEFORE INSERT ON locationCorrectionDecision BEGIN SELECT RAISE(ABORT,'review receipt failed'); END",
    )
    await expect(
      decideLocationCorrection(f.db, {
        ...f.command,
        proposalId: id!,
        actorId: 'reviewer',
        outcome: 'accepted',
      }),
    ).rejects.toThrow()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n,
    ).toBe(0)
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM locationCorrectionDecision').get()?.n,
    ).toBe(0)
    expect(
      f.sqlite
        .prepare(
          'SELECT count(*) n FROM locationRefreshItem WHERE organisationRevision IS NOT NULL',
        )
        .get()?.n,
    ).toBe(0)
  })
  it('rejects decision receipts for another owner or Location and rejected receipts with a revision', async () => {
    const f = await correctionFixture()
    const id = await proposeLocationCorrection(f.db, f.command)
    const other = await createLocalLocation(
      f.db,
      'p',
      { state: 'unresolved', facts },
      'creator',
    )
    const insert = f.sqlite.prepare(
      "INSERT INTO organisationLocation(id,organisationId,locationId,overrides,actorId,createdAt) VALUES(?,?,?,'{}','reviewer','2026-01-01')",
    )
    insert.run('foreign-owner', 'other', f.source.locationId)
    insert.run('foreign-location', 'p', other.locationId)
    insert.run('matching', 'p', f.source.locationId)
    const decide = f.sqlite.prepare(
      "INSERT INTO locationCorrectionDecision(proposalId,outcome,organisationRevision,actorId,reason,createdAt) VALUES(?,?,?,'reviewer','Reviewed','2026-01-01')",
    )
    for (const revision of ['foreign-owner', 'foreign-location', null])
      expect(() => decide.run(id!, 'accepted', revision)).toThrow('owner mismatch')
    expect(() => decide.run(id!, 'rejected', 'matching')).toThrow('owner mismatch')
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM locationCorrectionDecision').get()?.n,
    ).toBe(0)
    expect(() => decide.run(id!, 'accepted', 'matching')).not.toThrow()
  })
  it('fences association movement and retains immutable proposal evidence', async () => {
    const f = await correctionFixture()
    const id = await proposeLocationCorrection(f.db, f.command)
    expect(() =>
      f.sqlite
        .prepare('UPDATE locationCorrectionProposal SET reason=? WHERE id=?')
        .run('changed', id!),
    ).toThrow('immutable')
    f.sqlite.exec("UPDATE featureLocation SET version='moved' WHERE featureId='f'")
    expect(
      await decideLocationCorrection(f.db, {
        ...f.command,
        proposalId: id!,
        actorId: 'reviewer',
        outcome: 'accepted',
      }),
    ).toBe(false)
    expect(await proposeLocationCorrection(f.db, f.command)).toBeNull()
  })
})

describe('Hype shared correction storage', () => {
  it('searches shared corrections and scoped Organisation names before pagination', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(readFileSync('migrations/0209_shared_location_corrections.sql', 'utf8'))
    const { prepareSharedLocationCorrection } = await import(
      '#lib/db/services/locationShared.js'
    )
    const { executeRevisionBatch } = await import('#lib/db/services/revisionBatch.js')
    const created = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts },
      'editor',
    )
    const write = await prepareSharedLocationCorrection(db, {
      locationId: created.locationId,
      sourceRevisionId: created.revisionId,
      expectedRevision: null,
      actorId: 'sa',
      rights: { canEdit: true, superAdmin: true },
      guard: sql`1`,
      patch: {
        names: { mode: 'override', value: { en: 'Hype corrected name' } },
        operatingStatus: { mode: 'override', value: 'permanently_closed' },
      },
    })
    await executeRevisionBatch(db, write.guard, write.queries)
    expect(
      (await listLocationResources(db, { q: 'Hype corrected', includeCount: true }))
        .totalCount,
    ).toBe(1)
    expect((await listLocationResources(db, { q: 'Bakery' })).data).toEqual([])
    expect(
      (await listLocationResources(db, { lifecycleStatus: 'permanently_closed' })).data,
    ).toHaveLength(1)
    expect(
      (
        await searchLocalLocationCandidates(db, { projectId: 'p', q: 'Hype corrected' })
      )[0].facts.names.en,
    ).toBe('Hype corrected name')
    await updateLocalLocationAddress(db, {
      locationId: created.locationId,
      organisationId: 'p',
      expectedRevisionId: created.revisionId,
      expectedOrganisationRevision: null,
      names: { en: 'Organisation name' },
      actorId: 'manager',
    })
    expect(
      (await listLocationResources(db, { organisationId: 'p', q: 'Organisation name' }))
        .data,
    ).toHaveLength(1)
    expect(
      (await listLocationResources(db, { organisationId: 'p', q: 'Hype corrected' }))
        .data,
    ).toEqual([])
    expect((await listLocationResources(db, { q: 'Organisation name' })).data).toEqual(
      [],
    )
  })

  it('accepts a phone correction without implicitly accepting a pending shared name', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(readFileSync('migrations/0209_shared_location_corrections.sql', 'utf8'))
    const { prepareSharedLocationCorrection, sharedLocationFacts } = await import(
      '#lib/db/services/locationShared.js'
    )
    const { executeRevisionBatch } = await import('#lib/db/services/revisionBatch.js')
    const created = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts },
      'editor',
    )
    const write = await prepareSharedLocationCorrection(db, {
      locationId: created.locationId,
      sourceRevisionId: created.revisionId,
      expectedRevision: null,
      actorId: 'superadmin',
      rights: { canEdit: true, superAdmin: true },
      guard: sql`1`,
      patch: {
        names: { mode: 'override', value: { en: 'Pending shared name' } },
        phoneNumber: { mode: 'override', value: ['+85221234567'] },
      },
    })
    expect(await executeRevisionBatch(db, write.guard, write.queries)).toBeTruthy()
    const accepted = await sharedLocationFacts(
      db,
      created.locationId,
      LocationFactsSchema.parse(facts),
      null,
      [{ field: 'phoneNumber', revision: write.id }],
    )
    expect(accepted.facts.names).toEqual(facts.names)
    expect(accepted.facts.phoneNumber).toEqual(['+85221234567'])
    expect(
      (
        await sharedLocationFacts(
          db,
          created.locationId,
          LocationFactsSchema.parse(facts),
          write.id,
        )
      ).facts.names.en,
    ).toBe('Pending shared name')
  })

  it('preserves immutable evidence, fences concurrent edits and retires changed-source contacts', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(readFileSync('migrations/0209_shared_location_corrections.sql', 'utf8'))
    const {
      prepareSharedLocationCorrection,
      readSharedLocationCorrection,
      reconcileSharedLocationSource,
      sharedLocationFacts,
    } = await import('#lib/db/services/locationShared.js')
    const { executeRevisionBatch } = await import('#lib/db/services/revisionBatch.js')
    const created = await createLocalLocation(
      db,
      'p',
      { state: 'unresolved', facts },
      'editor',
    )
    const write = await prepareSharedLocationCorrection(db, {
      locationId: created.locationId,
      sourceRevisionId: created.revisionId,
      expectedRevision: null,
      actorId: 'editor',
      rights: { canEdit: true, superAdmin: false },
      guard: sql`1`,
      patch: { phoneNumber: { mode: 'override', value: ['+85221234567'] } },
    })
    expect(await executeRevisionBatch(db, write.guard, write.queries)).not.toBeNull()
    expect(
      (
        await sharedLocationFacts(
          db,
          created.locationId,
          LocationFactsSchema.parse(facts),
        )
      ).facts.phoneNumber,
    ).toEqual(['+85221234567'])
    expect(
      (
        await sharedLocationFacts(
          db,
          created.locationId,
          LocationFactsSchema.parse(facts),
          null,
        )
      ).facts.phoneNumber,
    ).toEqual(facts.phoneNumber)
    await expect(
      prepareSharedLocationCorrection(db, {
        locationId: created.locationId,
        sourceRevisionId: created.revisionId,
        expectedRevision: null,
        actorId: 'other',
        rights: { canEdit: true, superAdmin: false },
        guard: sql`1`,
        patch: { phoneNumber: { mode: 'clear' } },
      }),
    ).rejects.toThrow('CHANGED')
    expect(() =>
      sqlite.exec("UPDATE locationSharedRevision SET actorId='forged'"),
    ).toThrow('immutable')
    const changed = { ...facts, phoneNumber: ['+85229876543'] }
    sqlite
      .prepare(
        "INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts) VALUES(?,?,2,'local','next','{}',?)",
      )
      .run(
        'source-next',
        created.locationId,
        serializeLocationFacts(LocationFactsSchema.parse(changed), 'establishment'),
      )
    await reconcileSharedLocationSource(db, created.locationId, 'source-next')
    const head = await readSharedLocationCorrection(db, created.locationId)
    expect(JSON.parse(head!.corrections).phoneNumber.supersededBy).toBe('source-next')
    expect(
      (
        await sharedLocationFacts(
          db,
          created.locationId,
          LocationFactsSchema.parse(facts),
        )
      ).facts.phoneNumber,
    ).toEqual(facts.phoneNumber)
    expect(
      (
        await sharedLocationFacts(
          db,
          created.locationId,
          LocationFactsSchema.parse(facts),
          write.id,
        )
      ).facts.phoneNumber,
    ).toEqual(['+85221234567'])
    // Rerunning the additive migration neither rewrites nor duplicates accepted history.
    sqlite.exec(readFileSync('migrations/0209_shared_location_corrections.sql', 'utf8'))
    expect(
      sqlite.prepare('SELECT count(*) n FROM locationSharedRevision').get()?.n,
    ).toBe(2)
  })
})
