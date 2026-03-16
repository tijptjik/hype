// NANOID
import { nanoid } from 'nanoid'
// DRIZZLE
import {
  and,
  eq,
  exists,
  inArray,
  or,
  sql,
  type InferInsertModel,
  type SQL,
} from 'drizzle-orm'
// DB
import {
  firstOrNull,
  resolveRequiredProbe,
  toOrderByWithLocalizedFields,
  toRelatedRecords,
  transformI18nSafely,
} from '..'
import { insert, insertManyRelated, replaceManyRelated } from '../crud'
import {
  feature,
  featureI18n,
  organisation,
  featureProperty,
  featurePropertyI18n,
} from '../schema'
import { getFeatureHubFilter } from './hub'
// I18N
import { toLocaleCode } from '$lib/i18n'
// TYPES
import type { Database, Id, ListResponse, Locale, LocaleKey } from '$lib/types'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type {
  Feature,
  FeatureDB,
  FeatureDBNew,
  FeatureDBPartial,
  FeatureI18nNew,
  FeatureI18nPartial,
  FeatureProperty,
  NewFeatureProperty,
} from '$lib/db/zod/schema/feature.types'
import type { GeometryObject } from 'geojson'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1.1 CRUD :: CREATE
//    - createFeature
//    - createI18n
//
// 1.2 CRUD :: CREATE (RELATED)
//    - createProperties
//    - upsertFeaturePropertyI18n (internal)
//
// 2.1 CRUD :: READ
//    - listFeatures
//    - getFeature
//
// 2.2 CRUD :: READ (PROBES)
//    - probeFeatureQuery
//    - probeFeatureForUpdate
//    - probeFeatureForCommand
//    - resolveFeatureCommandProbe
//
// 2.3 CRUD :: READ (MERGING)
//    - mergeFeatureProperties
//
// 3.1 CRUD :: UPDATE
//    - updateFeatureByIdWithConcurrency
//    - updateFeaturePublishedStateById
//    - updateFeatureArchivedStateById
//
// 3.2 CRUD :: UPDATE (RELATED)
//    - updateI18n
//    - updateProperties
//
// 4. CRUD :: DELETE
//    - No hard delete helpers in this module (intentional)

// ═══════════════════════
// 1.1 CRUD :: CREATE
// ═══════════════════════

/**
 * Creates a new feature row.
 * @param db - The database instance.
 * @param data - The validated core feature payload to persist.
 * @returns The inserted feature row.
 * @remarks
 * Relation rows are created separately so remote handlers can control sequencing,
 * error handling, and authorization around each mutation step.
 */
export const createFeature = async (
  db: Database,
  data: FeatureDBNew,
): Promise<FeatureDB> =>
  (await insert(db, feature, {
    ...data,
    addressMeta: data.addressMeta ?? {},
    isPublished: data.isPublished ?? false,
  })) as FeatureDB

/**
 * Creates feature i18n rows for every submitted locale.
 * @param db - The database instance.
 * @param i18n - Locale-keyed feature translations.
 * @param featureId - The parent feature id.
 * @returns The persisted i18n rows.
 * @remarks
 * The remote form owns locale-to-record shaping, so this helper only expands the
 * locale map into related insert records.
 */
export const createI18n = async (
  db: Database,
  i18n: Record<LocaleKey, FeatureI18nNew>,
  featureId: Id,
) => {
  return await insertManyRelated(
    db,
    featureI18n,
    toRelatedRecords(i18n, 'featureId', featureId, 'locale') as InferInsertModel<
      typeof featureI18n
    >[],
    'featureId',
    featureId,
  )
}

// ═══════════════════════
// 1.2 CRUD :: CREATE (RELATED)
// ═══════════════════════

/**
 * Upserts locale-scoped translatable values for a single feature-property row.
 * @param db - The database instance.
 * @param featureId - The parent feature id.
 * @param propertyId - The property id within the composite feature-property key.
 * @param i18n - Locale-keyed property-value translations.
 * @returns Persisted feature-property i18n rows for the target property.
 * @remarks
 * This stays internal because callers should mutate feature-property i18n through
 * `createProperties(...)` or `updateProperties(...)`, not as a standalone workflow.
 */
