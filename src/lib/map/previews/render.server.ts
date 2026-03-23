import { and, desc, eq, inArray, sql } from 'drizzle-orm'

// DB
import { feature, layer, mapStyles, project, projectMapStyles } from '$lib/db/schema'
import { getFeatureWithRelations, toListResponseShape } from '$lib/api/services/feature'
import { listFeatures } from '$lib/db/services/feature'
// TYPES
import type { Database } from '$lib/types'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { FeatureCollection, GeometryObject } from 'geojson'
// HELPERS
import { buildPreviewRenderJob } from './jobs.server'
import type { PreviewRenderJob } from '../../types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. HASH HELPERS
//    - getPreviewRefreshCutoffIso
//    - hashPreviewPayload
//
// 2. RENDER DATA LOADERS
//    - getLayerPreviewRenderData
//    - getProjectPreviewRenderData
//
// 3. REFRESH PLANNING
//    - planLayerPreviewRefreshJobs
//    - planProjectPreviewRefreshJobs

const DEFAULT_STYLE_CODE = 'hyper'

type PreviewFeatureRow = {
  id: string
  layerId: string
  modifiedAt: string
  geometry: GeometryObject
}

type PreviewLayerRow = {
  id: string
  rank: number
  modifiedAt: string
}

type MapEntityPreviewRenderData = {
  styleCode: string
  featureCollection: FeatureCollection
  features: PreviewFeatureRow[]
  featureRecords: FeatureFromCollection[]
  layers: PreviewLayerRow[]
  selectedLayerIds: string[]
  modifiedAt: string
}

/**
 * Returns the ISO timestamp used as the lower bound for scheduled preview refresh checks.
 *
 * @param sinceHours Number of hours to look back from now.
 * @returns ISO timestamp string.
 */
export const getPreviewRefreshCutoffIso = (sinceHours: number): string =>
  new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString()

const toFeatureCollection = (features: PreviewFeatureRow[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features: features.map(featureRow => ({
    type: 'Feature',
    id: featureRow.id,
    properties: {
      featureId: featureRow.id,
      layerId: featureRow.layerId,
      modifiedAt: featureRow.modifiedAt,
    },
    geometry: featureRow.geometry,
  })),
})

