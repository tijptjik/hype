// DRIZZLE
import { eq, inArray, type SQL } from 'drizzle-orm'
// LIB
import { applyQueryFilters, removeExcludedColumns } from '$lib/api'
import { toBooleanOrUndefined } from '$lib/api/services'
// AUTH
import {
  assertUserLoggedIn,
  assertAdminRequest,
  assertSuperAdmin,
  runAssertions,
  assertOrganisationOwnerOrSuperAdmin,
  assertIsCoreInclusiveModifiedBySuperAdmin,
} from '$lib/auth/asserts'
// DB
import { isFieldUnique } from '$lib/db'
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user'
import { isSuperAdmin } from '$lib/client/services/auth'
// SCHEMA
import { organisation } from '$lib/db/schema/index'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type {
  Database,
  Id,
  OrganisationProfile,
  Organisation,
  OrganisationDB,
  OrganisationNew,
  QueryParams,
  SessionUser,
  UserRoleDisco,
} from '$lib/types'
import type { SuperValidated } from 'sveltekit-superforms'

/********************
 *  COMMON
 ************/
export const organisationWithRelations = {
  i18n: true,
  userRoles: {
    with: {
      user: {
        columns: userColumnsWithPrivacyProtected,
      },
    },
  },
  image: true,
  publisher: {
    columns: userColumnsWithPrivacyProtected,
  },
}

export const getOrganisationWithRelations = (
  profile: OrganisationProfile,
  isSuperAdmin: boolean,
) => {
  if (profile === 'admin') {
    return {
      i18n: true,
      userRoles: {
        with: {
          user: {
            columns: userColumnsWithPrivacyProtected,
          },
        },
      },
      image: true,
      publisher: {
        columns: userColumnsWithPrivacyProtected,
      },
      properties: {
        with: {
          i18n: true,
          values: {
            with: {
              i18n: true,
            },
          },
        },
      },
      ...(isSuperAdmin ? { hub: true } : {}),
    }
  }

  if (profile === 'card' || profile === 'detail') {
    return {
      i18n: true,
      image: true,
    }
  }

  return {
    i18n: true,
  }
}

const organisationProfiles = ['list', 'card', 'detail', 'admin'] as const

export const toOrganisationProfile = (
  value: unknown,
  fallback: OrganisationProfile,
): OrganisationProfile =>
  typeof value === 'string' &&
  (organisationProfiles as readonly string[]).includes(value)
    ? (value as OrganisationProfile)
    : fallback

export const toLookupConditions = (params: {
  ref: string
  refKey?: 'id' | 'code'
}): Partial<OrganisationDB> =>
  params.refKey === 'code'
    ? ({ code: params.ref } as Partial<OrganisationDB>)
    : ({ id: params.ref as Id } as Partial<OrganisationDB>)

export const toRequestedListState = (conditions: Partial<OrganisationDB>) => ({
  isPublished: toBooleanOrUndefined(conditions.isPublished) ?? true,
  isArchived: toBooleanOrUndefined(conditions.isArchived) ?? false,
})

const VISIBILITY_COLUMNS = ['isArchived', 'isPublished'] as const

const toTriStateBoolean = (value: unknown): boolean | null | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 1) return true
  if (value === 0) return false
  return undefined
}

const applyTriStateBooleanCondition = (
  conditions: SQL<unknown>[],
  column: any,
  value: boolean | null | undefined,
) => {
  if (value === true) conditions.push(eq(column, true))
  if (value === false) conditions.push(eq(column, false))
}

/**
 * Builds visibility and ownership constraints for organisation list queries.
 *
 * @param user - Current session user.
 * @param isAdminRequest - Whether request originated from admin context.
 * @param params - Raw query params from list conditions.
 * @param userRoles - Resolved user roles from session.
 * @returns SQL conditions plus params with visibility keys removed.
 * @remarks
 * Tri-state visibility semantics:
 * - `true`: include only records where column is `true`.
 * - `false`: include only records where column is `false`.
 * - `null` or `undefined`: ignore that visibility column.
 *
 * Legacy dot-key and raw filter handling is delegated to `applyQueryFilters`;
 * visibility keys are applied centrally here.
 */
