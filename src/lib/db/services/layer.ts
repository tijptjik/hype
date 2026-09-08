// DRIZZLE
import { and, eq, inArray, not, or, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import {
  feature,
  layer,
  layerI18n,
  layerProperty,
  organisation,
  project,
} from '../schema'
// SERVICES
import { getLayerHubFilter } from './hub'
// DB
import {
  firstOrNull,
  resolveRequiredProbe,
  transformI18nSafely,
  toOrderByWithLocalizedFields,
  toRelatedRecords,
} from '..'
import { insert, insertMany, insertManyRelated, replaceManyRelated } from '../crud'
import { retryBusyRead } from './sqlite'
import { autochunk, chunkedInArray } from '$lib/utils/batch-query'
// I18N
import { normalizeI18nLocaleRecord } from '$lib/i18n'
// TYPES
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
import type { TaskEditorLayerOption } from '$lib/db/zod/schema/task.types'

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
//    - listLayerPropertyLinks (internal)
//    - listLayers
//    - getLayer
//    - listAssignableTaskLayers
//
// 2.2 CRUD :: READ (PROBES)
//    - probeLayerQuery
//    - probeLayerForUpdate
//    - probeLayerForCommand
//    - resolveLayerCommandProbe
//
// 2.3 CRUD :: READ (LOOKUPS)
//    - getLayerMap
//    - hasProjectLayersCondition
//    - hasOrganisationLayersCondition
//
// 3.1 CRUD :: UPDATE (CONCURRENCY/STATE)
//    - updateLayerByIdWithConcurrency
//    - updateLayerPublishedStateById
//    - cascadeLayerPublishedStateToDescendants
//    - updateLayerArchivedStateById
//    - cascadeLayerArchivedStateToDescendants
//    - updateI18n
//    - updateProperties
//
// 3.2 CRUD :: UPDATE (SYNC)
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
  const normalizedI18n = normalizeI18nLocaleRecord(
    i18n as Record<string, LayerI18nNew>,
  ) as Record<LocaleKey, LayerI18nNew>
  return await insertManyRelated(
    db,
    layerI18n,
    toRelatedRecords(normalizedI18n, 'layerId', layerId, 'locale') as never,
    'layerId',
    layerId,
  )
}

/**
 * Creates layer-property link rows and returns hydrated link records.
 * Used when establishing property visibility/contributable configuration for a layer.
 * @param db - Database used by the authorized layer workflow.
 * @param layerId - Authoritative target layer for every submitted link.
 * @param properties - Property links to insert.
 * @returns Links hydrated with properties, translations, and values.
 */
export const createProperties = async (
  db: Database,
  layerId: string,
  properties: LayerPropertyNew[],
): Promise<LayerPropertyDBRaw[]> => {
  if (properties.length > 0) {
    await insertMany(
      db,
      layerProperty,
      properties.map(prop => ({
        ...prop,
        layerId,
      })),
    )
  }

  return await listLayerPropertyLinks(db, layerId)
}

// ═══════════════════════
// 2.1 CRUD :: READ
// ═══════════════════════

/**
 * Reads layer links with the shared nested property graph after creation or replacement.
 * @param db - Database used for the committed-state readback.
 * @param layerId - Layer whose links should be hydrated.
 * @returns Property links including property and value translations.
 */
