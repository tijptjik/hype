// REMOTE
import { guardedCommand, guardedForm, guardedQuery } from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
// I18N
import { getLocale } from '$lib/i18n'
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
  mergeProjectInheritedPropertySyncItems,
  normalizeSubmittedPropertyRanks,
  resolveCanonicalScopeByPropertyId,
  splitSubmittedPropertiesByScope,
  toEntityResponseShape,
  toListResponseShape,
  toPreservedLocalPropertiesForProject,
  toSubmittedLocalPropertiesWithProjectId,
  toSubmittedPropertyIdSet,
  sanitizeSubmittedRoleCapabilities,
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
  cascadeOrganisationToDescendants,
  createI18n,
  createUserRoles,
  createProject,
  getProject as loadProject,
  listUserRoleAssignments,
  listProjects,
  mergeOrganisationCapabilities,
  probeOrganisationHubForProject,
  probeExistingProject,
  probeProjectQuery,
  probeProjectForUpdate,
  resolveProjectCommandProbe,
  syncUserRoles,
  toUserRoles,
  updateI18n,
  updateProjectArchivedStateById,
  updateProjectByIdWithConcurrency,
  updateProjectPublishedStateById,
  cascadeProjectPublishedStateToDescendants,
} from '$lib/db/services/project'
import { hasProjectLayersCondition } from '$lib/db/services/layer'
import { syncProjectLayerPresentation } from '$lib/db/services/layer'
import {
  listResolvedProjectProperties,
  seedDefaultInheritedPropertiesForProject,
  syncProjectInheritedProperties,
  upsertProjectProperties,
} from '$lib/db/services/property'
import {
  getOrganisationMapStyleScope,
  listMapStylesForProject,
  listMapStylesForScope,
  syncMapStyleCatalog,
  setProjectMapStyleByCode,
} from '$lib/db/services/map'
import {
  appendProjectLicenseHistory,
  normalizeProjectLicense,
} from '$lib/db/services/licence'
import { isMapStyleKey } from '$lib/map/styles'
import { resolveMapStyleRenderPathForKey } from '$lib/map/styles/render.shared'
// SCHEMA
import {
  GetProjectMapStylesSchema,
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
import type { Id, Prisms, ProjectAuthorizationField, QueryParams } from '$lib/types'
import type { ProjectAdminDBRaw, ProjectDB } from '$lib/db/zod/schema/project.types'
import type { MapStyleResolvedDB } from '$lib/db/zod/schema/map.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// GET
// - getProjects
// - getProjectsWhichHaveLayers
// - getProject
// - getProjectMapStyles
//
// FORM
// - projectForm
//
// COMMAND
// - publishProject
// - archiveProject

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
    event.locals.hub?.isCore ? null : (event.locals.hub?.id ?? null),
  )

  // Load records from DB.
  const result = await listProjects(
    db,
    getProjectWithRelations(profile) as never,
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
      locale: getLocale(),
    },
  )

  // Return loaded records with desired profile.
  return toListResponseShape(result, user, profile)
})

export const getProjects = getProjectsQuery

const getProjectsWhichHaveLayersQuery = guardedQuery(
  ListQueryParamsSchema,
  async (params, ctx) => {
    const { db, user, userRoles, event } = ctx
    const profile = toProjectProfile(params.meta?.profile, 'list')

    const queryParams = validateQueryParams<ProjectDB>(
      project,
      params.conditions as Partial<ProjectDB> | undefined,
    )
    const requestedListState = toRequestedListState(queryParams as Partial<ProjectDB>)

    const listDecision = authorizeProjectListForContext({
      user,
      userRoles,
      hub: event.locals.hub,
      requestedListState,
    })
    if (!listDecision.allowed) {
      throw error(403, toAuthMessage(listDecision.code ?? 'INSUFFICIENT_ROLE'))
    }

    const { conditions, filtersToApply } = toQueryConditions(
      db,
      user,
      ctx.isAdminRequest,
      queryParams,
      userRoles,
      (params.prisms as Prisms | undefined) ?? getPrisms(event.url),
      event.locals.hub?.isCore ? null : (event.locals.hub?.id ?? null),
    )

    conditions.push(
      hasProjectLayersCondition({
        requirePublished: !ctx.isAdminRequest,
        requireNonArchived: !ctx.isAdminRequest,
      }),
    )

    const result = await listProjects(
      db,
      getProjectWithRelations(profile) as never,
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
        locale: getLocale(),
      },
    )

    return toListResponseShape(result, user, profile)
  },
)