const hashPreviewPayload = async (value: unknown): Promise<string> => {
  const payload = new TextEncoder().encode(JSON.stringify(value))
  const hashBuffer = await crypto.subtle.digest('SHA-256', payload)

  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

const getProjectMapStyleCode = async (
  db: Database,
  projectId: string,
): Promise<string> => {
  const rows = await db
    .select({
      code: mapStyles.code,
    })
    .from(projectMapStyles)
    .innerJoin(mapStyles, eq(projectMapStyles.mapStyleId, mapStyles.id))
    .where(eq(projectMapStyles.projectId, projectId))
    .limit(1)

  return rows[0]?.code ?? DEFAULT_STYLE_CODE
}

const getLayerFeatures = async (
  db: Database,
  layerIds: string[],
  options: {
    includeUnpublished?: boolean
  } = {},
): Promise<PreviewFeatureRow[]> => {
  if (layerIds.length === 0) {
    return []
  }

  const conditions = [eq(feature.isArchived, false), inArray(feature.layerId, layerIds)]

  if (!options.includeUnpublished) {
    conditions.unshift(eq(feature.isPublished, true))
  }

  return await db
    .select({
      id: feature.id,
      layerId: feature.layerId,
      modifiedAt: feature.modifiedAt,
      geometry: feature.geometry,
    })
    .from(feature)
    .where(and(...conditions))
    .orderBy(feature.layerId, feature.id)
}

const getPreviewFeatureRecords = async (
  db: Database,
  layerIds: string[],
  options: {
    includeUnpublished?: boolean
  } = {},
): Promise<FeatureFromCollection[]> => {
  if (layerIds.length === 0) {
    return []
  }

  const conditions = [eq(feature.isArchived, false), inArray(feature.layerId, layerIds)]

  if (!options.includeUnpublished) {
    conditions.unshift(eq(feature.isPublished, true))
  }

  const result = await listFeatures(
    db,
    getFeatureWithRelations('list'),
    conditions,
    {
      id: null,
      code: 'preview',
      isCore: true,
    } as never,
    undefined,
    {
      sortBy: 'modifiedAt',
      sortOrder: 'desc',
    },
  )

  const shaped = await toListResponseShape(result as never, 'list')
  return shaped.data
}

/**
 * Loads the deterministic payload needed to render one layer preview.
 *
 * @param db Database connection.
 * @param layerId Target layer id.
 * @returns Render payload or `null` when the layer should not produce a preview.
 */
export const getLayerPreviewRenderData = async (
  db: Database,
  layerId: string,
): Promise<MapEntityPreviewRenderData | null> => {
  const rows = await db
    .select({
      id: layer.id,
      projectId: layer.projectId,
      modifiedAt: layer.modifiedAt,
      rank: layer.rank,
    })
    .from(layer)
    .where(and(eq(layer.id, layerId), eq(layer.isArchived, false)))
    .limit(1)

  const targetLayer = rows[0]
  if (!targetLayer) {
    return null
  }

  const styleCode = await getProjectMapStyleCode(db, targetLayer.projectId)
  const features = await getLayerFeatures(db, [layerId], {
    includeUnpublished: true,
  })
  const featureRecords = await getPreviewFeatureRecords(db, [layerId], {
    includeUnpublished: true,
  })

  return {
    styleCode,
    featureCollection: toFeatureCollection(features),
    features,
    featureRecords,
    layers: [
      {
        id: targetLayer.id,
        rank: targetLayer.rank,
        modifiedAt: targetLayer.modifiedAt,
      },
    ],
    selectedLayerIds: [targetLayer.id],
    modifiedAt: targetLayer.modifiedAt,
  }
}

/**
 * Loads the deterministic payload needed to render one project preview.
 *
 * @param db Database connection.
 * @param projectId Target project id.
 * @returns Render payload or `null` when the project should not produce a preview.
 */
export const getProjectPreviewRenderData = async (
  db: Database,
  projectId: string,
): Promise<MapEntityPreviewRenderData | null> => {
  const projectRows = await db
    .select({
      id: project.id,
      modifiedAt: project.modifiedAt,
    })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  const targetProject = projectRows[0]
  if (!targetProject) {
    return null
  }

  const defaultVisibleLayers = await db
    .select({
      id: layer.id,
      rank: layer.rank,
      modifiedAt: layer.modifiedAt,
    })
    .from(layer)
    .where(
      and(
        eq(layer.projectId, projectId),
        eq(layer.isDefaultVisible, true),
        eq(layer.isPublished, true),
        eq(layer.isArchived, false),
      ),
    )
    .orderBy(layer.rank, layer.id)

  const features = await getLayerFeatures(
    db,
    defaultVisibleLayers.map(layerRow => layerRow.id),
  )
  const selectedLayerIds = defaultVisibleLayers.map(layerRow => layerRow.id)
  const featureRecords = await getPreviewFeatureRecords(db, selectedLayerIds)
  const styleCode = await getProjectMapStyleCode(db, projectId)

  return {
    styleCode,
    featureCollection: toFeatureCollection(features),
    features,
    featureRecords,
    layers: defaultVisibleLayers,
    selectedLayerIds,
    modifiedAt: targetProject.modifiedAt,
  }
}

export const buildLayerPreviewHash = async (
  renderData: MapEntityPreviewRenderData,
): Promise<string> =>
  hashPreviewPayload({
    styleCode: renderData.styleCode,
    layer: renderData.layers[0],
    features: renderData.features.map(featureRow => ({
      id: featureRow.id,
      modifiedAt: featureRow.modifiedAt,
    })),
  })

export const buildProjectPreviewHash = async (
  renderData: MapEntityPreviewRenderData,
): Promise<string> =>
  hashPreviewPayload({
    styleCode: renderData.styleCode,
    projectModifiedAt: renderData.modifiedAt,
    layers: renderData.layers.map(layerRow => ({
      id: layerRow.id,
      rank: layerRow.rank,
      modifiedAt: layerRow.modifiedAt,
    })),
    features: renderData.features.map(featureRow => ({
      id: featureRow.id,
      layerId: featureRow.layerId,
      modifiedAt: featureRow.modifiedAt,
    })),
  })

const buildLayerPreviewRefreshCandidates = async (
  db: Database,
  cutoffIso: string,
  force: boolean,
): Promise<string[]> => {
  if (force) {
    const rows = await db
      .select({
        id: layer.id,
      })
      .from(layer)
      .where(eq(layer.isArchived, false))
      .orderBy(desc(layer.modifiedAt), layer.id)

    return rows.map(row => row.id)
  }

  const rows = await db
    .select({
      id: layer.id,
    })
    .from(layer)
    .where(
      and(
        eq(layer.isArchived, false),
        sql`(
          ${layer.modifiedAt} >= ${cutoffIso}
          OR EXISTS (
            SELECT 1
            FROM "feature"
            WHERE "feature"."layerId" = ${layer.id}
              AND "feature"."isArchived" = 0
              AND "feature"."modifiedAt" >= ${cutoffIso}
          )
        )`,
      ),
    )
    .orderBy(desc(layer.modifiedAt), layer.id)

  return rows.map(row => row.id)
}

const buildProjectPreviewRefreshCandidates = async (
  db: Database,
  cutoffIso: string,
  force: boolean,
): Promise<string[]> => {
  if (force) {
    const rows = await db
      .select({
        id: project.id,
      })
      .from(project)
      .orderBy(desc(project.modifiedAt), project.id)

    return rows.map(row => row.id)
  }

  const rows = await db
    .select({
      id: project.id,
    })
    .from(project)
    .where(
      sql`(
        ${project.modifiedAt} >= ${cutoffIso}
        OR EXISTS (
          SELECT 1
          FROM "layer"
          WHERE "layer"."projectId" = ${project.id}
            AND "layer"."isDefaultVisible" = 1
            AND "layer"."isPublished" = 1
            AND "layer"."isArchived" = 0
            AND "layer"."modifiedAt" >= ${cutoffIso}
        )
        OR EXISTS (
          SELECT 1
          FROM "feature"
          INNER JOIN "layer" AS "defaultLayer"
            ON "defaultLayer"."id" = "feature"."layerId"
          WHERE "defaultLayer"."projectId" = ${project.id}
            AND "defaultLayer"."isDefaultVisible" = 1
            AND "defaultLayer"."isPublished" = 1
            AND "defaultLayer"."isArchived" = 0
            AND "feature"."isPublished" = 1
            AND "feature"."isArchived" = 0
            AND "feature"."modifiedAt" >= ${cutoffIso}
        )
      )`,
    )
    .orderBy(desc(project.modifiedAt), project.id)

  return rows.map(row => row.id)
}

/**
 * Plans layer preview render jobs for layers that changed within the requested time window.
 *
 * @param db Database connection.
 * @param publicOrigin Public app origin used to build headless URLs.
 * @param renderToken Internal preview render token for protected payload routes.
 * @param sinceHours Lookback window in hours.
 * @returns Queue-ready render jobs.
 */
export const planLayerPreviewRefreshJobs = async (
  db: Database,
  publicOrigin: string | null | undefined,
  renderToken: string | null | undefined,
  sinceHours: number,
  force: boolean = false,
): Promise<PreviewRenderJob[]> => {
  const cutoffIso = getPreviewRefreshCutoffIso(sinceHours)
  const candidateIds = await buildLayerPreviewRefreshCandidates(db, cutoffIso, force)
  const jobs: PreviewRenderJob[] = []

  for (const layerId of candidateIds) {
    const renderData = await getLayerPreviewRenderData(db, layerId)

    if (!renderData) {
      continue
    }

    jobs.push(
      buildPreviewRenderJob(
        publicOrigin,
        'layers',
        layerId,
        await buildLayerPreviewHash(renderData),
        renderToken,
      ),
    )
  }

  return jobs
}

/**
 * Plans project preview render jobs for projects that changed within the requested time window.
 *
 * @param db Database connection.
 * @param publicOrigin Public app origin used to build headless URLs.
 * @param renderToken Internal preview render token for protected payload routes.
 * @param sinceHours Lookback window in hours.
 * @returns Queue-ready render jobs.
 */
export const planProjectPreviewRefreshJobs = async (
  db: Database,
  publicOrigin: string | null | undefined,
  renderToken: string | null | undefined,
  sinceHours: number,
  force: boolean = false,
): Promise<PreviewRenderJob[]> => {
  const cutoffIso = getPreviewRefreshCutoffIso(sinceHours)
  const candidateIds = await buildProjectPreviewRefreshCandidates(db, cutoffIso, force)
  const jobs: PreviewRenderJob[] = []

  for (const projectId of candidateIds) {
    const renderData = await getProjectPreviewRenderData(db, projectId)

    if (!renderData) {
      continue
    }

    jobs.push(
      buildPreviewRenderJob(
        publicOrigin,
        'projects',
        projectId,
        await buildProjectPreviewHash(renderData),
        renderToken,
      ),
    )
  }

  return jobs
}
