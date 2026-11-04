// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { organisationRole, user } from '../schema'

/**
 * Scope both directory rows and counts to actual audience membership.
 * @param organisationId Server-authorized organisation.
 * @returns A correlated predicate without materialising an unbounded list of user IDs.
 */
export function organisationUsersCondition(organisationId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM ${organisationRole} WHERE ${organisationRole.organisationId}=${organisationId} AND ${organisationRole.userId}=${user.id} AND ${organisationRole.role} IN ('user','member','owner'))`
}