export const getProjectsWhichHaveLayers = getProjectsWhichHaveLayersQuery

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

  // Probe the requested project for flags.
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
    undefined,
    event.locals.hub?.isCore ? null : (event.locals.hub?.id ?? null),
  )

  // Load record from DB.
  const result = await loadProject(
    db,
    getProjectWithRelations(profile) as never,
    conditions,
    {
      ...event.locals.hub,
      isSuperAdmin: user.superAdmin || false,
      isAdminRequest,
    },
  )

  const normalizedResult = result
    ? {
        ...result,
        properties:
          profile === 'admin'
            ? await listResolvedProjectProperties(db, result.id)
            : 'properties' in result
              ? result.properties
              : undefined,
        capabilities: await mergeOrganisationCapabilities(
          db,
          probe.organisationId as Id,
          result.capabilities,
        ),
      }
    : null

  // Return loaded record with desired profile.
  return toEntityResponseShape(normalizedResult ?? null, profile)
})

export const getProject = getProjectQuery

export const getProjectMapStylesQuery = guardedQuery(
  GetProjectMapStylesSchema,
  async (params, ctx): Promise<{ data: MapStyleResolvedDB[] }> => {
    const { db, event } = ctx
    const environment = event.platform?.env?.ENVIRONMENT

    await syncMapStyleCatalog(db)

    const withResolvedPreviewPath = async (
      rows: MapStyleResolvedDB[],
    ): Promise<MapStyleResolvedDB[]> =>
      await Promise.all(
        rows.map(async row => ({
          ...row,
          previewImagePath: isMapStyleKey(row.code)
            ? await resolveMapStyleRenderPathForKey(environment, row.code)
            : null,
        })),
      )

    if (params.projectId) {
      return {
        data: await withResolvedPreviewPath(
          await listMapStylesForProject(db, params.projectId),
        ),
      }
    }

    if (params.organisationId) {
      const scope = await getOrganisationMapStyleScope(db, params.organisationId)
      return {
        data: scope
          ? await withResolvedPreviewPath(await listMapStylesForScope(db, scope))
          : [],
      }
    }

    return { data: [] }
  },
)

export const getProjectMapStyles = getProjectMapStylesQuery

/**
 * Creates or updates a project and related i18n/role/property rows from form payloads.
 *
 * @param input - Form payload parsed by `ProjectFormData`.
 * @returns A promise resolving to `{ data: { id, modifiedAt } }`.
 * @remarks
 * - `mode` must be explicitly `create` or `update`.
 * - `create` submissions cannot include `meta.id`.
 * - `update` submissions must include `meta.id` and pass optimistic concurrency
 *   via `meta.updatedAt`.
 * - Role membership changes, role capability assignment changes, and project capability
 *   config changes are authorized independently (`manageProjectRoles`,
 *   `assignCapabilities`, `manageCapabilities`).
 */
