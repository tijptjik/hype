// REMOTE
import { guardedCommand, guardedForm, guardedQuery } from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
import {
  getDuplicateValues,
  hasRoleMembershipChanged,
  requireValue,
  validateUniqueNonReservedCode,
} from '$lib/api/services'
// I18N
import { toLocaleRecordFromOrganisationFormI18n } from '$lib/i18n'
// DRIZZLE
import { eq } from 'drizzle-orm'
// UTILS
import { nanoid } from 'nanoid'
import {
  hubCollectionWithRelations,
  hubEntityWithRelations,
  toHubEntityResponse,
  toHubListResponse,
  toHubProfile,
  toLookupConditions,
  toQueryConditions,
  toRequestedListState,
} from '$lib/api/services/hub'
// AUTHORIZATION
import {
  authorizeHubReadForProbe,
  authorizeHubCreateForSubmission,
  authorizeHubUpdateForSubmission,
  authorizeHubManageRolesForSubmission,
  authorizeHubPublishForSubmission,
  authorizeHubDeleteForSubmission,
  ensureHubCommandAllowed,
  hasInvalidHubOrganisationAssignmentsForSubmission,
  isReservedCode,
  toAuthMessage,
  toHubListConditions,
  toIssueDetailMessage,
  toHubUserRoleSignature,
  authorizeHubList,
} from '$lib/api/services/authz'
// SERVICES
import {
  createHub,
  createI18n,
  createHubUserRoles,
  probeExistingHub,
  probeHubForUpdate,
  resolveHubCommandProbe,
  updateHubPublishedStateById,
  updateHubArchivedStateById,
  updateHubByIdWithConcurrency,
  probeHubQuery,
  updateI18n,
  syncHubUserRoles,
  listHubOrganisationLookups,
  listHubs,
  getHub as loadHub,
  syncHubOrganisations,
} from '$lib/db/services/hub'
// API UTILS
import { getValidQueryParams as validateQueryParams } from '$lib/api'
// SCHEMA
import { hub, hubRole } from '$lib/db/schema'
// ZOD
import {
  ListQueryParamsSchema,
  GetQueryParamsSchema,
  HubFormData,
  PublishHubSchema,
  RemoveHubSchema,
} from '$lib/db/zod'
// TYPES
import type {
  EntityResponse,
  HubDB,
  HubEntityByProfile,
  HubGetParamsByProfile,
  HubListByProfile,
  HubListParamsByProfile,
  HubProfile as HubProfileType,
  Id,
  ListResponse,
} from '$lib/types'

/* ----------------- */
// REMOTE QUERIES
/* -------- */

/**
 * Returns a role-aware hub collection for guarded remote callers.
 *
 * @param params - List query params validated by `ListQueryParamsSchema`.
 * @param params.conditions - Optional typed filters for hub columns.
 * @param params.pagination - Optional pagination controls (`limit`, `offset`).
 * @param params.sorting - Optional sorting controls.
 * @param params.meta - Optional request metadata.
 * @param params.meta.profile - Optional response profile (`list`, `card`, `detail`, `admin`).
 * @returns A promise resolving to list response `{ data, limit, offset, totalCount }`.
 * @remarks
 * Uses `authorizeHubList` first, then scopes visible rows to:
 * - all hubs for core hub admins,
 * - only admin-scoped hub ids for non-core hub admins.
 * Visibility flags (`isPublished`, `isArchived`) are applied only when explicitly requested.
 */
