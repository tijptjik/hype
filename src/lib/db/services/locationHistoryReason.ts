// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { locationActionReasons } from '#lib/revisions/locationActions.js'
// TYPES
import type { Database } from '#lib/types.js'

/** Describe legacy Location changes using newly pinned, immutable correction evidence.
 * @param db Request database.
 * @param input An already authorized Feature revision and its stored reason.
 * @returns A workflow-specific label, or a neutral label when provenance is unavailable.
 * @remarks Never infer historical staff status from today's user roles or rewrite audit records.
 */
export async function locationHistoryReason(
  db: Database,
  input: { revisionId: string; reason: string | null },
): Promise<string | null> {
  if (input.reason !== 'Shared Location correction accepted') return input.reason
  const tables = await db.all<{ name: string }>(sql`SELECT name FROM sqlite_master
    WHERE type='table' AND name IN ('organisationLocation','locationSharedRevision')`)
  const kinds = new Set<string>()
  // Only a new pin owned by this change's actor can explain this revision's action.
  for (const { name } of tables) {
    const shared = name === 'locationSharedRevision'
    const path = shared
      ? '$.placement.location.acceptancePolicy.lastSharedRevision'
      : '$.placement.location.factsOrganisationRevision'
    const table = shared ? sql`locationSharedRevision` : sql`organisationLocation`
    const rows = await db.all<{ kind: string | null }>(sql`
      SELECT json_extract(e.provenance,'$.kind') kind
      FROM featureRevision r
      LEFT JOIN featureRevision p ON p.id=r.previousRevisionId AND p.featureId=r.featureId
      JOIN revisionChangeSet c ON c.id=r.changeSetId
      JOIN ${table} e ON e.id=json_extract(r.content,${path})
        AND e.locationId=json_extract(r.content,'$.placement.location.locationId')
        AND e.actorId=c.actorId
      WHERE r.id=${input.revisionId}
        AND json_extract(r.content,${path}) IS NOT json_extract(p.content,${path})`)
    for (const row of rows) if (row.kind) kinds.add(row.kind)
  }
  const contribution = kinds.has('task-correction')
  const staff = [...kinds].some(kind =>
    ['staff-correction', 'location-editor', 'feature-staff-edit'].includes(kind),
  )
  if (contribution && !staff) return locationActionReasons['contribution-accepted']
  if (staff && !contribution) return locationActionReasons['staff-update']
  return 'Location updated'
}