async function listLayerPropertyLinks(
  db: Database,
  layerId: string,
): Promise<LayerPropertyDBRaw[]> {
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

  const data = await retryBusyRead(() =>
    db.query.layer.findMany({
      with: withRelations,
      where: whereClause,
      limit: pagination?.limit,
      offset: pagination?.offset,
      orderBy,
    }),
  )

  const countQuery = db.select({ count: sql<number>`count(*)` }).from(layer)
  const totalRows = await retryBusyRead(() =>
    whereClause ? countQuery.where(whereClause) : countQuery,
  )
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

/**
 * Lists active layers within a project for task reassignment controls.
 * Used by the task editor to populate same-project layer options.
 */
export const listAssignableTaskLayers = async (
  db: Database,
  projectId: Id,
): Promise<TaskEditorLayerOption[]> => {
  const rows = await db.query.layer.findMany({
    columns: {
      id: true,
    },
    where: and(eq(layer.projectId, projectId), eq(layer.isArchived, false)),
    with: {
      i18n: true,
    },
  })

  return rows.map(row => ({
    id: row.id as Id,
    code: null,
    projectId,
    i18n: transformI18nSafely(row.i18n) ?? {},
  }))
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
  isDefaultVisible: boolean
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
        isDefaultVisible: layer.isDefaultVisible,
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

/**
 * Builds a predicate that matches projects with at least one qualifying layer.
 */
export const hasProjectLayersCondition = (options?: {
  requirePublished?: boolean
  requireNonArchived?: boolean
}): SQL<unknown> => sql`EXISTS (
  SELECT 1 FROM "layer"
  WHERE "layer"."projectId" = ${project.id}
  ${options?.requirePublished ? sql`AND "layer"."isPublished" = 1` : sql``}
  ${options?.requireNonArchived ? sql`AND "layer"."isArchived" = 0` : sql``}
)`

/**
 * Builds a predicate that matches organisations with at least one qualifying layer.
 */
export const hasOrganisationLayersCondition = (options?: {
  requirePublished?: boolean
  requireNonArchived?: boolean
}): SQL<unknown> => sql`EXISTS (
  SELECT 1 FROM "layer"
  WHERE "layer"."organisationId" = ${organisation.id}
  ${options?.requirePublished ? sql`AND "layer"."isPublished" = 1` : sql``}
  ${options?.requireNonArchived ? sql`AND "layer"."isArchived" = 0` : sql``}
)`

// ═══════════════════════
// 3.1 CRUD :: UPDATE (CONCURRENCY/STATE)
// ═══════════════════════

/**
 * Syncs persisted rank/default-visible presentation fields for one project's layers.
 */
export const syncProjectLayerPresentation = async (
  db: Database,
  projectId: Id,
  rows: Array<{ id: Id; rank: number; isDefaultVisible: boolean }>,
): Promise<void> => {
  if (rows.length === 0) return

  const existingRows = await autochunk(
    { items: rows.map(row => row.id), otherParametersCount: 1 },
    async rowIds =>
      await db.query.layer.findMany({
        where: and(eq(layer.projectId, projectId), inArray(layer.id, rowIds)),
        columns: {
          id: true,
        },
      }),
  )
  const existingIds = new Set(existingRows.map(row => row.id))

  await Promise.all(
    rows
      .filter(row => existingIds.has(row.id))
      .map(row =>
        db
          .update(layer)
          .set({
            rank: row.rank,
            isDefaultVisible: row.isDefaultVisible,
          })
          .where(and(eq(layer.projectId, projectId), eq(layer.id, row.id))),
      ),
  )
}

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
 * Cascades a layer publish-state change into descendant features.
 * Existing local publish snapshots are preserved while an ancestor remains unpublished.
 * @param db - The database instance.
 * @param params - The parent layer id and next publish state.
 * @returns A promise that resolves once descendant rows are updated.
 */
export const cascadeLayerPublishedStateToDescendants = async (
  db: Database,
  params: {
    layerId: Id
    state: boolean
  },
): Promise<void> => {
  await db
    .update(feature)
    .set({
      localIsPublished: params.state
        ? null
        : sql`coalesce(${feature.localIsPublished}, ${feature.isPublished})`,
      isPublished: params.state
        ? sql`coalesce(${feature.localIsPublished}, ${feature.isPublished})`
        : sql`0`,
    })
    .where(eq(feature.layerId, params.layerId))
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
 * Cascades a layer archive-state change into descendant features.
 * Existing local archive snapshots are preserved while an ancestor remains archived so
 * unarchiving restores the prior descendant state instead of reviving every record.
 *
 * When unarchiving (`state=false`), features are only restored from their
 * `localIsArchived` snapshot when neither the owning organisation nor the
 * owning project is still archived. If either ancestor remains archived,
 * features stay archived so that unarchiving a single layer cannot revive
 * records hidden by an ancestor.
 *
 * @param db - The database instance.
 * @param params - The parent layer id and next archived state.
 * @returns A promise that resolves once descendant rows are updated.
 */
export const cascadeLayerArchivedStateToDescendants = async (
  db: Database,
  params: {
    layerId: Id
    state: boolean
  },
): Promise<void> => {
  // Preserve feature archive snapshots until neither owning ancestor keeps them hidden.
  await db
    .update(feature)
    .set({
      localIsArchived: params.state
        ? sql`coalesce(${feature.localIsArchived}, ${feature.isArchived})`
        : sql`case
            when (
              select ${organisation.isArchived}
              from ${organisation}
              where ${organisation.id} = ${feature.organisationId}
            ) = 1 then ${feature.localIsArchived}
            when (
              select ${project.isArchived}
              from ${project}
              where ${project.id} = ${feature.projectId}
            ) = 1 then ${feature.localIsArchived}
            else null
          end`,
      isArchived: params.state
        ? sql`1`
        : sql`case
            when (
              select ${organisation.isArchived}
              from ${organisation}
              where ${organisation.id} = ${feature.organisationId}
            ) = 1 then 1
            when (
              select ${project.isArchived}
              from ${project}
              where ${project.id} = ${feature.projectId}
            ) = 1 then 1
            else coalesce(${feature.localIsArchived}, ${feature.isArchived})
          end`,
    })
    .where(eq(feature.layerId, params.layerId))
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
  const normalizedI18n = normalizeI18nLocaleRecord(
    i18n as Record<string, LayerI18nPartial>,
  ) as Record<LocaleKey, LayerI18nPartial>
  return await replaceManyRelated(
    db,
    layerI18n,
    toRelatedRecords(normalizedI18n, 'layerId', layerId, 'locale') as never,
    layerI18n.layerId,
    layerId,
  )
}

/**
 * Replaces all layer-property links for a layer.
 * Used by full replacement update flows.
 * @param db - Database used by the authorized layer workflow.
 * @param layerId - Authoritative target layer.
 * @param properties - Complete replacement set of links.
 * @returns Committed links hydrated with properties, translations, and values.
 * @remarks Deletion and all insert chunks commit atomically; a failed insert preserves existing links.
 */
export const updateProperties = async (
  db: Database,
  layerId: string,
  properties: LayerPropertyNew[],
): Promise<LayerPropertyDBRaw[]> => {
  // Keep SQL parameter chunks inside one transaction before hydrating the committed graph.
  await replaceManyRelated(
    db,
    layerProperty,
    properties.map(prop => ({ ...prop, layerId })),
    layerProperty.layerId,
    layerId,
  )
  return await listLayerPropertyLinks(db, layerId)
}

// ═══════════════════════
// 3.2 CRUD :: UPDATE (SYNC)
// ═══════════════════════

/**
 * Synchronizes each layer's property links against current project property state.
 * Used when project property assignments change and child layers must follow.
 * @param db - Database used by the authorized project workflow.
 * @param projectId - Project whose current layers must follow the submitted properties.
 * @param newProjectProperties - Resolved project property state.
 * @returns Nothing after all child-layer changes commit.
 * @remarks Diffs and inserts links without destructive full rewrites. Existing link
 * flags are preserved at write time; failures roll back every affected layer.
 */
export const syncProperties = async (
  db: Database,
  projectId: string,
  newProjectProperties: Property[],
): Promise<void> => {
  const targetProperties = newProjectProperties.filter(propertyRow => {
    if (!propertyRow?.id || typeof propertyRow.id !== 'string') return false
    if (propertyRow.scope === 'project') return true
    const enabled = (propertyRow as Property & { isEnabled?: boolean }).isEnabled
    return typeof enabled === 'boolean'
      ? enabled
      : Boolean(propertyRow.isDefaultEnabled)
  })
  const projectLayerIds = db
    .select({ id: layer.id })
    .from(layer)
    .where(eq(layer.projectId, projectId))

  // Resolve layer membership and obsolete links inside the transaction, without stale reads.
  const detach = db.delete(layerProperty).where(
    and(
      inArray(layerProperty.layerId, projectLayerIds),
      not(
        chunkedInArray(
          layerProperty.propertyId,
          targetProperties.map(row => row.id),
        ),
      ),
    ),
  )
  if (targetProperties.length === 0) {
    await db.batch([detach])
    return
  }

  // A bound JSON table keeps the parameter count fixed across all properties and layers.
  const incoming = JSON.stringify(
    targetProperties.map(row => ({
      id: row.id,
      enabled: Number(Boolean(row.isDefaultEnabled)),
    })),
  )
  const assignments = db
    .insert(layerProperty)
    .select(
      db
        .select({
          layerId: layer.id,
          propertyId: sql<string>`json_extract(incoming.value, '$.id')`.as(
            'propertyId',
          ),
          isVisible: sql<boolean>`json_extract(incoming.value, '$.enabled')`.as(
            'isVisible',
          ),
          isUserContributable:
            sql<boolean>`json_extract(incoming.value, '$.enabled')`.as(
              'isUserContributable',
            ),
        })
        .from(layer)
        .innerJoin(sql`json_each(${incoming}) as incoming`, sql`true`)
        .where(eq(layer.projectId, projectId)),
    )
    .onConflictDoNothing({ target: [layerProperty.layerId, layerProperty.propertyId] })

  // Conflicting links retain their live flags; a later failure also restores all detachments.
  await db.batch([detach, assignments])
}

// ═══════════════════════
// 4. CRUD :: DELETE
// ═══════════════════════
// No hard delete helpers in this module by design.
