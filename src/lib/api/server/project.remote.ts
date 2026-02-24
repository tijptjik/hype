// REMOTE
import { guardedCommand, guardedForm, guardedQuery } from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq } from 'drizzle-orm'
// API
import { getPrisms, getValidQueryParams as validateQueryParams } from '$lib/api'
import {
  getDuplicateValues,
  hasRoleMembershipChanged,
  requireValue,
  toBooleanStateResponseShape,
  toCreatedResponseShape,
  validateUniqueNonReservedCode,
} from '$lib/api/services'
import {
  getProjectWithRelations,
  toLookupConditions,
  toQueryConditions,
  toProjectProfile,
  toRequestedListState,
} from '$lib/api/services/project'
// AUTHORIZATION
import {
  authorizeProjectAssignCapabilitiesForSubmission,
  authorizeProjectCreateForSubmission,
  authorizeProjectDeleteForSubmission,
  authorizeProjectListForContext,
  authorizeProjectManageCapabilitiesForSubmission,
  authorizeProjectManageRolesForSubmission,
  normalizeProjectI18nForFormInput,
  authorizeProjectPublishForSubmission,
  authorizeProjectReadForProbe,
  toProjectStableAuthzSignature,
  authorizeProjectUpdateForSubmission,
  ensureProjectCommandAllowed,
  isReservedCode,
  toAuthMessage,
  toIssueDetailMessage,
  toProjectUserRoleCapabilitiesSignature,
  toProjectUserRoleSignature,
} from '$lib/api/services/authz'
// DB
import {
  createI18n,
  createProjectUserRoles,
  createProject,
  getProject as loadProject,
  listProjectRoleAssignments,
  listProjects,
  probeOrganisationHubForProject,
  probeExistingProject,
  probeProjectQuery,
  probeProjectForUpdate,
  resolveProjectCommandProbe,
  syncProjectUserRoles,
  toEntityResponseShape,
  toPersistedProjectUserRoles,
  toListResponseShape,
  updateI18n,
  updateProjectArchivedStateById,
  updateProjectByIdWithConcurrency,
  updateProjectPublishedStateById,
} from '$lib/db/services/project'
import {
  createPropertiesWithRelated,
  updatePropertiesWithRelated,
} from '$lib/db/services/property'
// I18N
import { toLocaleRecordFromOrganisationFormI18n } from '$lib/i18n'
// SCHEMA
import {
  GetQueryParamsSchema,
  ListQueryParamsSchema,
  ProjectFormData,
  PublishProjectSchema,
  RemoveProjectSchema,
} from '$lib/db/zod'
// UTILS
import { nanoid } from 'nanoid'
// SCHEMA
import { project } from '$lib/db/schema'
// TYPES
import type {
  Id,
  Prisms,
  ProjectAuthorizationField,
  ProjectDB,
  ProjectI18nNew,
  ProjectI18nPartial,
  Property,
  PropertyNew,
  QueryParams,
} from '$lib/types'

/**
 * Returns a role-aware project collection for guarded remote callers.
 *
 * @param params - List query params validated by `ListQueryParamsSchema`.
 * @param params.conditions - Optional typed filters for project columns.
 * @param params.prisms - Optional prism filters (`organisation`, `project`, `layer`).
 * @param params.pagination - Optional pagination controls (`limit`, `offset`).
 * @param params.sorting - Optional sorting controls.
 * @param params.q - Optional full-text search string.
 * @param params.meta - Optional request metadata.
 * @param params.meta.profile - Optional response profile (`list`, `card`, `detail`, `admin`).
 * @returns A promise resolving to list response `{ data, limit, offset, totalCount }`.
 * @remarks
 * Authorization is evaluated against requested visibility state first; only then are
 * role-scoped query conditions and prisms applied to fetch rows.
 */
