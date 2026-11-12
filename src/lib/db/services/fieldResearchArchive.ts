// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { researchProjectAccess } from '#lib/fieldResearch/access.js'
// SCHEMA
import { fieldResearchSession } from '#lib/db/schema/fieldResearch.js'
// SERVICES
import { executeRevisionBatch } from './revisionBatch.js'
// TYPES
import type { Database } from '#lib/types.js'

/** Archive or restore a selection atomically without modifying its captures or Features.
 * @param ctx Authenticated actor, authoritative roles and database.
 * @param selection Session identities and revisions observed by the client.
 * @param archived Whether to archive or restore the sessions.
 * @returns Whether every selected session was accessible and still at its observed revision.
 * @remarks One JSON parameter keeps large selections below the D1 variable ceiling.
 */
export async function setResearchSessionsArchived(
  ctx: Parameters<typeof researchProjectAccess>[0] & { db: Database },
  selection: { id: string; revision: number }[],
  archived: boolean,
): Promise<boolean> {
  if (!selection.length || ctx.user.isAnonymous) return false
  const selected = JSON.stringify(selection)
  const now = new Date().toISOString()
  // Validate all permissions and revisions within the write transaction; no partial changes.
  const guard = sql`NOT EXISTS(SELECT 1 FROM json_each(${selected}) picked LEFT JOIN fieldResearchSession s ON s.id=json_extract(picked.value,'$.id') WHERE s.id IS NULL OR s.revision!=json_extract(picked.value,'$.revision') OR NOT (${researchProjectAccess(ctx, sql`s.projectId`)}))`
  return Boolean(
    await executeRevisionBatch(ctx.db, guard, [
      ctx.db
        .update(fieldResearchSession)
        .set({
          isArchived: archived,
          archivedAt: archived ? now : null,
          archivedBy: archived ? ctx.user.id : null,
          updatedAt: now,
          revision: sql`${fieldResearchSession.revision}+1`,
        })
        .where(
          sql`${fieldResearchSession.id} IN (SELECT json_extract(value,'$.id') FROM json_each(${selected}))`,
        ),
    ]),
  )
}
