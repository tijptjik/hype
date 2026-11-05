// DRIZZLE
import { and, eq, exists, isNull, sql } from 'drizzle-orm'
// DB
import { hasAdminResourceRevisionStorage } from './adminResourceRevision'
import { organisation } from '../schema/organisation'
// SERVICES
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
import {
  hasOrganisationRevisionStorage,
  organisationRevisionTarget,
  prepareOrganisationRevisionCapture,
} from './organisationRevision'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { OrganisationRevisionActor } from './organisationRevision'

/**
 * Removes the current organisation logo while retaining media referenced by history.
 * @param db Request database.
 * @param input Authorized organisation, image, actor and persisted image/scope guard.
 * @returns Whether detachment and its revision committed; false for a stale or skipped write.
 * @remarks The caller must not delete image bytes after this operation. Existing image
 * metadata and other resource associations remain intact. Before migration, the same
 * guarded detachment works without adding history.
 */
export async function removeOrganisationImage(
  db: Database,
  input: {
    organisationId: string
    imageId: string
    actor: OrganisationRevisionActor
    guard: SQL
  },
): Promise<boolean> {
  const target = and(
    eq(organisation.id, input.organisationId),
    eq(organisation.imageId, input.imageId),
  )
  const capture = await prepareOrganisationRevisionCapture(
    db,
    organisationRevisionTarget(input.organisationId),
    input.actor,
  )
  // Fence the authorized association before recording history or changing the projection.
  const result = await executeRevisionBatch(
    db,
    sql`${input.guard} AND ${exists(
      db.select({ id: organisation.id }).from(organisation).where(target),
    )}`,
    [
      ...capture.before,
      db.update(organisation).set({ imageId: null }).where(target),
      ...capture.after,
      prepareRevisionCheck(
        db,
        exists(
          db
            .select({ id: organisation.id })
            .from(organisation)
            .where(
              and(
                eq(organisation.id, input.organisationId),
                isNull(organisation.imageId),
              ),
            ),
        ),
      ),
    ],
  )
  return result !== null
}

/**
 * Builds an atomic deletion guard for images retained by resource snapshots or immutable image revisions.
 * @param db Request database.
 * @param imageId Image whose current and past use must be preserved.
 * @returns SQL predicate allowing deletion only when no immutable snapshot refers to it.
 * @remarks Rollout-compatible when revision storage is absent. Evaluate this predicate
 * in the DELETE transaction, not as an earlier boolean preflight.
 */
export async function organisationImageDeletionGuard(
  db: Database,
  imageId: string,
): Promise<SQL> {
  const guards: SQL[] = []
  const imageStorage = await db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='imageRevision'`,
  )
  if (imageStorage?.n)
    guards.push(sql`NOT EXISTS (SELECT 1 FROM imageRevision WHERE imageId=${imageId})`)
  if (await hasOrganisationRevisionStorage(db))
    guards.push(
      sql`NOT EXISTS (SELECT 1 FROM organisationRevision WHERE json_extract(content,'$.record.imageId')=${imageId})`,
    )
  for (const resource of ['project', 'hub'] as const) {
    if (await hasAdminResourceRevisionStorage(db, resource))
      guards.push(
        sql`NOT EXISTS (SELECT 1 FROM ${sql.identifier(`${resource}Revision`)} WHERE json_extract(content,'$.record.imageId')=${imageId})`,
      )
  }
  return guards.length ? sql.join(guards, sql` AND `) : sql`1`
}