const upsertFeaturePropertyI18n = async (
  db: Database,
  featureId: Id,
  propertyId: Id,
  i18n: Record<LocaleKey, { value?: string | null; valueGen?: boolean | null }>,
) => {
  const i18nRecords = Object.entries(i18n).map(([locale, data]) => ({
    featureId,
    propertyId,
    locale: toLocaleCode(locale as LocaleKey) as Locale,
    value: data.value ?? null,
    valueGen: Boolean(data.valueGen),
  }))

  for (const record of i18nRecords) {
    await db
      .insert(featurePropertyI18n)
      .values(record)
      .onConflictDoUpdate({
        target: [
          featurePropertyI18n.featureId,
          featurePropertyI18n.propertyId,
          featurePropertyI18n.locale,
        ],
        set: {
          value: record.value,
          valueGen: record.valueGen,
        },
      })
  }

  return await db.query.featurePropertyI18n.findMany({
    where: and(
      eq(featurePropertyI18n.featureId, featureId),
      eq(featurePropertyI18n.propertyId, propertyId),
    ),
  })
}

/**
 * Creates feature-property rows and any submitted translatable value rows.
 * @param db - The database instance.
 * @param featureId - The parent feature id.
 * @param properties - The submitted feature-property payloads.
 * @returns The hydrated persisted feature-property rows.
 * @remarks
 * Feature-property rows use a composite key of `(featureId, propertyId)`, so inserts
 * are implemented as upserts to keep create flows idempotent.
 */
export const createProperties = async (
  db: Database,
  featureId: Id,
  properties: NewFeatureProperty[],
) => {
  if (properties.length > 0) {
    for (const propertyRow of properties) {
      const propertyToInsert = {
        featureId,
        propertyId: propertyRow.propertyId,
        value: propertyRow.value ?? null,
        propertyValueId:
          propertyRow.propertyValueId && propertyRow.propertyValueId !== ''
            ? propertyRow.propertyValueId
            : null,
      }

      await db
        .insert(featureProperty)
        .values(propertyToInsert)
        .onConflictDoUpdate({
          target: [featureProperty.featureId, featureProperty.propertyId],
          set: {
            value: propertyToInsert.value,
            propertyValueId: propertyToInsert.propertyValueId,
          },
        })

      if (propertyRow.i18n) {
        await upsertFeaturePropertyI18n(
          db,
          featureId,
          propertyRow.propertyId,
          propertyRow.i18n as Record<
            LocaleKey,
            { value?: string | null; valueGen?: boolean | null }
          >,
        )
      }
    }
  }

  return await db.query.featureProperty.findMany({
    where: eq(featureProperty.featureId, featureId),
    with: {
      i18n: true,
      property: {
        with: {
          i18n: true,
          values: { with: { i18n: true } },
        },
      },
      propertyValue: {
        with: { i18n: true },
      },
    },
  })
}

// ═══════════════════════
// 2.1 CRUD :: READ
// ═══════════════════════

/**
 * Lists features with optional relation hydration and paginated metadata.
 * @param db - The database instance.
 * @param withRelations - Optional Drizzle relation graph to hydrate.
 * @param conditions - SQL conditions already normalized by API services.
 * @param opts - Hub request scope used to apply hub-level filtering.
 * @param listOptions - Optional text query, sorting, and pagination controls.
 * @returns A paginated feature row result.
 */
export const listFeatures = async <TRow extends Record<string, unknown> = FeatureDB>(
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended,
  pagination?: { limit?: number | null; offset?: number | null },
  sorting?: { sortBy?: string | null; sortOrder?: 'asc' | 'desc' | null },
  query?: {
    q?: string | null
    locale?: Locale
  },
): Promise<ListResponse<TRow>> => {
  const startedAt = Date.now()
  const allConditions = [...conditions]
  const hubFilter = getFeatureHubFilter(db, opts)

  if (hubFilter) {
    allConditions.push(hubFilter)
  }

  if (query?.q) {
    const search = query.q.toLowerCase()
    const i18nSearchConditions: SQL<unknown>[] = [
      sql`lower("featureI18n"."title") like ${`%${search}%`}`,
      sql`("featureI18n"."description" IS NOT NULL AND lower("featureI18n"."description") like ${`%${search}%`})`,
      sql`("featureI18n"."displayAddress" IS NOT NULL AND lower("featureI18n"."displayAddress") like ${`%${search}%`})`,
    ]
    const combinedConditions = or(...i18nSearchConditions)
    if (combinedConditions) {
      allConditions.push(
        exists(
          db
            .select({ featureId: featureI18n.featureId })
            .from(featureI18n)
            .where(and(eq(featureI18n.featureId, feature.id), combinedConditions)),
        ),
      )
    }
  }

  const sortBy = sorting?.sortBy || 'modifiedAt'
  const sortOrder = sorting?.sortOrder || 'desc'
  const orderBy = toOrderByWithLocalizedFields({
    db,
    locale: query?.locale,
    sortBy,
    sortOrder,
    fallbackColumn: feature.modifiedAt,
    baseTable: feature,
    localizedSortColumns: {
      title: featureI18n.title,
      description: featureI18n.description,
      displayAddress: featureI18n.displayAddress,
    },
    i18nTable: featureI18n,
    parentIdColumn: feature.id,
    foreignKeyColumn: featureI18n.featureId,
    localeColumn: featureI18n.locale,
  })
  const whereClause = allConditions.length > 0 ? and(...allConditions) : undefined

  const data = (await db.query.feature.findMany({
    with: withRelations,
    where: whereClause,
    limit: pagination?.limit ?? undefined,
    offset: pagination?.offset ?? undefined,
    orderBy,
  })) as unknown as TRow[]
  const countQuery = db.select({ count: sql<number>`count(*)` }).from(feature)
  const totalRows = whereClause ? await countQuery.where(whereClause) : await countQuery
  const totalCount = Number(totalRows[0]?.count || 0)
  const offset = pagination?.offset ?? 0
  const hasMore = offset + data.length < totalCount

  return {
    data,
    limit: pagination?.limit ?? undefined,
    offset,
    totalCount,
    hasMore,
    nextOffset: hasMore ? offset + data.length : null,
    sortBy,
    sortOrder,
    q: query?.q ?? undefined,
    durationMs: Date.now() - startedAt,
  }
}

