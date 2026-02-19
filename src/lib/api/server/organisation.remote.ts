// REMOTE
import { guardedCommand, guardedForm, guardedQuery } from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
// I18N
import { toLocaleRecordFromOrganisationFormI18n } from '$lib/i18n'
// DRIZZLE
import { and, eq, ne } from 'drizzle-orm'
// UTILS
import { nanoid } from 'nanoid'
// AUTHORIZATION
import {
  isReservedCode,
  toAuthMessage,
  toIssueDetailMessage,
  toOrganisationSubmittedFields,
  toOrganisationUserRoleSignature,
  authorizeOrganisationRead,
  authorizeOrganisationList,
  authorizeOrganisationCreate,
  authorizeOrganisationUpdate,
  authorizeOrganisationManageRoles,
  authorizeOrganisationPublish,
  authorizeOrganisationDelete,
} from '$lib/api/services/authz'
// SERVICES
import {
  toQueryConditions,
  organisationWithRelations,
} from '$lib/api/services/organisation'
import {
  createI18n,
  createOrganisation,
  createUserRoles,
  listOrganisations,
  getOrganisation as loadOrganisation,
  updateI18n,
  updateOrganisationById,
  updateUserRoles,
  toPersistedOrganisationUserRoles,
  toEntityResponseShape,
  toListResponseShape,
} from '$lib/db/services/organisation'
// UTILS
import { getValidQueryParams as validateQueryParams } from '$lib/api'
// SCHEMA
import { organisation, organisationRole } from '$lib/db/schema'
// SCHEMA
import {
  ListQueryParamsSchema,
  GetQueryParamsSchema,
  OrganisationFormData,
  PublishOrganisationSchema,
  RemoveOrganisationSchema,
} from '$lib/db/zod'
import type { OrganisationDB, Id } from '$lib/types'

/* ----------------- */
// QUERY HELPERS
/* -------- */

const toLookupConditions = (params: {
  ref: string
  refKey?: 'id' | 'code'
}): Partial<OrganisationDB> =>
  params.refKey === 'code'
    ? ({ code: params.ref } as Partial<OrganisationDB>)
    : ({ id: params.ref as Id } as Partial<OrganisationDB>)

