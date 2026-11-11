// SVELTE
import { error } from '@sveltejs/kit'
// AUTHORIZATION
import { authorizeOrganisationUpdateForSubmission } from './authz/index'
// DB
import { probeOrganisationQuery } from '#lib/db/services/organisation.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

/**
 * Require Organisation administration before creating or managing its private Locations.
 * @param ctx Authenticated account and current persisted roles.
 * @param organisationId Persisted owner identity, not ancestry supplied by the client.
 * @returns Nothing when allowed; rejects anonymous, missing or unauthorized owners.
 * @remarks Project roles grant no upward permission over Organisation-owned Locations.
 */
export async function requireLocationOrganisationManager(
  ctx: GuardedBaseContext,
  organisationId: string,
): Promise<void> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  const resource = await probeOrganisationQuery(ctx.db, {
    ref: organisationId,
    refKey: 'id',
  })
  if (!resource) error(404, 'ORGANISATION_NOT_FOUND')
  const decision = authorizeOrganisationUpdateForSubmission({
    user: ctx.user,
    userRoles: ctx.userRoles,
    resource,
    submittedData: { code: true },
  })
  if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
}

/** Resolve community curation editing from project/Organisation authority; translation rights do not qualify.
 * @param ctx Fresh server session. @param projectId Persisted project establishing scope.
 * @returns Field-authoring rights for identity, address and communications; adoption remains policy-controlled.
 */
export async function sharedLocationEditRights(
  ctx: GuardedBaseContext,
  projectId: string,
): Promise<{ canEdit: boolean; superAdmin: boolean }> {
  const { probeProjectQuery } = await import('#lib/db/services/project.js')
  const { authorizeProjectUpdateForSubmission } = await import('./authz/index')
  const project = await probeProjectQuery(ctx.db, { ref: projectId, refKey: 'id' })
  const canEdit = Boolean(
    !ctx.user.isAnonymous &&
      project &&
      authorizeProjectUpdateForSubmission({
        user: ctx.user,
        userRoles: ctx.userRoles,
        resource: project,
        submittedData: { locationUpdatePolicy: true },
      }).allowed,
  )
  return { canEdit, superAdmin: Boolean(!ctx.user.isAnonymous && ctx.user.superAdmin) }
}