/**
 * Loads a single feature with optional relation hydration.
 * @param db - The database instance.
 * @param withRelations - Optional Drizzle relation graph to hydrate.
 * @param conditions - SQL conditions already normalized by API services.
 * @param opts - Hub request scope used to apply hub-level filtering.
 * @returns The matching feature row or `undefined`.
 * @remarks
 * The loaded row intentionally keeps raw relation arrays. Response/profile shaping
 * happens in the API service layer.
 */
export const getFeature = async <TRow extends Record<string, unknown> = FeatureDB>(
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended,
): Promise<TRow | undefined> => {
  const allConditions = [...conditions]
  const hubFilter = getFeatureHubFilter(db, opts)

  if (hubFilter) {
    allConditions.push(hubFilter)
  }

  return (await db.query.feature.findFirst({
    with: withRelations,
    where: allConditions.length > 0 ? and(...allConditions) : undefined,
  })) as unknown as TRow | undefined
}

// ═══════════════════════
// 2.2 CRUD :: READ (PROBES)
// ═══════════════════════

/**
 * Loads the minimal persisted feature state required for guarded read authorization.
 * @param db - The database instance.
 * @param params - Lookup params containing a feature reference.
 * @returns The minimal authorization probe or `null`.
 * @remarks
 * Probe reads stay intentionally small so authorization can run before a full relation
 * graph is loaded.
 */
export const probeFeatureQuery = async (
  db: Database,
  params: { ref?: string; refKey?: string | null },
) => {
  if (!params.ref) return null

  return firstOrNull(
    await db
      .select({
        id: feature.id,
        organisationId: feature.organisationId,
        projectId: feature.projectId,
        layerId: feature.layerId,
        resourceHubId: organisation.hubId,
        isPublished: feature.isPublished,
        isArchived: feature.isArchived,
      })
      .from(feature)
      .innerJoin(organisation, eq(feature.organisationId, organisation.id))
      .where(eq(feature.id, params.ref))
      .limit(1),
  )
}

/**
 * Loads the minimal persisted feature state required for guarded updates.
 * @param db - The database instance.
 * @param featureId - The feature id to probe.
 * @returns The minimal update probe or `null`.
 * @remarks
 * This adds concurrency and field-level state needed by form submissions without
 * loading the full admin relation graph.
 */
export const probeFeatureForUpdate = async (db: Database, featureId: Id) => {
  return firstOrNull(
    await db
      .select({
        id: feature.id,
        organisationId: feature.organisationId,
        projectId: feature.projectId,
        layerId: feature.layerId,
        contributorId: feature.contributorId,
        geometry: feature.geometry,
        addressMeta: feature.addressMeta,
        isPublished: feature.isPublished,
        isArchived: feature.isArchived,
        isIntangible: feature.isIntangible,
        isVisitable: feature.isVisitable,
        modifiedAt: feature.modifiedAt,
        resourceHubId: organisation.hubId,
      })
      .from(feature)
      .innerJoin(organisation, eq(feature.organisationId, organisation.id))
      .where(eq(feature.id, featureId))
      .limit(1),
  )
}

