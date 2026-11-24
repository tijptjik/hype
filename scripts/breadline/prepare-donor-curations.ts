// NODE
import { writeFileSync } from 'node:fs'
// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { prepareSharedLocationCorrection } from '../../src/lib/db/services/locationShared'
import { prepareSharedFeatureAdoption } from '../../src/lib/db/services/locationSharedFeature'
import { prepareRevisionCheck } from '../../src/lib/db/services/revisionBatch'
import { reviewedDonorCuration } from './lib/donor-curation'
import type { Group } from '../revisions/production/contract'

/** Apply durable donor rules to a disposable current-schema snapshot and retain its SQL.
 * @param path Private working database, never the live DEV database.
 * @param actorId Verified production contributor ID.
 * @returns Guarded revision groups; an already accepted correction produces no writes.
 * @remarks Run after source reconciliation. Raw source revisions and hashes are preserved.
 */
export async function prepareDonorCurations(
  path: string,
  actorId: string,
): Promise<Group[]> {
  const domain = openSqliteDomain(path)
  const groups: Group[] = []
  try {
    const actor = domain.sqlite
      .query('SELECT id FROM user WHERE id=? AND username=?')
      .get(actorId, 'tijptjik')
    if (!actor) throw new Error('Verified curation contributor is missing')
    for (const sourceId of ['767', '768']) {
      const rule = reviewedDonorCuration('donors', sourceId)!
      const field = rule.phoneNumber ? 'phoneNumber' : 'operatingStatus'
      const value = rule.phoneNumber ? [...rule.phoneNumber] : rule.operatingStatus!
      const row = domain.sqlite
        .query(`SELECT f.id,f.projectId,l.locationId,l.acceptancePolicy
        FROM breadlineImportFeature b JOIN feature f ON f.id=b.featureId
        JOIN featureLocation l ON l.featureId=f.id WHERE b.sourceTable='donors' AND b.sourceId=?`)
        .get(sourceId) as {
        id: string
        projectId: string
        locationId: string
        acceptancePolicy: string | null
      } | null
      if (!row) throw new Error('Curated donor binding missing: ' + sourceId)
      const source = domain.sqlite
        .query(
          'SELECT id FROM locationRevisionContent WHERE locationId=? ORDER BY version DESC LIMIT 1',
        )
        .get(row.locationId) as { id: string }
      const head = domain.sqlite
        .query('SELECT id,corrections FROM locationSharedHead WHERE locationId=?')
        .get(row.locationId) as { id: string; corrections: string } | null
      const entry = head ? JSON.parse(head.corrections)[field] : null
      const phone = rule.phoneNumber
        ? (domain.sqlite
            .query(
              "SELECT value FROM featureProperty WHERE featureId=? AND propertyId='gPropPhNum01'",
            )
            .get(row.id) as { value: string } | null)
        : null
      if (
        entry?.choice?.mode === 'override' &&
        !entry.supersededBy &&
        JSON.stringify(entry.choice.value) === JSON.stringify(value) &&
        JSON.parse(row.acceptancePolicy || '{}').lastSharedRevision === head?.id &&
        (!rule.phoneNumber || phone?.value === JSON.stringify(value))
      )
        continue
      // Shared evidence and Feature adoption commit atomically through ordinary revision services.
      const shared = await prepareSharedLocationCorrection(domain.db, {
        locationId: row.locationId,
        sourceRevisionId: source.id,
        expectedRevision: head?.id ?? null,
        actorId,
        guard: sql`1`,
        draftWorkingCopy: true,
        patch: { [field]: { mode: 'override', value } },
        rights: { canEdit: true, superAdmin: true },
        provenance: {
          kind: 'breadline-durable-curation',
          sourceDonorId: sourceId,
          reason: rule.reason,
        },
      })
      const adopted = await prepareSharedFeatureAdoption(domain.db, {
        featureId: row.id,
        projectId: row.projectId,
        actorId,
        action: 'staff-update',
        locationId: row.locationId,
        sourceRevisionId: source.id,
        sharedRevisionId: shared.id,
        facts: shared.facts,
        fields: [field],
        guard: sql`1`,
      })
      if (!adopted) throw new Error('Curated donor adoption failed')
      const queries = [
        ...shared.queries,
        prepareRevisionCheck(domain.db, adopted.guard),
        ...adopted.statements,
      ]
      const statements = queries
        .map(q => q.toSQL())
        .map(({ sql, params }) => ({
          sql,
          params: params as (string | number | null)[],
        }))
      await domain.db.batch(queries as any)
      groups.push({ label: 'donor-curation/' + sourceId, statements })
    }
    return groups
  } finally {
    domain.close()
  }
}

if (import.meta.main) {
  process.umask(0o077)
  const [path, actorId, output] = process.argv.slice(2)
  if (!path?.startsWith('.local/') || !output?.startsWith('.local/') || !actorId)
    throw new Error('Explicit private snapshot, contributor and output required')
  const groups = await prepareDonorCurations(path, actorId)
  writeFileSync(output, JSON.stringify(groups) + '\n', { mode: 0o600, flag: 'wx' })
  console.log('Prepared donor curation groups:', groups.length)
}
