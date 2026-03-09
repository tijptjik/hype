// REMOTE
import { guardedCommand, guardedForm, guardedQuery } from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
// UTILS
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
// AUTHORIZATION
import {
  authorizeLayerCreateForSubmission,
  authorizeLayerDeleteForSubmission,
  authorizeLayerListForContext,
  authorizeLayerPublishForSubmission,
  authorizeLayerReadForProbe,
  authorizeLayerUpdateForSubmission,
  ensureLayerCommandAllowed,
  toAuthMessage,
  toIssueDetailMessage,
} from '$lib/api/services/authz'
// SERVICES
import {
  getDuplicateValues,
  requireValue,
  toStableSignature,
  toBooleanStateResponseShape,
  toCreatedResponseShape,
} from '$lib/api/services'
import {
  getLayerWithRelations,
  toComparableLayerProperties,
  toEntityResponseShape,
  toListResponseShape,
  toLayerProfile,
  toLayerPrisms,
  toLookupConditions,
  toQueryConditions,
  toRequestedListState,
} from '$lib/api/services/layer'
// DB
import {
  createI18n,
  createLayer,
  getLayer as loadLayer,
  listLayers,
  probeLayerForUpdate,
  probeLayerQuery,
  resolveLayerCommandProbe,
  updateProperties,
  updateI18n,
  updateLayerArchivedStateById,
  updateLayerByIdWithConcurrency,
  updateLayerPublishedStateById,
} from '$lib/db/services/layer'
import { probeProjectForUpdate } from '$lib/db/services/project'
// SCHEMA
import { layer } from '$lib/db/schema'
import {
  GetQueryParamsSchema,
  LayerFormData,
  ListQueryParamsSchema,
  PublishLayerSchema,
  RemoveLayerSchema,
} from '$lib/db/zod'
import type {
  EntityResponse,
  Id,
  LayerCommandProbe,
  LayerDB,
  LayerEntityByProfile,
  LayerGetParamsByProfile,
  LayerListByProfile,
  LayerListParamsByProfile,
  LayerProfile,
  ListResponse,
  RelationShape,
} from '$lib/types'
import { getValidQueryParams as validateQueryParams } from '$lib/api'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// GET
// - getLayers
// - getLayer
//
// FORM
// - layerForm
//
// COMMAND
// - publishLayer
// - archiveLayer

/**
 * Returns a role-aware layer collection for guarded remote callers.
 *
 * @param params - List query params validated by `ListQueryParamsSchema`.
 * @param params.conditions - Optional typed filters for layer columns.
 * @param params.prisms - Optional prism scope filters (`organisation`, `project`, `layer`).
 * @param params.pagination - Optional pagination controls (`limit`, `offset`).
 * @param params.sorting - Optional sorting controls.
 * @param params.q - Optional text query applied by the DB list service.
 * @param params.meta - Optional request metadata.
 * @param params.meta.profile - Optional response profile (`list`, `card`, `detail`, `admin`).
 * @returns A promise resolving to list response `{ data, limit, offset, totalCount }`.
 * @remarks
 * Authorization is evaluated against requested visibility state before query conditions
 * are built. Prism filters and hub scope are then applied to keep list reads policy-safe.
 */
