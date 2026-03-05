// REMOTE
import { guardedCommand, guardedForm, guardedQuery } from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
// I18N
import { toLocaleRecordFromOrganisationFormI18n } from '$lib/i18n'
// UTILS
import { nanoid } from 'nanoid'
// AUTHORIZATION
import {
  isReservedCode,
  toAuthMessage,
  toIssueDetailMessage,
  authorizeOrganisationListForContext,
  authorizeOrganisationReadForProbe,
  authorizeOrganisationCreateForSubmission,
  authorizeOrganisationUpdateForSubmission,
  authorizeOrganisationManageRolesForSubmission,
  toOrganisationUserRoleSignature,
  authorizeOrganisationPublishForSubmission,
  authorizeOrganisationDeleteForSubmission,
  ensureOrganisationCommandAllowed,
} from '$lib/api/services/authz'
// SERVICES
import {
  toQueryConditions,
  getOrganisationWithRelations,
  toOrganisationProfile,
  toLookupConditions,
  toRequestedListState,
} from '$lib/api/services/organisation'
import {
  getDuplicateValues,
  hasRoleMembershipChanged,
  requireValue,
  toBooleanStateResponseShape,
  toCreatedResponseShape,
  validateUniqueNonReservedCode,
} from '$lib/api/services'
import {
  createI18n,
  createOrganisation,
  createUserRoles,
  listOrganisationRoleAssignments,
  listOrganisations,
  probeExistingOrganisation,
  probeOrganisationForUpdate,
  resolveOrganisationCommandProbe,
  probeOrganisationQuery,
  getOrganisation as loadOrganisation,
  updateI18n,
  updateOrganisationByIdWithConcurrency,
  updateOrganisationPublishedStateById,
  updateOrganisationArchivedStateById,
  syncOrganisationUserRoles,
  toPersistedOrganisationUserRoles,
  toEntityResponseShape,
  toListResponseShape,
} from '$lib/db/services/organisation'
// UTILS
import { getValidQueryParams as validateQueryParams } from '$lib/api'
// SCHEMA
import { organisation } from '$lib/db/schema'
// SCHEMA
import {
  ListQueryParamsSchema,
  GetQueryParamsSchema,
  OrganisationFormData,
  PublishOrganisationSchema,
  RemoveOrganisationSchema,
} from '$lib/db/zod'
import type {
  EntityResponse,
  Id,
  ListResponse,
  OrganisationDB,
  OrganisationEntityByProfile,
  OrganisationGetParamsByProfile,
  OrganisationListByProfile,
  OrganisationListParamsByProfile,
  OrganisationProfile,
  RelationShape,
} from '$lib/types'

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
 * @param params.meta.profile - Optional response profile (`list`, `card`, `detail`, `admin`).
 * @returns A promise resolving to `{ data, limit, offset, totalCount }`.
 * @remarks
 * Uses `authorizeOrganisationList` for visibility-state authorization before querying.
 * Query conditions are then built via `toQueryConditions`, using guarded
 * `isAdminRequest` context so admin callers can request non-default visibility states.
 */
const getOrganisationsQuery = guardedQuery(
  ListQueryParamsSchema,
  async (params, ctx) => {
    const { db, user, userRoles, isAdminRequest, event } = ctx
    // Resolve desired `profile`.
    const profile = toOrganisationProfile(params.meta?.profile, 'list')

    // Resolve desired `query params`.
    const queryParams = validateQueryParams<OrganisationDB>(
      organisation,
      params.conditions as Partial<OrganisationDB> | undefined,
    )
    // Resolve requested visibility state from query params.
    const requestedListState = toRequestedListState(
      queryParams as Partial<OrganisationDB>,
    )

    // Apply role-based authorization.
    const listDecision = authorizeOrganisationListForContext({
      user,
      userRoles,
      hub: event.locals.hub,
      requestedListState,
    })
    if (!listDecision.allowed) {
      throw error(403, toAuthMessage(listDecision.code ?? 'INSUFFICIENT_ROLE'))
    }

    // Resolve query conditions.
    const { conditions, filtersToApply } = toQueryConditions(
      user,
      isAdminRequest,
      queryParams,
      userRoles,
    )

    // Load records from DB.
    const result = await listOrganisations(
      db,
      getOrganisationWithRelations(profile, Boolean(user.superAdmin)) as RelationShape,
      conditions,
      event.locals.hub,
      params.pagination,
      params.sorting,
      {
        q: params.q,
        filtersToApply,
      },
    )

    // Return loaded records with desired profile.
    return toListResponseShape(result, user, profile)
  },
)

export const getOrganisations = getOrganisationsQuery as typeof getOrganisationsQuery &
  (<P extends OrganisationProfile = 'list'>(
    params: OrganisationListParamsByProfile<P>,
  ) => Promise<ListResponse<OrganisationListByProfile<P>>>)

