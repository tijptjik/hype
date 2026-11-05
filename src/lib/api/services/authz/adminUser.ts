// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// DB
import { user } from '#lib/db/schema/user.js'
// TYPES
import type { Database, SessionUser } from '#lib/types.js'

/**
 * Build the persisted audience boundary for profile administration.
 * @param actor Durable session identity.
 * @returns A correlated predicate evaluated against the target user row.
 * @remarks Only explicit SuperAdmins have global access. Staff must share a persisted
 * organisation audience with the target and that organisation must have the explicit
 * SuperAdmin-granted permission; project roles never grant profile editing.
 */
export function adminUserEditCondition(actor: SessionUser): SQL {
  if (!actor.id || actor.isAnonymous !== false) return sql`0`
  if (actor.superAdmin === true) return sql`1`
  return sql`EXISTS (
    SELECT 1 FROM organisationRole audience
    JOIN organisation o ON o.id = audience.organisationId
    WHERE audience.userId = ${user.id} AND o.isArchived = 0
      AND o.permitUserDetailsEdit = 1
      AND audience.role IN ('user', 'member', 'owner')
      AND (
        EXISTS (SELECT 1 FROM organisationRole staff
          WHERE staff.organisationId = o.id AND staff.userId = ${actor.id}
            AND staff.role = 'owner')
        OR EXISTS (SELECT 1 FROM hubRole staff
          WHERE staff.hubId = o.hubId AND staff.userId = ${actor.id}
            AND staff.role = 'admin')
      )
  )`
}

/**
 * Resolve the same target-specific permission used by profile reads and writes.
 * @param db Request database.
 * @param actor Durable session identity.
 * @param targetUserId Persisted target identity.
 * @returns Whether full profile settings may be read and edited.
 */
export async function canEditAdminUser(
  db: Database,
  actor: SessionUser,
  targetUserId: string,
): Promise<boolean> {
  if (!actor.id || actor.isAnonymous !== false) return false
  if (actor.superAdmin === true) return true
  const target = await db.query.user.findFirst({
    columns: { id: true },
    where: and(eq(user.id, targetUserId), adminUserEditCondition(actor)),
  })
  return Boolean(target)
}
