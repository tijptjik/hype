// BACKGROUND TRANSLATIONS
import {
  scheduleAutomaticTranslations,
  scheduleFeaturePropertyTranslations,
} from '#lib/api/services/automaticTranslations.js'
// AUTOMATIC TRANSLATIONS
import { prepareAutomaticTranslationSubmission } from '#lib/db/services/automaticTranslation.js'
import { suppliedModelTab } from '#lib/forms/modelTabs.js'
import type { FeatureEntityFormData } from '#lib/db/zod/schema/feature.form.js'
// CONTENT LOCALES
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// DOMAIN
import { TARGET_CONTEXTS } from '#lib/features/locationPolicy.js'
import { sharedLocationEditRights } from './services/locationOwnership'
import { historicalSourceLayerId } from '#lib/db/services/historicalLayers.js'
import type { RemoteQuery } from '$app/server'
import { error } from '@sveltejs/kit'

import { readFeatureIntentPolicy } from '#lib/db/services/featureIntentPolicy.js'
import { requireFeatureType } from '#lib/features/intents.js'
// Register panel query families for bounded single-flight mutation refreshes.
import './resources.remote'
// REMOTE
import {
  guardedBatchByIdQuery,
  guardedCommand,
  guardedForm,
  guardedQuery,
} from '#lib/api/server/guarded.js'

import { eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

// ANALYTICS
import { recordContribution } from '#lib/analytics/productUsage.server.js'
// I18N
import { getLocale } from '#lib/i18n.js'
// UTILS
import { nanoid } from 'nanoid'
// SERVICES
import { updateFeatureRevisionState } from '#lib/db/services/featureStateRevision.js'
// ADDRESS
import { validateAddressDivisionOverrides } from '#lib/db/services/addressDivisions.js'
import { projectFeatureAddress } from '#lib/addresses/featureAddress.js'
// API
import { publicationPreviewConditions } from './services/publicationPreview.js'
import { scheduleFeatureMtr } from '#lib/api/services/feature-mtr.js'
import { getValidQueryParams as validateQueryParams } from '#lib/api/index.js'
import {
  getDuplicateValues,
  requireValue,
  toBooleanStateResponseShape,
  toCreatedResponseShape,
} from '#lib/api/services/index.js'
import {
  getFeatureWithRelations,
  toComparableFeatureProperties,
  toEntityResponseShape,
  toFeatureProfile,
  toListResponseShape,
  toLookupConditions,
  toQueryConditions,
  toRequestedListState,
} from '#lib/api/services/feature.js'
// AUTHORIZATION
import {
  authorizeFeatureAdminReadForProbe,
  authorizeFeatureCreateForSubmission,
  authorizeFeatureDeleteForSubmission,
  authorizeFeatureListForContext,
  authorizeFeaturePublishForSubmission,
  authorizeFeatureReadForProbe,
  authorizeFeatureUpdateForSubmission,
  ensureFeatureCommandAllowed,
  toAuthMessage,
  toIssueDetailMessage,
} from '#lib/api/services/authz/index.js'
// DB
import { readFeaturePresentationPolicy } from '#lib/db/services/featurePresentationPolicy.js'
import {
  createFeatureForm,
  saveUnlinkedFeatureForm,
} from '#lib/db/services/featureFormSave.js'
import { requireLocationOrganisationManager } from '#lib/api/services/locationOwnership.js'
import { saveLinkedFeatureForm } from '#lib/db/services/locationEdit.js'
import {
  featureDestinationGuard,
  reconcileFeatureTransferProperties,
  type FeatureDestinationScope,
} from '#lib/db/services/featureParentTransfer.js'
import {
  saveFeatureFormRevision,
  type FeatureFormPatch,
} from '#lib/db/services/featureFormRevision.js'
import { buildFeatureCommandScopeGuard } from '#lib/db/services/featureCommandScope.js'
import { getInternalPropertyAccess } from '#lib/properties/audience.server.js'
import { validateFeaturePhoneProperties } from '#lib/db/services/feature-property-validation.js'
import {
  getFeature as loadFeature,
  listFeatures,
  probeFeatureForUpdate,
  probeFeatureQuery,
  resolveFeatureCommandProbe,
  updateFeatureArchivedStateById,
  updateFeatureByIdWithConcurrency,
  updateFeaturePublishedStateById,
} from '#lib/db/services/feature.js'
import { probeLayerForUpdate } from '#lib/db/services/layer.js'
import {
  publishAllFeatureImagesExceptResearch,
  publishAllImagesWithPublicIntent,
} from '#lib/db/services/image.js'
// SCHEMA
import { feature } from '#lib/db/schema/index.js'
import { FormBoolean } from '#lib/db/zod/form.js'
import {
  FeatureFormData,
  GetQueryParamsSchema,
  ListQueryParamsSchema,
  PublishFeatureImagesSchema,
  PublishFeatureSchema,
  RemoveFeatureSchema,
} from '#lib/db/zod/index.js'
// TYPES
import type { EntityResponse, Id, ListResponse } from '#lib/types.js'
import type { FeatureBulkStateResult } from '#lib/client/services/bulkEdit.types.js'
import type {
  GuardedCommandContext,
  GuardedQueryContext,
} from '#lib/api/guarded.types.js'
import type {
  FeatureCommandProbe,
  FeatureDB,
  FeatureQueryRowByProfile,
  FeatureEntityByProfile,
  FeatureGetParamsByProfile,
  FeatureListByProfile,
  FeatureListParamsByProfile,
  FeatureProfile,
} from '#lib/db/zod/schema/feature.types.js'

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
// - publishFeatureImages
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
 * @param ctx - Guarded request authorization and database context.
 * @param idsOnly - Skip relation hydration for bounded navigation reads.
 * @returns A promise resolving to a list response with `data`, pagination metadata,
 * sort metadata, and the applied filter summary.
 * @remarks
 * Authorization is evaluated against the requested visibility state before query conditions
 * are built. Prism filters, hub scope, locale-aware sorting, and response profile shaping
 * are then applied in sequence so list reads stay policy-safe and profile-consistent.
 */
async function readFeatureList(
  params: z.infer<typeof ListQueryParamsSchema>,
  ctx: GuardedQueryContext,
  idsOnly = false,
): Promise<
  ListResponse<FeatureListByProfile<FeatureProfile>> | ListResponse<{ id: string }>
> {
  const { db, user, userRoles, isAdminRequest, event } = ctx
  const profile = toFeatureProfile(params.meta?.profile, 'list')

  if ((user.isAnonymous || params.meta?.publicationPreview) && profile === 'admin')
    throw error(403, 'ACCOUNT_REQUIRED')

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
  if (!params.meta?.publicationPreview && !listDecision.allowed) {
    throw error(403, toAuthMessage(listDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  const { conditions, filtersToApply } = params.meta?.publicationPreview
    ? await publicationPreviewConditions(
        ctx,
        params.meta.publicationPreview,
        'feature',
        queryParams,
        params.prisms,
      )
    : toQueryConditions(
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
    idsOnly ? {} : (getFeatureWithRelations(profile) as never),
    conditions,
    {
      ...event.locals.hub,
      isAdminRequest: isAdminRequest && !params.meta?.publicationPreview,
    },
    params.pagination,
    params.sorting,
    {
      q: params.q,
      filtersToApply,
      locale: getLocale(),
      idsOnly,
      publicationPreview: Boolean(params.meta?.publicationPreview),
    },
  )

  if (idsOnly) return result as ListResponse<{ id: string }>

  return (await toListResponseShape(
    {
      ...result,
      sortBy: params.sorting?.sortBy ?? undefined,
      sortOrder: params.sorting?.sortOrder ?? undefined,
      q: params.q ?? undefined,
    },
    profile,
  )) as ListResponse<FeatureListByProfile<typeof profile>>
}

const getFeaturesQuery = guardedQuery(ListQueryParamsSchema, (params, ctx) =>
  readFeatureList(params, ctx),
)

/** Load a bounded page of authorized IDs in the same order as the feature index.
 * @param params Existing feature scope, search, sorting and pagination constraints.
 * @returns Identifiers and traversal metadata, with no images, properties or parent graph.
 * @remarks Every page uses the ordinary list authorization and hub predicates.
 */
export const getFeatureIds = guardedQuery(ListQueryParamsSchema, async (params, ctx) =>
  readFeatureList(
    {
      ...params,
      pagination: {
        ...params.pagination,
        limit: Math.min(params.pagination?.limit ?? 250, 250),
      },
    },
    ctx,
    true,
  ),
) as unknown as (
  params: FeatureListParamsByProfile<'card'>,
) => RemoteQuery<ListResponse<{ id: string }>>

export const getFeatures = getFeaturesQuery as unknown as <
  P extends FeatureProfile = 'list',
>(
  params: FeatureListParamsByProfile<P>,
) => RemoteQuery<ListResponse<FeatureListByProfile<P>>>

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

  if ((user.isAnonymous || params.meta?.publicationPreview) && profile === 'admin')
    throw error(403, 'ACCOUNT_REQUIRED')

  const normalizedParams = { ...params, refKey: 'id' as const }
  const probe = await probeFeatureQuery(db, normalizedParams)

  if (!probe) {
    return toEntityResponseShape(null, profile)
  }

  const readDecision = authorizeFeatureReadForProbe({
    user,
    userRoles,
    probe,
  })
  if (!params.meta?.publicationPreview && !readDecision.allowed) {
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
  const { conditions } = params.meta?.publicationPreview
    ? await publicationPreviewConditions(
        ctx,
        params.meta.publicationPreview,
        'feature',
        queryParams,
      )
    : toQueryConditions(
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
    {
      ...event.locals.hub,
      isAdminRequest: isAdminRequest && !params.meta?.publicationPreview,
    },
    { publicationPreview: Boolean(params.meta?.publicationPreview) },
  )

  return toEntityResponseShape(result as never, profile)
})

export const getFeature = getFeatureQuery as unknown as <
  P extends FeatureProfile = 'detail',
>(
  params: FeatureGetParamsByProfile<P>,
) => RemoteQuery<EntityResponse<FeatureEntityByProfile<P>>>

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

  if (!ctx.isAdminRequest) {
    throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
  }

  const probes = await Promise.all(
    ids.map(id => probeFeatureQuery(db, { ref: id, refKey: 'id' })),
  )
  const probeById = new Map(
    probes
      .filter((probe): probe is NonNullable<typeof probe> => probe !== null)
      .map(probe => [probe.id, probe]),
  )

  const readableIds = ids.filter(id => {
    const probe = probeById.get(id)

    if (!probe) return false

    const decision = authorizeFeatureAdminReadForProbe({ user, userRoles, probe })

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
      { ...event.locals.hub, isAdminRequest: true },
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
 * - Parent and relation writes commit atomically, coordinated with Location associations.
 */
export const featureForm = guardedForm('unchecked', async (input, ctx) => {
  const { db, user, userRoles, invalid } = ctx
  // In-progress form values must return field issues, not throw a server error.
  const parsed = FeatureFormData.safeParse(input)
  if (!parsed.success) return invalid(...parsed.error.issues)
  const params = parsed.data
  /** Validate signed metadata only after the owning authorization check. */
  async function prepareTranslations(): Promise<void> {
    await prepareAutomaticTranslationSubmission({
      db: ctx.db,
      resource: 'feature',
      id: params.meta?.id,
      rows: data.i18n,
      actorId: ctx.user.id,
      secret: ctx.event.locals.platform?.env.AUTH_SECRET,
    })
    for (const property of data.properties ?? []) {
      await prepareAutomaticTranslationSubmission({
        db,
        resource: 'featureProperty',
        id: params.meta?.id,
        propertyId: property.propertyId,
        rows: property.i18n,
        actorId: user.id,
        secret: ctx.event.locals.platform?.env.AUTH_SECRET,
      })
    }
  }
  const issue = ctx.issue
  const { meta } = params
  let data: FeatureFormPatch = { ...params.data }
  if (params.meta?.mode === 'create' || data.geometry !== undefined)
    data.geometry = normalizeFeatureFormGeometry(data.geometry)
  if (data.geometry !== undefined && data.i18n !== undefined)
    data = projectFeatureAddress({ ...data, geometry: data.geometry, i18n: data.i18n })
  const hasSubmittedProperties = suppliedModelTab(params, 'fields', 'properties')

  if (
    data.addressMeta?.address?.divisionOverrides ||
    data.addressMeta?.address?.source.divisionOverrides
  ) {
    await validateAddressDivisionOverrides(db, {
      ...data.addressMeta.address.source.divisionOverrides,
      ...data.addressMeta.address.divisionOverrides,
    })
  }

  const featureId = meta?.id?.trim()
  const mode = meta?.mode
  const isSupportedMode = mode === 'create' || mode === 'update'
  if (!isSupportedMode) {
    invalid(issue(toIssueDetailMessage('INVALID_MODE')))
  }

  if (mode === 'create' && (data.locationBrandEdit || data.locationReset))
    invalid(issue('Inheritance requires an existing linked Feature'))

  let submittedProperties = Array.isArray(data.properties) ? data.properties : []
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

  if (mode === 'create') {
    // Creation uses the complete validated entity, while updates may omit tabs.
    const createData = data as ReturnType<typeof FeatureEntityFormData.parse>
    const layerScope = requireValue(
      await probeLayerForUpdate(db, createData.layerId as Id),
      () => invalid(issue('LAYER_NOT_FOUND')),
    )
    const resolvedOrganisationId = layerScope.organisationId
    const resolvedProjectId = layerScope.projectId

    const createDecision = authorizeFeatureCreateForSubmission({
      user,
      userRoles,
      resource: {
        organisationId: resolvedOrganisationId,
        projectId: resolvedProjectId,
        layerId: createData.layerId,
        resourceHubId: layerScope.hubId,
      },
      submittedData: createData,
    })
    if (!createDecision.allowed) {
      invalid(issue(toIssueDetailMessage(createDecision.code ?? 'INSUFFICIENT_ROLE')))
    }
    await prepareTranslations()

    try {
      submittedProperties = await validateFeaturePhoneProperties(
        db,
        submittedProperties,
        (await getInternalPropertyAccess(ctx)).allowed,
        createData.layerId,
      )
    } catch (error) {
      invalid(
        issue.data.properties(error instanceof Error ? error.message : String(error)),
      )
    }

    if (await historicalSourceLayerId(db, createData.layerId))
      invalid(issue('HISTORICAL_LAYER_MEMBERSHIP_AUTOMATIC'))
    let nameTemplate:
      | import('#lib/features/locationPolicy.js').FeatureNameTemplate
      | null = null
    try {
      const policy = await readFeatureIntentPolicy(db, {
        type: 'layer',
        id: createData.layerId,
      })
      const selected = requireFeatureType(policy.types, createData.featureType)
      createData.featureType = selected.id
      createData.kind =
        selected.kind ?? (selected.id === 'business' ? 'place' : 'object')
      createData.associationRelation =
        selected.relation ?? (createData.kind === 'place' ? 'represents' : 'locatedAt')
      const contexts =
        selected.targetContexts ??
        TARGET_CONTEXTS.filter(kind => selected.locationKinds.includes(kind))
      createData.targetContext =
        createData.targetContext ?? (contexts.length === 1 ? contexts[0] : null)
      if (createData.targetContext && !contexts.includes(createData.targetContext))
        throw new Error('Choose a location context available for this layer.')
      if (selected.nameRule || createData.associationRelation === 'represents') {
        nameTemplate = {
          rule: selected.nameRule ?? { base: 'location', conditions: [] },
        }
      }
    } catch (cause) {
      invalid(issue(cause instanceof Error ? cause.message : 'Invalid feature type'))
    }
    // Store localized authoring inputs beside the computed translation title.
    for (const [locale, row] of Object.entries(createData.i18n)) {
      Object.assign(row, {
        baseName: row.title,
        nameOverride: nameTemplate
          ? (createData.nameOverrides?.[canonicalContentTag(locale)] ?? null)
          : null,
      })
    }
    const presentationPolicy = await readFeaturePresentationPolicy(
      db,
      createData.layerId,
    )
    if (!presentationPolicy.allowDescriptions) {
      for (const row of Object.values(createData.i18n)) row.description = ''
    }
    // Coordinate-only Features remain valid; Location-based naming is a separate preference.
    const inheritsLocationName =
      presentationPolicy.locationBasedNames || createData.locationNameMode === 'inherit'
    // Address-only Locations supply the title when no venue name was provided.
    if (
      inheritsLocationName &&
      !Object.values(createData.i18n).some(row => row.title?.trim())
    )
      for (const row of Object.values(createData.i18n))
        row.title = row.displayAddress?.trim() ?? ''
    const created = await createFeatureForm(db, {
      revisionActor: { actorId: user.id, mode: 'staff' },
      data: {
        ...createData,
        nameTemplate,
        id: featureId || nanoid(12),
        organisationId: resolvedOrganisationId,
        projectId: resolvedProjectId,
        contributorId: createData.contributorId ?? user.id ?? null,
        addressMeta: createData.addressMeta ?? {},
        isPublished: false,
        isArchived: false,
      },
      i18n: createData.i18n,
      properties: submittedProperties,
    })

    if (!created.isDraft)
      recordContribution(ctx.event.locals, 'contribution.new_feature', created.id)
    scheduleFeatureMtr(ctx.event.locals.platform, created.id)
    scheduleAutomaticTranslations(ctx, 'feature', created.id, params.data.i18n)
    scheduleFeaturePropertyTranslations(ctx, created.id, params.data.properties)
    return toCreatedResponseShape(created)
  }

  const targetFeatureId = requireValue(featureId, () =>
    invalid(issue('MISSING_FEATURE_ID')),
  )
  const current = requireValue(
    await probeFeatureForUpdate(db, targetFeatureId as Id),
    () => invalid(issue('FEATURE_NOT_FOUND')),
  )
  if (data.featureType !== undefined && data.featureType !== current.featureType)
    invalid(issue('Changing the feature type requires an explicit reclassification.'))
  data.featureType = current.featureType
  for (const key of ['kind', 'targetContext', 'associationRelation'] as const) {
    if (data[key] !== undefined && data[key] !== current[key])
      invalid(issue('Changing location intent requires explicit reclassification.'))
    Object.assign(data, { [key]: current[key] })
  }
  // Omitted ancestry is resolved from the authorized persisted identity, never a default.
  data.layerId ??= current.layerId
  data.projectId ??= current.projectId
  data.organisationId ??= current.organisationId
  let destinationScope: FeatureDestinationScope | undefined
  const parentsChanged =
    data.layerId !== current.layerId ||
    data.projectId !== current.projectId ||
    data.organisationId !== current.organisationId

  // Authorize scalar changes before loading the relation-heavy admin shape.
  const submittedDataBeforeHydration: Record<string, unknown> =
    data.i18n === undefined ? {} : { i18n: data.i18n }
  if (parentsChanged) {
    submittedDataBeforeHydration.layerId = data.layerId
  }
  // Property snapshots need persisted relations for comparison; the final gate below
  // checks their actual changes so unchanged values do not block translators.
  if (
    data.geometry !== undefined &&
    JSON.stringify(data.geometry ?? null) !== JSON.stringify(current.geometry ?? null)
  ) {
    submittedDataBeforeHydration.geometry = data.geometry
  }
  if (
    data.addressMeta !== undefined &&
    JSON.stringify(data.addressMeta ?? null) !==
      JSON.stringify(current.addressMeta ?? null)
  ) {
    submittedDataBeforeHydration.addressMeta = data.addressMeta
  }
  if (
    data.isIntangible !== undefined &&
    Boolean(data.isIntangible) !== Boolean(current.isIntangible)
  ) {
    submittedDataBeforeHydration.isIntangible = data.isIntangible
  }
  if (
    data.isVisitable !== undefined &&
    Boolean(data.isVisitable) !== Boolean(current.isVisitable)
  ) {
    submittedDataBeforeHydration.isVisitable = data.isVisitable
  }
  if (
    data.isPendingReview !== undefined &&
    Boolean(data.isPendingReview) !== Boolean(current.isPendingReview)
  ) {
    submittedDataBeforeHydration.isPendingReview = data.isPendingReview
  }

  // Authorize reset intent by its affected field groups before reading accepted source values.
  if (data.locationBrandEdit || data.locationReset?.phoneNumber)
    submittedDataBeforeHydration.properties = []
  if (data.locationReset?.location) {
    submittedDataBeforeHydration.geometry = data.geometry
    submittedDataBeforeHydration.addressMeta = data.addressMeta
  }
  const preliminaryUpdateDecision = authorizeFeatureUpdateForSubmission({
    user,
    userRoles,
    resource: {
      id: current.id,
      organisationId: current.organisationId,
      projectId: current.projectId,
      layerId: current.layerId,
      resourceHubId: current.resourceHubId,
      isArchived: current.isArchived,
    },
    submittedData: submittedDataBeforeHydration,
  })
  if (!preliminaryUpdateDecision.allowed) {
    invalid(
      issue(
        toIssueDetailMessage(preliminaryUpdateDecision.code ?? 'INSUFFICIENT_ROLE'),
      ),
    )
  }
  await prepareTranslations()

  // Authorize the source first, then resolve and independently authorize the destination.
  if (parentsChanged) {
    const destination = requireValue(
      await probeLayerForUpdate(db, data.layerId as Id),
      () => invalid(issue('LAYER_NOT_FOUND')),
    )
    if (
      destination.organisationId !== data.organisationId ||
      destination.projectId !== data.projectId
    )
      invalid(issue(toIssueDetailMessage('FIELD_FORBIDDEN')))
    destinationScope = {
      organisationId: destination.organisationId,
      projectId: destination.projectId,
      layerId: data.layerId,
      resourceHubId: destination.hubId,
    }
    const destinationDecision = authorizeFeatureCreateForSubmission({
      user,
      userRoles,
      resource: destinationScope,
      submittedData: { layerId: data.layerId },
    })
    if (!destinationDecision.allowed)
      invalid(
        issue(toIssueDetailMessage(destinationDecision.code ?? 'INSUFFICIENT_ROLE')),
      )
  }
  const resolvedOrganisationId =
    destinationScope?.organisationId ?? current.organisationId
  const resolvedProjectId = destinationScope?.projectId ?? current.projectId

  const currentWithRelations = requireValue(
    await loadFeature<FeatureQueryRowByProfile<'admin'>>(
      db,
      getFeatureWithRelations('admin'),
      [eq(feature.id, current.id)],
      {
        ...ctx.event.locals.hub,
        isSuperAdmin: user.superAdmin || false,
        isAdminRequest: ctx.isAdminRequest,
      },
    ),
    () => invalid(issue('FEATURE_NOT_FOUND')),
  )

  const currentEntity = requireValue(
    (await toEntityResponseShape(currentWithRelations, 'admin')).data,
    () => invalid(issue('FEATURE_NOT_FOUND')),
  )
  // A transfer reconciles retained values even when the Fields tab was not edited.
  if (parentsChanged && !hasSubmittedProperties)
    submittedProperties = (currentEntity.properties ?? []) as typeof submittedProperties
  // Project a submitted location against accepted translations without requiring Profile controls.
  if (data.geometry !== undefined || data.addressMeta !== undefined) {
    const projected = projectFeatureAddress({
      ...data,
      geometry: data.geometry ?? current.geometry ?? {},
      addressMeta:
        data.addressMeta === undefined ? current.addressMeta : data.addressMeta,
      i18n:
        data.i18n ??
        Object.fromEntries(
          Object.entries(currentEntity.i18n ?? {}).map(([locale, row]) => [
            locale,
            {
              ...row,
              autoTranslated: row.autoTranslated ?? undefined,
              translationProvenance: row.translationProvenance ?? undefined,
              description: row.description ?? undefined,
              displayAddress: row.displayAddress ?? undefined,
            },
          ]),
        ),
    })
    data = {
      ...data,
      addressMeta: projected.addressMeta,
      // Location-only edits project address text without reauthoring accepted names or descriptions.
      i18n: data.i18n
        ? projected.i18n
        : Object.fromEntries(
            Object.entries(projected.i18n).map(([locale, row]) => [
              locale,
              {
                displayAddress: row.displayAddress,
                displayAddressGen: row.displayAddressGen,
                addressProperties: row.addressProperties,
              },
            ]),
          ),
    }
  }
  // Disabled description authoring retains existing content instead of erasing it.
  const presentationPolicy = await readFeaturePresentationPolicy(
    db,
    data.layerId ?? current.layerId,
  )
  if (!presentationPolicy.allowDescriptions) {
    for (const [locale, row] of Object.entries(data.i18n ?? {})) {
      const previous = currentEntity.i18n?.[locale as keyof typeof currentEntity.i18n]
      row.description = previous?.description ?? ''
      row.descriptionGen = previous?.descriptionGen ?? true
    }
  }
  const i18nChanged =
    data.i18n !== undefined &&
    JSON.stringify(data.i18n) !== JSON.stringify(currentEntity.i18n ?? {})
  const propertiesChanged =
    hasSubmittedProperties &&
    JSON.stringify(toComparableFeatureProperties(submittedProperties)) !==
      JSON.stringify(
        toComparableFeatureProperties((currentEntity.properties ?? []) as never[]),
      )
  const geometryChanged =
    data.geometry !== undefined &&
    data.geometry !== undefined &&
    JSON.stringify(data.geometry ?? null) !== JSON.stringify(current.geometry ?? null)
  const addressChanged =
    data.addressMeta !== undefined &&
    data.addressMeta !== undefined &&
    JSON.stringify(data.addressMeta ?? null) !==
      JSON.stringify(current.addressMeta ?? null)
  const intangibleChanged =
    data.isIntangible !== undefined &&
    Boolean(data.isIntangible) !== Boolean(current.isIntangible)
  const visitableChanged =
    data.isVisitable !== undefined &&
    Boolean(data.isVisitable) !== Boolean(current.isVisitable)
  const pendingReviewChanged =
    data.isPendingReview !== undefined &&
    Boolean(data.isPendingReview) !== Boolean(current.isPendingReview)
  const submittedDataForUpdate: Record<string, unknown> = {}

  if (parentsChanged) submittedDataForUpdate.layerId = data.layerId

  if (i18nChanged || data.locationReset?.names.length || data.locationNameMode)
    submittedDataForUpdate.i18n = data.i18n
  if (propertiesChanged || data.locationBrandEdit || data.locationReset?.phoneNumber)
    submittedDataForUpdate.properties = submittedProperties
  if (geometryChanged || data.locationReset?.location)
    submittedDataForUpdate.geometry = data.geometry
  if (addressChanged || data.locationReset?.location)
    submittedDataForUpdate.addressMeta = data.addressMeta
  if (intangibleChanged) submittedDataForUpdate.isIntangible = data.isIntangible
  if (visitableChanged) submittedDataForUpdate.isVisitable = data.isVisitable

  if (pendingReviewChanged) {
    submittedDataForUpdate.isPendingReview = data.isPendingReview
  }

  const updateDecision = authorizeFeatureUpdateForSubmission({
    user,
    userRoles,
    resource: {
      id: current.id,
      organisationId: current.organisationId,
      projectId: current.projectId,
      layerId: current.layerId,
      resourceHubId: current.resourceHubId,
      isArchived: current.isArchived,
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

  if (destinationScope) {
    submittedProperties = (
      await reconcileFeatureTransferProperties(
        db,
        current.id,
        destinationScope,
        submittedProperties,
        (
          await getInternalPropertyAccess(ctx)
        ).allowed,
      )
    ).properties
  }

  if (propertiesChanged || data.layerId !== current.layerId) {
    try {
      submittedProperties = await validateFeaturePhoneProperties(
        db,
        submittedProperties,
        destinationScope
          ? new Set(submittedProperties.map(row => row.propertyId))
          : (await getInternalPropertyAccess(ctx)).allowed,
        data.layerId,
      )
    } catch (error) {
      invalid(
        issue.data.properties(error instanceof Error ? error.message : String(error)),
      )
    }
  }

  if (
    data.layerId !== current.layerId &&
    (await historicalSourceLayerId(db, data.layerId ?? current.layerId))
  )
    invalid(issue('HISTORICAL_LAYER_MEMBERSHIP_AUTOMATIC'))

  const saveInput = {
    featureId: current.id,
    projectId: current.projectId,
    actorId: user.id,
    updatedAt,
    destinationScope,
    allowedInternalIds: (await getInternalPropertyAccess(ctx)).allowed,
    scopeGuard: destinationScope
      ? sql`(${buildFeatureCommandScopeGuard(db, current.id, current)}) AND (${featureDestinationGuard(destinationScope)})`
      : undefined,
    data: {
      organisationId: resolvedOrganisationId,
      projectId: resolvedProjectId,
      layerId: data.layerId,
      contributorId: data.contributorId ?? current.contributorId ?? null,
      geometry: data.geometry,
      addressMeta:
        data.addressMeta === undefined ? undefined : (data.addressMeta ?? {}),
      isIntangible: data.isIntangible,
      isVisitable: data.isVisitable,
      isPendingReview: data.isPendingReview,
    },
    i18n: data.i18n ?? {},
    properties: propertiesChanged || destinationScope ? submittedProperties : undefined,
    locationBrandEdit: data.locationBrandEdit,
    locationReset: data.locationReset,
    locationNameMode: presentationPolicy.locationBasedNames
      ? ('inherit' as const)
      : data.locationNameMode,
    authorizeDestinationLocation: () =>
      requireLocationOrganisationManager(ctx, resolvedOrganisationId),
    authorizeLocationCorrection: () =>
      requireLocationOrganisationManager(ctx, current.organisationId),
  }
  // Authorized staff saves update accepted content directly, including translation-only edits.
  try {
    const revision = await saveFeatureFormRevision(db, {
      ...saveInput,
      data: {
        ...data,
        properties:
          hasSubmittedProperties || destinationScope ? submittedProperties : undefined,
      },
      authorizeSharedCorrection: () => sharedLocationEditRights(ctx, current.projectId),
      expectedScope: current,
      guard: buildFeatureCommandScopeGuard(db, current.id, current),
      destinationScope,
      revisionBoundary: Boolean(destinationScope),
      reason: destinationScope
        ? `Feature transferred from ${current.organisationId}/${current.projectId}/${current.layerId} to ${resolvedOrganisationId}/${resolvedProjectId}/${data.layerId}`
        : undefined,
      canPublish: authorizeFeaturePublishForSubmission({
        user,
        userRoles,
        resource: current,
      }).allowed,
      allowDescriptions: presentationPolicy.allowDescriptions,
      allowedInternalIds: (await getInternalPropertyAccess(ctx)).allowed,
    })
    if (revision.status === 'applied') {
      if (!currentWithRelations.isDraft)
        recordContribution(ctx.event.locals, 'contribution.edit', current.id)
      if (geometryChanged) scheduleFeatureMtr(ctx.event.locals.platform, current.id)
      scheduleAutomaticTranslations(ctx, 'feature', current.id, params.data.i18n)
      scheduleFeaturePropertyTranslations(ctx, current.id, params.data.properties)
      return { data: { id: current.id }, revisionApplied: revision.revisionId }
    }
  } catch (cause) {
    invalid(
      issue(
        cause instanceof Error ? cause.message : 'Feature changes could not be saved',
      ),
    )
  }
  const linkedSave = await saveLinkedFeatureForm(db, saveInput)
  if (linkedSave.status === 'conflict')
    invalid(issue(toIssueDetailMessage('STALE_WRITE')))
  if (linkedSave.status === 'review')
    invalid(issue(`Location-linked feature requires review: ${linkedSave.reason}`))
  if (linkedSave.status === 'saved') {
    if (!linkedSave.feature.isDraft)
      recordContribution(ctx.event.locals, 'contribution.edit', linkedSave.feature.id)
    if (linkedSave.geometryChanged)
      scheduleFeatureMtr(ctx.event.locals.platform, linkedSave.feature.id)
    scheduleAutomaticTranslations(
      ctx,
      'feature',
      linkedSave.feature.id,
      params.data.i18n,
    )
    return toCreatedResponseShape(linkedSave.feature)
  }

  const persisted = requireValue(await saveUnlinkedFeatureForm(db, saveInput), () =>
    invalid(issue(toIssueDetailMessage('STALE_WRITE'))),
  )

  if (!persisted.isDraft)
    recordContribution(ctx.event.locals, 'contribution.edit', persisted.id)
  if (geometryChanged) scheduleFeatureMtr(ctx.event.locals.platform, persisted.id)
  scheduleAutomaticTranslations(ctx, 'feature', persisted.id, params.data.i18n)
  scheduleFeaturePropertyTranslations(ctx, persisted.id, params.data.properties)
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
 * publish flag, and applies the project image policies through the database service
 * when switching to `true`.
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
        expectedScope: probed,
        state: params.state,
        publisherId: user.id,
      }),
      () => {
        throw error(404, 'FEATURE_NOT_FOUND')
      },
    )

    return toBooleanStateResponseShape(persisted, 'isPublished')
  },
)

/**
 * Publishes every active non-research image assigned to an already published Feature.
 * @param params The Feature id and request metadata.
 * @returns A promise resolving to the published Feature id.
 * @remarks Uses the same persisted hierarchy authorization as feature publication so the
 * follow-up editor action cannot bypass project publish permissions.
 */
export const publishFeatureImages = guardedCommand(
  PublishFeatureImagesSchema,
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

    const published = await publishAllFeatureImagesExceptResearch(
      db,
      featureId,
      user.id as Id,
      probed,
    )
    if (!published) throw error(409, 'STALE_FEATURE_PUBLICATION_SCOPE')
    return { data: { id: featureId } }
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
        expectedScope: probed,
        state: params.state,
        actorId: user.id,
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
      isArchived: current.isArchived,
    },
    submittedData: params.data,
  })
  if (!updateDecision.allowed) {
    throw error(403, toIssueDetailMessage(updateDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  const revisionState = await updateFeatureRevisionState(db, {
    featureId: params.id,
    updatedAt: current.modifiedAt,
    data: params.data,
    actorId: user.id,
    guard: buildFeatureCommandScopeGuard(db, params.id, current),
  })
  if (revisionState.status === 'updated')
    return requireValue(revisionState.feature, () => {
      throw error(409, 'STALE_WRITE')
    })
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
        expectedScope: probed,
        state: params.value,
        publisherId: user.id,
      }),
      () => {
        throw error(404, 'FEATURE_NOT_FOUND')
      },
    )

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
        expectedScope: probed,
        state: params.value,
        actorId: user.id,
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
 * Applies a bounded bulk edit as a command with independent per-row outcomes.
 * @param updates Feature identities, state fields, values and explicit admin intent.
 * @returns Results in input order, including failures for individual rows.
 * @remarks Commands cannot be retained or replayed by native query refreshes.
 * Each row uses its own admin intent; the batch does not confer another row's scope.
 */
export const updateFeatureBulkState = guardedCommand(
  z.array(BulkFeatureStateSchema).min(1).max(100),
  async (updates, ctx): Promise<FeatureBulkStateResult[]> =>
    Promise.all(
      updates.map(async params => {
        try {
          const data = await applyFeatureBulkStateField(params, {
            ...ctx,
            isAdminRequest: params.meta?.isAdminRequest === true,
          })
          return { id: params.id as Id, ok: true, data }
        } catch (err) {
          return {
            id: params.id as Id,
            ok: false,
            error: toFeatureBulkStateErrorMessage(err),
          }
        }
      }),
    ),
)
