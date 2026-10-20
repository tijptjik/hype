// Refs #194. See spec/breadline/proposal/places-address-curation.md.
// Run: bun scripts/places/rehearse-address-curation.ts
// RUNTIME
import { Database } from 'bun:sqlite'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
// SAANSEOI SOURCE IMPLEMENTATIONS
import { createMemoryProvenanceStore } from '../../../saanseoi/libs/core/src/testing/provenanceStore'
import { requireDefined } from '../../../saanseoi/libs/core/src/requireDefined'
import {
  computeVersionHash,
  currentSchema,
  metaSchema,
} from '../../../saanseoi/libs/db/src/index.ts'
import { initialDatasets } from '../../../saanseoi/libs/db/src/registry/index.ts'
import { createLocalHarbourDb } from '../../../saanseoi/libs/core/src/testing/localDb'
import {
  insertFixtureRelease,
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../saanseoi/libs/core/src/testing/metaFixtures'
import {
  ensureDraftReleaseSetForRelease,
  ensureDraftSnapshotForRelease,
  publishReleaseArtefacts,
  getDatasetRecordByReleaseId,
  publishSnapshot,
  recordSnapshotAssembly,
  upsertSnapshotSource,
} from '../../../saanseoi/libs/core/src/lib/db/metaRegistry'
import { getAddressDetail } from '../../../saanseoi/apps/atlas-api/src/services/addresses'
import { AddressDetailQuerySchema } from '../../../saanseoi/apps/atlas-api/src/schema/addresses'

/**
 * Rehearse synthetic curation, source Address publication/API reads and HYPE ingestion.
 * @returns Completion only after exact snapshot hydration and idempotent persistence pass.
 * @remarks All databases are in memory. Requires the sibling SaanSeoi checkout; never
 * opens production mirrors, publishes remotely or accepts a real establishment match.
 * Place collection evidence is synthetic; Address curation/publication/read services are real.
 */
async function main(): Promise<void> {
  const { store: lineageStore } = createMemoryProvenanceStore()
  const meta = new Database(':memory:')
  const current = new Database(':memory:')
  try {
    for (const [database, family] of [
      [meta, 'meta'],
      [current, 'current'],
    ] as const)
      database.exec(
        loadMigrationSql(
          resolve(import.meta.dir, '../../../saanseoi/libs/db/migrations'),
          [family],
        ).replaceAll('--> statement-breakpoint', ''),
      )
    seedFixtureCatalog(meta)
    meta.exec(`DELETE FROM apiCatalogRevisionReleaseSets;
      DELETE FROM apiCatalogRevisions;
      DELETE FROM apiVersionReleaseSets;
      DELETE FROM apiReleaseSets;`)
    const db = createLocalHarbourDb(meta)
    const currentDb = createLocalHarbourDb(current)
    meta.exec(`INSERT INTO datasets (id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, versionHash)
      SELECT 'overture-hk-place', publisherId, 'ds-hk-overture-place', 'hk', 'static', 'monthly', 'places', 'fixture'
      FROM datasets WHERE id = 'overture-hk-division';
      UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'place') WHERE id = 'overture-hk-place' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'place');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'address') WHERE id = 'overture-hk-place' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'address');`)
    const cohort = '2025-09-24.0'
    const members = [
      {
        id: 'division',
        type: 'division',
        source: 'overture',
        datasetId: 'overture-hk-division',
        datasetCode: 'ds-hk-overture-division',
        variant: 'overture',
      },
      {
        id: 'als',
        type: 'address',
        source: 'hkgov-dpo',
        datasetId: 'hkgov-dpo-hk-address',
        datasetCode: 'ds-hk-hkgov-dpo-address',
        variant: 'hkgov-dpo',
      },
      {
        id: 'supplementary',
        type: 'address',
        source: 'overture',
        datasetId: 'overture-hk-place',
        datasetCode: 'ds-hk-overture-place',
        variant: 'overture-places',
      },
    ] as const
    const snapshots = new Map<string, string>()
    for (const member of members) {
      insertFixtureRelease(meta, {
        resourceReleaseId: member.id,
        datasetCode: member.datasetCode,
        releaseCode: `release-${member.id}`,
        source: member.source,
        regionCode: 'hk',
        rawObjectKey: 'fixture.json',
        originalFileName: 'fixture.json',
        ingestedAt: '2025-09-25T00:00:00Z',
        resourceType: member.type,
        cohortKey: cohort,
        sourceVersion: cohort,
        status: 'current',
        createdAt: '2025-09-25T00:00:00Z',
        updatedAt: '2025-09-25T00:00:00Z',
      })
      const snapshot = await ensureDraftSnapshotForRelease(db, member.type, {
        cohortKey: cohort,
        datasetCode: member.datasetCode,
        datasetId: member.datasetId,
        sourceReleaseId: member.id,
        regionCode: 'hk',
        variant: member.variant,
      })
      await upsertSnapshotSource(db, snapshot.id, member.id, 'primary', {
        selectedByRule: `assembly:${member.type}:source-release:v1`,
        selectionMode: 'exact_ref',
      })
      await recordSnapshotAssembly(db, {
        anchorReleaseId: member.id,
        resourceType: member.type,
        snapshotId: snapshot.id,
      })
      snapshots.set(member.id, snapshot.id)
    }
    // Capture the actual dataset policy so every pinned field rule is retained.
    for (const dataset of initialDatasets) {
      if (!dataset.processingRules) continue
      const definitionId = computeVersionHash(dataset.processingRules)
      await db
        .insert(metaSchema.metaProcessingRuleDefinitions)
        .values({ id: definitionId, definition: dataset.processingRules })
        .onConflictDoNothing()
        .run()
      meta
        .query(`UPDATE resourceReleases SET processingRules = ?
          WHERE sourceReleaseId IN (SELECT s.id FROM sourceReleases s JOIN datasets d ON d.id=s.datasetId WHERE d.code = ?)`)
        .run(definitionId, dataset.code)
    }
    const divisionSnapshotId = requireDefined(snapshots.get('division'))
    currentDb
      .insert(currentSchema.divisions)
      .values({
        scopeId: 'division',
        id: 'hk',
        class: 'country',
        category: 'administrative',
        hierarchies: { administrative: [], locality: [], landform: [], full: [] },
      })
      .run()
    currentDb
      .insert(currentSchema.divisions)
      .values({
        scopeId: 'division',
        id: 'division-district',
        class: 'district',
        category: 'administrative',
        hierarchies: { administrative: [], locality: [], landform: [], full: [] },
      })
      .run()
    currentDb
      .insert(currentSchema.divisionPublicationState)
      .values({
        snapshotId: divisionSnapshotId,
        scopeId: 'division',
        status: 'current',
        publicationToken: 'division',
        preparedAt: '2026-01-01',
      })
      .run()

    const {
      addressFingerprint,
      createSupplementaryAddressAnalyser,
      emptySupplementaryEntryLedger,
      parseSupplementaryCuration,
      supplementaryIdentity,
    } = await import(
      '../../../saanseoi/apps/harbour-cli/src/lib/pipeline/places/supplementaryPlaceAddress.ts'
    )
    const { buildSupplementaryAddressRows } = await import(
      '../../../saanseoi/apps/harbour-cli/src/lib/pipeline/places/supplementaryPlaceAddressRows.ts'
    )
    const policy = (
      await import(
        '../../../saanseoi/apps/harbour-cli/src/lib/pipeline/places/testFixtures/supplementaryAddressPolicy.json'
      )
    ).default
    const values = [
      {
        locale: 'en',
        formattedAddress: 'REHEARSAL HOUSE, 20 REHEARSAL ROAD',
        buildingName: 'REHEARSAL HOUSE',
        premisesName: null,
        blockExpression: null,
        phaseExpression: null,
        streetName: 'REHEARSAL ROAD',
        buildingNumberExpression: '20',
        buildingNumberFrom: '20',
        buildingNumberTo: null,
      },
    ]
    const observation = {
      placeId: 'synthetic-curation-place',
      sourceRelease: cohort,
      texts: ['Rehearsal House, 20 Rehearsal Road'],
      lng: 114.1,
      lat: 22.3,
    }
    const decision = {
      placeId: observation.placeId,
      sourceRelease: cohort,
      fingerprint: addressFingerprint(observation.texts),
      previousAddressId: null,
      resolution: 'create_supplementary',
      addressId: supplementaryIdentity(values).addressId,
      reason: 'Isolated synthetic HYPE integration rehearsal',
      address: { baseAddressId: null, values },
    }
    const curation = parseSupplementaryCuration(
      { ...structuredClone(policy), decisions: [decision] },
      emptySupplementaryEntryLedger(),
    )
    const analyse = createSupplementaryAddressAnalyser(
      [],
      new Set(),
      new Map(),
      curation,
    )
    const resolution = analyse(observation, null)
    assert.equal(resolution.tier, 'supplementary')
    assert.equal(analyse(observation, null).addressId, resolution.addressId)
    const snapshotId = snapshots.get('supplementary')!
    const rows = await buildSupplementaryAddressRows({
      resolutions: [resolution],
      officialAddresses: new Map(),
      snapshotId,
      divisionSnapshotId,
      sourceVersion: cohort,
      datasetCode: 'ds-hk-overture-place',
    })
    assert.equal(rows.length, 1)
    currentDb
      .insert(currentSchema.addressPublicationState)
      .values({
        scopeId: snapshotId,
        snapshotId,
        divisionSnapshotId,
        status: 'current',
        publicationToken: 'rehearsal',
        preparedAt: '2025-09-25T00:00:00Z',
      })
      .run()
    currentDb
      .insert(currentSchema.addressPublicationState)
      .values({
        scopeId: snapshots.get('als')!,
        snapshotId: snapshots.get('als')!,
        divisionSnapshotId,
        status: 'current',
        publicationToken: 'official-rehearsal',
        preparedAt: '2025-09-25T00:00:00Z',
      })
      .run()
    currentDb.insert(currentSchema.address2d).values(rows[0]!.current).run()
    for (const row of rows[0]!.i18n)
      currentDb
        .insert(currentSchema.address2dI18n)
        .values({ ...row, scopeId: snapshotId })
        .run()
    // Materialise the curated rows before publishing their source snapshots and catalogue.
    for (const snapshot of snapshots.values()) await publishSnapshot(db, snapshot)
    // Publishing the supplementary resource must accept its snapshot variant,
    // even though its shared publisher dataset has the Places theme.
    const releaseSet = await ensureDraftReleaseSetForRelease(
      db,
      'address',
      { cohortKey: cohort, regionCode: 'hk' },
      {
        domainCode: 'saanseoi',
        schemaVersion: 'sv-address-v1',
        rulesetVersion: 'rs-address-merge-v1',
      },
    )
    const dataset = await getDatasetRecordByReleaseId(db, 'supplementary')
    if (!dataset) throw new Error('Missing fixture release')
    const publication = await publishReleaseArtefacts(db, {
      lineageStore,
      dataset,
      currentRelease: null,
      currentReleaseIsCorrected: false,
      releaseSetId: releaseSet.id,
      snapshotId: requireDefined(snapshots.get('supplementary')),
      snapshotVariant: 'overture-places',
      resourceType: 'address',
      publishedAt: '2025-09-25T00:00:00Z',
      updateDatasetRelease: false,
      carriedSnapshots: [
        {
          resourceType: 'address',
          variant: 'hkgov-dpo',
          snapshotId: requireDefined(snapshots.get('als')),
        },
        {
          resourceType: 'division',
          variant: 'overture',
          snapshotId: requireDefined(snapshots.get('division')),
        },
      ],
    })
    assert.ok(publication?.code)
    const requests: string[] = []
    const client = {
      baseUrl: 'https://source.example',
      apiKey: 'synthetic-fixture',
      fetch: async (input: URL | RequestInfo) => {
        const url = new URL(String(input))
        requests.push(url.toString())
        const result = await getAddressDetail({
          currentDb: currentDb as never,
          metaDb: db as never,
          requestUrl: url.toString(),
          requestedVersionPath: 'addresses/v0.1',
          requestedApiVersion: '0.1',
          resolvedApiVersion: 'api-addresses-v0.1',
          id: resolution.addressId!,
          query: AddressDetailQuerySchema.parse(Object.fromEntries(url.searchParams)),
        })
        return Response.json(result.body, { status: result.status })
      },
    }
    const { projectSaanSeoiPlace } = await import('../../src/lib/places/saanseoi.ts')
    const { hydrateSaanSeoiPlaceAddress } = await import(
      '../../src/lib/places/sourceAddress.ts'
    )
    const projection = projectSaanSeoiPlace(
      {
        type: 'places',
        id: 'synthetic-canonical-place',
        attributes: {
          geometry: { type: 'Point', coordinates: [114.1, 22.3] },
          snapshotId: 'synthetic-place-snapshot',
          resourceReleaseId: 'synthetic-place-release',
          addressSnapshotId: snapshotId,
          address2dId: resolution.addressId,
          address3dId: null,
          address3dUnitId: null,
          phones: [],
          identifiers: null,
          i18n: { en: { name: 'Synthetic rehearsal shop', brandName: null } },
        },
      },
      {
        apiReleaseSet: 'synthetic-place-publication',
        apiCatalogRevision: 'synthetic-place-catalog',
        catalogPublishedAt: new Date().toISOString(),
        cohort,
        domain: 'overture',
        region: 'hk',
        resolvedApiVersion: 'api-places-v0.1',
        schemaVersion: 'v1',
      },
      {
        apiReleaseSet: 'synthetic-place-publication',
        snapshotId: 'synthetic-place-snapshot',
      },
    )
    const hydrated = await hydrateSaanSeoiPlaceAddress(client as never, projection)

    assert.equal(hydrated.facts.location.address.status, 'resolved')
    assert.equal(hydrated.facts.location.address.address2dId, resolution.addressId)
    assert.equal(hydrated.facts.location.address.addressSnapshotId, snapshotId)
    assert.equal(hydrated.issues.length, 0)
    assert.equal(requests.length, 2)
    const evidence = hydrated.facts.location.address.records.data as {
      attributes: {
        i18n: Record<string, { formattedAddress: string }>
        sources: unknown[]
      }
    }
    assert.equal(
      evidence.attributes.i18n.en?.formattedAddress,
      values[0]!.formattedAddress,
    )
    assert.deepEqual(evidence.attributes.sources, [
      {
        publisher: 'overture',
        dataset: 'ds-hk-overture-place',
        recordId: observation.placeId,
      },
    ])
    const wrongSnapshot = structuredClone(projection)
    wrongSnapshot.facts.location.address.addressSnapshotId = 'wrong-snapshot'
    const held = await hydrateSaanSeoiPlaceAddress(client as never, wrongSnapshot)
    assert.equal(held.facts.location.address.status, 'unresolved')
    assert.deepEqual(held.payload.addressHydration, {
      status: 'review',
      reason: 'address-dependency-mismatch',
    })
    assert.ok(new URL(requests[1]!).searchParams.get('catalogRevision'))
    // Retain actual source-service bytes and prove that HYPE ingestion is idempotent.
    const { drizzle: hypeDrizzle } = await import('drizzle-orm/d1')
    const { readFileSync } = await import('node:fs')
    const { persistSaanSeoiPlace } = await import(
      '../../src/lib/db/services/placeSource'
    )
    const { resolveFeaturePlace } = await import('../../src/lib/places/resolve')
    const hype = new Database(':memory:')
    try {
      hype.exec(
        'PRAGMA foreign_keys=ON; CREATE TABLE project(id TEXT PRIMARY KEY); CREATE TABLE feature(id TEXT PRIMARY KEY);',
      )
      for (const migration of [
        '0102_place_inheritance_foundation.sql',
        '0116_place_identity_history.sql',
      ])
        hype.exec(
          readFileSync(resolve(import.meta.dir, '../../migrations', migration), 'utf8'),
        )
      /** Bind SQLite to the same atomic statement API used by D1 ingestion. */
      type Statement = {
        bind: (...args: unknown[]) => Statement
        raw: () => Promise<unknown[][]>
        all: () => Promise<{
          success: boolean
          results: unknown[]
          meta: { changes: number }
        }>
        run: () => Promise<{ success: boolean; meta: { changes: number | bigint } }>
      }
      const prepare = (query: string, values: unknown[] = []): Statement => ({
        bind: (...args: unknown[]) => prepare(query, args),
        raw: async () => hype.query(query).values(...(values as never[])),
        all: async () => ({
          success: true,
          results: hype.query(query).all(...(values as never[])),
          meta: {
            changes: Number(
              (hype.query('SELECT changes() AS n').get() as { n: number }).n,
            ),
          },
        }),
        run: async () => ({
          success: true,
          meta: { changes: hype.query(query).run(...(values as never[])).changes },
        }),
      })
      const binding = {
        prepare,
        batch: async (statements: ReturnType<typeof prepare>[]) => {
          hype.exec('BEGIN')
          try {
            const results = []
            for (const statement of statements) results.push(await statement.all())
            hype.exec('COMMIT')
            return results
          } catch (error) {
            hype.exec('ROLLBACK')
            throw error
          }
        },
      }
      const hypeDb = hypeDrizzle(binding as never)
      const first = await persistSaanSeoiPlace(hypeDb as never, hydrated)
      const second = await persistSaanSeoiPlace(hypeDb as never, hydrated)
      assert.deepEqual(first, second)
      assert.equal(
        (hype.query('SELECT count(*) AS n FROM placeRevision').get() as { n: number })
          .n,
        1,
      )
      assert.equal(
        (hype.query('SELECT count(*) AS n FROM place').get() as { n: number }).n,
        1,
      )
      const stored = hype.query('SELECT facts FROM placeRevision').get() as {
        facts: string
      }
      assert.deepEqual(
        JSON.parse(stored.facts).location.address,
        hydrated.facts.location.address,
      )
      const overridden = resolveFeaturePlace(hydrated.facts, hydrated.facts.location, {
        names: { en: { mode: 'override', value: 'Breadline collection label' } },
      })
      assert.equal(overridden.names.en, 'Breadline collection label')
      assert.deepEqual(overridden.location?.address, hydrated.facts.location.address)
      assert.deepEqual(hype.query('PRAGMA foreign_key_check').all(), [])
      assert.deepEqual(current.query('PRAGMA foreign_key_check').all(), [])
      assert.deepEqual(meta.query('PRAGMA foreign_key_check').all(), [])
      console.log(
        JSON.stringify(
          {
            fixture: 'synthetic-address-curation',
            curation: resolution.tier,
            addressResolved: true,
            exactSnapshot: true,
            pinnedRequests: 2,
            wrongSnapshotHeldForReview: true,
            persistedPlaces: 1,
            persistedRevisions: 1,
            replayUnchanged: true,
            featureNameOverridePreserved: true,
          },
          null,
          2,
        ),
      )
    } finally {
      hype.close()
    }
  } finally {
    meta.close()
    current.close()
  }
}
await main()
