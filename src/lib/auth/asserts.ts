// API
import { isAdminRequest } from '$lib/api'
// I18N
import { m } from '$lib/i18n'
// TYPES
import type {
  Code,
  Id,
  SessionUser,
  UserRoleDisco,
} from '$lib/types'
import type { OrganisationPartial } from '$lib/db/zod/schema/organisation.types'
import { error } from '@sveltejs/kit'

/**
 * Access Control Assertions
 * These functions throw appropriate errors if access conditions are not met
 */

/**
 * Runs multiple assertion functions and returns the first error encountered
 * @param assertions - Array of functions that return void | Response
 * @returns void | Response - Returns the first error Response, or void if all pass
 */
export const runAssertions = (
  ...assertions: (() => void | Response)[]
): void | Response => {
  for (const assertion of assertions) {
    const result = assertion()
    if (result) return result
  }
}

/**
 * Assert that the user is logged in
 * @param user - The session user object
 * @throws {Response} 401 error if user is not logged in
 */
export const assertUserLoggedIn = (user: SessionUser): void | Response => {
  if (!user) {
    return error(401, m.last_front_toucan_type())
  }
}

/**
 * Assert that the request is from the admin dashboard
 * @param request - The request object
 * @throws {Response} 401 error if not an admin request
 */
export const assertAdminRequest = (request: Request): void | Response => {
  if (!isAdminRequest(request)) {
    return error(401, m.lucky_dark_larva_express())
  }
}

/**
 * Assert that the user has an owner role for the specified organisation
 * @param userRoles - Array of user roles
 * @param organisationId - The organisation ID to check access for
 * @throws {Response} 403 error if user doesn't have access to the organisation
 */
export const assertOrganisationOwner = (
  userRoles: UserRoleDisco[],
  organisationId: string,
): void | Response => {
  const hasRole = userRoles.some(
    role =>
      role.type === 'organisation' &&
      role.organisationId === organisationId &&
      role.role === 'owner',
  )
  if (!hasRole) {
    return error(403, m.missing_permissions())
  }
}

/**
 * Assert that the user has a maintainer role for the specified project
 * @param userRoles - Array of user roles
 * @param projectId - The project ID to check access for
 * @throws {Response} 403 error if user doesn't have access to the project
 */
export const assertProjectMaintainer = (
  userRoles: UserRoleDisco[],
  projectId: string,
): void | Response => {
  const hasRole = userRoles.some(
    role =>
      role.type === 'project' &&
      role.projectId === projectId &&
      role.role === 'maintainer',
  )
  if (!hasRole) {
    return error(403, m.missing_permissions())
  }
}

/**
 * Assert that the user has a member role for the specified project
 * @param userRoles - Array of user roles
 * @param projectId - The project ID to check access for
 * @throws {Response} 403 error if user doesn't have access to the project
 */
export const assertProjectMember = (
  userRoles: UserRoleDisco[],
  projectId: string,
): void | Response => {
  const hasRole = userRoles.some(
    role =>
      role.type === 'project' && role.projectId === projectId && role.role === 'member',
  )
  if (!hasRole) {
    return error(403, m.missing_permissions())
  }
}
/**
 * Assert that the user is a super admin
 * @param session - The session object
 * @throws {Response} 403 error if user is not a super admin
 */
export const assertSuperAdmin = (user: SessionUser): void | Response => {
  if (!user?.superAdmin) {
    return error(403, m.missing_permissions())
  }
}

export const assertUserIsSelf = (
  user: SessionUser,
  userId: string,
): void | Response => {
  if (user.id !== userId) {
    return error(403, m.missing_permissions())
  }
}

export const assertOrganisationOwnerOrSuperAdmin = (
  user: SessionUser,
  userRoles: UserRoleDisco[],
  organisationId: string,
): void | Response => {
  let isOrgOwner = false
  let isSuperAdmin = false
  try {
    assertOrganisationOwner(userRoles, organisationId)
    isOrgOwner = true
  } catch {}
  try {
    assertSuperAdmin(user)
    isSuperAdmin = true
  } catch {}
  // Only error if BOTH checks failed
  if (!isOrgOwner && !isSuperAdmin) {
    return error(403, m.missing_permissions())
  }
}

export const assertIsCoreInclusiveModifiedBySuperAdmin = (
  user: SessionUser,
  newData?: OrganisationPartial,
): void | Response => {
  let isSuperAdmin = false
  try {
    assertSuperAdmin(user)
    isSuperAdmin = true
  } catch {}
  // Only error if not  SUPERADMIN and newData is not undefined
  if (!isSuperAdmin && newData && 'isCoreInclusive' in newData) {
    return error(403, m.missing_permissions())
  }
}

export const assertProjectMaintainerOrSuperAdmin = (
  user: SessionUser,
  userRoles: UserRoleDisco[],
  projectId: string,
): void | Response => {
  let isProjectMaintainer = false
  let isSuperAdmin = false
  try {
    assertProjectMaintainer(userRoles, projectId)
    isProjectMaintainer = true
  } catch {}
  try {
    assertSuperAdmin(user)
    isSuperAdmin = true
  } catch {}
  // Only error if BOTH checks failed
  if (!isProjectMaintainer && !isSuperAdmin) {
    return error(403, m.missing_permissions())
  }
}

export const assertProjectMaintainerOrMemberOrSuperAdmin = (
  user: SessionUser,
  userRoles: UserRoleDisco[],
  projectId: string,
): void | Response => {
  let isProjectMaintainer = false
  let isSuperAdmin = false
  let isProjectMember = false
  try {
    assertProjectMaintainer(userRoles, projectId)
    isProjectMaintainer = true
  } catch {}
  try {
    assertProjectMember(userRoles, projectId)
    isProjectMember = true
  } catch {}
  try {
    assertSuperAdmin(user)
    isSuperAdmin = true
  } catch {}
  // Only error if ALL checks failed
  if (!isProjectMaintainer && !isProjectMember && !isSuperAdmin) {
    return error(403, m.missing_permissions())
  }
}

/**
 * Assert that the form data has a required ID field
 * @param formData - The form data object
 * @param key - The key name for error message (defaults to 'Id')
 * @throws {Response} 401 error if ID is missing
 */
export const assertId = (formData: any, key: string = 'Id'): void | Response => {
  if (!formData.id) {
    return error(401, m.field_is_required({ field: key }))
  }
}

/**
 * Assert that the parameter identifier matches the form data identifier
 * @param formData - The form data object containing the identifier
 * @param refId - The identifier from the URL parameter
 * @param refType - The type of identifier ('id' or 'code')
 * @throws {Response} 400 error if identifiers don't match
 */
export const assertParamIdentifierEqualsFormIdentifier = (
  formData: any,
  refId: Id | Code,
  refType: 'id' | 'code',
): void | Response => {
  const formIdentifier = formData[refType]
  if (formIdentifier && formIdentifier !== refId) {
    return error(
      400,
      `${refType.charAt(0).toUpperCase() + refType.slice(1)} mismatch: URL parameter ${refType} (${refId}) does not match form data ${refType} (${formIdentifier})`,
    )
  }
}