const getProjectsQuery = guardedQuery(ListQueryParamsSchema, async (params, ctx) => {
  const { db, user, userRoles, event } = ctx
  // Resolve desired `profile`.
  const profile = toProjectProfile(params.meta?.profile, 'list')

  // Resolve desired `query params`.
  const queryParams = validateQueryParams<ProjectDB>(
    project,
    params.conditions as Partial<ProjectDB> | undefined,
  )
  // Resolve requested visibility state from query params.
  const requestedListState = toRequestedListState(queryParams as Partial<ProjectDB>)

  // Apply role-based authorization.
  const listDecision = authorizeProjectListForContext({
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
    db,
    user,
    ctx.isAdminRequest,
    queryParams,
    userRoles,
    (params.prisms as Prisms | undefined) ?? getPrisms(event.url),
  )

  // Load records from DB.
  const result = await listProjects(
    db,
    getProjectWithRelations(profile),
    conditions,
    {
      ...event.locals.hub,
      isSuperAdmin: user.superAdmin || false,
      isAdminRequest: ctx.isAdminRequest,
    },
    params.pagination,
    params.sorting,
    {
      q: params.q,
      filtersToApply: filtersToApply as QueryParams,
    },
  )

  // Return loaded records with desired profile.
  return toListResponseShape(result, user, profile)
})

export const getProjects = getProjectsQuery

/**
 * Returns a role-aware project record for guarded remote callers.
 *
 * @param params - Lookup params validated by `GetQueryParamsSchema`.
 * @param params.ref - Project identifier value.
 * @param params.refKey - Optional lookup column (`id` or `code`), defaults to `id`.
 * @param params.meta - Optional request metadata.
 * @param params.meta.profile - Optional response profile (`list`, `card`, `detail`, `admin`).
 * @returns A promise resolving to `{ data }`, where `data` is the matched project.
 * @remarks
 * Performs a minimal probe query first (`id`, `organisationId`, `hubId`, `isPublished`,
 * `isArchived`) so authorization can evaluate persisted visibility and scope before the
 * full relation shape is loaded.
 */
const getProjectQuery = guardedQuery(GetQueryParamsSchema, async (params, ctx) => {
  const { db, user, userRoles, isAdminRequest, event } = ctx
  // Resolve desired `profile`.
  const profile = toProjectProfile(params.meta?.profile, 'admin')

  // Probe the requested organisation for flags.
  const probe = await probeProjectQuery(db, {
    ref: params.ref,
    refKey: params.refKey,
  })
  if (!probe) {
    return {
      data: null,
    }
  }

  // Apply role-based authorization.
  const readDecision = authorizeProjectReadForProbe({
    user,
    userRoles,
    probe,
  })
  if (!readDecision.allowed) {
    throw error(403, toAuthMessage(readDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  // Resolve desired `query params`.
  const queryParams = validateQueryParams<ProjectDB>(
    project,
    toLookupConditions(params),
    {
      isPublished: probe.isPublished,
      isArchived: probe.isArchived,
    } as Partial<ProjectDB>,
  )
  const { conditions } = toQueryConditions(
    db,
    user,
    isAdminRequest,
    queryParams,
    userRoles,
  )

  // Load record from DB.
  const result = await loadProject(db, getProjectWithRelations(profile), conditions, {
    ...event.locals.hub,
    isSuperAdmin: user.superAdmin || false,
    isAdminRequest,
  })

  // Return loaded record with desired profile.
  return toEntityResponseShape(result ?? null, profile)
})

export const getProject = getProjectQuery

/**
 * Creates or updates a project and related i18n/role/property rows from form payloads.
 *
 * @param input - Form payload parsed by `ProjectFormData`.
 * @returns A promise resolving to `{ data: { id, modifiedAt } }`.
 * @remarks
 * - `mode: 'create'` (or no mode with no update token) creates a new project.
 * - Other submissions follow update flow and enforce optimistic concurrency via
 *   `meta.updatedAt`.
 * - Role membership changes, role capability assignment changes, and project capability
 *   config changes are authorized independently (`manageProjectRoles`,
 *   `assignCapabilities`, `manageCapabilities`).
 */
export const projectForm = guardedForm('unchecked', async (input, ctx) => {
  // Parse and normalize submitted form input.
  const params = ProjectFormData.parse(input)
  const { db, user, userRoles, invalid } = ctx
  const issue = ctx.issue
  const { meta, data } = params

  const projectId = meta?.id?.trim()
  const mode = meta?.mode
  const normalizedCode = data.code.trim()
  const submittedRoles = Array.isArray(data.userRoles) ? data.userRoles : []
  const submittedRolesWithCapabilities = submittedRoles.map(role => ({
    ...role,
    capabilities: role.capabilities ?? {},
  }))
  const hasSubmittedProperties = Object.hasOwn(data, 'properties')
  const submittedProperties = Array.isArray(data.properties) ? data.properties : []
  const duplicateSubmittedRoleUserIds = getDuplicateValues(
    submittedRoles.map(role => role.userId),
  )
  const duplicateSubmittedPropertyKeys = getDuplicateValues(
    submittedProperties
      .map(property => property?.key)
      .filter((key): key is string => typeof key === 'string' && key.trim().length > 0),
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
  if (duplicateSubmittedPropertyKeys.length > 0) {
    invalid(
      issue.data.properties(
        `INVALID: Duplicate property keys submitted (${Array.from(new Set(duplicateSubmittedPropertyKeys)).join(', ')})`,
      ),
    )
  }
  if (mode === 'create' && projectId) {
    invalid(issue('CREATE_MODE_CANNOT_INCLUDE_ID'))
  }
  if (mode === 'update' && !projectId) {
    invalid(issue('MISSING_PROJECT_ID'))
  }

  const isCreateMode = !projectId && !meta?.updatedAt && (!mode || mode === 'create')

  if (isCreateMode) {
    // Apply role-based authorization.
    const organisationScope = requireValue(
      await probeOrganisationHubForProject(db, data.organisationId as Id),
      () => invalid(issue('ORGANISATION_NOT_FOUND')),
    )

    const createDecision = authorizeProjectCreateForSubmission({
      user,
      userRoles,
      organisationId: data.organisationId,
      resourceHubId: organisationScope.hubId,
      submittedData: data,
    })
    if (!createDecision.allowed) {
      invalid(issue(toIssueDetailMessage(createDecision.code ?? 'INSUFFICIENT_ROLE')))
    }

    await validateUniqueNonReservedCode({
      code: normalizedCode,
      isReservedCode,
      probeExisting: code => probeExistingProject(db, code),
      onReserved: () => invalid(issue.data.code(toIssueDetailMessage('CODE_RESERVED'))),
      onConflict: () =>
        invalid(issue.data.code(toIssueDetailMessage('CODE_ALREADY_EXISTS'))),
    })

    // Create main record and related rows.
    const created = await createProject(db, {
      id: nanoid(12),
      organisationId: data.organisationId,
      code: normalizedCode,
      capabilities: data.capabilities ?? {},
      isPublished: false,
      isArchived: false,
    })

    await createI18n(
      db,
      toLocaleRecordFromOrganisationFormI18n<ProjectI18nNew>(data.i18n),
      created.id,
    )
    await createProjectUserRoles(
      db,
      toPersistedProjectUserRoles(submittedRolesWithCapabilities, created.id),
      created.id,
      created.organisationId,
    )

    if (submittedProperties.length > 0) {
      await createPropertiesWithRelated(
        db,
        submittedProperties as PropertyNew[],
        created.id,
      )
    }

    return toCreatedResponseShape(created)
  }

  const targetProjectId = projectId as Id

  // Load current record for update flow.
  const current = requireValue(await probeProjectForUpdate(db, targetProjectId), () =>
    invalid(issue('PROJECT_NOT_FOUND')),
  )

  // Load the full persisted entity so field-level auth can compare against real DB state.
  const currentWithRelations = requireValue(
    await loadProject(
      db,
      getProjectWithRelations('admin'),
      [eq(project.id, current.id)],
      {
        ...ctx.event.locals.hub,
        isSuperAdmin: user.superAdmin || false,
        isAdminRequest: ctx.isAdminRequest,
      },
    ),
    () => invalid(issue('PROJECT_NOT_FOUND')),
  )
  const currentEntity = requireValue(
    (await toEntityResponseShape(currentWithRelations, 'admin')).data,
    () => invalid(issue('PROJECT_NOT_FOUND')),
  )

  // Read current role assignments so membership/capability changes can be authorized separately.
  const existingRoleRows = await listProjectRoleAssignments(db, current.id)
  // Detect membership changes (add/remove/swap users or roles) for manage-roles auth checks.
  const roleMembershipChanged = hasRoleMembershipChanged(
    submittedRoles,
    existingRoleRows,
    toProjectUserRoleSignature,
  )
  // Detect per-role capability assignment changes for assign-capabilities auth checks.
  const roleCapabilityAssignmentsChanged =
    toProjectUserRoleCapabilitiesSignature(
      submittedRolesWithCapabilities.map(role => ({
        userId: role.userId,
        capabilities: role.capabilities,
      })),
    ) !==
    toProjectUserRoleCapabilitiesSignature(
      existingRoleRows.map(role => ({
        userId: role.userId,
        capabilities: role.capabilities ?? {},
      })),
    )
  // Detect property changes only when the properties section was part of the submitted payload.
  const propertiesChanged =
    hasSubmittedProperties &&
    toProjectStableAuthzSignature(submittedProperties) !==
      toProjectStableAuthzSignature(currentEntity.properties ?? [])
  // Compare normalized i18n payloads so translator-only submissions resolve to i18n field auth.
  const i18nChanged =
    toProjectStableAuthzSignature(data.i18n) !==
    toProjectStableAuthzSignature(normalizeProjectI18nForFormInput(currentEntity.i18n))

  // Build the submitted field set from actual diffs so authz checks changed fields only.
  const submittedDataForUpdate: Partial<Record<ProjectAuthorizationField, unknown>> = {}
  if (normalizedCode !== current.code) submittedDataForUpdate.code = normalizedCode
  if (i18nChanged) submittedDataForUpdate.i18n = data.i18n
  if (
    toProjectStableAuthzSignature(data.capabilities ?? {}) !==
    toProjectStableAuthzSignature(current.capabilities ?? {})
  ) {
    submittedDataForUpdate.capabilities = data.capabilities ?? {}
  }
  if (roleMembershipChanged || roleCapabilityAssignmentsChanged) {
    submittedDataForUpdate.userRoles = submittedRolesWithCapabilities
  }
  if (propertiesChanged) {
    submittedDataForUpdate.properties = submittedProperties
  }

  // Apply role-based authorization for core update fields.
  const updateDecision = authorizeProjectUpdateForSubmission({
    user,
    userRoles,
    resource: {
      id: current.id,
      organisationId: current.organisationId,
      hubId: current.hubId,
    },
    submittedData: submittedDataForUpdate,
  })
  if (!updateDecision.allowed) {
    invalid(issue(toIssueDetailMessage(updateDecision.code ?? 'INSUFFICIENT_ROLE')))
  }

  // Apply role-management authorization only when role membership changed.
  if (roleMembershipChanged) {
    const roleDecision = authorizeProjectManageRolesForSubmission({
      user,
      userRoles,
      resource: {
        id: current.id,
        organisationId: current.organisationId,
        hubId: current.hubId,
      },
    })
    if (!roleDecision.allowed) {
      invalid(issue(toIssueDetailMessage(roleDecision.code ?? 'INSUFFICIENT_ROLE')))
    }
  }

  // Handle changes to role-based capabilities, respecting the new ones.
  if (roleCapabilityAssignmentsChanged) {
    const assignDecision = authorizeProjectAssignCapabilitiesForSubmission({
      user,
      userRoles,
      resource: {
        id: current.id,
        organisationId: current.organisationId,
        hubId: current.hubId,
      },
    })
    if (!assignDecision.allowed) {
      invalid(issue(toIssueDetailMessage(assignDecision.code ?? 'INSUFFICIENT_ROLE')))
    }
  }

  // Allow projects to be assigned to or moved between organisations.
  if (data.organisationId !== current.organisationId) {
    const targetOrganisationScope = requireValue(
      await probeOrganisationHubForProject(db, data.organisationId as Id),
      () => invalid(issue('ORGANISATION_NOT_FOUND')),
    )

    const createOnTargetDecision = authorizeProjectCreateForSubmission({
      user,
      userRoles,
      organisationId: data.organisationId,
      resourceHubId: targetOrganisationScope.hubId,
      submittedData: data,
    })
    if (!createOnTargetDecision.allowed) {
      invalid(
        issue(toIssueDetailMessage(createOnTargetDecision.code ?? 'INSUFFICIENT_ROLE')),
      )
    }

    const deleteOnSourceDecision = authorizeProjectDeleteForSubmission({
      user,
      userRoles,
      resource: {
        id: current.id,
        organisationId: current.organisationId,
        hubId: current.hubId,
      },
    })
    if (!deleteOnSourceDecision.allowed) {
      invalid(
        issue(toIssueDetailMessage(deleteOnSourceDecision.code ?? 'INSUFFICIENT_ROLE')),
      )
    }
  }

  // Perform additional auth checks if capabilities changed.
  const projectCapabilitiesChanged =
    JSON.stringify(data.capabilities ?? {}) !==
    JSON.stringify(current.capabilities ?? {})
  if (projectCapabilitiesChanged) {
    const manageCapabilitiesDecision = authorizeProjectManageCapabilitiesForSubmission({
      user,
      userRoles,
      resource: {
        id: current.id,
        organisationId: current.organisationId,
        hubId: current.hubId,
      },
    })
    if (!manageCapabilitiesDecision.allowed) {
      invalid(
        issue(
          toIssueDetailMessage(manageCapabilitiesDecision.code ?? 'INSUFFICIENT_ROLE'),
        ),
      )
    }
  }

  // Enforce optimistic concurrency guard.
  const updatedAt = meta?.updatedAt
  if (!updatedAt || updatedAt !== current.modifiedAt) {
    invalid(issue(toIssueDetailMessage('STALE_WRITE')))
  }

  // Enforce uniqueness of code.
  await validateUniqueNonReservedCode({
    code: normalizedCode,
    current,
    isReservedCode,
    probeExisting: code => probeExistingProject(db, code),
    onReserved: () => invalid(issue.data.code(toIssueDetailMessage('CODE_RESERVED'))),
    onConflict: () =>
      invalid(issue.data.code(toIssueDetailMessage('CODE_ALREADY_EXISTS'))),
  })

  // Persist main record atomically with optimistic concurrency.
  const persisted = requireValue(
    await updateProjectByIdWithConcurrency(db, {
      id: current.id as Id,
      updatedAt: updatedAt as string,
      data: {
        organisationId: data.organisationId,
        code: normalizedCode,
        capabilities: data.capabilities ?? {},
      },
    }),
    () => invalid(issue(toIssueDetailMessage('STALE_WRITE'))),
  )

  // Persist related i18n,role assignments, and properties
  await updateI18n(
    db,
    toLocaleRecordFromOrganisationFormI18n<ProjectI18nPartial>(data.i18n),
    current.id,
  )
  await syncProjectUserRoles(
    db,
    toPersistedProjectUserRoles(submittedRolesWithCapabilities, current.id),
    current.id as Id,
    data.organisationId as Id,
  )

  if (hasSubmittedProperties) {
    await updatePropertiesWithRelated(db, submittedProperties as Property[], current.id)
  }

  return toCreatedResponseShape(persisted)
})

/**
 * Toggles project publish state after role-based authorization.
 *
 * @param params - Command payload validated by `PublishProjectSchema`.
 * @param params.id - Target project id.
 * @param params.state - Next publish state.
 * @returns A promise resolving to `{ data: { id, isPublished } }`.
 */
export const publishProject = guardedCommand(
  PublishProjectSchema,
  async (params, ctx) => {
    const { db, user, userRoles } = ctx
    const projectId = params.id as Id

    // Probe target record existence.
    const probed = await resolveProjectCommandProbe(db, projectId, () => {
      throw error(404, 'PROJECT_NOT_FOUND')
    })
    // Apply role-based authorization.
    ensureProjectCommandAllowed(
      authorizeProjectPublishForSubmission({
        user,
        userRoles,
        resource: {
          id: probed.id,
          organisationId: probed.organisationId,
          hubId: probed.hubId,
        },
      }),
      toIssueDetailMessage,
    )

    // Persist publish state update.
    const persisted = requireValue(
      await updateProjectPublishedStateById(db, {
        id: projectId,
        state: params.state,
        publisherId: user.id,
      }),
      () => {
        throw error(404, 'PROJECT_NOT_FOUND')
      },
    )

    return toBooleanStateResponseShape(persisted, 'isPublished')
  },
)

/**
 * Toggles project archive state after role-based authorization.
 *
 * @param params - Command payload validated by `RemoveProjectSchema`.
 * @param params.id - Target project id.
 * @param params.state - Next archive state.
 * @returns A promise resolving to `{ data: { id, isArchived } }`.
 */
export const archiveProject = guardedCommand(
  RemoveProjectSchema,
  async (params, ctx) => {
    const { db, user, userRoles } = ctx
    const projectId = params.id as Id
    const probed = await resolveProjectCommandProbe(db, projectId, () => {
      throw error(404, 'PROJECT_NOT_FOUND')
    })

    // Apply role-based authorization.
    ensureProjectCommandAllowed(
      authorizeProjectDeleteForSubmission({
        user,
        userRoles,
        resource: {
          id: probed.id,
          organisationId: probed.organisationId,
          hubId: probed.hubId,
        },
      }),
      toIssueDetailMessage,
    )

    // Persist archive state update.
    const persisted = requireValue(
      await updateProjectArchivedStateById(db, {
        id: projectId,
        state: params.state,
      }),
      () => {
        throw error(404, 'PROJECT_NOT_FOUND')
      },
    )

    return toBooleanStateResponseShape(persisted, 'isArchived')
  },
)
