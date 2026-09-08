import { organisation, project } from '$lib/db/schema'
import type { AssetAnalyticsScope, Database, UserRoleDisco } from '$lib/types'
import { autochunk, chunkedInArray } from '$lib/utils/batch-query'
import { getScopedHubAdminIds, isCoreHubAdmin } from './hub'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ROLE RESOLUTION
//    - resolveAnalyticsScope

/**
 * Resolves the analytics scope a caller may query.
 *
 * @param params - Database, actor roles, and requested analytics filters.
 * @returns An authorization decision plus server-derived resource filters.
 * @remarks
 * Global actors may retain explicit analytics filters. Scoped actors receive only
 * organisation and project ids derived from their role assignments; caller-supplied
 * prefixes are never treated as authorization evidence.
 */
export const resolveAnalyticsScope = async (params: {
  db: Database
  user: {
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  requestedScope: AssetAnalyticsScope
}): Promise<{
  allowed: boolean
  code?: 'INSUFFICIENT_ROLE'
  scope?: AssetAnalyticsScope
}> => {
  const requestedOrganisationIds = Array.from(
    new Set(params.requestedScope.organisationIds.filter(Boolean)),
  )
  const requestedProjectIds = Array.from(
    new Set(params.requestedScope.projectIds.filter(Boolean)),
  )

  if (params.user.superAdmin || isCoreHubAdmin(params.userRoles)) {
    return {
      allowed: true,
      scope: {
        scopePrefixes: [...params.requestedScope.scopePrefixes],
        organisationIds: requestedOrganisationIds,
        projectIds: requestedProjectIds,
      },
    }
  }

  const ownedOrganisationIds = params.userRoles
    .filter(
      (role): role is Extract<UserRoleDisco, { type: 'organisation' }> =>
        role.type === 'organisation' && role.role === 'owner',
    )
    .map(role => role.organisationId)
  const ownedProjectIds = params.userRoles
    .filter(
      (role): role is Extract<UserRoleDisco, { type: 'project' }> =>
        role.type === 'project' && role.role === 'owner',
    )
    .map(role => role.projectId)
  const scopedHubIds = Array.from(getScopedHubAdminIds(params.userRoles))

  // Resolve hub-admin descendants and organisation-owned project descendants server-side.
  const hubOrganisationRows = await autochunk(
    { items: scopedHubIds },
    async hubIdBatch =>
      await params.db
        .select({ id: organisation.id })
        .from(organisation)
        .where(chunkedInArray(organisation.hubId, hubIdBatch)),
  )
  const allowedOrganisationIds = Array.from(
    new Set([...ownedOrganisationIds, ...hubOrganisationRows.map(row => row.id)]),
  )

  const organisationProjectRows = await autochunk(
    { items: allowedOrganisationIds },
    async organisationIdBatch =>
      await params.db
        .select({ id: project.id })
        .from(project)
        .where(chunkedInArray(project.organisationId, organisationIdBatch)),
  )
  const allowedProjectIds = new Set([
    ...ownedProjectIds,
    ...organisationProjectRows.map(row => row.id),
  ])
  const allowedOrganisationIdSet = new Set(allowedOrganisationIds)

  if (
    requestedOrganisationIds.some(id => !allowedOrganisationIdSet.has(id)) ||
    requestedProjectIds.some(id => !allowedProjectIds.has(id))
  ) {
    return { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  const effectiveOrganisationIds =
    requestedOrganisationIds.length > 0
      ? requestedOrganisationIds
      : requestedProjectIds.length > 0
        ? []
        : allowedOrganisationIds
  const effectiveProjectIds =
    requestedProjectIds.length > 0
      ? requestedProjectIds
      : requestedOrganisationIds.length > 0
        ? []
        : [...allowedProjectIds]

  // Empty filters would make the downstream worker query its global dataset.
  if (effectiveOrganisationIds.length === 0 && effectiveProjectIds.length === 0) {
    return { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  return {
    allowed: true,
    scope: {
      scopePrefixes: [],
      organisationIds: effectiveOrganisationIds,
      projectIds: effectiveProjectIds,
    },
  }
}