const toBooleanOrUndefined = (value: unknown): boolean | undefined => {
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

const toRequestedListState = (conditions: Partial<OrganisationDB>) => ({
  isPublished: toBooleanOrUndefined(conditions.isPublished) ?? true,
  isArchived: toBooleanOrUndefined(conditions.isArchived) ?? false,
})

/* ----------------- */
// REMOTE QUERIES
/* -------- */

/**
 * Returns a role-aware organisation collection for guarded remote callers.
 *
 * @param params - List query params validated by `ListQueryParamsSchema`.
 * @param params.conditions - Optional typed filters for organisation columns.
 * @param params.pagination - Optional pagination controls (`limit`, `offset`).
 * @param params.sortBy - Optional column to sort by.
 * @param params.sortOrder - Optional sort direction (`asc` or `desc`).
 * @param params.q - Optional text query applied by the service layer.
 * @param params.meta - Optional request metadata.
 * @param params.meta.isAdminRequest - Explicit admin-origin hint used by guarded context resolution.
 * @returns A promise resolving to `{ data, limit, offset, totalCount }`.
 * @remarks
 * Uses `authorizeOrganisationList` for visibility-state authorization before querying.
 * Query conditions are then built via `toQueryConditions`, using guarded
 * `isAdminRequest` context so admin callers can request non-default visibility states.
 */
export const getOrganisations = guardedQuery(
  ListQueryParamsSchema,
  async (params, ctx) => {
    const { db, user, userRoles, isAdminRequest, event } = ctx

    // Validate incoming filter keys against table columns and set default visibility filters.
    const queryParams = validateQueryParams<OrganisationDB>(
      organisation,
      params.conditions as Partial<OrganisationDB> | undefined,
    )
    const requestedListState = toRequestedListState(
      queryParams as Partial<OrganisationDB>,
    )

    // Apply role-based authorization.
    const listDecision = authorizeOrganisationList(
      {
        userId: user.id,
        userRoles,
        isAuthenticated: true,
        isAnonymous: user.isAnonymous,
      },
      {
        resourceHubId: event.locals.hub?.isCore ? null : (event.locals.hub?.id ?? null),
      },
      requestedListState,
    )
    if (!listDecision.allowed) {
      throw error(403, toAuthMessage(listDecision.code ?? 'INSUFFICIENT_ROLE'))
    }

    // Build final SQL conditions based on request scope and role permissions.
    const { conditions, filtersToApply } = toQueryConditions(
      user,
      isAdminRequest,
      queryParams,
      userRoles,
    )

    // Execute list query with optional text search and pagination.
    const result = await listOrganisations(
      db,
      organisationWithRelations,
      conditions,
      event.locals.hub,
      params.pagination,
      params.sorting,
      {
        q: params.q,
        filtersToApply,
      },
    )

    return toListResponseShape(result, user)
  },
)

/**
 * Returns a role-aware organisation record for guarded remote callers.
 *
 * @param params - Lookup params validated by `GetQueryParamsSchema`.
 * @param params.ref - Organisation identifier value.
 * @param params.refKey - Optional lookup column (`id` or `code`), defaults to `id`.
 * @param params.meta - Optional request metadata.
 * @param params.meta.isAdminRequest - Explicit admin-origin hint used by guarded context resolution.
 * @returns A promise resolving to `{ data }`, where `data` is the matched organisation.
 * @remarks
 * Performs a minimal probe query first (`id`, `hubId`, `isPublished`, `isArchived`)
 * so authorization can evaluate the real persisted state before loading the full record.
 */
export const getOrganisation = guardedQuery(
  GetQueryParamsSchema,
  async (params, ctx) => {
    try {
      const { db, user, userRoles, isAdminRequest, event } = ctx

      // Probe the requested organisation for flags.
      const probeQuery = db
        .select({
          id: organisation.id,
          hubId: organisation.hubId,
          isPublished: organisation.isPublished,
          isArchived: organisation.isArchived,
        })
        .from(organisation)
        .where(
          params.refKey === 'code'
            ? eq(organisation.code, params.ref)
            : eq(organisation.id, params.ref as Id),
        )
        .limit(1)

      const [probe] = await probeQuery
      if (!probe) {
        return toEntityResponseShape(null, user)
      }

      // Apply role-based authorization.
      const readDecision = authorizeOrganisationRead(
        {
          userId: user.id,
          userRoles,
          isAuthenticated: true,
          isAnonymous: user.isAnonymous,
        },
        {
          resourceId: probe.id,
          resourceHubId: probe.hubId,
        },
        {
          isPublished: probe.isPublished,
          isArchived: probe.isArchived,
        },
      )

      if (!readDecision.allowed) {
        throw error(403, toAuthMessage(readDecision.code ?? 'INSUFFICIENT_ROLE'))
      }

      // Validate incoming filter keys against table columns and set default visibility filters.
      const queryParams = validateQueryParams<OrganisationDB>(
        organisation,
        toLookupConditions(params),
        {
          isPublished: probe.isPublished,
          isArchived: probe.isArchived,
        } as Partial<OrganisationDB>,
      )

      // Build final SQL conditions based on request scope and role permissions.
      const { conditions } = toQueryConditions(
        user,
        isAdminRequest,
        queryParams,
        userRoles,
      )

      // Execute a single-record query.
      const result = await loadOrganisation(
        db,
        organisationWithRelations,
        conditions,
        event.locals.hub,
      )

      return toEntityResponseShape(result ?? null, user)
    } catch (error) {
      console.error('[remote:getOrganisation] Failed', {
        params,
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  },
)

/* ----------------- */
// REMOTE FORM
/* -------- */

/**
 * Creates or updates an organisation and related i18n/role rows from form payloads.
 *
 * @param params - Form payload validated by `OrganisationFormData`.
 * @param params.meta - Optional form metadata (`id`, `mode`, `updatedAt`, `isAdminRequest`).
 * @param params.data - Organisation form data (`code`, `url`, `i18n`, `userRoles`).
 * @returns A promise resolving to `{ data: { id, modifiedAt } }`.
 * @remarks
 * `mode: 'create'` with no `meta.id` triggers create behavior; all other submissions
 * are treated as updates and require `meta.id`.
 * Update flow enforces optimistic concurrency via `meta.updatedAt === current.modifiedAt`.
 * Authorization is checked before uniqueness lookups to avoid leaking existence details.
 */
export const organisationForm = guardedForm('unchecked', async (input, ctx) => {
  const params = OrganisationFormData.parse(input)
  const { db, user, userRoles, event, invalid, issue } = ctx
  const { meta, data } = params
  let organisationId = meta?.id?.trim()
  const mode = meta?.mode
  const normalizedCode = data.code.trim()
  const activeHubId = event.locals.hub?.isCore ? null : (event.locals.hub?.id ?? null)
  const isExplicitCreateMode = mode === 'create'
  const hasUpdateToken = Boolean(meta?.updatedAt)
  const submittedRoles = Array.isArray(data.userRoles) ? data.userRoles : []
  const duplicateSubmittedRoleUserIds = submittedRoles
    .map(userRole => userRole.userId)
    .filter((userId, index, array) => array.indexOf(userId) !== index)

  // Defensive validation: enforce role invariants server-side even if payload parsing
  // quirks bypass client/schema checks.
  if (submittedRoles.length === 0) {
    invalid(issue(toIssueDetailMessage('USER_ROLES_REQUIRED')))
  }
  if (!submittedRoles.some(userRole => userRole.role === 'owner')) {
    invalid(issue(toIssueDetailMessage('OWNER_REQUIRED')))
  }
  if (duplicateSubmittedRoleUserIds.length > 0) {
    invalid(
      issue.data.userRoles(
        `INVALID: Duplicate user roles submitted (${Array.from(new Set(duplicateSubmittedRoleUserIds)).join(', ')})`,
      ),
    )
  }

  if (mode === 'create' && organisationId) {
    invalid(issue('CREATE_MODE_CANNOT_INCLUDE_ID'))
  }
  if (mode === 'update' && !organisationId) {
    invalid(issue('MISSING_ORGANISATION_ID'))
  }

  // Defensive fallback: if update metadata id is missing, recover by unique code.
  if (!organisationId && !isExplicitCreateMode && meta?.updatedAt) {
    const [existingByCode] = await db
      .select({ id: organisation.id })
      .from(organisation)
      .where(eq(organisation.code, normalizedCode))
      .limit(1)
    organisationId = existingByCode?.id
  }

  const isCreateMode =
    !organisationId && !hasUpdateToken && (!mode || isExplicitCreateMode)

  if (isCreateMode) {
    const createDecision = authorizeOrganisationCreate(
      {
        userId: user.id,
        userRoles,
        isAuthenticated: true,
        isAnonymous: user.isAnonymous,
      },
      { resourceHubId: activeHubId },
      toOrganisationSubmittedFields(data),
    )
    if (!createDecision.allowed) {
      invalid(issue(toIssueDetailMessage(createDecision.code ?? 'INSUFFICIENT_ROLE')))
    }

    if (isReservedCode(normalizedCode)) {
      invalid(issue.data.code(toIssueDetailMessage('CODE_RESERVED')))
    }

    const existing = await db
      .select({ id: organisation.id })
      .from(organisation)
      .where(eq(organisation.code, normalizedCode))
      .limit(1)

    if (existing.length > 0) {
      invalid(issue.data.code(toIssueDetailMessage('CODE_ALREADY_EXISTS')))
    }

    const created = await createOrganisation(db, {
      id: nanoid(12),
      code: normalizedCode,
      url: data.url.trim() === '' ? null : data.url.trim(),
      hubId: activeHubId,
    })

    await createI18n(db, toLocaleRecordFromOrganisationFormI18n(data.i18n), created.id)
    await createUserRoles(
      db,
      toPersistedOrganisationUserRoles(data.userRoles, created.id),
      created.id,
    )

    return {
      data: {
        id: created.id,
        modifiedAt: created.modifiedAt,
      },
    }
  }

  if (!organisationId) invalid(issue('MISSING_ORGANISATION_ID'))

  const [current] = await db
    .select({
      id: organisation.id,
      code: organisation.code,
      hubId: organisation.hubId,
      modifiedAt: organisation.modifiedAt,
    })
    .from(organisation)
    .where(eq(organisation.id, organisationId as Id))
    .limit(1)

  if (!current) invalid(issue('ORGANISATION_NOT_FOUND'))

  const updateDecision = authorizeOrganisationUpdate(
    {
      userId: user.id,
      userRoles,
      isAuthenticated: true,
      isAnonymous: user.isAnonymous,
    },
    {
      resourceId: current.id,
      resourceHubId: current.hubId,
    },
    toOrganisationSubmittedFields(data),
  )
  if (!updateDecision.allowed) {
    invalid(issue(toIssueDetailMessage(updateDecision.code ?? 'INSUFFICIENT_ROLE')))
  }

  const existingRoleRows = await db
    .select({
      userId: organisationRole.userId,
      role: organisationRole.role,
    })
    .from(organisationRole)
    .where(eq(organisationRole.organisationId, current.id))
  const incomingRolesSignature = toOrganisationUserRoleSignature(data.userRoles)
  const existingRolesSignature = toOrganisationUserRoleSignature(existingRoleRows)
  if (incomingRolesSignature !== existingRolesSignature) {
    const roleDecision = authorizeOrganisationManageRoles(
      {
        userId: user.id,
        userRoles,
        isAuthenticated: true,
        isAnonymous: user.isAnonymous,
      },
      {
        resourceId: current.id,
        resourceHubId: current.hubId,
      },
    )
    if (!roleDecision.allowed) {
      invalid(issue(toIssueDetailMessage(roleDecision.code ?? 'INSUFFICIENT_ROLE')))
    }
  }

  if (!meta?.updatedAt) {
    invalid(issue(toIssueDetailMessage('STALE_WRITE')))
  }
  if (meta.updatedAt !== current.modifiedAt) {
    invalid(issue(toIssueDetailMessage('STALE_WRITE')))
  }

  if (isReservedCode(normalizedCode)) {
    invalid(issue.data.code(toIssueDetailMessage('CODE_RESERVED')))
  }

  const conflictingCode = await db
    .select({ id: organisation.id })
    .from(organisation)
    .where(and(eq(organisation.code, normalizedCode), ne(organisation.id, current.id)))
    .limit(1)
  if (conflictingCode.length > 0) {
    invalid(issue.data.code(toIssueDetailMessage('CODE_ALREADY_EXISTS')))
  }

  // Atomic optimistic-concurrency check to prevent parallel submissions from
  // racing into relation replacement and throwing unique-key 500s.
  const [updated] = await db
    .update(organisation)
    .set({
      code: normalizedCode,
      url: data.url.trim() === '' ? null : data.url.trim(),
    })
    .where(
      and(eq(organisation.id, current.id), eq(organisation.modifiedAt, meta.updatedAt)),
    )
    .returning({
      id: organisation.id,
      modifiedAt: organisation.modifiedAt,
    })

  if (!updated) {
    invalid(issue(toIssueDetailMessage('STALE_WRITE')))
  }

  const nextI18n = toLocaleRecordFromOrganisationFormI18n(data.i18n)
  const nextRoles = toPersistedOrganisationUserRoles(data.userRoles, current.id)

  await updateI18n(db, nextI18n, current.id)
  await updateUserRoles(db, nextRoles, current.id)

  return {
    data: {
      id: updated.id,
      modifiedAt: updated.modifiedAt,
    },
  }
})

/* ----------------- */
// REMOTE COMMANDS
/* -------- */

/**
 * Toggles organisation publish state after role-based authorization.
 *
 * @param params - Command payload validated by `PublishOrganisationSchema`.
 * @param params.id - Target organisation id.
 * @param params.state - Next publish state.
 * @param params.meta - Optional request metadata (`isAdminRequest`).
 * @returns A promise resolving to `{ data: { id, isPublished } }`.
 */
export const publishOrganisation = guardedCommand(
  PublishOrganisationSchema,
  async (params, ctx) => {
    const { db, user, userRoles } = ctx

    const [current] = await db
      .select({
        id: organisation.id,
        hubId: organisation.hubId,
      })
      .from(organisation)
      .where(eq(organisation.id, params.id as Id))
      .limit(1)

    if (!current) {
      throw error(404, 'ORGANISATION_NOT_FOUND')
    }

    const publishDecision = authorizeOrganisationPublish(
      {
        userId: user.id,
        userRoles,
        isAuthenticated: true,
        isAnonymous: user.isAnonymous,
      },
      {
        resourceId: current.id,
        resourceHubId: current.hubId,
      },
    )
    if (!publishDecision.allowed) {
      throw error(403, toAuthMessage(publishDecision.code ?? 'INSUFFICIENT_ROLE'))
    }

    const updated = await updateOrganisationById(
      db,
      {
        isPublished: params.state,
        publishedAt: params.state ? new Date().toISOString() : null,
        publisherId: params.state ? user.id : null,
      },
      params.id as Id,
    )

    return {
      data: {
        id: updated.id,
        isPublished: updated.isPublished,
      },
    }
  },
)

/**
 * Toggles organisation archive state after role-based authorization.
 *
 * @param params - Command payload validated by `RemoveOrganisationSchema`.
 * @param params.id - Target organisation id.
 * @param params.state - Next archive state.
 * @param params.meta - Optional request metadata (`isAdminRequest`).
 * @returns A promise resolving to `{ data: { id, isArchived } }`.
 */
export const archiveOrganisation = guardedCommand(
  RemoveOrganisationSchema,
  async (params, ctx) => {
    const { db, user, userRoles } = ctx

    const [current] = await db
      .select({
        id: organisation.id,
        hubId: organisation.hubId,
      })
      .from(organisation)
      .where(eq(organisation.id, params.id as Id))
      .limit(1)

    if (!current) {
      throw error(404, 'ORGANISATION_NOT_FOUND')
    }

    const deleteDecision = authorizeOrganisationDelete(
      {
        userId: user.id,
        userRoles,
        isAuthenticated: true,
        isAnonymous: user.isAnonymous,
      },
      {
        resourceHubId: current.hubId,
      },
    )
    if (!deleteDecision.allowed) {
      throw error(403, toAuthMessage(deleteDecision.code ?? 'INSUFFICIENT_ROLE'))
    }

    const updated = await updateOrganisationById(
      db,
      { isArchived: params.state },
      params.id as Id,
    )

    return {
      data: {
        id: updated.id,
        isArchived: updated.isArchived,
      },
    }
  },
)
