// DRIZZLE
import { and, eq, exists, isNull, sql } from 'drizzle-orm'
// SCHEMA
import { project } from '../schema/project'
import { hub } from '../schema/hub'
// SERVICES
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
import { prepareAdminResourceRevisionCapture } from './adminResourceRevision'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { OrganisationRevisionActor } from './organisationRevision'

/**
 * Removes the current resource logo while retaining media referenced by history.
 * @param db Request database.
 * @param input Authorized resource, image, actor and persisted image/scope guard.
 * @returns Whether detachment and its revision committed; false for a stale or skipped write.
 * @remarks The caller must not delete image bytes after this operation. Existing image
 * metadata and other resource associations remain intact. Before migration, the same
 * guarded detachment works without adding history.
 */
export async function removeAdminResourceImage(
  db: Database,
  input: {
    resourceId: string
    resource: 'project' | 'hub'
    imageId: string
    actor: OrganisationRevisionActor
    guard: SQL
  },
): Promise<boolean> {
  const table = input.resource === 'project' ? project : hub
  const target = and(eq(table.id, input.resourceId), eq(table.imageId, input.imageId))
  const capture = await prepareAdminResourceRevisionCapture(
    db,
    input.resource,
    sql`SELECT ${input.resourceId} AS id`,
    input.actor,
  )
  // Fence the authorized association before recording history or changing the projection.
  const result = await executeRevisionBatch(
    db,
    sql`${input.guard} AND ${exists(
      db.select({ id: table.id }).from(table).where(target),
    )}`,
    [
      ...capture.before,
      db.update(table).set({ imageId: null }).where(target),
      ...capture.after,
      prepareRevisionCheck(
        db,
        exists(
          db
            .select({ id: table.id })
            .from(table)
            .where(and(eq(table.id, input.resourceId), isNull(table.imageId))),
        ),
      ),
    ],
  )
  return result !== null
}
