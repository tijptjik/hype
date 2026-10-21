// RUNTIME
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableColumns, sql } from 'drizzle-orm'
// DOMAIN
import { feature, featureI18n } from '../../../src/lib/db/schema/feature'
import { persistSaanSeoiPlace } from '../../../src/lib/db/services/locationSource'
import { prepareOrganisationLocationWrite } from '../../../src/lib/db/services/organisationLocation'
import { prepareFeatureLocationAssociationWrite } from '../../../src/lib/db/services/locationAssociation'
import { saveProjectLocationSettings } from '../../../src/lib/db/services/location'
import { adoptRefreshedLocationForFeature } from '../../../src/lib/db/services/locationRefreshAdoption'
import { DEFAULT_PROJECT_LOCATION_POLICY } from '../../../src/lib/locations/model'
// TYPES
import type { Database as Sqlite } from 'bun:sqlite'
import type { Database } from '../../../src/lib/types'
import type { SaanSeoiPlaceProjection } from '../../../src/lib/locations/saanseoi'

/**
 * Verify persisted Project adoption using real source-service hydration evidence.
 * @param db Isolated D1-compatible domain connection.
 * @param sqlite The same in-memory SQLite database with Location foundation installed.
 * @param unresolved Canonical collection projection before Address hydration.
 * @param resolved The same publication after exact Address dependency hydration.
 * @returns Count-only evidence after automatic adoption, review isolation and replay checks.
 * @remarks Synthetic Feature fixtures use actual schema column order and Location migrations.
 * This tests the refresh adoption service, not the scheduled Worker or a new publication.
 */
