// REMOTE
import {
  guardedBatchQuery,
  guardedBatchByIdQuery,
  guardedCommand,
  guardedForm,
  guardedQuery,
} from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
import { inArray } from 'drizzle-orm'
import { z } from 'zod'
// I18N
import { getLocale } from '$lib/i18n'
// UTILS
import { nanoid } from 'nanoid'
// API
import { getValidQueryParams as validateQueryParams } from '$lib/api'
import {
  getDuplicateValues,
  requireValue,
  toBooleanStateResponseShape,
  toCreatedResponseShape,
} from '$lib/api/services'
import {
  getFeatureWithRelations,
  toComparableFeatureProperties,
  toEntityResponseShape,
  toFeatureProfile,
  toListResponseShape,
  toLookupConditions,
  toQueryConditions,
  toRequestedListState,
} from '$lib/api/services/feature'
// AUTHORIZATION
import {
  authorizeFeatureCreateForSubmission,
  authorizeFeatureDeleteForSubmission,
  authorizeFeatureListForContext,
  authorizeFeaturePublishForSubmission,
  authorizeFeatureReadForProbe,
  authorizeFeatureUpdateForSubmission,
  ensureFeatureCommandAllowed,
  toAuthMessage,
  toIssueDetailMessage,
} from '$lib/api/services/authz'
// DB
import {
  createFeature,
  createI18n,
  createProperties,
  getFeature as loadFeature,
  listFeatures,
  probeFeatureForUpdate,
  probeFeatureQuery,
  resolveFeatureCommandProbe,
  updateFeatureArchivedStateById,
  updateFeatureByIdWithConcurrency,
  updateFeaturePublishedStateById,
  updateI18n,
  updateProperties,
} from '$lib/db/services/feature'
import { probeLayerForUpdate } from '$lib/db/services/layer'
import { publishAllImagesWithPublicIntent } from '$lib/db/services/image'
// SCHEMA
import { feature } from '$lib/db/schema'
import { FormBoolean } from '$lib/db/zod/form'
import {
  FeatureFormData,
  GetQueryParamsSchema,
  ListQueryParamsSchema,
  PublishFeatureSchema,
  RemoveFeatureSchema,
} from '$lib/db/zod'
// TYPES
import type {
  EntityResponse,
  FeatureBulkStateResult,
  GuardedCommandContext,
  GuardedQueryContext,
  Id,
  ListResponse,
} from '$lib/types'
import type {
  FeatureCommandProbe,
  FeatureDB,
  FeatureEntityByProfile,
  FeatureGetParamsByProfile,
  FeatureListByProfile,
  FeatureListParamsByProfile,
  FeatureProfile,
} from '$lib/db/zod/schema/feature.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// GET
// - getFeatures
// - getFeature
// - getFeatureForImport
//
// FORM
// - featureForm
//
// COMMAND
// - publishFeature
// - archiveFeature
// - updateFeatureState
// - updateFeatureBulkState

