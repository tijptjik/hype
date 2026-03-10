// DRIZZLE
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { layer, layerI18n, layerProperty, organisation, project } from '../schema'
// SERVICES
import { getLayerHubFilter } from './hub'
// DB
import {
  firstOrNull,
  resolveRequiredProbe,
  toOrderByWithLocalizedFields,
  toRelatedRecords,
} from '..'
import { insert, insertManyRelated, replaceManyRelated } from '../crud'
// TYPES
import type { SQLiteInsertValue } from 'drizzle-orm/sqlite-core'
import type {
  Database,
  Id,
  LocaleKey,
  Locale,
  LayerMetadata,
  ListResponse,
  QueryParams,
} from '$lib/types'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type {
  LayerCommandProbe,
  LayerDB,
  LayerDBNew,
  LayerDBRaw,
  LayerI18nDB,
  LayerI18nNew,
  LayerI18nPartial,
  LayerPropertyDBRaw,
  LayerPropertyNew,
} from '$lib/db/zod/schema/layer.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1.1 CRUD :: CREATE
//    - createLayer
//    - createI18n
//    - createProperties
//
// 2.1 CRUD :: READ
//    - listLayers
//    - getLayer
//
// 2.2 CRUD :: READ (PROBES)
//    - probeLayerQuery
//    - probeLayerForUpdate
//    - probeLayerForCommand
//    - resolveLayerCommandProbe
//
// 2.3 CRUD :: READ (LOOKUPS)
//    - getLayerMap
//
// 3.1 CRUD :: UPDATE (CONCURRENCY/STATE)
//    - updateLayerByIdWithConcurrency
//    - updateLayerPublishedStateById
//    - updateLayerArchivedStateById
//    - updateI18n
//    - updateProperties
//
// 3.2 CRUD :: UPDATE (SYNC)
//    - upsertLayerProperties (internal)
//    - syncProperties
//
// 4. CRUD :: DELETE
//    - No hard delete helpers in this module (intentional)

// ═══════════════════════
// 1.1 CRUD :: CREATE
// ═══════════════════════

/**
 * Inserts a new layer row with persisted defaults.
 * Used as the base write primitive for layer creation.
 */
export const createLayer = async (db: Database, data: LayerDBNew): Promise<LayerDB> =>
  await insert(db, layer, {
    ...data,
    isPublished: data.isPublished ?? false,
  })

/**
 * Creates layer i18n rows from locale-keyed payload.
 * Used by create orchestration after base layer insert.
 */
export const createI18n = async (
  db: Database,
  i18n: Record<LocaleKey, LayerI18nNew>,
  layerId: string,
): Promise<LayerI18nDB[]> => {
  return await insertManyRelated(
    db,
    layerI18n,
    toRelatedRecords(i18n, 'layerId', layerId, 'locale') as never,
    'layerId',
    layerId,
  )
}

/**
 * Creates layer-property link rows and returns hydrated link records.
 * Used when establishing property visibility/contributable configuration for a layer.
 */
export const createProperties = async (
  db: Database,
  layerId: string,
  properties: LayerPropertyNew[],
): Promise<LayerPropertyDBRaw[]> => {
  if (properties.length > 0) {
    await db.insert(layerProperty).values(
      properties.map(prop => ({
        layerId,
        ...prop,
      })),
    )
  }

  const rows = await db.query.layerProperty.findMany({
    where: eq(layerProperty.layerId, layerId),
    with: {
      property: {
        with: {
          i18n: true,
          values: {
            with: {
              i18n: true,
            },
          },
        },
      },
    },
  })

  return rows as LayerPropertyDBRaw[]
}

// ═══════════════════════
// 2.1 CRUD :: READ
// ═══════════════════════

/**
 * Lists layers with optional role/hub filters, search, sorting, and pagination.
 * Used by admin/public list endpoints to return hydrated list envelopes plus metadata.
 */
