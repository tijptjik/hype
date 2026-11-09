// Refs #194 — isolated rehearsal of the minimal operating-state contract.
// NODE
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { openSqliteDomain } from './lib/sqlite-domain'
import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'
import { updateLocalLocationAddress } from '../../src/lib/db/services/locationLocal'
import { listLocationResources } from '../../src/lib/db/services/locationDirectory'
import { getAcceptedFeatureLocation } from '../../src/lib/db/services/location'
import { proposeFeatureLocationAdoption } from '../../src/lib/db/services/locationAdoptionReview'
import { applyLocationAdoptionGroup } from '../../src/lib/db/services/locationAdoptionApply'
import { featureLocationLifecycleSQL } from '../../src/lib/db/services/locationLifecycleProjection'

/** Assert rehearsal invariants without allowing silent partial success.
 * @param value Required invariant. @param message Failure detail. @returns Nothing on success.
 */
function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

/** Rehearse on an explicitly named disposable copy of a populated local database.
 * @param path Disposable rehearsal.sqlite next to before.sqlite under .local/locations.
 * @returns A receipt and one synthetic manifest row; never modifies the primary/local/remote bindings.
 * @remarks The before.sqlite backup is the rollback artifact. Assertions are synthetic acceptance
 * fixtures, not research claims about the real business. No historical JSON backfill is required.
 */
