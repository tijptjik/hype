// SVELTE
import { error } from '@sveltejs/kit'
// AUTHORIZATION
import { authorizeOrganisationUpdateForSubmission } from './authz/index'
// DB
import { probeOrganisationQuery } from '#lib/db/services/organisation.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

/**
 * Require Organisation administration before creating or managing its private Places.
 * @param ctx Authenticated account and current persisted roles.
 * @param organisationId Persisted owner identity, not ancestry supplied by the client.
 * @returns Nothing when allowed; rejects anonymous, missing or unauthorized owners.
 * @remarks Project roles grant no upward permission over Organisation-owned Places.
 */
export async function requirePlaceOrganisationManager(
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