const PatchFeatureStateSchema = z.object({
  id: z.string().min(1),
  data: z.object({
    isPublished: FormBoolean.optional(),
    isArchived: FormBoolean.optional(),
    isIntangible: FormBoolean.optional(),
    isVisitable: FormBoolean.optional(),
    isPendingReview: FormBoolean.optional(),
  }),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

const BulkFeatureStateSchema = z.object({
  id: z.string().min(1),
  field: z.enum(['isPublished', 'isArchived', 'isIntangible', 'isVisitable']),
  value: FormBoolean,
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

const ImportFeatureLookupSchema = z.object({
  id: z.string().min(1),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

const IMPORT_FEATURE_LOOKUP_BATCH_SIZE = 80

/**
 * Normalizes GeoJSON point coordinates after form parsing.
 *
 * @param geometry - Parsed geometry payload from the feature form.
 * @returns Geometry with numeric point coordinates when possible.
 * @remarks FormData submissions can serialize nested numbers as strings; D1 spatial
 * consumers expect persisted GeoJSON coordinates to remain numeric.
 */
function normalizeFeatureFormGeometry<T>(geometry: T): T {
  const point = geometry as { type?: unknown; coordinates?: unknown }
  if (point?.type !== 'Point' || !Array.isArray(point.coordinates)) {
    return geometry
  }

  const longitude = Number(point.coordinates[0])
  const latitude = Number(point.coordinates[1])
  if (Number.isNaN(longitude) || Number.isNaN(latitude)) {
    return geometry
  }

  return {
    ...point,
    type: 'Point',
    coordinates: [longitude, latitude],
  } as T
}

/**
 * Splits dynamic feature id lists into D1-safe batches for relation-heavy admin reads.
 *
 * @param ids - Authorized feature identifiers to load.
 * @returns Ordered chunks sized below Cloudflare D1's 100-parameter ceiling.
 */
function chunkImportFeatureLookupIds(ids: string[]): string[][] {
  const chunks: string[][] = []

  for (let index = 0; index < ids.length; index += IMPORT_FEATURE_LOOKUP_BATCH_SIZE) {
    chunks.push(ids.slice(index, index + IMPORT_FEATURE_LOOKUP_BATCH_SIZE))
  }

  return chunks
}

/**
 * Returns a role-aware feature collection for guarded remote callers.
 *
 * @param params - List query params validated by `ListQueryParamsSchema`.
 * @param params.conditions - Optional typed filters for feature columns.
 * @param params.prisms - Optional prism scope filters (`organisation`, `project`, `layer`).
 * @param params.pagination - Optional pagination controls (`limit`, `offset`).
 * @param params.sorting - Optional sorting controls, including locale-aware i18n fields.
 * @param params.q - Optional text query applied by the DB list service.
 * @param params.meta - Optional request metadata.
 * @param params.meta.profile - Optional response profile (`list`, `card`, `detail`, `admin`).
 * @returns A promise resolving to a list response with `data`, pagination metadata,
 * sort metadata, and the applied filter summary.
 * @remarks
 * Authorization is evaluated against the requested visibility state before query conditions
 * are built. Prism filters, hub scope, locale-aware sorting, and response profile shaping
 * are then applied in sequence so list reads stay policy-safe and profile-consistent.
 */
const getFeaturesQuery = guardedQuery(ListQueryParamsSchema, async (params, ctx) => {
  const { db, user, userRoles, isAdminRequest, event } = ctx
  const profile = toFeatureProfile(params.meta?.profile, 'list')

  const queryParams = validateQueryParams<FeatureDB>(
    feature,
    params.conditions as Partial<FeatureDB> | undefined,
  )
  const requestedListState = toRequestedListState(queryParams as Partial<FeatureDB>)

  const listDecision = authorizeFeatureListForContext({
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
    params.prisms as never,
    event.locals.hub.id ?? null,
  )

  const result = await listFeatures(
    db,
    getFeatureWithRelations(profile) as never,
    conditions,
    event.locals.hub,
    params.pagination,
    params.sorting,
    {
      q: params.q,
      filtersToApply,
      locale: getLocale(),
    },
  )

  return (await toListResponseShape(
    {
      ...result,
      sortBy: params.sorting?.sortBy ?? undefined,
      sortOrder: params.sorting?.sortOrder ?? undefined,
      q: params.q ?? undefined,
    },
    profile,
  )) as ListResponse<FeatureListByProfile<typeof profile>>
})

export const getFeatures = getFeaturesQuery as typeof getFeaturesQuery &
  (<P extends FeatureProfile = 'list'>(
    params: FeatureListParamsByProfile<P>,
  ) => Promise<ListResponse<FeatureListByProfile<P>>>)

/**
 * Returns a single role-aware feature record for guarded remote callers.
 *
 * @param params - Lookup params validated by `GetQueryParamsSchema`.
 * @param params.ref - Feature identifier value.
 * @param params.refKey - Ignored for this resource; feature reads are id-scoped.
 * @param params.meta - Optional request metadata.
 * @param params.meta.profile - Optional response profile (`list`, `card`, `detail`, `admin`).
 * @returns A promise resolving to `{ data }`, where `data` is the matched feature for the
 * requested profile or `null` when no persisted row matches `params.ref`.
 * @remarks
 * Performs a minimal probe first (`id`, `organisationId`, `projectId`, `layerId`,
 * `resourceHubId`, `isPublished`, `isArchived`) so authorization can run on persisted
 * state before loading the full relation graph for the requested profile.
 */
const getFeatureQuery = guardedQuery(GetQueryParamsSchema, async (params, ctx) => {
  const { db, user, userRoles, isAdminRequest, event } = ctx
  const profile = toFeatureProfile(params.meta?.profile, 'detail')
  const normalizedParams = {
    ...params,
    refKey: 'id' as const,
  }

  const probe = await probeFeatureQuery(db, normalizedParams)
  if (!probe) {
    return toEntityResponseShape(null, profile)
  }

  const readDecision = authorizeFeatureReadForProbe({
    user,
    userRoles,
    probe,
  })
  if (!readDecision.allowed) {
    throw error(403, toAuthMessage(readDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  const queryParams = validateQueryParams<FeatureDB>(
    feature,
    toLookupConditions(normalizedParams),
    {
      isPublished: probe.isPublished,
      isArchived: probe.isArchived,
    } as Partial<FeatureDB>,
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

  const result = await loadFeature(
    db,
    getFeatureWithRelations(profile) as never,
    conditions,
    event.locals.hub,
  )

  return toEntityResponseShape(result as never, profile)
})

export const getFeature = getFeatureQuery as typeof getFeatureQuery &
  (<P extends FeatureProfile = 'detail'>(
    params: FeatureGetParamsByProfile<P>,
  ) => Promise<EntityResponse<FeatureEntityByProfile<P>>>)

/**
 * Batched admin lookup used by CSV import reconciliation.
 *
 * @param params.id - Feature id to resolve.
 * @param params.meta - Optional request metadata.
 * @returns A promise resolving to `{ data }` with the admin profile feature or `null`.
 * @remarks
 * Call this query concurrently for many ids so SvelteKit can collapse them into a
 * single batched remote request.
 */
export const getFeatureForImport = guardedBatchByIdQuery<
  typeof ImportFeatureLookupSchema,
  EntityResponse<FeatureEntityByProfile<'admin'>>
>(ImportFeatureLookupSchema, async ({ ids, ctx }) => {
  const { db, user, userRoles, event } = ctx

  const probes = await Promise.all(
    ids.map(id =>
      probeFeatureQuery(db, {
        ref: id,
        refKey: 'id',
      }),
    ),
  )
  const probeById = new Map(
    probes
      .filter((probe): probe is NonNullable<typeof probe> => probe !== null)
      .map(probe => [probe.id, probe]),
  )

  const readableIds = ids.filter(id => {
    const probe = probeById.get(id)
    if (!probe) return false

    const decision = authorizeFeatureReadForProbe({
      user,
      userRoles,
      probe,
    })

    return decision.allowed
  })

  // Chunk the authorized ids so the relation-heavy admin read stays under D1's
  // 100 bound-parameter limit during batched import resolution lookups.
  const loadedRows: FeatureEntityByProfile<'admin'>[] = []

  for (const readableIdBatch of chunkImportFeatureLookupIds(readableIds)) {
    const batchResult = await listFeatures(
      db,
      getFeatureWithRelations('admin') as never,
      [inArray(feature.id, readableIdBatch as Id[])],
      event.locals.hub,
      {
        limit: readableIdBatch.length,
        offset: 0,
      },
      undefined,
      {
        locale: getLocale(),
      },
    )

    loadedRows.push(...(batchResult.data as FeatureEntityByProfile<'admin'>[]))
  }

  const byId = new Map(
    loadedRows.map(row => [
      (row as { id: string }).id,
      row as FeatureEntityByProfile<'admin'>,
    ]),
  )

  const envelopes = await Promise.all(
    ids.map(async id => [
      id,
      (await toEntityResponseShape((byId.get(id) ?? null) as never, 'admin')) as never,
    ]),
  )
  const envelopeById = new Map(
    envelopes as Array<[string, EntityResponse<FeatureEntityByProfile<'admin'>>]>,
  )

  return arg => envelopeById.get(arg.id) ?? { data: null }
})

/**
 * Creates or updates a feature and related i18n/property rows from remote form payload.
 *
 * @param input - Raw form payload parsed by `FeatureFormData`.
 * @returns A promise resolving to `{ data: { id, modifiedAt } }` for the persisted feature.
 * @remarks
 * - `mode` must be explicitly `create` or `update`.
 * - `create` submissions may include `meta.id` to persist a caller-supplied feature id.
 * - `update` submissions must include `meta.id` and pass optimistic concurrency via
 *   `meta.updatedAt`.
 * - Layer scope is resolved first so organisation/project ancestry comes from persisted
 *   hierarchy, not the submitted payload.
 * - Duplicate property ids are rejected before any write occurs.
 * - Authorization is evaluated against a changed-field subset on update so unrelated
 *   permissions are not required for no-op fields.
 * - The mutation path persists the core feature row first, then synchronizes i18n and
 *   property relations through the DB relation helpers.
 */
export const featureForm = guardedForm('unchecked', async (input, ctx) => {
  const params = FeatureFormData.parse(input)
  const { db, user, userRoles, invalid } = ctx
  const issue = ctx.issue
  const { meta } = params
  const data = {
    ...params.data,
    geometry: normalizeFeatureFormGeometry(params.data.geometry),
  }

  const featureId = meta?.id?.trim()
  const mode = meta?.mode
  const isSupportedMode = mode === 'create' || mode === 'update'
  if (!isSupportedMode) {
    invalid(issue(toIssueDetailMessage('INVALID_MODE')))
  }

  const submittedProperties = Array.isArray(data.properties) ? data.properties : []
  const duplicatePropertyIds = getDuplicateValues(
    submittedProperties
      .map(property => property?.propertyId)
      .filter(
        (propertyId): propertyId is string =>
          typeof propertyId === 'string' && propertyId.trim().length > 0,
      ),
  )
  if (duplicatePropertyIds.length > 0) {
    invalid(
      issue.data.properties(
        `INVALID: Duplicate properties submitted (${Array.from(new Set(duplicatePropertyIds)).join(', ')})`,
      ),
    )
  }

  if (mode === 'update' && !featureId) {
    invalid(issue('MISSING_FEATURE_ID'))
  }

  const layerScope = requireValue(
    await probeLayerForUpdate(db, data.layerId as Id),
    () => invalid(issue('LAYER_NOT_FOUND')),
  )
  const resolvedOrganisationId = layerScope.organisationId
  const resolvedProjectId = layerScope.projectId

  if (mode === 'create') {
    const createDecision = authorizeFeatureCreateForSubmission({
      user,
      userRoles,
      resource: {
        organisationId: resolvedOrganisationId,
        projectId: resolvedProjectId,
        layerId: data.layerId,
        resourceHubId: layerScope.hubId,
      },
      submittedData: data,
    })
    if (!createDecision.allowed) {
      invalid(issue(toIssueDetailMessage(createDecision.code ?? 'INSUFFICIENT_ROLE')))
    }

    const created = await createFeature(db, {
      ...data,
      id: featureId || nanoid(12),
      organisationId: resolvedOrganisationId,
      projectId: resolvedProjectId,
      contributorId: data.contributorId ?? user.id ?? null,
      addressMeta: data.addressMeta ?? {},
      isPublished: false,
      isArchived: false,
    })
    await createI18n(db, data.i18n, created.id)
    await createProperties(db, created.id, submittedProperties)

    return toCreatedResponseShape(created)
  }

  const targetFeatureId = requireValue(featureId, () =>
    invalid(issue('MISSING_FEATURE_ID')),
  )
  const current = requireValue(
    await probeFeatureForUpdate(db, targetFeatureId as Id),
    () => invalid(issue('FEATURE_NOT_FOUND')),
  )

  const currentEntity = requireValue(
    (
      await getFeature({
        ref: current.id,
        refKey: 'id',
        meta: { isAdminRequest: true, profile: 'admin' },
      })
    ).data,
    () => invalid(issue('FEATURE_NOT_FOUND')),
  )

  const i18nChanged =
    JSON.stringify(data.i18n) !== JSON.stringify(currentEntity.i18n ?? {})
  const propertiesChanged =
    JSON.stringify(toComparableFeatureProperties(submittedProperties)) !==
    JSON.stringify(
      toComparableFeatureProperties((currentEntity.properties ?? []) as never[]),
    )
  const geometryChanged =
    JSON.stringify(data.geometry ?? null) !== JSON.stringify(current.geometry ?? null)
  const addressChanged =
    JSON.stringify(data.addressMeta ?? null) !==
    JSON.stringify(current.addressMeta ?? null)
  const intangibleChanged = Boolean(data.isIntangible) !== Boolean(current.isIntangible)
  const visitableChanged = Boolean(data.isVisitable) !== Boolean(current.isVisitable)

  const submittedDataForUpdate: Record<string, unknown> = {}
  if (i18nChanged) submittedDataForUpdate.i18n = data.i18n
  if (propertiesChanged) submittedDataForUpdate.properties = submittedProperties
  if (geometryChanged) submittedDataForUpdate.geometry = data.geometry
  if (addressChanged) submittedDataForUpdate.addressMeta = data.addressMeta
  if (intangibleChanged) submittedDataForUpdate.isIntangible = data.isIntangible
  if (visitableChanged) submittedDataForUpdate.isVisitable = data.isVisitable

  const updateDecision = authorizeFeatureUpdateForSubmission({
    user,
    userRoles,
    resource: {
      id: current.id,
      organisationId: current.organisationId,
      projectId: current.projectId,
      layerId: current.layerId,
      resourceHubId: current.resourceHubId,
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
    await updateFeatureByIdWithConcurrency(db, {
      id: current.id as Id,
      updatedAt,
      data: {
        organisationId: resolvedOrganisationId,
        projectId: resolvedProjectId,
        layerId: data.layerId,
        contributorId: data.contributorId ?? current.contributorId ?? null,
        geometry: data.geometry,
        addressMeta: data.addressMeta ?? {},
        isIntangible: data.isIntangible,
        isVisitable: data.isVisitable,
        isPendingReview: data.isPendingReview,
      },
    }),
    () => invalid(issue(toIssueDetailMessage('STALE_WRITE'))),
  )

  await updateI18n(db, data.i18n, current.id as Id)
  await updateProperties(db, submittedProperties, current.id as Id)

  return toCreatedResponseShape(persisted)
})

/**
 * Toggles feature publish state after role-based authorization.
 *
 * @param params - Command payload validated by `PublishFeatureSchema`.
 * @param params.id - Target feature id.
 * @param params.state - Next publish state.
 * @returns A promise resolving to `{ data: { id, isPublished } }`.
 * @remarks
 * Runs a command probe first, authorizes against persisted hierarchy state, persists the
 * publish flag, and publishes all public-intent images when switching to `true` so image
 * visibility stays consistent with the feature publish transition.
 */
export const publishFeature = guardedCommand(
  PublishFeatureSchema,
  async (params, ctx) => {
    const { db, user, userRoles } = ctx
    const featureId = params.id as Id

    const probed = (await resolveFeatureCommandProbe(db, featureId, () => {
      throw error(404, 'FEATURE_NOT_FOUND')
    })) as FeatureCommandProbe

    ensureFeatureCommandAllowed(
      authorizeFeaturePublishForSubmission({
        user,
        userRoles,
        resource: {
          id: probed.id,
          organisationId: probed.organisationId,
          projectId: probed.projectId,
          layerId: probed.layerId,
          resourceHubId: probed.resourceHubId,
        },
      }),
      toIssueDetailMessage,
    )

    const persisted = requireValue(
      await updateFeaturePublishedStateById(db, {
        id: featureId,
        state: params.state,
        publisherId: user.id,
      }),
      () => {
        throw error(404, 'FEATURE_NOT_FOUND')
      },
    )

    if (params.state) {
      await publishAllImagesWithPublicIntent(db, featureId, user.id as Id)
    }

    return toBooleanStateResponseShape(persisted, 'isPublished')
  },
)

/**
 * Toggles feature archived state after role-based authorization.
 *
 * @param params - Command payload validated by `RemoveFeatureSchema`.
 * @param params.id - Target feature id.
 * @param params.state - Next archived state.
 * @returns A promise resolving to `{ data: { id, isArchived } }`.
 * @remarks
 * Runs a command probe first so authorization executes against persisted hierarchy scope
 * before the archive flag is updated. This command only mutates archive state and returns
 * the minimal boolean state payload expected by admin toggle flows.
 */
export const archiveFeature = guardedCommand(
  RemoveFeatureSchema,
  async (params, ctx) => {
    const { db, user, userRoles } = ctx
    const featureId = params.id as Id

    const probed = (await resolveFeatureCommandProbe(db, featureId, () => {
      throw error(404, 'FEATURE_NOT_FOUND')
    })) as FeatureCommandProbe

    ensureFeatureCommandAllowed(
      authorizeFeatureDeleteForSubmission({
        user,
        userRoles,
        resource: {
          id: probed.id,
          organisationId: probed.organisationId,
          projectId: probed.projectId,
          layerId: probed.layerId,
          resourceHubId: probed.resourceHubId,
        },
      }),
      toIssueDetailMessage,
    )

    const persisted = requireValue(
      await updateFeatureArchivedStateById(db, {
        id: featureId,
        state: params.state,
      }),
      () => {
        throw error(404, 'FEATURE_NOT_FOUND')
      },
    )

    return toBooleanStateResponseShape(persisted, 'isArchived')
  },
)

/**
 * Applies the task-oriented feature state patch used by non-form update flows.
 *
 * @param params - Feature id and partial feature-state data to persist.
 * @param ctx - Guarded command/query context with DB, user, and role state.
 * @returns The persisted feature row.
 * @remarks
 * The current feature row is probed immediately before update so authorization and
 * optimistic concurrency are both evaluated against the same persisted hierarchy state.
 */
async function applyFeatureStatePatch(
  params: z.infer<typeof PatchFeatureStateSchema>,
  ctx: GuardedCommandContext | GuardedQueryContext,
): Promise<FeatureDB> {
  const { db, user, userRoles } = ctx

  const current = requireValue(await probeFeatureForUpdate(db, params.id as Id), () => {
    throw error(404, 'FEATURE_NOT_FOUND')
  })

  const updateDecision = authorizeFeatureUpdateForSubmission({
    user,
    userRoles,
    resource: {
      id: current.id,
      organisationId: current.organisationId,
      projectId: current.projectId,
      layerId: current.layerId,
      resourceHubId: current.resourceHubId,
    },
    submittedData: params.data,
  })
  if (!updateDecision.allowed) {
    throw error(403, toIssueDetailMessage(updateDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  const persisted = requireValue(
    await updateFeatureByIdWithConcurrency(db, {
      id: params.id as Id,
      updatedAt: current.modifiedAt,
      data: params.data,
    }),
    () => {
      throw error(409, 'STALE_WRITE')
    },
  )

  if (params.data.isPublished === true) {
    await publishAllImagesWithPublicIntent(db, params.id as Id, user.id as Id)
  }

  return persisted
}

/**
 * Applies a single field-oriented bulk state update.
 *
 * @param params - Feature id, state field, and boolean value to apply.
 * @param ctx - Guarded query context for the batched remote call.
 * @returns The persisted feature row after the state change.
 * @remarks
 * Publish/archive fields deliberately use the dedicated command semantics so publisher
 * metadata and public-intent image side effects remain consistent with single-feature
 * admin actions. Archive changes are exposed only to super admins in bulk mode.
 */
async function applyFeatureBulkStateField(
  params: z.infer<typeof BulkFeatureStateSchema>,
  ctx: GuardedQueryContext,
): Promise<FeatureDB> {
  const { db, user, userRoles } = ctx
  const featureId = params.id as Id

  if (params.field === 'isPublished') {
    const probed = (await resolveFeatureCommandProbe(db, featureId, () => {
      throw error(404, 'FEATURE_NOT_FOUND')
    })) as FeatureCommandProbe

    ensureFeatureCommandAllowed(
      authorizeFeaturePublishForSubmission({
        user,
        userRoles,
        resource: {
          id: probed.id,
          organisationId: probed.organisationId,
          projectId: probed.projectId,
          layerId: probed.layerId,
          resourceHubId: probed.resourceHubId,
        },
      }),
      toIssueDetailMessage,
    )

    const persisted = requireValue(
      await updateFeaturePublishedStateById(db, {
        id: featureId,
        state: params.value,
        publisherId: user.id,
      }),
      () => {
        throw error(404, 'FEATURE_NOT_FOUND')
      },
    )

    if (params.value) {
      await publishAllImagesWithPublicIntent(db, featureId, user.id as Id)
    }

    return persisted
  }

  if (params.field === 'isArchived') {
    if (!user.superAdmin) {
      throw error(403, toIssueDetailMessage('INSUFFICIENT_ROLE'))
    }

    const probed = (await resolveFeatureCommandProbe(db, featureId, () => {
      throw error(404, 'FEATURE_NOT_FOUND')
    })) as FeatureCommandProbe

    ensureFeatureCommandAllowed(
      authorizeFeatureDeleteForSubmission({
        user,
        userRoles,
        resource: {
          id: probed.id,
          organisationId: probed.organisationId,
          projectId: probed.projectId,
          layerId: probed.layerId,
          resourceHubId: probed.resourceHubId,
        },
      }),
      toIssueDetailMessage,
    )

    const persisted = requireValue(
      await updateFeatureArchivedStateById(db, {
        id: featureId,
        state: params.value,
      }),
      () => {
        throw error(404, 'FEATURE_NOT_FOUND')
      },
    )

    return persisted
  }

  return applyFeatureStatePatch(
    {
      id: params.id,
      data: {
        [params.field]: params.value,
      },
      meta: params.meta,
    },
    ctx,
  )
}

/**
 * Converts a per-row bulk update exception into a stable row-level error string.
 *
 * @param err - Unknown exception thrown while processing one feature row.
 * @returns A concise error message suitable for row result state and toasts.
 */
function toFeatureBulkStateErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'FEATURE_UPDATE_FAILED'

  if (
    'body' in err &&
    err.body &&
    typeof err.body === 'object' &&
    'message' in err.body &&
    typeof err.body.message === 'string'
  ) {
    return err.body.message
  }

  if ('message' in err && typeof err.message === 'string') {
    return err.message
  }

  return 'FEATURE_UPDATE_FAILED'
}

/**
 * Applies task-oriented partial feature state updates.
 *
 * @param params - Command payload validated by `PatchFeatureStateSchema`.
 * @param params.id - Target feature id.
 * @param params.data - Partial state fields to persist (`isPublished`, `isArchived`,
 * `isIntangible`, `isVisitable`, `isPendingReview`).
 * @returns A promise resolving to `{ data }`, where `data` is the persisted feature row
 * returned by the concurrency-safe DB update helper.
 * @remarks
 * This is the non-form mutation path used by task-oriented flows. It still probes current
 * state first, authorizes against persisted hierarchy scope, and writes through the same
 * optimistic-concurrency update helper as the main form flow. When `isPublished` is set to
 * `true`, public-intent images are also published to keep downstream task state coherent.
 */
export const updateFeatureState = guardedCommand(
  PatchFeatureStateSchema,
  async (params, ctx) => {
    return { data: await applyFeatureStatePatch(params, ctx) }
  },
)

/**
 * Applies feature state updates in a batched remote query for bulk admin editing.
 *
 * @param params.id - Feature id to update.
 * @param params.field - Boolean state field to change.
 * @param params.value - Boolean value to persist for the field.
 * @returns A per-row result object containing either the persisted feature row or an error.
 * @remarks
 * Call this query concurrently for up to 100 selected feature ids; SvelteKit collapses
 * those calls into a single `query.batch` request while preserving row-level results.
 */
export const updateFeatureBulkState = guardedBatchQuery(
  BulkFeatureStateSchema,
  async (outputs, ctx) => {
    const resultEntries: Array<readonly [string, FeatureBulkStateResult]> =
      await Promise.all(
        outputs.map(async params => {
          const key = `${params.id}:${params.field}:${params.value}`

          try {
            const data = await applyFeatureBulkStateField(params, ctx)
            const result: FeatureBulkStateResult = {
              id: params.id as Id,
              ok: true,
              data,
            }
            return [key, result] as const
          } catch (err) {
            const result: FeatureBulkStateResult = {
              id: params.id as Id,
              ok: false,
              error: toFeatureBulkStateErrorMessage(err),
            }
            return [key, result] as const
          }
        }),
      )
    const resultsByKey = new Map(resultEntries)

    return params =>
      resultsByKey.get(`${params.id}:${params.field}:${params.value}`) ?? {
        id: params.id as Id,
        ok: false,
        error: 'FEATURE_UPDATE_FAILED',
      }
  },
)