async function rehearse(path: string): Promise<void> {
  const root = resolve(path, '..')
  requireValue(
    root.startsWith(resolve('.local/locations') + '/') &&
      resolve(path) === resolve(root, 'rehearsal.sqlite') &&
      existsSync(resolve(root, 'before.sqlite')),
    'Use a disposable rehearsal.sqlite beside its before.sqlite backup',
  )
  const { db, sqlite, close } = openSqliteDomain(path)
  try {
    const tables = [
      'location',
      'locationRevision',
      'feature',
      'featureLocation',
      'organisationLocation',
    ] as const
    const count = (): Record<string, number> =>
      Object.fromEntries(
        tables.map(table => [
          table,
          Number(
            (sqlite.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number })
              .n,
          ),
        ]),
      )
    const beforeCounts = count()
    const oldRevisions = sqlite
      .query('SELECT * FROM locationRevision ORDER BY id')
      .all()
    const rawFeatures = JSON.stringify(
      sqlite.query('SELECT * FROM feature ORDER BY id').all(),
    )
    const rawAssociations = JSON.stringify(
      sqlite.query('SELECT * FROM featureLocation ORDER BY featureId').all(),
    )
    const row = sqlite
      .query(`SELECT l.id,l.ownerOrganisationId,r.id AS revisionId,r.facts,fp.featureId,f.projectId,f.modifiedAt
      FROM location l JOIN locationRevision r ON r.locationId=l.id
      JOIN featureLocation fp ON fp.locationId=l.id JOIN feature f ON f.id=fp.featureId
      WHERE l.ssId IS NULL AND l.kind='establishment' AND f.isPublished=1 AND f.isArchived=0
      AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id)
      ORDER BY l.id LIMIT 1`)
      .get() as {
      id: string
      ownerOrganisationId: string
      revisionId: string
      facts: string
      featureId: string
      projectId: string
      modifiedAt: string
    } | null
    requireValue(row, 'No eligible local establishment/Feature')
    const baseline = readLocationFacts(row.facts)
    const status = 'permanently_closed' as const
    const current = (
      await listLocationResources(db, {
        id: row.id,
        organisationId: row.ownerOrganisationId,
      })
    ).data[0]
    const input = {
      locationId: row.id,
      organisationId: row.ownerOrganisationId,
      expectedRevisionId: row.revisionId,
      expectedOrganisationRevision: current.organisationRevision ?? null,
      actorId: 'hype-local-agent-admin',
      operatingStatus: status,
    }
    const saved = await updateLocalLocationAddress(db, input)
    requireValue(
      saved && saved.revisionId !== row.revisionId,
      'Lifecycle edit did not append a baseline',
    )
    requireValue(
      JSON.stringify(sqlite.query('SELECT * FROM feature ORDER BY id').all()) ===
        rawFeatures,
      'Lifecycle edit changed Features',
    )
    requireValue(
      JSON.stringify(
        sqlite.query('SELECT * FROM featureLocation ORDER BY featureId').all(),
      ) === rawAssociations,
      'Lifecycle edit changed associations',
    )
    for (const old of oldRevisions as { id: string }[])
      requireValue(
        JSON.stringify(
          sqlite.query('SELECT * FROM locationRevision WHERE id=?').get(old.id),
        ) === JSON.stringify(old),
        'Immutable source/baseline changed',
      )
    requireValue(
      (await updateLocalLocationAddress(db, input)) === null,
      'Old revision replay was not rejected',
    )
    const afterEditCounts = count()
    const noChange = await updateLocalLocationAddress(db, {
      ...input,
      expectedRevisionId: saved.revisionId,
      expectedOrganisationRevision: saved.organisationRevision,
    })
    requireValue(
      noChange?.revisionId === saved.revisionId &&
        count().locationRevision === afterEditCounts.locationRevision,
      'No-change replay appended a revision',
    )
    const historic = (
      await listLocationResources(db, {
        id: row.id,
        organisationId: row.ownerOrganisationId,
        lifecycleStatus: 'permanently_closed',
      })
    ).data[0]
    requireValue(
      historic?.facts?.operatingStatus === 'permanently_closed',
      'Historical search/filter failed',
    )
    requireValue(
      JSON.stringify(historic.facts.location) === JSON.stringify(baseline.location),
      'Historical geometry/address lost',
    )
    const accepted = await getAcceptedFeatureLocation(db, row.featureId, row.projectId)
    requireValue(
      accepted && accepted.effective.operatingStatus !== 'permanently_closed',
      'Unadopted lifecycle leaked into Feature',
    )
    const review = await proposeFeatureLocationAdoption(db, {
      featureId: row.featureId,
      projectId: row.projectId,
      candidateRevisionId: saved.revisionId,
    })
    requireValue(
      review?.proposal.evidence.plan.decision.facts === 'review',
      'Lifecycle skipped explicit review',
    )
    const adopted = await applyLocationAdoptionGroup(db, {
      featureId: row.featureId,
      projectId: row.projectId,
      expectedRevision: accepted.revision,
      expectedFeatureModifiedAt: row.modifiedAt,
      proposalId: review.proposal.id,
      fieldGroup: 'facts',
      mode: 'reviewed',
      actorId: 'hype-local-agent-admin',
      reason: 'Synthetic isolated lifecycle acceptance rehearsal',
    })
    requireValue(adopted.status === 'applied', 'Reviewed lifecycle adoption failed')
    const projection = await db.get<{ value: string }>(
      sql`SELECT ${featureLocationLifecycleSQL()} AS value FROM feature WHERE id=${row.featureId}`,
    )
    requireValue(
      JSON.parse(projection.value).operatingStatus === 'permanently_closed' &&
        !projection.value.includes('evidence'),
      'Public projection missing or exposes evidence',
    )
    requireValue(
      sqlite.query('PRAGMA foreign_key_check').all().length === 0,
      'Foreign key violations',
    )
    requireValue(
      (sqlite.query('PRAGMA integrity_check').get() as { integrity_check: string })
        .integrity_check === 'ok',
      'Integrity failed',
    )
    const receipt = {
      status: 'verified',
      environment: 'isolated-local-copy',
      sqlMigration: null,
      beforeCounts,
      afterEditCounts,
      afterAdoptionCounts: count(),
      immutableRevisionsPreserved: oldRevisions.length,
      featureWritesDuringLocationEdit: 0,
      associationWritesDuringLocationEdit: 0,
      staleReplayConflicts: 1,
      noChangeReplayInserts: 0,
      foreignKeys: 'ok',
      integrity: 'ok',
      fixture: {
        locationId: row.id,
        featureId: row.featureId,
        organisationId: row.ownerOrganisationId,
        projectId: row.projectId,
        revisionId: saved.revisionId,
      },
      rollback:
        'Restore before.sqlite to this disposable copy only; primary local and remote databases were never modified.',
    }
    writeFileSync(
      resolve(root, 'rehearsal-receipt.json'),
      JSON.stringify(receipt, null, 2) + '\n',
    )
    writeFileSync(
      resolve(root, 'rehearsal-manifest.jsonl'),
      JSON.stringify({
        manifestVersion: 1,
        featureId: row.featureId,
        locationId: row.id,
        imageId: null,
        field: 'operatingStatus',
        expectedRevisionId: row.revisionId,
        expectedBefore: baseline.operatingStatus ?? null,
        proposedAfter: status,
        decision: 'no-change',
        evidence: [],
        effectiveDate: null,
        datePrecision: null,
        confidence: 'high',
        notes:
          'SYNTHETIC TEST ONLY, already rehearsed. Not a supported research assertion; never apply this manifest to real databases.',
      }) + '\n',
    )
    console.log(JSON.stringify(receipt))
  } finally {
    close()
  }
}

await rehearse(process.argv[2] ?? '')