/**
 * Loads the minimal persisted feature state required for guarded commands.
 * @param db - The database instance.
 * @param featureId - The feature id to probe.
 * @returns The minimal command probe or `null`.
 */
export const probeFeatureForCommand = async (db: Database, featureId: Id) => {
  const record = await probeFeatureQuery(db, {
    ref: featureId,
    refKey: 'id',
  })
  if (!record) return null

  return {
    id: record.id,
    organisationId: record.organisationId,
    projectId: record.projectId,
    layerId: record.layerId,
    resourceHubId: record.resourceHubId,
  }
}

/**
 * Resolves a command probe or delegates to a caller-provided not-found handler.
 * @param db - The database instance.
 * @param featureId - The feature id to resolve.
 * @param onNotFound - Callback invoked when the feature cannot be probed.
 * @returns The resolved command probe or the callback result.
 */
export const resolveFeatureCommandProbe = async <T>(
  db: Database,
  featureId: Id,
  onNotFound: () => T,
) => {
  const probed = await probeFeatureForCommand(db, featureId)
  return resolveRequiredProbe(probed, onNotFound)
}

// ═══════════════════════
// 2.3 CRUD :: READ (MERGING)
// ═══════════════════════

/**
 * Merges feature-property rows with currently visible layer-property definitions.
 * @param featureData - The feature entity to extend.
 * @param layerData - The layer relation graph providing visibility rules.
 * @returns The feature with its visible property set normalized.
 * @remarks
 * Legacy consumers still expect invisible layer properties to be removed and missing
 * visible ones to be synthesized. That compatibility behavior is kept here until the
 * old loaders are fully deleted.
 */
export const mergeFeatureProperties = (
  featureData: Feature,
  layerData: Layer,
): Feature => {
  if (!featureData.properties) {
    featureData.properties = []
  }

  const visibleLayerProperties = new Map()
  layerData.properties?.forEach(layerProperty => {
    if (layerProperty.isVisible) {
      visibleLayerProperties.set(layerProperty.propertyId, layerProperty)
    }
  })

  featureData.properties = featureData.properties.filter(featureProperty =>
    visibleLayerProperties.has(featureProperty.propertyId),
  )

  const existingPropertyIds = new Set(
    featureData.properties.map(propertyRow => propertyRow.propertyId),
  )

  visibleLayerProperties.forEach((layerProperty, propertyId) => {
    if (existingPropertyIds.has(propertyId)) return

    const propertyDefinition = layerProperty.property
    if (propertyDefinition && typeof propertyDefinition.i18n !== 'object') {
      propertyDefinition.i18n = transformI18nSafely(propertyDefinition.i18n)
    }

    featureData.properties.push({
      id: nanoid(12),
      featureId: featureData.id,
      propertyId,
      value: null,
      propertyValueId: null,
      property: propertyDefinition,
      propertyValue: undefined,
    } as FeatureProperty)
  })

  return featureData
}

// ═══════════════════════
// 3.1 CRUD :: UPDATE
// ═══════════════════════

/**
 * Updates a feature only when the caller's concurrency token still matches.
 * @param db - The database instance.
 * @param params - The target feature id, current `modifiedAt`, and update payload.
 * @returns The updated feature row or `undefined` when the write is stale.
 * @remarks
 * Feature form writes must use optimistic concurrency so the remote layer can reject
 * stale admin edits without guessing whether another mutation already won.
 */
export const updateFeatureByIdWithConcurrency = async (
  db: Database,
  params: {
    id: Id
    updatedAt: string
    data: FeatureDBPartial
  },
): Promise<FeatureDB | undefined> => {
  const [updated] = await db
    .update(feature)
    .set(params.data)
    .where(and(eq(feature.id, params.id), eq(feature.modifiedAt, params.updatedAt)))
    .returning()

  return updated as FeatureDB | undefined
}

/**
 * Toggles persisted feature publish state and updates publisher metadata.
 * @param db - The database instance.
 * @param params - The target feature id, next publish state, and optional publisher id.
 * @returns The updated feature row or `undefined` when the feature is missing.
 */
export const updateFeaturePublishedStateById = async (
  db: Database,
  params: {
    id: Id
    state: boolean
    publisherId?: Id | null
  },
): Promise<FeatureDB | undefined> => {
  const [updated] = await db
    .update(feature)
    .set({
      isPublished: params.state,
      publishedAt: params.state ? new Date().toISOString() : null,
      publisherId: params.state ? (params.publisherId ?? null) : null,
    })
    .where(eq(feature.id, params.id))
    .returning()

  return updated as FeatureDB | undefined
}

