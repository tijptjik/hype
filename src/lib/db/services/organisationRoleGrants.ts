// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { organisationRole } from '../schema'
// POLICY
import { isOrganisationStaffRole } from '#lib/roles/organisation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'

/** Replace manual staff assignments while preserving every other independent grant.
 * @param db Request database.
 * @param organisationId Authorized organisation.
 * @param submitted Complete submitted staff list; audience roles are never accepted here.
 * @param guard Parent revision/ancestry predicate, checked by every statement.
 * @returns Bounded statements for the caller's atomic batch.
 * @remarks One JSON binding avoids an unbounded IN list. The migration triggers derive
 * role from grant and remove a role only when its last grant disappears.
 */
export function prepareOrganisationStaffRoles(
  db: Database,
  organisationId: string,
  submitted: Array<{ userId: string; role?: string }>,
  guard: SQL = sql`1`,
): [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] {
  const roles = submitted.map(row => ({ ...row, role: row.role ?? 'member' }))
  if (
    roles.some(role => !isOrganisationStaffRole(role.role)) ||
    new Set(roles.map(role => role.userId)).size !== roles.length
  )
    throw new Error('Invalid organisation staff assignments')
  const payload = JSON.stringify(roles.map(({ userId, role }) => ({ userId, role })))
  // Remove omitted manual grants only; imported/onboarded users are not staff-form rows.
  const remove = db
    .update(organisationRole)
    .set({ grant: sql`json_remove(${organisationRole.grant},'$.manual')` })
    .where(
      and(
        eq(organisationRole.organisationId, organisationId),
        guard,
        sql`json_extract(${organisationRole.grant},'$.manual') IS NOT NULL`,
        sql`NOT EXISTS(SELECT 1 FROM json_each(${payload}) WHERE json_extract(value,'$.userId')=${organisationRole.userId})`,
      ),
    )
  if (!roles.length) return [remove]
  const add = db
    .insert(organisationRole)
    .select(
      sql`SELECT ${organisationId},json_extract(value,'$.userId'),json_extract(value,'$.role'),json_object('manual',json_extract(value,'$.role')) FROM json_each(${payload}) WHERE ${guard}`,
    )
    .onConflictDoUpdate({
      target: [organisationRole.organisationId, organisationRole.userId],
      set: { grant: sql`json_patch(${organisationRole.grant},excluded.grant)` },
    })
  return [remove, add]
}