const getHubsQuery = guardedQuery(ListQueryParamsSchema, async (params, ctx) => {
  const { db, user, userRoles } = ctx
  // Resolve desired `profile`.
  const profile = toHubProfile(params.meta?.profile, 'list')

  // Resolve desired `query params`.
  const queryParams = validateQueryParams<HubDB>(
    hub,
    params.conditions as Partial<HubDB> | undefined,
  )
  // Resolve requested visibility state from query params.
  const requestedListState = toRequestedListState(queryParams as Partial<HubDB>)

  // Apply role-based authorization.
  const listDecision = authorizeHubList({
    userId: user.id,
    userRoles,
    isAuthenticated: true,
    isAnonymous: user.isAnonymous,
  })
  if (!listDecision.allowed) {
    throw error(403, toAuthMessage(listDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  // Load records from DB.
  const rows = await listHubs(
    db,
    hubCollectionWithRelations,
    toHubListConditions(userRoles, requestedListState),
  )

  // Return loaded records with desired profile.
  return toHubListResponse({
    data: rows,
    profile,
    limit: params.pagination?.limit,
    offset: params.pagination?.offset,
    totalCount: rows.length,
    hasMore: false,
    nextOffset: null,
  })
})

export const getHubs = getHubsQuery as typeof getHubsQuery &
  (<P extends HubProfileType = 'list'>(
    params: HubListParamsByProfile<P>,
  ) => Promise<ListResponse<HubListByProfile<P>>>)

/**
 * Returns a single role-aware hub entity for guarded remote callers.
 *
 * @param params - Lookup params validated by `GetQueryParamsSchema`.
 * @param params.ref - Hub identifier value.
 * @param params.refKey - Optional lookup key (`id` or `code`).
 * @param params.meta - Optional request metadata.
 * @param params.meta.profile - Optional response profile (`list`, `card`, `detail`, `admin`).
 * @returns A promise resolving to `{ data }`, where `data` is the matched hub or `null`.
 * @remarks
 * Performs a minimal probe first so authorization can evaluate access against the resolved hub id
 * before loading the full relation shape.
 */
const getHubQuery = guardedQuery(GetQueryParamsSchema, async (params, ctx) => {
  const { db, user, userRoles } = ctx
  let result = null

  // Resolve desired `query params`
  const queryParams = validateQueryParams<HubDB>(hub, toLookupConditions(params))

  // Probe the requested hub for flags
  const probe = await probeHubQuery(db, params)
  if (probe) {
    // Apply role-based authorization
    const readDecision = authorizeHubReadForProbe({ user, userRoles, probe })
    if (!readDecision.allowed) {
      throw error(403, toAuthMessage(readDecision.code ?? 'INSUFFICIENT_ROLE'))
    }
    // Resolve `query conditions`
    const conditions = toQueryConditions(params, queryParams as Partial<HubDB>)
    // Load record from DB
    result = await loadHub(db, hubEntityWithRelations, conditions)
  }
  // Resolve desired `profile`
  const profile = toHubProfile(params.meta?.profile, 'detail')
  // Return loaded record with desired profile
  return toHubEntityResponse(result ?? null, profile)
})

export const getHub = getHubQuery as typeof getHubQuery &
  (<P extends HubProfileType = 'detail'>(
    params: HubGetParamsByProfile<P>,
  ) => Promise<EntityResponse<HubEntityByProfile<P>>>)

/* ----------------- */
// REMOTE FORM
/* -------- */

/**
 * Creates or updates a hub and its related i18n, role, and organisation rows from form payloads.
 *
 * @param input - Form payload parsed by `HubFormData`.
 * @returns A promise resolving to `{ data: { id, modifiedAt } }`.
 * @remarks
 * - `mode: 'create'` (or no mode with no update token) creates a new hub.
 * - Other submissions follow update flow and enforce optimistic concurrency via `meta.updatedAt`.
 * - Image updates are intentionally excluded from this form flow and managed separately.
 * - Role and organisation scope checks are enforced before persistence.
 */
export const hubForm = guardedForm('unchecked', async (input, ctx) => {
  // Parse and normalize submitted form input.
  const params = HubFormData.parse(input)
  const { db, user, userRoles, invalid } = ctx
  const issue = ctx.issue
  const { meta, data } = params

  const hubId = meta?.id?.trim()
  const mode = meta?.mode
  const normalizedCode = data.code.trim()
  const normalizedDomain = data.domain.trim()
  const submittedRoles = Array.isArray(data.userRoles) ? data.userRoles : []
  const submittedOrganisations = Array.isArray(data.organisations)
    ? data.organisations
    : []

  const duplicateSubmittedRoleUserIds = getDuplicateValues(
    submittedRoles.map(userRole => userRole.userId),
  )

  // Validate payload invariants.
  if (submittedRoles.length === 0) {
    invalid(issue(toIssueDetailMessage('USER_ROLES_REQUIRED')))
  }
  if (duplicateSubmittedRoleUserIds.length > 0) {
    invalid(
      issue.data.userRoles(
        `INVALID: Duplicate user roles submitted (${Array.from(new Set(duplicateSubmittedRoleUserIds)).join(', ')})`,
      ),
    )
  }
  if (mode === 'create' && hubId) {
    invalid(issue('CREATE_MODE_CANNOT_INCLUDE_ID'))
  }
  if (mode === 'update' && !hubId) {
    invalid(issue('MISSING_HUB_ID'))
  }

  const isCreateMode = !hubId && (!mode || mode === 'create') && !meta?.updatedAt

  if (isCreateMode) {
    // Apply role-based authorization.
    const createDecision = authorizeHubCreateForSubmission({
      user,
      userRoles,
      submittedData: data,
    })
    if (!createDecision.allowed) {
      invalid(issue(toIssueDetailMessage(createDecision.code ?? 'INSUFFICIENT_ROLE')))
    }

    await validateUniqueNonReservedCode({
      code: normalizedCode,
      isReservedCode,
      probeExisting: code => probeExistingHub(db, code),
      onReserved: () => invalid(issue.data.code(toIssueDetailMessage('CODE_RESERVED'))),
      onConflict: () =>
        invalid(issue.data.code(toIssueDetailMessage('CODE_ALREADY_EXISTS'))),
    })

    // Create main record and related rows.
    const created = await createHub(db, {
      id: nanoid(12),
      code: normalizedCode,
      domain: normalizedDomain === '' ? null : normalizedDomain,
      isPublished: true,
      isArchived: false,
    })

    await createI18n(db, toLocaleRecordFromOrganisationFormI18n(data.i18n), created.id)
    await createHubUserRoles(db, submittedRoles, created.id)
    await syncHubOrganisations(db, created.id, submittedOrganisations)

    return {
      data: {
        id: created.id,
        modifiedAt: created.modifiedAt,
      },
    }
  }

  // Resolve target id for update flow.
  const targetHubId = requireValue(hubId, () => invalid(issue('MISSING_HUB_ID'))) as Id

  // Load current record for update flow.
  const current = requireValue(await probeHubForUpdate(db, targetHubId), () =>
    invalid(issue('HUB_NOT_FOUND')),
  )

  // Apply role-based authorization for core update fields.
  const updateDecision = authorizeHubUpdateForSubmission({
    user,
    userRoles,
    resource: { id: current.id },
    submittedData: data,
  })
  if (!updateDecision.allowed) {
    invalid(issue(toIssueDetailMessage(updateDecision.code ?? 'INSUFFICIENT_ROLE')))
  }

  const existingRoleRows = await db
    .select({
      userId: hubRole.userId,
      role: hubRole.role,
    })
    .from(hubRole)
    .where(eq(hubRole.hubId, current.id))

  // Apply role-management authorization only when role membership changed.
  if (
    hasRoleMembershipChanged(submittedRoles, existingRoleRows, toHubUserRoleSignature)
  ) {
    const roleDecision = authorizeHubManageRolesForSubmission({
      user,
      userRoles,
      resource: { id: current.id },
    })
    if (!roleDecision.allowed) {
      invalid(issue(toIssueDetailMessage(roleDecision.code ?? 'INSUFFICIENT_ROLE')))
    }
  }

  // Enforce organisation scope for submitted assignments.
  const hasInvalidOrganisationAssignment =
    await hasInvalidHubOrganisationAssignmentsForSubmission({
      db,
      user,
      userRoles,
      resource: { id: current.id },
      submittedOrganisations,
    })
  if (hasInvalidOrganisationAssignment) {
    invalid(issue.data.organisations(toIssueDetailMessage('HUB_SCOPE_FORBIDDEN')))
  }

  // Enforce optimistic concurrency guard.
  const updatedAt = meta?.updatedAt
  if (!updatedAt) {
    invalid(issue(toIssueDetailMessage('STALE_WRITE')))
  }

  if (updatedAt !== current.modifiedAt) {
    invalid(issue(toIssueDetailMessage('STALE_WRITE')))
  }

  await validateUniqueNonReservedCode({
    code: normalizedCode,
    current,
    isReservedCode,
    probeExisting: code => probeExistingHub(db, code),
    onReserved: () => invalid(issue.data.code(toIssueDetailMessage('CODE_RESERVED'))),
    onConflict: () =>
      invalid(issue.data.code(toIssueDetailMessage('CODE_ALREADY_EXISTS'))),
  })

  // Persist main record atomically with optimistic concurrency.
  const result = await updateHubByIdWithConcurrency(db, {
    id: current.id,
    updatedAt: updatedAt as string,
    data: {
      code: normalizedCode,
      domain: normalizedDomain === '' ? null : normalizedDomain,
    },
  })

  const persisted = requireValue(result, () =>
    invalid(issue(toIssueDetailMessage('STALE_WRITE'))),
  )

  // Persist related i18n, roles, and organisation assignments.
  await updateI18n(db, toLocaleRecordFromOrganisationFormI18n(data.i18n), current.id)
  await syncHubUserRoles(db, submittedRoles, current.id)
  await syncHubOrganisations(db, current.id, submittedOrganisations)

  // Return persisted identity and write token.
  return {
    data: {
      id: persisted.id,
      modifiedAt: persisted.modifiedAt,
    },
  }
})

/* ----------------- */
// REMOTE COMMANDS
/* -------- */

/**
 * Toggles hub publish state after role-based authorization.
 *
 * @param params - Command payload validated by `PublishHubSchema`.
 * @param params.id - Target hub id.
 * @param params.state - Next publish state.
 * @returns A promise resolving to `{ data: { id, isPublished } }`.
 */
export const publishHub = guardedCommand(PublishHubSchema, async (params, ctx) => {
  const { db, user, userRoles } = ctx
  const commandHubId = params.id as Id

  // Probe target record existence.
  const probed = await resolveHubCommandProbe(db, commandHubId, () => {
    throw error(404, 'HUB_NOT_FOUND')
  })

  // Apply role-based authorization.
  ensureHubCommandAllowed(
    authorizeHubPublishForSubmission({
      user,
      userRoles,
      resource: { id: probed.id },
    }),
  )

  // Persist publish state update.
  const persisted = requireValue(
    await updateHubPublishedStateById(db, {
      id: commandHubId,
      state: params.state,
    }),
    () => {
      throw error(404, 'HUB_NOT_FOUND')
    },
  )

  return {
    data: {
      id: persisted.id,
      isPublished: persisted.isPublished,
    },
  }
})

/**
 * Toggles hub archive state after role-based authorization.
 *
 * @param params - Command payload validated by `RemoveHubSchema`.
 * @param params.id - Target hub id.
 * @param params.state - Next archive state.
 * @returns A promise resolving to `{ data: { id, isArchived } }`.
 */
export const archiveHub = guardedCommand(RemoveHubSchema, async (params, ctx) => {
  const { db, user, userRoles } = ctx
  const commandHubId = params.id as Id

  // Probe target record existence.
  const probed = await resolveHubCommandProbe(db, commandHubId, () => {
    throw error(404, 'HUB_NOT_FOUND')
  })

  // Apply role-based authorization.
  ensureHubCommandAllowed(
    authorizeHubDeleteForSubmission({
      user,
      userRoles,
      resource: { id: probed.id },
    }),
  )

  // Persist archive state update.
  const persisted = requireValue(
    await updateHubArchivedStateById(db, {
      id: commandHubId,
      state: params.state,
    }),
    () => {
      throw error(404, 'HUB_NOT_FOUND')
    },
  )

  return {
    data: {
      id: persisted.id,
      isArchived: persisted.isArchived,
    },
  }
})

/* ----------------- */
// ORGANISATION LOOKUP (HUB FORM)
/* -------- */

/**
 * Returns lookup rows for organisations selected in the hub form.
 *
 * @param params - List query params validated by `ListQueryParamsSchema`.
 * @param params.conditions.organisation - Organisation id list to probe.
 * @returns A promise resolving to `{ data }` containing organisation assignment flags.
 * @remarks
 * This endpoint is intentionally narrow and only returns fields required to reconcile
 * hub-organisation form selections (`hubId`, `isCoreInclusive`, `isHubExclusive`).
 */
export const getOrganisationLookupsForHub = guardedQuery(
  ListQueryParamsSchema,
  async (params, ctx) => {
    const { db } = ctx
    // Resolve organisation ids from query conditions.
    const organisationIds = Array.isArray(params.conditions?.organisation)
      ? (params.conditions?.organisation as string[])
      : []

    // Short-circuit when there is nothing to load.
    if (organisationIds.length === 0) {
      return { data: [] }
    }

    // Load assignment flags for selected organisations.
    const result = await listHubOrganisationLookups(db, organisationIds)

    // Return lookup payload used by hub form reconciliation.
    return { data: result }
  },
)