export async function rehearseCuratedAdoption(
  db: Database,
  sqlite: Sqlite,
  unresolved: SaanSeoiPlaceProjection,
  resolved: SaanSeoiPlaceProjection,
): Promise<{
  automaticAddressAdopted: true
  otherProjectHeldForReview: true
  adoptionReplayUnchanged: true
}> {
  // Populate the Feature projection tables without inventing production resources or permissions.
  for (const [name, table] of [
    ['feature', feature],
    ['featureI18n', featureI18n],
  ] as const) {
    if (name === 'featureI18n') {
      sqlite.exec(
        `CREATE TABLE featureI18n (${Object.values(getTableColumns(table))
          .map(column => `"${column.name}" ${column.getSQLType()}`)
          .join(',')})`,
      )
    } else {
      for (const column of Object.values(getTableColumns(table))) {
        if (!['id', 'localLocationBrands'].includes(column.name))
          sqlite.exec(
            `ALTER TABLE feature ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
      }
    }
  }
  for (const migration of [
    '0109_place_association_scope.sql',
    '0110_feature_place_history.sql',
    '0112_feature_place_detachment.sql',
    '0113_place_adoption_review.sql',
    '0117_place_identity_review.sql',
    '0118_place_merge_redirect.sql',
    '0120_place_identity_rejection.sql',
    '0123_place_owned_fields.sql',
    '0124_place_adoption_decisions.sql',
    '0125_place_identity_consolidation.sql',
    '0135_place_organisation_ownership.sql',
    '0137_location_kinds.sql',
    '0114_place_refresh.sql',
    '0115_place_refresh_processing.sql',
    '0119_place_source_changes.sql',
    '0121_place_refresh_identity_scan.sql',
    '0122_simplify_place_refresh.sql',
    '0138_location_storage.sql',
    '0139_organisation_location_corrections.sql',
    '0141_organisation_location_scope_guards.sql',
    '0142_location_facts_snapshots.sql',
  ]) {
    sqlite.exec(
      readFileSync(resolve(import.meta.dir, '../../../migrations', migration), 'utf8'),
    )
  }
  const baseline = await persistSaanSeoiPlace(db, unresolved)
  const overrides = {
    names: { en: { mode: 'override' as const, value: 'Breadline collection label' } },
    phoneNumber: { mode: 'override' as const, value: ['+85223456789'] },
  }
  for (const projectId of ['automatic', 'review']) {
    sqlite.query('INSERT INTO organisation(id) VALUES (?)').run(projectId)
    sqlite.query('INSERT INTO project(id,organisationId) VALUES (?,?)').run(projectId, projectId)
    sqlite
      .query(
        'INSERT INTO feature(id,projectId,isDraft,isIntangible,modifiedAt,geometry,addressMeta) VALUES (?,?,0,0,?,?,?)',
      )
      .run(
        projectId,
        projectId,
        '2025-09-25T00:00:00Z',
        JSON.stringify(unresolved.facts.location.geometry),
        '{}',
      )
    sqlite
      .query(
        "INSERT INTO featureI18n(featureId,locale,title,description,displayAddress) VALUES (?,'en',?,?,?)",
      )
      .run(
        projectId,
        'Breadline collection label',
        'Keep pickup instructions',
        'Unresolved address',
      )
    const correction=await prepareOrganisationLocationWrite(db,{organisationId:projectId,locationId:baseline.locationId,actorId:'synthetic-rehearsal',overrides,guard:sql`1`})
    for(const query of correction.queries)await query
    await prepareFeatureLocationAssociationWrite(db, {
      featureId: projectId,
      projectId,
      locationId: baseline.locationId,
      factsRevisionId: baseline.revisionId,
      locationRevisionId: baseline.revisionId,
      expectedFeatureModifiedAt: '2025-09-25T00:00:00Z',
      expectedRevision: null,
      actorId: 'synthetic-rehearsal',
      overrides,
      factsOrganisationRevision:correction.revision,
      locationOrganisationRevision:correction.revision,
    }).query
  }
  assert.ok(
    await saveProjectLocationSettings(
      db,
      'automatic',
      {
        ...DEFAULT_PROJECT_LOCATION_POLICY,
        address: 'automatic',
        unit: 'automatic',
      },
      0,
    ),
  )
  const candidate = await persistSaanSeoiPlace(db, resolved)
  assert.equal(candidate.locationId, baseline.locationId)
  assert.notEqual(candidate.revisionId, baseline.revisionId)
  /** Apply the same hydrated source revision under each persisted Project policy. @param projectId Fixture scope. @returns Durable adoption result. */
  const adopt = (projectId: string) =>
    adoptRefreshedLocationForFeature(db, {
      featureId: projectId,
      projectId,
      locationId: baseline.locationId,
      candidateRevisionId: candidate.revisionId,
      guard: sql`1`,
    })
  const automatic = await adopt('automatic')
  const review = await adopt('review')
  assert.equal(automatic.status, 'processed')
  assert.equal(automatic.groups.location, 'applied')
  assert.equal(automatic.geometryChanged, false)
  assert.equal(review.status, 'review')
  assert.equal(review.groups.location, 'review')
  for (const id of ['automatic', 'review']) {
    const association = sqlite
      .query('SELECT * FROM featureLocation WHERE featureId=?')
      .get(id) as {
      locationId: string
      locationRevisionId: string
      acceptedOverrides: string
    }
    assert.equal(association.locationId, baseline.locationId)
    assert.equal(
      association.locationRevisionId,
      id === 'automatic' ? candidate.revisionId : baseline.revisionId,
    )
    assert.deepEqual(JSON.parse(association.acceptedOverrides), overrides)
    const row = sqlite
      .query(
        'SELECT title,description,displayAddress FROM featureI18n WHERE featureId=?',
      )
      .get(id) as {
      title: string
      description: string
      displayAddress: string
    }
    assert.equal(row.title, 'Breadline collection label')
    assert.equal(row.description, 'Keep pickup instructions')
    if (id === 'automatic') {
      assert.match(row.displayAddress, /REHEARSAL HOUSE/)
      const parent = sqlite
        .query('SELECT addressMeta FROM feature WHERE id=?')
        .get(id) as { addressMeta: string }
      assert.deepEqual(
        JSON.parse(parent.addressMeta).address.source,
        resolved.facts.location.address,
      )
    } else assert.equal(row.displayAddress, 'Unresolved address')
  }
  /** Capture every adoption-owned row for an exact replay check. @returns Serialized immutable snapshot. */
  const snapshot = (): string =>
    JSON.stringify(
      [
        'location',
        'locationRevision',
        'feature',
        'featureI18n',
        'featureLocation',
        'featureLocationHistory',
        'locationAdoptionProposal',
      ].map(table => sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
    )
  const before = snapshot()
  await adopt('automatic')
  await adopt('review')
  assert.equal(snapshot(), before)
  assert.deepEqual(sqlite.query('PRAGMA foreign_key_check').all(), [])
  return {
    automaticAddressAdopted: true,
    otherProjectHeldForReview: true,
    adoptionReplayUnchanged: true,
  }
}