/**
 * Returns a role-aware organisation record for guarded remote callers.
 *
 * @param params - Lookup params validated by `GetQueryParamsSchema`.
 * @param params.ref - Organisation identifier value.
 * @param params.refKey - Optional lookup column (`id` or `code`), defaults to `id`.
 * @param params.meta - Optional request metadata.
 * @param params.meta.isAdminRequest - Explicit admin-origin hint used by guarded context resolution.
 * @param params.meta.profile - Optional response profile (`list`, `card`, `detail`, `admin`).
 * @returns A promise resolving to `{ data }`, where `data` is the matched organisation.
 * @remarks
 * Performs a minimal probe query first (`id`, `hubId`, `isPublished`, `isArchived`)
 * so authorization can evaluate the real persisted state before loading the full record.
 */
const getOrganisationQuery = guardedQuery(GetQueryParamsSchema, async (params, ctx) => {
  try {
    const { db, user, userRoles, isAdminRequest, event } = ctx
    // Resolve desired `profile`.
    const profile = toOrganisationProfile(params.meta?.profile, 'detail')

    // Probe the requested organisation for flags.
    const probe = await probeOrganisationQuery(db, params)
    if (!probe) {
      return toEntityResponseShape(null, user)
    }

    // Apply role-based authorization.
    const readDecision = authorizeOrganisationReadForProbe({
      user,
      userRoles,
      probe,
    })
    if (!readDecision.allowed) {
      throw error(403, toAuthMessage(readDecision.code ?? 'INSUFFICIENT_ROLE'))
    }

    // Resolve desired `query params`.
    const queryParams = validateQueryParams<OrganisationDB>(
      organisation,
      toLookupConditions(params),
      {
        isPublished: probe.isPublished,
        isArchived: probe.isArchived,
      } as Partial<OrganisationDB>,
    )

    // Resolve query conditions.
    const { conditions } = toQueryConditions(
      user,
      isAdminRequest,
      queryParams,
      userRoles,
    )

    // Load record from DB.
    const result = await loadOrganisation(
      db,
      getOrganisationWithRelations(profile, Boolean(user.superAdmin)) as RelationShape,
      conditions,
      event.locals.hub,
    )

    // Return loaded record with desired profile.
    return toEntityResponseShape(result ?? null, user, profile)
  } catch (error) {
    console.error('[remote:getOrganisation] Failed', {
      params,
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
})

export const getOrganisation = getOrganisationQuery as typeof getOrganisationQuery &
  (<P extends OrganisationProfile = 'detail'>(
    params: OrganisationGetParamsByProfile<P>,
  ) => Promise<EntityResponse<OrganisationEntityByProfile<P>>>)

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
export const organisationForm = guardedForm(
  'unchecked',
  async (
    input: unknown,
    ctx,
  ): Promise<{ data: { id: string; modifiedAt: string } }> => {
    // Parse and normalize submitted form input.
    const params = OrganisationFormData.parse(input)
    const { db, user, userRoles, event, invalid } = ctx
    const issue = ctx.issue
    const { meta, data } = params

    const organisationId = meta?.id?.trim()
    const mode = meta?.mode
    const normalizedCode = data.code.trim()
    const activeHubId = event.locals.hub?.isCore ? null : (event.locals.hub?.id ?? null)
    const isExplicitCreateMode = mode === 'create'
    const hasUpdateToken = Boolean(meta?.updatedAt)
    const submittedRoles = Array.isArray(data.userRoles) ? data.userRoles : []
    const duplicateSubmittedRoleUserIds = getDuplicateValues(
      submittedRoles.map(userRole => userRole.userId),
    )

    // Validate payload invariants.
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

    // Create mode must be explicit.
    // This prevents update submissions with missing meta fields from being
    // misrouted into create flow and raising misleading code-conflict errors.
    const isCreateMode = isExplicitCreateMode

    if (isCreateMode) {
      if (organisationId) {
        invalid(issue('CREATE_MODE_CANNOT_INCLUDE_ID'))
      }
      // Apply role-based authorization.
      const createDecision = authorizeOrganisationCreateForSubmission({
        user,
        userRoles,
        resourceHubId: activeHubId,
        submittedData: data,
      })
      if (!createDecision.allowed) {
        invalid(issue(toIssueDetailMessage(createDecision.code ?? 'INSUFFICIENT_ROLE')))
      }

      await validateUniqueNonReservedCode({
        code: normalizedCode,
        isReservedCode,
        probeExisting: code => probeExistingOrganisation(db, code),
        onReserved: () =>
          invalid(issue.data.code(toIssueDetailMessage('CODE_RESERVED'))),
        onConflict: () =>
          invalid(issue.data.code(toIssueDetailMessage('CODE_ALREADY_EXISTS'))),
      })

      // Create main record and related rows.
      const created = await createOrganisation(db, {
        id: nanoid(12),
        code: normalizedCode,
        url: data.url.trim() === '' ? null : data.url.trim(),
        hubId: activeHubId,
        capabilities: data.capabilities ?? {},
      })

      await createI18n(
        db,
        toLocaleRecordFromOrganisationFormI18n(data.i18n),
        created.id,
      )
      await createUserRoles(
        db,
        toPersistedOrganisationUserRoles(data.userRoles, created.id),
        created.id,
      )

      return toCreatedResponseShape(created)
    }

    const targetOrganisationId = requireValue(organisationId, () =>
      invalid(issue('MISSING_ORGANISATION_ID')),
    ) as Id

    // Load current record for update flow.
    const current = requireValue(
      await probeOrganisationForUpdate(db, targetOrganisationId),
      () => invalid(issue('ORGANISATION_NOT_FOUND')),
    )

    // Apply role-based authorization for core update fields.
    const updateDecision = authorizeOrganisationUpdateForSubmission({
      user,
      userRoles,
      resource: {
        id: current.id,
        hubId: current.hubId,
      },
      submittedData: data,
    })
    if (!updateDecision.allowed) {
      invalid(issue(toIssueDetailMessage(updateDecision.code ?? 'INSUFFICIENT_ROLE')))
    }

    // Apply role-management authorization only when role membership changed.
    const existingRoleRows = await listOrganisationRoleAssignments(db, current.id)
    if (
      hasRoleMembershipChanged(
        submittedRoles,
        existingRoleRows,
        toOrganisationUserRoleSignature,
      )
    ) {
      const roleDecision = authorizeOrganisationManageRolesForSubmission({
        user,
        userRoles,
        resource: {
          id: current.id,
          hubId: current.hubId,
        },
      })
      if (!roleDecision.allowed) {
        invalid(issue(toIssueDetailMessage(roleDecision.code ?? 'INSUFFICIENT_ROLE')))
      }
    }

    // Enforce optimistic concurrency guard.
    const updatedAt = meta?.updatedAt
    if (!updatedAt) {
      invalid(issue(toIssueDetailMessage('STALE_WRITE')))
    }
    if (updatedAt !== current.modifiedAt) {
      invalid(issue(toIssueDetailMessage('STALE_WRITE')))
    }

    // Enforce uniqueness of code.
    await validateUniqueNonReservedCode({
      code: normalizedCode,
      current,
      isReservedCode,
      probeExisting: code => probeExistingOrganisation(db, code),
      onReserved: () => invalid(issue.data.code(toIssueDetailMessage('CODE_RESERVED'))),
      onConflict: () =>
        invalid(issue.data.code(toIssueDetailMessage('CODE_ALREADY_EXISTS'))),
    })

    // Persist main record atomically with optimistic concurrency.
    const persisted = requireValue(
      await updateOrganisationByIdWithConcurrency(db, {
        id: current.id,
        updatedAt: updatedAt as string,
        data: {
          code: normalizedCode,
          url: data.url.trim() === '' ? null : data.url.trim(),
          capabilities: data.capabilities ?? {},
        },
      }),
      () => invalid(issue(toIssueDetailMessage('STALE_WRITE'))),
    )

    // Persist related i18n and role assignments.
    await updateI18n(db, toLocaleRecordFromOrganisationFormI18n(data.i18n), current.id)
    await syncOrganisationUserRoles(
      db,
      toPersistedOrganisationUserRoles(data.userRoles, current.id),
      current.id,
    )

    // Return persisted identity and write token.
    return toCreatedResponseShape(persisted)
  },
)

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
    const commandOrganisationId = params.id as Id

    // Probe target record existence.
    const probed = await resolveOrganisationCommandProbe(
      db,
      commandOrganisationId,
      () => {
        throw error(404, 'ORGANISATION_NOT_FOUND')
      },
    )

    // Apply role-based authorization.
    ensureOrganisationCommandAllowed(
      authorizeOrganisationPublishForSubmission({
        user,
        userRoles,
        resource: {
          id: probed.id,
          hubId: probed.hubId,
        },
      }),
    )

    // Persist publish state update.
    const persisted = requireValue(
      await updateOrganisationPublishedStateById(db, {
        id: commandOrganisationId,
        state: params.state,
        publisherId: user.id,
      }),
      () => {
        throw error(404, 'ORGANISATION_NOT_FOUND')
      },
    )

    return toBooleanStateResponseShape(persisted, 'isPublished')
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
    const commandOrganisationId = params.id as Id

    // Probe target record existence.
    const probed = await resolveOrganisationCommandProbe(
      db,
      commandOrganisationId,
      () => {
        throw error(404, 'ORGANISATION_NOT_FOUND')
      },
    )

    // Apply role-based authorization.
    ensureOrganisationCommandAllowed(
      authorizeOrganisationDeleteForSubmission({
        user,
        userRoles,
        resource: {
          id: probed.id,
          hubId: probed.hubId,
        },
      }),
    )

    // Persist archive state update.
    const persisted = requireValue(
      await updateOrganisationArchivedStateById(db, {
        id: commandOrganisationId,
        state: params.state,
      }),
      () => {
        throw error(404, 'ORGANISATION_NOT_FOUND')
      },
    )

    return toBooleanStateResponseShape(persisted, 'isArchived')
  },
)