const getLayersQuery = guardedQuery(ListQueryParamsSchema, async (params, ctx) => {
  const { db, user, userRoles, isAdminRequest, event } = ctx
  const profile = toLayerProfile(params.meta?.profile, 'list')

  const queryParams = validateQueryParams<LayerDB>(
    layer,
    params.conditions as Partial<LayerDB> | undefined,
  )
  const requestedListState = toRequestedListState(queryParams as Partial<LayerDB>)
  const normalizedPrisms = toLayerPrisms(params.prisms)

  const listDecision = authorizeLayerListForContext({
    user,
    userRoles,
    requestedListState,
    resourceHubId: event.locals.hub.id ?? null,
  })
  if (!listDecision.allowed) {
    throw error(403, toAuthMessage(listDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  const { conditions, filtersToApply } = toQueryConditions(
    db,
    user,
    isAdminRequest,
    queryParams,
    userRoles,
    normalizedPrisms,
    event.locals.hub.id ?? null,
  )

  const result = await listLayers(
    db,
    getLayerWithRelations(profile, Boolean(user.superAdmin)) as RelationShape,
    conditions,
    event.locals.hub,
    params.pagination,
    params.sorting,
    {
      q: params.q,
      filtersToApply,
    },
  )

  return toListResponseShape(result, profile)
})

export const getLayers = getLayersQuery as typeof getLayersQuery &
  (<P extends LayerProfile = 'list'>(
    params: LayerListParamsByProfile<P>,
  ) => Promise<ListResponse<LayerListByProfile<P>>>)

/**
 * Returns a single role-aware layer record for guarded remote callers.
 *
 * @param params - Lookup params validated by `GetQueryParamsSchema`.
 * @param params.ref - Layer identifier value.
 * @param params.refKey - Ignored for this resource; layer reads are id-scoped.
 * @param params.meta - Optional request metadata.
 * @param params.meta.profile - Optional response profile (`list`, `card`, `detail`, `admin`).
 * @returns A promise resolving to `{ data }`, where `data` is the matched layer or `null`.
 * @remarks
 * Performs a minimal probe first (`id`, `organisationId`, `projectId`, `hubId`,
 * `isPublished`, `isArchived`) so authorization can run on persisted state before loading
 * the full relation shape.
 */
const getLayerQuery = guardedQuery(GetQueryParamsSchema, async (params, ctx) => {
  const { db, user, userRoles, isAdminRequest, event } = ctx
  const profile = toLayerProfile(params.meta?.profile, 'detail')
  const normalizedParams = {
    ...params,
    refKey: 'id' as const,
  }

  const probe = await probeLayerQuery(db, normalizedParams)
  if (!probe) {
    return toEntityResponseShape(null, profile)
  }

  const readDecision = authorizeLayerReadForProbe({
    user,
    userRoles,
    probe,
  })
  if (!readDecision.allowed) {
    throw error(403, toAuthMessage(readDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  const queryParams = validateQueryParams<LayerDB>(
    layer,
    toLookupConditions(normalizedParams),
    {
      isPublished: probe.isPublished,
      isArchived: probe.isArchived,
    } as Partial<LayerDB>,
  )

  const { conditions } = toQueryConditions(
    db,
    user,
    isAdminRequest,
    queryParams,
    userRoles,
    undefined,
    event.locals.hub.id ?? null,
  )

  const result = await loadLayer(
    db,
    getLayerWithRelations(profile, Boolean(user.superAdmin)) as RelationShape,
    conditions,
    event.locals.hub,
  )

  return toEntityResponseShape(result ?? null, profile)
})

export const getLayer = getLayerQuery as typeof getLayerQuery &
  (<P extends LayerProfile = 'detail'>(
    params: LayerGetParamsByProfile<P>,
  ) => Promise<EntityResponse<LayerEntityByProfile<P>>>)

/**
 * Creates or updates a layer and related records from remote form payload.
 *
 * @param input - Raw form payload parsed by `LayerFormData`.
 * @returns A promise resolving to `{ data: { id, modifiedAt } }`.
 * @remarks
 * - `mode` must be explicitly `create` or `update`.
 * - `create` submissions cannot include `meta.id`.
 * - `update` submissions must include `meta.id` and pass optimistic concurrency via
 *   `meta.updatedAt`.
 * - Field-level authorization is evaluated against a computed changed-field subset to
 *   avoid requiring unrelated permissions.
 */
export const layerForm = guardedForm('unchecked', async (input, ctx) => {
  const params = LayerFormData.parse(input)
  const { db, user, userRoles, invalid } = ctx
  const issue = ctx.issue
  const { meta, data } = params

  const layerId = meta?.id?.trim()
  const mode = meta?.mode
  const isSupportedMode = mode === 'create' || mode === 'update'
  if (!isSupportedMode) {
    invalid(issue(toIssueDetailMessage('INVALID_MODE')))
  }

  const submittedProperties = (
    Array.isArray(data.properties) ? data.properties : []
  ) as Array<{
    propertyId: string
    isVisible?: boolean
    isUserContributable?: boolean
  }>
  const hasSubmittedProperties = submittedProperties.length > 0

  const duplicateSubmittedPropertyIds = getDuplicateValues(
    submittedProperties
      .map(property => property?.propertyId)
      .filter(
        (propertyId): propertyId is string =>
          typeof propertyId === 'string' && propertyId.trim().length > 0,
      ),
  )

  if (duplicateSubmittedPropertyIds.length > 0) {
    invalid(
      issue.data.properties(
        `INVALID: Duplicate properties submitted (${Array.from(new Set(duplicateSubmittedPropertyIds)).join(', ')})`,
      ),
    )
  }

  if (mode === 'create' && layerId) {
    invalid(issue('CREATE_MODE_CANNOT_INCLUDE_ID'))
  }
  if (mode === 'update' && !layerId) {
    invalid(issue('MISSING_LAYER_ID'))
  }

  const projectScope = requireValue(
    await probeProjectForUpdate(db, data.projectId as Id),
    () => invalid(issue('PROJECT_NOT_FOUND')),
  )
  const resolvedOrganisationId = projectScope.organisationId

  const isCreateMode = mode === 'create'

  if (isCreateMode) {
    const createDecision = authorizeLayerCreateForSubmission({
      user,
      userRoles,
      resource: {
        organisationId: resolvedOrganisationId,
        projectId: data.projectId,
        hubId: projectScope.hubId,
      },
      submittedData: data,
    })
    if (!createDecision.allowed) {
      invalid(issue(toIssueDetailMessage(createDecision.code ?? 'INSUFFICIENT_ROLE')))
    }

    const created = await createLayer(db, {
      id: nanoid(12),
      organisationId: resolvedOrganisationId,
      projectId: data.projectId,
      metadata: data.metadata,
      isDefaultVisible: data.isDefaultVisible,
      isPublished: false,
      isArchived: false,
    })
    await createI18n(db, data.i18n, created.id)

    await updateProperties(db, created.id, submittedProperties)

    return toCreatedResponseShape(created)
  }

  const targetLayerId = requireValue(layerId, () =>
    invalid(issue('MISSING_LAYER_ID')),
  ) as Id

  const current = requireValue(await probeLayerForUpdate(db, targetLayerId), () =>
    invalid(issue('LAYER_NOT_FOUND')),
  )

  const currentWithRelations = requireValue(
    await loadLayer(
      db,
      getLayerWithRelations('admin', Boolean(user.superAdmin)) as RelationShape,
      [eq(layer.id, current.id)],
      {
        ...ctx.event.locals.hub,
        isSuperAdmin: user.superAdmin || false,
        isAdminRequest: ctx.isAdminRequest,
      },
    ),
    () => invalid(issue('LAYER_NOT_FOUND')),
  )

  const currentEntity = requireValue(
    (await toEntityResponseShape(currentWithRelations, 'admin')).data,
    () => invalid(issue('LAYER_NOT_FOUND')),
  )

  const i18nChanged =
    toStableSignature(data.i18n) !== toStableSignature(currentEntity.i18n ?? {})
  const propertiesChanged =
    hasSubmittedProperties &&
    toStableSignature(toComparableLayerProperties(submittedProperties)) !==
      toStableSignature(toComparableLayerProperties(currentEntity.properties ?? []))
  const metadataChanged =
    toStableSignature(data.metadata ?? {}) !== toStableSignature(current.metadata ?? {})
  const defaultVisibilityChanged =
    Boolean(data.isDefaultVisible) !== Boolean(currentEntity.isDefaultVisible)

  const submittedDataForUpdate: Record<string, unknown> = {}
  if (i18nChanged) submittedDataForUpdate.i18n = data.i18n
  if (propertiesChanged) submittedDataForUpdate.properties = submittedProperties
  if (metadataChanged) submittedDataForUpdate.metadata = data.metadata
  if (defaultVisibilityChanged) {
    submittedDataForUpdate.isDefaultVisible = data.isDefaultVisible
  }

  const updateDecision = authorizeLayerUpdateForSubmission({
    user,
    userRoles,
    resource: {
      id: current.id,
      organisationId: current.organisationId,
      projectId: current.projectId,
      hubId: current.hubId,
    },
    submittedData: submittedDataForUpdate,
  })
  if (!updateDecision.allowed) {
    invalid(issue(toIssueDetailMessage(updateDecision.code ?? 'INSUFFICIENT_ROLE')))
  }

  const updatedAt = requireValue(meta?.updatedAt, () =>
    invalid(issue(toIssueDetailMessage('STALE_WRITE'))),
  )
  if (updatedAt !== current.modifiedAt) {
    invalid(issue(toIssueDetailMessage('STALE_WRITE')))
  }

  const persisted = requireValue(
    await updateLayerByIdWithConcurrency(db, {
      id: current.id as Id,
      updatedAt,
      data: {
        organisationId: resolvedOrganisationId,
        projectId: data.projectId,
        metadata: data.metadata,
        isDefaultVisible: data.isDefaultVisible,
      },
    }),
    () => invalid(issue(toIssueDetailMessage('STALE_WRITE'))),
  )
  await updateI18n(db, data.i18n, current.id)

  if (propertiesChanged) {
    await updateProperties(db, current.id, submittedProperties)
  }

  return toCreatedResponseShape(persisted)
})

/**
 * Toggles layer publish state after role-based authorization.
 *
 * @param params - Command payload validated by `PublishLayerSchema`.
 * @param params.id - Target layer id.
 * @param params.state - Next publish state.
 * @returns A promise resolving to `{ data: { id, isPublished } }`.
 */
export const publishLayer = guardedCommand(PublishLayerSchema, async (params, ctx) => {
  const { db, user, userRoles } = ctx
  const layerId = params.id as Id

  const probed = await resolveLayerCommandProbe(db, layerId, () => {
    throw error(404, 'LAYER_NOT_FOUND')
  })

  ensureLayerCommandAllowed(
    authorizeLayerPublishForSubmission({
      user,
      userRoles,
      resource: {
        id: probed.id,
        organisationId: probed.organisationId,
        projectId: probed.projectId,
        hubId: probed.hubId,
      },
    }),
    toIssueDetailMessage,
  )

  const persisted = requireValue(
    await updateLayerPublishedStateById(db, {
      id: layerId,
      state: params.state,
      publisherId: user.id,
    }),
    () => {
      throw error(404, 'LAYER_NOT_FOUND')
    },
  )

  return toBooleanStateResponseShape(persisted, 'isPublished')
})

/**
 * Toggles layer archived state after role-based authorization.
 *
 * @param params - Command payload validated by `RemoveLayerSchema`.
 * @param params.id - Target layer id.
 * @param params.state - Next archived state.
 * @returns A promise resolving to `{ data: { id, isArchived } }`.
 */
export const archiveLayer = guardedCommand(RemoveLayerSchema, async (params, ctx) => {
  const { db, user, userRoles } = ctx
  const layerId = params.id as Id

  const probed = requireValue(
    (await resolveLayerCommandProbe(db, layerId, () => {
      throw error(404, 'LAYER_NOT_FOUND')
    })) as LayerCommandProbe,
    () => {
      throw error(404, 'LAYER_NOT_FOUND')
    },
  )

  ensureLayerCommandAllowed(
    authorizeLayerDeleteForSubmission({
      user,
      userRoles,
      resource: {
        id: probed.id,
        organisationId: probed.organisationId,
        projectId: probed.projectId,
        hubId: probed.hubId,
      },
    }),
    toIssueDetailMessage,
  )

  const persisted = requireValue(
    await updateLayerArchivedStateById(db, {
      id: layerId,
      state: params.state,
    }),
    () => {
      throw error(404, 'LAYER_NOT_FOUND')
    },
  )

  return toBooleanStateResponseShape(persisted, 'isArchived')
})
