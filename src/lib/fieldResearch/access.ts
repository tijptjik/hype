// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// AUTHORIZATION
import {
  isCoreHubAdmin,
  getScopedHubAdminIds,
} from '#lib/api/services/authz/hubPolicy.js'
// TYPES
import type { Database, UserRoleDisco } from '#lib/types.js'

type ResearchActor = {
  user: { id: string; isAnonymous?: boolean; superAdmin?: boolean }
  userRoles: UserRoleDisco[]
}

/** Restrict a project expression to management scope using bounded JSON parameters.
 * @param actor Authoritative request identity and roles. @param projectId SQL project identity.
 * @returns Predicate shared by lists, searches, asset reads and mutations.
 * @remarks Translators and ordinary members do not have project management access.
 */
export function researchProjectAccess(actor: ResearchActor, projectId: SQL): SQL {
  if (actor.user.isAnonymous) return sql`0`
  if (actor.user.superAdmin || isCoreHubAdmin(actor.userRoles)) return sql`1`
  const projects = actor.userRoles.flatMap(role =>
    role.type === 'project' && ['maintainer', 'owner'].includes(role.role)
      ? [role.projectId]
      : [],
  )
  const organisations = actor.userRoles.flatMap(role =>
    role.type === 'organisation' && role.role === 'owner' ? [role.organisationId] : [],
  )
  const hubs = [...getScopedHubAdminIds(actor.userRoles)]
  return sql`EXISTS(SELECT 1 FROM project researchProject JOIN organisation researchOrganisation ON researchOrganisation.id=researchProject.organisationId WHERE researchProject.id=${projectId} AND (researchProject.id IN (SELECT value FROM json_each(${JSON.stringify(projects)})) OR researchProject.organisationId IN (SELECT value FROM json_each(${JSON.stringify(organisations)})) OR researchOrganisation.hubId IN (SELECT value FROM json_each(${JSON.stringify(hubs)}))))`
}

/** Enforce the same project scope for a direct session lookup as for its index row.
 * @param ctx Request database, identity and roles. @param sessionId Private session identity.
 * @returns Nothing when the actor can manage its owning project.
 */
export async function requireResearchSessionAccess(
  ctx: ResearchActor & { db: Database },
  sessionId: string,
): Promise<void> {
  if (ctx.user.isAnonymous) error(403, 'INSUFFICIENT_ROLE')
  const row = await ctx.db.get(
    sql`SELECT id FROM fieldResearchSession WHERE id=${sessionId} AND ${researchProjectAccess(ctx, sql`fieldResearchSession.projectId`)}`,
  )
  if (!row) error(403, 'INSUFFICIENT_ROLE')
}