export const listLayers = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended,
  pagination?: { limit?: number; offset?: number },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
  query?: {
    q?: string
    searchColumns?: string[]
    ignoreHubFilter?: boolean
    filtersToApply?: QueryParams
    locale?: Locale
  },
): Promise<ListResponse<LayerDBRaw>> => {
  const startedAt = Date.now()

  if (!query?.ignoreHubFilter) {
    const hubFilter = getLayerHubFilter(db, opts)
    if (hubFilter) {
      conditions.push(hubFilter)
    }
  }

  if (query?.q) {
    const search = query.q.toLowerCase()
    const searchColumns = query.searchColumns || ['name', 'description']
    const searchConditions: SQL<unknown>[] = []

    const i18nColumns = searchColumns.filter(column =>
      ['name', 'description'].includes(column),
    )
    if (i18nColumns.length > 0) {
      const i18nSearchConditions: SQL<unknown>[] = []
      for (const column of i18nColumns) {
        if (column === 'name') {
          i18nSearchConditions.push(
            sql`lower("layerI18n"."name") like ${`%${search}%`}`,
          )
        } else if (column === 'description') {
          i18nSearchConditions.push(
            sql`("layerI18n"."description" IS NOT NULL AND lower("layerI18n"."description") like ${`%${search}%`})`,
          )
        }
      }

      if (i18nSearchConditions.length > 0) {
        const combinedConditions =
          i18nSearchConditions.length === 1
            ? i18nSearchConditions[0]
            : sql`(${sql.join(i18nSearchConditions, sql` OR `)})`
        searchConditions.push(
          sql`EXISTS (
            SELECT 1 FROM "layerI18n"
            WHERE "layerI18n"."layerId" = ${layer.id}
            AND ${combinedConditions}
          )`,
        )
      }
    }

    if (searchConditions.length > 0) {
      if (searchConditions.length === 1) {
        conditions.push(searchConditions[0])
      } else {
        const combinedSearchCondition = or(...searchConditions)
        if (combinedSearchCondition) {
          conditions.push(combinedSearchCondition)
        }
      }
    }
  }

  const sortBy = sorting?.sortBy || 'modifiedAt'
  const sortOrder = sorting?.sortOrder || 'desc'
  const orderBy = toOrderByWithLocalizedFields({
    db,
    locale: query?.locale,
    sortBy,
    sortOrder,
    fallbackColumn: layer.modifiedAt,
    baseTable: layer,
    localizedSortColumns: {
      name: layerI18n.name,
      nameShort: layerI18n.nameShort,
      description: layerI18n.description,
    },
    i18nTable: layerI18n,
    parentIdColumn: layer.id,
    foreignKeyColumn: layerI18n.layerId,
    localeColumn: layerI18n.locale,
  })
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const data = await db.query.layer.findMany({
    with: withRelations,
    where: whereClause,
    limit: pagination?.limit,
    offset: pagination?.offset,
    orderBy,
  })

  const countQuery = db.select({ count: sql<number>`count(*)` }).from(layer)
  const totalRows = whereClause ? await countQuery.where(whereClause) : await countQuery
  const totalCount = Number(totalRows[0]?.count || 0)
  const offset = pagination?.offset ?? 0
  const hasMore = offset + data.length < totalCount
  const nextOffset = hasMore ? offset + data.length : null
  const durationMs = Date.now() - startedAt

  return {
    data: data as LayerDBRaw[],
    limit: pagination?.limit,
    offset,
    totalCount,
    hasMore,
    nextOffset,
    sortBy,
    sortOrder,
    appliedFilters: query?.filtersToApply,
    q: query?.q,
    durationMs,
  }
}

/**
 * Loads a single layer with optional relation graph and hub scoping.
 * Used by read/update flows that need one hydrated layer record.
 */