export const projectForm = guardedForm('unchecked', async (input, ctx) => {
  /* ----------------- */
  // FORM INPUT NORMALIZATION
  /* -------- */

  // Parse and normalize submitted form input.
  const params = ProjectFormData.parse(input)
  const { db, user, userRoles, invalid } = ctx
  const issue = ctx.issue
  const { meta, data } = params

  const projectId = meta?.id?.trim()
  const mode = meta?.mode
  const isSupportedMode = mode === 'create' || mode === 'update'
  if (!isSupportedMode) {
    invalid(issue(toIssueDetailMessage('INVALID_MODE')))
  }
  const normalizedCode = data.code.trim()
  const hasSubmittedUserRoles = Object.hasOwn(data, 'userRoles')
  const submittedRoles =
    hasSubmittedUserRoles && Array.isArray(data.userRoles) ? data.userRoles : []
  const submittedProjectCapabilities = await mergeOrganisationCapabilities(
    db,
    data.organisationId as Id,
    data.capabilities,
  )
  const submittedRolesWithCapabilities = sanitizeSubmittedRoleCapabilities(
    submittedRoles,
    submittedProjectCapabilities,
  )
  const hasSubmittedProperties = Object.hasOwn(data, 'properties')
  const submittedProperties =
    hasSubmittedProperties && Array.isArray(data.properties) ? data.properties : []
  const hasSubmittedLayers = Object.hasOwn(data, 'layers')
  const submittedLayers =
    hasSubmittedLayers && Array.isArray(data.layers) ? data.layers : []
  const toSubmittedDefaultVisible = (input: unknown): boolean =>
    input === true || input === 'true'
  const normalizedSubmittedLayers = submittedLayers
    .map((layer, index) => ({ layer, index }))
    .filter(
      entry => typeof entry.layer?.id === 'string' && entry.layer.id.trim().length > 0,
    )
    .sort((left, right) => {
      const leftRank =
        typeof left.layer.rank === 'number' && Number.isFinite(left.layer.rank)
          ? left.layer.rank
          : left.index
      const rightRank =
        typeof right.layer.rank === 'number' && Number.isFinite(right.layer.rank)
          ? right.layer.rank
          : right.index
      if (leftRank !== rightRank) return leftRank - rightRank
      return left.index - right.index
    })
    .map(({ layer }, rank) => ({
      id: layer.id as Id,
      rank,
      isDefaultVisible: toSubmittedDefaultVisible(layer.isDefaultVisible),
    }))
  const normalizedSubmittedProperties =
    normalizeSubmittedPropertyRanks(submittedProperties)
  const canonicalScopeByPropertyId = await resolveCanonicalScopeByPropertyId(
    db,
    normalizedSubmittedProperties,
  )
  const { local: submittedLocalProperties, inherited: submittedInheritedProperties } =
    splitSubmittedPropertiesByScope(
      normalizedSubmittedProperties,
      canonicalScopeByPropertyId,
    )
  const duplicateSubmittedRoleUserIds = hasSubmittedUserRoles
    ? getDuplicateValues(submittedRoles.map(role => role.userId))
    : []
  const duplicateSubmittedPropertyKeys = getDuplicateValues(
    normalizedSubmittedProperties
      .map(property => property?.key)
      .filter((key): key is string => typeof key === 'string' && key.trim().length > 0),
  )

  /* ----------------- */
  // INVARIANT VALIDATION
  /* -------- */

  // Validate payload invariants.
  if (hasSubmittedUserRoles && submittedRoles.length === 0) {
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
  if (
    hasSubmittedLayers &&
    normalizedSubmittedLayers.length > 0 &&
    !normalizedSubmittedLayers.some(layer => layer.isDefaultVisible)
  ) {
    invalid(issue.data.layers('At least one layer must be visible by default.'))
  }
  if (mode === 'create' && projectId) {
    invalid(issue('CREATE_MODE_CANNOT_INCLUDE_ID'))
  }
  if (mode === 'update' && !projectId) {
    invalid(issue('MISSING_PROJECT_ID'))
  }

  // Create/update mode is explicit and validated above.
  const isCreateMode = mode === 'create'

  /* ----------------- */
  // CREATE FLOW
  /* -------- */

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
      license: data.license,
      capabilities: submittedProjectCapabilities,
      isPublished: false,
      isArchived: false,
    })

    await createI18n(db, data.i18n, created.id)
    await createUserRoles(
      db,
      toUserRoles(submittedRolesWithCapabilities, created.id),
      created.id,
      created.organisationId,
    )
    try {
      await setProjectMapStyleByCode(db, {
        projectId: created.id,
        organisationId: created.organisationId,
        hubId: organisationScope.hubId,
        mapStyleCode: data.mapStyleCode,
      })
    } catch {
      invalid(issue('MAP_STYLE_NOT_AVAILABLE'))
    }

    if (normalizedSubmittedProperties.length > 0) {
      const submittedPropertiesWithProjectId = toSubmittedLocalPropertiesWithProjectId(
        submittedLocalProperties,
        created.id,
      )
      if (submittedPropertiesWithProjectId.length > 0) {
        await upsertProjectProperties(db, submittedPropertiesWithProjectId, created.id)
      }
      await syncProjectInheritedProperties(db, {
        projectId: created.id,
        properties: mergeProjectInheritedPropertySyncItems(
          submittedPropertiesWithProjectId,
          submittedInheritedProperties,
        ),
      })
    }
    await seedDefaultInheritedPropertiesForProject(db, {
      projectId: created.id,
      hubId: organisationScope.hubId,
      startingRank: submittedLocalProperties.length,
    })

    return toCreatedResponseShape(created)
  }

  /* ----------------- */
  // UPDATE FLOW
  /* -------- */

  const targetProjectId = requireValue(projectId, () =>
    invalid(issue('MISSING_PROJECT_ID')),
  ) as Id

  // Load current record for update flow.
  const current = requireValue(await probeProjectForUpdate(db, targetProjectId), () =>
    invalid(issue('PROJECT_NOT_FOUND')),
  )

  // Load the full persisted entity so field-level auth can compare against real DB state.
  const currentWithRelations = requireValue(
    await loadProject<ProjectAdminDBRaw>(
      db,
      getProjectWithRelations('admin') as never,
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
  currentEntity.properties = await listResolvedProjectProperties(db, current.id)
  const licenseTouched = meta?.licenseTouched === true

  /* ----------------- */
  // UPDATE FLOW: DIFF DETECTION
  /* -------- */

  // Read current role assignments so membership/capability changes can be authorized separately.
  const existingRoleRows = hasSubmittedUserRoles
    ? await listUserRoleAssignments(db, current.id)
    : []
  // Detect membership changes (add/remove/swap users or roles) for manage-roles auth checks.
  const roleMembershipChanged = hasSubmittedUserRoles
    ? hasRoleMembershipChanged(
        submittedRoles,
        existingRoleRows,
        toProjectUserRoleSignature,
      )
    : false
  // Detect per-role capability assignment changes for assign-capabilities auth checks.
  const roleCapabilityAssignmentsChanged = hasSubmittedUserRoles
    ? toProjectUserRoleCapabilitiesSignature(
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
    : false
  // Compare normalized i18n payloads so translator-only submissions resolve to i18n field auth.
  const i18nChanged =
    toProjectStableAuthzSignature(data.i18n) !==
    toProjectStableAuthzSignature(normalizeProjectI18nForFormInput(currentEntity.i18n))
  const licenseChanged =
    licenseTouched &&
    toProjectStableAuthzSignature(data.license) !==
      toProjectStableAuthzSignature(currentEntity.license)
  const persistedLicense =
    licenseChanged && currentEntity.isPublished
      ? appendProjectLicenseHistory(data.license, new Date().toISOString())
      : licenseChanged
        ? normalizeProjectLicense(data.license)
        : undefined
  const organisationChanged = data.organisationId !== current.organisationId
  const projectCapabilitiesChanged =
    toProjectStableAuthzSignature(submittedProjectCapabilities) !==
    toProjectStableAuthzSignature(current.capabilities ?? {})
  const authResource = {
    id: current.id,
    organisationId: current.organisationId,
    hubId: current.hubId,
  }

  // Build the submitted field set from actual diffs so authz checks changed fields only.
  const submittedDataForUpdate: Partial<Record<ProjectAuthorizationField, unknown>> = {}
  if (normalizedCode !== current.code) submittedDataForUpdate.code = normalizedCode
  if (i18nChanged) submittedDataForUpdate.i18n = data.i18n
  if (licenseChanged) submittedDataForUpdate.license = data.license
  if (projectCapabilitiesChanged) {
    submittedDataForUpdate.capabilities = submittedProjectCapabilities
  }
  if (roleMembershipChanged || roleCapabilityAssignmentsChanged) {
    submittedDataForUpdate.userRoles = submittedRolesWithCapabilities
  }
  if (hasSubmittedProperties) {
    submittedDataForUpdate.properties = normalizedSubmittedProperties
  }

  /* ----------------- */
  // UPDATE FLOW: AUTHORIZATION
  /* -------- */

  // Apply role-based authorization for core update fields.
  const updateDecision = authorizeProjectUpdateForSubmission({
    user,
    userRoles,
    resource: authResource,
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
      resource: authResource,
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
      resource: authResource,
    })
    if (!assignDecision.allowed) {
      invalid(issue(toIssueDetailMessage(assignDecision.code ?? 'INSUFFICIENT_ROLE')))
    }
  }

  // Allow projects to be assigned to or moved between organisations.
  if (organisationChanged) {
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
      resource: authResource,
    })
    if (!deleteOnSourceDecision.allowed) {
      invalid(
        issue(toIssueDetailMessage(deleteOnSourceDecision.code ?? 'INSUFFICIENT_ROLE')),
      )
    }
  }
  // Perform additional auth checks if capabilities changed.
  if (projectCapabilitiesChanged) {
    const manageCapabilitiesDecision = authorizeProjectManageCapabilitiesForSubmission({
      user,
      userRoles,
      resource: authResource,
    })
    if (!manageCapabilitiesDecision.allowed) {
      invalid(
        issue(
          toIssueDetailMessage(manageCapabilitiesDecision.code ?? 'INSUFFICIENT_ROLE'),
        ),
      )
    }
  }

  /* ----------------- */
  // UPDATE FLOW: CONCURRENCY + UNIQUENESS
  /* -------- */

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

  /* ----------------- */
  // UPDATE FLOW: PERSISTENCE
  /* -------- */

  // Persist main record atomically with optimistic concurrency.
  const persisted = requireValue(
    await updateProjectByIdWithConcurrency(db, {
      id: current.id as Id,
      updatedAt: updatedAt as string,
      data: {
        organisationId: data.organisationId,
        code: normalizedCode,
        ...(persistedLicense ? { license: persistedLicense } : {}),
        capabilities: submittedProjectCapabilities,
      },
    }),
    () => invalid(issue(toIssueDetailMessage('STALE_WRITE'))),
  )

  if (organisationChanged) {
    await cascadeOrganisationToDescendants(db, {
      projectId: current.id as Id,
      organisationId: data.organisationId as Id,
    })
  }
  const targetMapStyleScope = organisationChanged
    ? requireValue(
        await probeOrganisationHubForProject(db, data.organisationId as Id),
        () => invalid(issue('ORGANISATION_NOT_FOUND')),
      )
    : {
        hubId: current.hubId,
      }
  try {
    await setProjectMapStyleByCode(db, {
      projectId: current.id,
      organisationId: data.organisationId,
      hubId: targetMapStyleScope.hubId,
      mapStyleCode: data.mapStyleCode,
    })
  } catch {
    invalid(issue('MAP_STYLE_NOT_AVAILABLE'))
  }

  /* ----------------- */
  // UPDATE FLOW: RELATED RECORD SYNC
  /* -------- */

  // Persist related i18n,role assignments, and properties
  await updateI18n(db, data.i18n, current.id)
  if (
    hasSubmittedUserRoles &&
    (roleMembershipChanged || roleCapabilityAssignmentsChanged)
  ) {
    await syncUserRoles(
      db,
      toUserRoles(submittedRolesWithCapabilities, current.id),
      current.id as Id,
      data.organisationId as Id,
    )
  }

  if (hasSubmittedProperties) {
    const submittedPropertiesWithProjectId = toSubmittedLocalPropertiesWithProjectId(
      submittedLocalProperties,
      current.id,
    )
    const submittedLocalPropertyIds = toSubmittedPropertyIdSet(
      submittedPropertiesWithProjectId,
    )
    const existingLocalProperties = (currentEntity.properties ?? []).filter(
      property => property.scope === 'project',
    )
    const shouldPreserveExistingLocalProperties =
      submittedPropertiesWithProjectId.length === 0 &&
      existingLocalProperties.length > 0
    const preservedLocalProperties = shouldPreserveExistingLocalProperties
      ? toPreservedLocalPropertiesForProject({
          existingLocalProperties,
          submittedLocalPropertyIds,
          projectId: current.id,
        })
      : []
    const localPropertiesToPersist = [
      ...submittedPropertiesWithProjectId,
      ...preservedLocalProperties,
    ]
    await upsertProjectProperties(db, localPropertiesToPersist, current.id)
    await syncProjectInheritedProperties(db, {
      projectId: current.id,
      properties: mergeProjectInheritedPropertySyncItems(
        localPropertiesToPersist,
        submittedInheritedProperties,
      ),
    })
  }
  if (hasSubmittedLayers) {
    await syncProjectLayerPresentation(db, current.id, normalizedSubmittedLayers)
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
    const publishedAt = new Date().toISOString()
    const nextLicense = params.state
      ? appendProjectLicenseHistory(
          normalizeProjectLicense(probed.license),
          publishedAt,
        )
      : undefined
    const persisted = requireValue(
      await updateProjectPublishedStateById(db, {
        id: projectId,
        state: params.state,
        publisherId: user.id,
        publishedAt,
        license: nextLicense,
      }),
      () => {
        throw error(404, 'PROJECT_NOT_FOUND')
      },
    )
    await cascadeProjectPublishedStateToDescendants(db, {
      projectId,
      state: params.state,
    })

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