export const buildVisibilityAndOwnershipConditions = (
  user: SessionUser,
  isAdminRequest: boolean,
  params: QueryParams,
  userRoles: UserRoleDisco[],
): {
  filtersToApply: QueryParams
  conditions: SQL<unknown>[]
  excludeColumns: string[]
} => {
  const conditions: SQL<unknown>[] = []
  const excludeColumns = [...VISIBILITY_COLUMNS]
  const filteredParams = removeExcludedColumns(params, excludeColumns)

  // Full bypass for super admins and hub admins.
  if (isSuperAdmin(user) || user.isHubAdminForActiveHub) {
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }

  // Public requests are always strictly published and not archived.
  if (!isAdminRequest) {
    conditions.push(eq(organisation.isPublished, true))
    conditions.push(eq(organisation.isArchived, false))
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }

  // Admin, non-super/non-hub-admin:
  // Users can query organisations where they have any organisation role.
  const allowedOrganisationIds = userRoles
    .filter(role => role.type === 'organisation')
    .map(role => role.organisationId) as Id[]

  if (allowedOrganisationIds.length === 0) {
    conditions.push(eq(organisation.id, '__none__' as Id))
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }
  conditions.push(inArray(organisation.id, allowedOrganisationIds))

  // Apply tri-state visibility semantics for admin owner queries.
  const isPublished = toTriStateBoolean(params.isPublished)
  const isArchived = toTriStateBoolean(params.isArchived)

  applyTriStateBooleanCondition(conditions, organisation.isPublished, isPublished)
  applyTriStateBooleanCondition(conditions, organisation.isArchived, isArchived)

  return { filtersToApply: filteredParams, conditions, excludeColumns }
}

/**
 * Get the query context for the organisation resource - filters the query based on the user's roles, and the query parameters.
 * @param user - The user object
 * @param isAdminRequest - Whether the request is from admin context
 * @param params - The query parameters
 * @param userRoles - The user roles
 */
export const toQueryConditions = (
  user: SessionUser,
  isAdminRequest: boolean,
  params: QueryParams,
  userRoles: UserRoleDisco[],
): {
  filtersToApply: QueryParams
  conditions: SQL<unknown>[]
  excludeColumns: string[]
} => {
  const contextRespectingVisibilityAndOwnership = buildVisibilityAndOwnershipConditions(
    user,
    isAdminRequest,
    params,
    userRoles,
  )

  // CONTEXT : Apply query filters to the conditions
  if (Object.keys(contextRespectingVisibilityAndOwnership.filtersToApply).length > 0) {
    applyQueryFilters(
      organisation,
      contextRespectingVisibilityAndOwnership.filtersToApply,
      contextRespectingVisibilityAndOwnership.conditions,
    )
  }

  return contextRespectingVisibilityAndOwnership
}

/**
 * Run assertions to check if the user has permissions to create an organisation
 * @param session - The session object
 * @param request - The request object
 * @param formData - The form data
 * @param userRoles - The user roles
 * @returns Object containing validation and access control context
 */
export const assertPermissionsToCreateOrganisation = (
  user: SessionUser,
  request: Request,
) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(user),
    () => assertAdminRequest(request),
    () => assertSuperAdmin(user),
  )

  if (assertionError) return assertionError
}

/**
 * Get the context for updating an organisation
 * @param session - The session object
 * @param request - The request object
 * @param formData - The form data
 * @param userRoles - The user roles
 * @returns Object containing validation and access control context
 * @remarks We don't need to assert code in params equals code in form,
 * as we want to allow the users to change the code of the organisation.
 */
export const assertPermissionsToUpdateOrganisation = (
  user: SessionUser,
  request: Request,
  formData: Record<string, unknown> & { id?: string },
  userRoles: UserRoleDisco[],
) => {
  // Run all access control assertions
  const assertionError = runAssertions(
    () => assertUserLoggedIn(user as any),
    () => assertAdminRequest(request),
    () => assertOrganisationOwnerOrSuperAdmin(user, userRoles, formData.id!),
    () => assertIsCoreInclusiveModifiedBySuperAdmin(user, formData as any),
  )

  if (assertionError) return assertionError
}

export const assertCodeUnique = async (
  db: Database,
  form: SuperValidated<OrganisationNew> | SuperValidated<Organisation>,
  formData: OrganisationNew | Organisation,
) => {
  // ASSERT : Code is unique
  const codeUnique = await isFieldUnique<Organisation>(
    db,
    formData as Organisation,
    FirstClassResource.organisation,
    'code',
  )

  if (!codeUnique) {
    form.valid = false
    form.errors.code = ['Code already exists']
  }
  return form
}

/**
 * Check if the current user will lose access upon success, superAdmins are exempt.
 * @param formData - The form data
 * @param userRoles - The user roles
 * @param user - The user
 * @returns True if the current user will lose access upon success, false otherwise
 */
export const isAccessLostUponSuccess = (
  user: SessionUser,
  formData: { id?: string; userRoles: UserRoleDisco[] },
  userRoles?: UserRoleDisco[],
) => {
  const userRolesToCheck = userRoles || formData.userRoles
  return (
    !(userRolesToCheck as UserRoleDisco[]).some(
      role =>
        role.type === 'organisation' &&
        role.organisationId === (formData as { id?: string }).id &&
        role.userId === user.id,
    ) && !user.superAdmin
  )
}