export const getLayer = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended,
): Promise<LayerDBRaw | undefined> => {
  const hubFilter = getLayerHubFilter(db, opts)
  if (hubFilter) {
    conditions.push(hubFilter)
  }

  const result = await db.query.layer.findFirst({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined,
  })
  return result as LayerDBRaw | undefined
}

// ═══════════════════════
// 2.2 CRUD :: READ (PROBES)
// ═══════════════════════

/**
 * Probes minimal layer fields required for read authorization decisions.
 * Used to run authz before paying full entity hydration cost.
 */
export const probeLayerQuery = async (
  db: Database,
  params: { ref: string; refKey?: 'id' },
): Promise<{
  id: string
  organisationId: string
  projectId: string
  hubId: string | null
  isPublished: boolean
  isArchived: boolean
} | null> => {
  return firstOrNull(
    await db
      .select({
        id: layer.id,
        organisationId: layer.organisationId,
        projectId: layer.projectId,
        hubId: organisation.hubId,
        isPublished: layer.isPublished,
        isArchived: layer.isArchived,
      })
      .from(layer)
      .innerJoin(project, eq(layer.projectId, project.id))
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(eq(layer.id, params.ref))
      .limit(1),
  )
}

/**
 * Probes mutable-layer state for optimistic concurrency and update auth checks.
 * Used by update commands before applying persistence writes.
 */
export const probeLayerForUpdate = async (
  db: Database,
  layerId: Id,
): Promise<{
  id: string
  organisationId: string
  projectId: string
  metadata: LayerMetadata | null
  hubId: string | null
  modifiedAt: string
} | null> => {
  return firstOrNull(
    await db
      .select({
        id: layer.id,
        organisationId: layer.organisationId,
        projectId: layer.projectId,
        metadata: layer.metadata,
        hubId: organisation.hubId,
        modifiedAt: layer.modifiedAt,
      })
      .from(layer)
      .innerJoin(project, eq(layer.projectId, project.id))
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(eq(layer.id, layerId))
      .limit(1),
  )
}

/**
 * Probes minimal layer command context for publish/archive/delete style actions.
 * Used by command handlers that require hub/org/project scope ids.
 */
const probeLayerForCommand = async (
  db: Database,
  layerId: Id,
): Promise<LayerCommandProbe | null> => {
  return firstOrNull(
    await db
      .select({
        id: layer.id,
        organisationId: layer.organisationId,
        projectId: layer.projectId,
        hubId: organisation.hubId,
      })
      .from(layer)
      .innerJoin(project, eq(layer.projectId, project.id))
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(eq(layer.id, layerId))
      .limit(1),
  )
}

/**
 * Resolves a required layer command probe or delegates to not-found handler.
 * Used to keep command codepaths consistent with explicit not-found behavior.
 */
export const resolveLayerCommandProbe = async (
  db: Database,
  layerId: Id,
  onNotFound: () => never,
): Promise<LayerCommandProbe> => {
  const probed = await probeLayerForCommand(db, layerId)
  return resolveRequiredProbe(probed, onNotFound)
}

// ═══════════════════════
// 2.3 CRUD :: READ (LOOKUPS)
// ═══════════════════════

/**
 * Loads multiple layers and returns them keyed by id.
 * Used by batch/hydration flows that need O(1) id lookups.
 */
export const getLayerMap = async (
  db: Database,
  layerIds: Id[],
  opts: HubOptsExtended,
): Promise<Map<Id, LayerDBRaw>> => {
  const layersMap = new Map<Id, LayerDBRaw>()

  for (const layerId of layerIds) {
    const conditions = [eq(layer.id, layerId)]
    const layerData = await getLayer(db, {}, conditions, opts)
    if (layerData) {
      layersMap.set(layerId, layerData)
    }
  }

  return layersMap
}

// ═══════════════════════
// 3.1 CRUD :: UPDATE (CONCURRENCY/STATE)
// ═══════════════════════

