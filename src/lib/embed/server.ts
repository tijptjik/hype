// FRAMEWORK
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, inArray, not, or, sql } from 'drizzle-orm'
// DB
import {
  layer,
  project,
  organisation,
  hub,
  feature,
  property,
} from '#lib/db/schema/index.js'
import { chunkedInArray } from '#lib/utils/batch-query.js'
import {
  historicalLayerVisibility,
  historicalFeatureVisibility,
} from '#lib/db/services/historicalLayers.js'
import { getLayerHubFilter } from '#lib/db/services/hub.js'
import { queryFeaturePage } from '#lib/db/services/featureQuery.js'
import { projectPropertyAudience } from '#lib/properties/audience.server.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { EmbedConfig } from './config'
import type { EmbedLayer, EmbedPayload, EmbedNames } from './embed.types'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. PUBLIC HIERARCHY
// - publicEmbedLayers
// - readEmbedLayers
// 2. PUBLIC FEATURES
// - readEmbed
// ---

/** Builds the public descendant selection with existing host visibility rules.
 * @param db Request database. @param config Explicit union selection, or null for builder catalogue.
 * @param host Trusted request hub. @returns Public layer ID subquery.
 * @remarks Publication applies to every ancestor, independently of session privileges.
 */
export function publicEmbedLayers(
  db: Database,
  config: EmbedConfig | null,
  host: HubOptsExtended,
) {
  const selection = config
    ? or(
        chunkedInArray(layer.id, config.layers),
        chunkedInArray(project.id, config.projects),
        chunkedInArray(organisation.id, config.organisations),
        chunkedInArray(hub.id, config.hubs),
      )
    : undefined
  return db
    .select({ id: layer.id })
    .from(layer)
    .innerJoin(
      project,
      and(
        eq(project.id, layer.projectId),
        eq(project.organisationId, layer.organisationId),
      ),
    )
    .innerJoin(organisation, eq(organisation.id, project.organisationId))
    .leftJoin(hub, eq(hub.id, organisation.hubId))
    .where(
      and(
        selection,
        config?.excluded?.length
          ? not(chunkedInArray(layer.id, config.excluded))
          : undefined,
        eq(layer.isPublished, true),
        eq(layer.isArchived, false),
        eq(project.isPublished, true),
        eq(project.isArchived, false),
        eq(organisation.isPublished, true),
        eq(organisation.isArchived, false),
        or(
          sql`${organisation.hubId} IS NULL`,
          and(eq(hub.isPublished, true), eq(hub.isArchived, false)),
        ),
        historicalLayerVisibility(),
        getLayerHubFilter(db, { ...host, isAdminRequest: false, isSuperAdmin: false }),
      ),
    )
}

/** Reads only the compact public hierarchy needed by the embed.
 * @param db Request database. @param config Selection or builder catalogue. @param host Request hub.
 * @returns Localized public layer rows.
 */
export async function readEmbedLayers(
  db: Database,
  config: EmbedConfig | null,
  host: HubOptsExtended,
): Promise<EmbedLayer[]> {
  const locale = (config?.lang ?? 'en').toLowerCase()
  // Correlated translation lookups avoid hydrating private ancestor metadata.
  const rows = await db
    .select({
      i18n: sql<string>`(select json_group_object(locale,json_object('name',name)) from layerI18n where layerId=${layer.id})`.mapWith(
        (value: string): EmbedNames => JSON.parse(value || '{}'),
      ),
      projectI18n:
        sql<string>`(select json_group_object(locale,json_object('name',name)) from projectI18n where projectId=${project.id})`.mapWith(
          (value: string): EmbedNames => JSON.parse(value || '{}'),
        ),
      organisationI18n:
        sql<string>`(select json_group_object(locale,json_object('name',name)) from organisationI18n where organisationId=${organisation.id})`.mapWith(
          (value: string): EmbedNames => JSON.parse(value || '{}'),
        ),
      id: layer.id,
      code: layer.id,
      projectCode: project.code,
      organisationCode: organisation.code,
      hubCode: hub.code,
      projectId: project.id,
      organisationId: organisation.id,
      hubId: organisation.hubId,
      hubName: hub.code,
      name: sql<string>`coalesce((select name from layerI18n where layerId=${layer.id} and locale=${locale}), ${layer.id})`,
      projectName: sql<string>`coalesce((select name from projectI18n where projectId=${project.id} and locale=${locale}), ${project.code})`,
      organisationName: sql<string>`coalesce((select name from organisationI18n where organisationId=${organisation.id} and locale=${locale}), ${organisation.code})`,
    })
    .from(layer)
    .innerJoin(project, eq(project.id, layer.projectId))
    .innerJoin(organisation, eq(organisation.id, project.organisationId))
    .leftJoin(hub, eq(hub.id, organisation.hubId))
    .where(inArray(layer.id, publicEmbedLayers(db, config, host)))
    .orderBy(organisation.code, project.code, layer.id)
  return rows
}

/** Loads a bounded public feature page inside the selected hierarchy.
 * @param db Request database. @param config Validated URL scope. @param host Trusted host hub.
 * @param cursor Last feature ID for continuation. @returns Public map payload without account state.
 * @remarks Every page rechecks ancestry; no caller can request draft, private, or internal fields.
 */
export async function readEmbed(
  db: Database,
  config: EmbedConfig,
  host: HubOptsExtended,
  cursor?: string,
): Promise<EmbedPayload> {
  if (cursor && !/^[\w:-]{1,100}$/.test(cursor)) throw error(400, 'Invalid cursor')
  const layers = await readEmbedLayers(db, config, host)
  const page = await queryFeaturePage(
    db,
    {
      limit: 250,
      includeCounts: !cursor,
      ...(cursor ? { cursor: { id: cursor, signature: '' } } : {}),
      meta: { isAdminRequest: false, scope: 'embed' },
    },
    [
      eq(feature.isPublished, true),
      eq(feature.isArchived, false),
      eq(feature.isDraft, false),
      historicalFeatureVisibility(),
      inArray(feature.layerId, publicEmbedLayers(db, config, host)),
      sql`exists(select 1 from layer l where l.id=${feature.layerId} and l.projectId=${feature.projectId} and l.organisationId=${feature.organisationId})`,
    ],
    { ...host, isAdminRequest: false, isSuperAdmin: false },
  )
  // Internal fields are removed even when an administrator previews their own embed.
  const internal = await db
    .select({ id: property.id })
    .from(property)
    .where(eq(property.audience, 'internal'))
  return {
    config,
    layers,
    page: projectPropertyAudience(page, new Set(internal.map(row => row.id))),
  }
}
