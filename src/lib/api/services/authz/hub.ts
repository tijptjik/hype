// DRIZZLE
import { eq, type SQL } from 'drizzle-orm'
// DB
import { hub, organisation } from '#lib/db/schema/index.js'
import { chunkedInArray } from '#lib/utils/batch-query.js'
// POLICIES
import { isOrganisationStaffRole } from '#lib/roles/organisation.js'
import { isCoreHubAdmin, getScopedHubAdminIds } from './hubPolicy'
// TYPES
import type { Database, Id, UserRoleDisco } from '#lib/types.js'
import type { HubRequestedListState } from './hubPolicy'

// TABLE OF CONTENTS
// 1. Scoped list predicates
// 2. Organisation assignment guard

// Server query adapters retain the existing API; browser consumers use hubPolicy.
export * from './hubPolicy'

/** Builds scoped hub query predicates without changing policy decisions.
 * @param roles Current role grants. @param requestedListState Requested visibility.
 * @param allowPublic Whether public rows can be listed. @returns SQL predicates.
 */
export const toHubListConditions = (
  roles: UserRoleDisco[],
  requestedListState: HubRequestedListState,
  allowPublic: boolean = false,
): SQL<unknown>[] => {
  const isCoreAdmin = isCoreHubAdmin(roles)
  const scopedHubIds = Array.from(getScopedHubAdminIds(roles))

  return [
    ...(!isCoreAdmin && scopedHubIds.length > 0
      ? [chunkedInArray(hub.id, scopedHubIds)]
      : []),
    ...(!allowPublic && !isCoreAdmin && scopedHubIds.length === 0
      ? [eq(hub.id, '__none__' as Id)]
      : []),
    ...(requestedListState.isPublished === undefined
      ? []
      : [eq(hub.isPublished, requestedListState.isPublished)]),
    ...(requestedListState.isArchived === undefined
      ? []
      : [eq(hub.isArchived, requestedListState.isArchived)]),
  ]
}

/** Checks whether newly assigned organisations fall outside the actor's staff scope.
 * @param params Database, actor and submitted assignments.
 * @returns Whether any added organisation is forbidden.
 */
export const hasInvalidHubOrganisationAssignmentsForSubmission = async (params: {
  db: Database
  user: { superAdmin?: boolean }
  userRoles: UserRoleDisco[]
  resource: { id: string }
  submittedOrganisations: Array<{ organisationId: string }>
}): Promise<boolean> => {
  if (params.user.superAdmin) return false

  const existingOrganisationRows = await params.db
    .select({ id: organisation.id })
    .from(organisation)
    .where(eq(organisation.hubId, params.resource.id))

  const existingOrganisationIds = new Set(existingOrganisationRows.map(row => row.id))
  const incomingOrganisationIds = params.submittedOrganisations.map(
    item => item.organisationId,
  )
  const addedOrganisationIds = incomingOrganisationIds.filter(
    organisationId => !existingOrganisationIds.has(organisationId),
  )
  if (addedOrganisationIds.length === 0) return false

  const memberOrganisationIds = new Set(
    params.userRoles.flatMap(role =>
      role.type === 'organisation' && isOrganisationStaffRole(role.role)
        ? [role.organisationId]
        : [],
    ),
  )

  return addedOrganisationIds.some(
    organisationId => !memberOrganisationIds.has(organisationId),
  )
}