/**
 * Updates a layer with modified-at match for optimistic concurrency control.
 * Used to prevent stale writes in remote form submissions.
 */
export const updateLayerByIdWithConcurrency = async (
  db: Database,
  params: {
    id: Id
    updatedAt: string
    data: {
      organisationId: string
      projectId: string
      metadata?: LayerMetadata
      isDefaultVisible?: boolean
    }
  },
): Promise<{ id: string; modifiedAt: string } | null> => {
  const [updated] = await db
    .update(layer)
    .set(params.data)
    .where(and(eq(layer.id, params.id), eq(layer.modifiedAt, params.updatedAt)))
    .returning({
      id: layer.id,
      modifiedAt: layer.modifiedAt,
    })

  return updated ?? null
}

/**
 * Toggles published state and publication metadata for a layer.
 * Used by publish/unpublish command handlers.
 */
export const updateLayerPublishedStateById = async (
  db: Database,
  params: { id: Id; state: boolean; publisherId: string | null },
): Promise<{ id: string; isPublished: boolean } | null> => {
  const [updated] = await db
    .update(layer)
    .set({
      isPublished: params.state,
      publishedAt: params.state ? new Date().toISOString() : null,
      publisherId: params.state ? params.publisherId : null,
    })
    .where(eq(layer.id, params.id))
    .returning({
      id: layer.id,
      isPublished: layer.isPublished,
    })

  return updated ?? null
}

/**
 * Toggles archived state for a layer.
 * Used by archive/unarchive command handlers.
 */
export const updateLayerArchivedStateById = async (
  db: Database,
  params: { id: Id; state: boolean },
): Promise<{ id: string; isArchived: boolean } | null> => {
  const [updated] = await db
    .update(layer)
    .set({ isArchived: params.state })
    .where(eq(layer.id, params.id))
    .returning({
      id: layer.id,
      isArchived: layer.isArchived,
    })

  return updated ?? null
}

/**
 * Replaces layer i18n rows from locale-keyed payload.
 * Used by update orchestration to persist submitted translations.
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<LocaleKey, LayerI18nPartial>,
  layerId: string,
): Promise<LayerI18nDB[]> => {
  return await replaceManyRelated(
    db,
    layerI18n,
    toRelatedRecords(i18n, 'layerId', layerId, 'locale') as never,
    layerI18n.layerId,
    layerId,
  )
}

/**
 * Replaces all layer-property links for a layer.
 * Used by full replacement update flows.
 */
export const updateProperties = async (
  db: Database,
  layerId: string,
  properties: LayerPropertyNew[],
): Promise<LayerPropertyDBRaw[]> => {
  await db.delete(layerProperty).where(eq(layerProperty.layerId, layerId))
  return await createProperties(db, layerId, properties)
}

// ═══════════════════════
// 3.2 CRUD :: UPDATE (SYNC)
// ═══════════════════════

/**
 * Diffs and upserts layer-property links with minimal DB operations.
 * Used by sync flows to avoid destructive full rewrites.
 */