/**
 * Toggles persisted feature archived state.
 * @param db - The database instance.
 * @param params - The target feature id and next archived state.
 * @returns The updated feature row or `undefined` when the feature is missing.
 */
export const updateFeatureArchivedStateById = async (
  db: Database,
  params: {
    id: Id
    state: boolean
  },
): Promise<FeatureDB | undefined> => {
  const [updated] = await db
    .update(feature)
    .set({
      isArchived: params.state,
    })
    .where(eq(feature.id, params.id))
    .returning()

  return updated as FeatureDB | undefined
}

// ═══════════════════════
// 3.2 CRUD :: UPDATE (RELATED)
// ═══════════════════════

/**
 * Replaces all persisted feature i18n rows with the submitted locale map.
 * @param db - The database instance.
 * @param i18n - Locale-keyed feature translations.
 * @param featureId - The parent feature id.
 * @returns The persisted i18n rows.
 * @remarks
 * Feature edit forms submit full locale state, so replacement keeps persisted i18n
 * aligned with the current source of truth instead of applying partial patches.
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<LocaleKey, FeatureI18nPartial>,
  featureId: Id,
) => {
  const relatedRecords = toRelatedRecords(
    i18n,
    'featureId',
    featureId,
    'locale',
  ) as InferInsertModel<typeof featureI18n>[]

  return await replaceManyRelated(
    db,
    featureI18n,
    relatedRecords,
    featureI18n.featureId,
    featureId,
  )
}

/**
 * Synchronizes feature-property rows against the submitted property set.
 * @param db - The database instance.
 * @param properties - The submitted feature-property payloads.
 * @param featureId - The parent feature id.
 * @returns The hydrated persisted feature-property rows.
 * @remarks
 * Any property omitted from submission is deleted so the persisted relation set stays
 * identical to the form payload.
 */
export const updateProperties = async (
  db: Database,
  properties: Array<NewFeatureProperty | FeatureProperty>,
  featureId: Id,
) => {
  const existingProperties = await db
    .select({ propertyId: featureProperty.propertyId })
    .from(featureProperty)
    .where(eq(featureProperty.featureId, featureId))

  const existingPropertyIds = new Set(
    existingProperties.map(propertyRow => propertyRow.propertyId),
  )
  const incomingPropertyIds = new Set(
    properties.map(propertyRow => propertyRow.propertyId),
  )
  const propertyIdsToDelete = [...existingPropertyIds].filter(
    propertyId => !incomingPropertyIds.has(propertyId),
  )

  if (propertyIdsToDelete.length > 0) {
    await db
      .delete(featurePropertyI18n)
      .where(
        and(
          eq(featurePropertyI18n.featureId, featureId),
          inArray(featurePropertyI18n.propertyId, propertyIdsToDelete),
        ),
      )

    await db
      .delete(featureProperty)
      .where(
        and(
          eq(featureProperty.featureId, featureId),
          inArray(featureProperty.propertyId, propertyIdsToDelete),
        ),
      )
  }

  for (const propertyRow of properties) {
    const propertyToUpsert = {
      featureId,
      propertyId: propertyRow.propertyId,
      value: propertyRow.value ?? null,
      propertyValueId:
        propertyRow.propertyValueId && propertyRow.propertyValueId !== ''
          ? propertyRow.propertyValueId
          : null,
    }

    await db
      .insert(featureProperty)
      .values(propertyToUpsert)
      .onConflictDoUpdate({
        target: [featureProperty.featureId, featureProperty.propertyId],
        set: {
          value: propertyToUpsert.value,
          propertyValueId: propertyToUpsert.propertyValueId,
        },
      })

    if (propertyRow.i18n) {
      await upsertFeaturePropertyI18n(
        db,
        featureId,
        propertyRow.propertyId,
        propertyRow.i18n as Record<
          LocaleKey,
          { value?: string | null; valueGen?: boolean | null }
        >,
      )
    } else {
      await db
        .delete(featurePropertyI18n)
        .where(
          and(
            eq(featurePropertyI18n.featureId, featureId),
            eq(featurePropertyI18n.propertyId, propertyRow.propertyId),
          ),
        )
    }
  }

  return await db.query.featureProperty.findMany({
    where: eq(featureProperty.featureId, featureId),
    with: {
      i18n: true,
      property: {
        with: {
          i18n: true,
          values: { with: { i18n: true } },
        },
      },
      propertyValue: {
        with: { i18n: true },
      },
    },
  })
}

// ═══════════════════════
// 4. CRUD :: DELETE
// ═══════════════════════
// No hard delete helpers in this module by design.