const upsertLayerProperties = async (
  db: Database,
  layerId: string,
  propertyLinks: Array<{
    propertyId: string
    isVisible?: boolean
    isUserContributable?: boolean
  }>,
): Promise<void> => {
  const currentLinks = await db.query.layerProperty.findMany({
    where: eq(layerProperty.layerId, layerId),
    columns: {
      propertyId: true,
      isVisible: true,
      isUserContributable: true,
    },
  })

  const currentLinkMap = new Map(
    currentLinks.map(link => [
      link.propertyId,
      {
        isVisible: link.isVisible,
        isUserContributable: link.isUserContributable,
      },
    ]),
  )
  const newLinkMap = new Map(
    propertyLinks.map(link => [
      link.propertyId,
      {
        isVisible: link.isVisible,
        isUserContributable: link.isUserContributable,
      },
    ]),
  )

  const toDelete: string[] = []
  const toInsert: SQLiteInsertValue<typeof layerProperty>[] = []
  const toUpdate: Array<{
    propertyId: string
    isVisible?: boolean
    isUserContributable?: boolean
  }> = []

  for (const currentPropertyId of currentLinkMap.keys()) {
    if (!newLinkMap.has(currentPropertyId)) {
      toDelete.push(currentPropertyId)
    }
  }

  for (const [newPropertyId, newState] of newLinkMap.entries()) {
    const currentState = currentLinkMap.get(newPropertyId)
    if (!currentState) {
      toInsert.push({
        layerId,
        propertyId: newPropertyId,
        isVisible: newState.isVisible ?? false,
        isUserContributable: newState.isUserContributable ?? false,
      })
      continue
    }

    if (
      (newState.isVisible !== undefined &&
        newState.isVisible !== currentState.isVisible) ||
      (newState.isUserContributable !== undefined &&
        newState.isUserContributable !== currentState.isUserContributable)
    ) {
      toUpdate.push({
        propertyId: newPropertyId,
        isVisible: newState.isVisible,
        isUserContributable: newState.isUserContributable,
      })
    }
  }

  if (toDelete.length > 0) {
    await db
      .delete(layerProperty)
      .where(
        and(
          eq(layerProperty.layerId, layerId),
          inArray(layerProperty.propertyId, toDelete),
        ),
      )
  }

  if (toInsert.length > 0) {
    await db.insert(layerProperty).values(toInsert)
  }

  for (const updateOp of toUpdate) {
    const payload: Partial<typeof layerProperty.$inferInsert> = {}
    if (updateOp.isVisible !== undefined) payload.isVisible = updateOp.isVisible
    if (updateOp.isUserContributable !== undefined) {
      payload.isUserContributable = updateOp.isUserContributable
    }

    await db
      .update(layerProperty)
      .set(payload)
      .where(
        and(
          eq(layerProperty.layerId, layerId),
          eq(layerProperty.propertyId, updateOp.propertyId),
        ),
      )
  }
}

/**
 * Synchronizes each layer's property links against current project property state.
 * Used when project property assignments change and child layers must follow.
 */
export const syncProperties = async (
  db: Database,
  projectId: string,
  newProjectProperties: Property[],
): Promise<void> => {
  const projectLayers = await db.query.layer.findMany({
    where: eq(layer.projectId, projectId),
    columns: {
      id: true,
    },
  })

  if (projectLayers.length === 0) return

  const isProjectPropertyEnabled = (propertyRow: Property): boolean => {
    if (propertyRow.scope === 'project') return true
    return typeof (propertyRow as Property & { isEnabled?: boolean }).isEnabled ===
      'boolean'
      ? Boolean((propertyRow as Property & { isEnabled?: boolean }).isEnabled)
      : Boolean(propertyRow.isDefaultEnabled)
  }

  const targetProperties = newProjectProperties.filter(propertyRow => {
    if (!propertyRow?.id || typeof propertyRow.id !== 'string') return false
    return isProjectPropertyEnabled(propertyRow)
  })

  for (const row of projectLayers) {
    const currentLinks = await db.query.layerProperty.findMany({
      where: eq(layerProperty.layerId, row.id),
      columns: { propertyId: true },
    })
    const currentIds = new Set(currentLinks.map(link => link.propertyId))
    const targetPropertyLinks = targetProperties.map(propertyRow => ({
      propertyId: propertyRow.id,
      isVisible: currentIds.has(propertyRow.id)
        ? undefined
        : Boolean(propertyRow.isDefaultEnabled),
      isUserContributable: currentIds.has(propertyRow.id)
        ? undefined
        : Boolean(propertyRow.isDefaultEnabled),
    }))
    await upsertLayerProperties(db, row.id, targetPropertyLinks)
  }
}

// ═══════════════════════
// 4. CRUD :: DELETE
// ═══════════════════════
// No hard delete helpers in this module by design.
