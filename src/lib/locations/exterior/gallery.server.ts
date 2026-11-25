// DRIZZLE
import { sql } from 'drizzle-orm'
// STORAGE
import { textureComparisonFile } from './textureComparison.server'
// TYPES
import type { Database } from '#lib/types.js'

/** Resolve the reviewed texture and front view for an authorized gallery entry.
 * @param db Request database. @param platform Stage asset bindings. @param model Current source association.
 * @returns The immutable comparison URL and its own front view, or the original model fallback.
 * @remarks The caller must authorize the Location before invoking this projection.
 */
export async function exteriorGalleryModel(
  db: Database,
  platform: App.Platform,
  model: {
    id: string
    assetId: string | null
    sourceModelId: string | null
    frontViewId: string | null
  },
): Promise<{
  exteriorUrl: string | null
  frontViewId: string | null
  exteriorVariant: 'AI-generated' | null
}> {
  if (!model.assetId || !model.sourceModelId)
    return { exteriorUrl: null, frontViewId: null, exteriorVariant: null }
  const comparison = await textureComparisonFile(platform, model.assetId)
  // A comparison's view IDs belong to its exact triangle layout, not the government assembly.
  const alignment = comparison
    ? await db.get<{ frontViewId: string | null }>(sql`
        SELECT alignment->>'$.frontViewId' frontViewId FROM locationExteriorAlignment
        WHERE locationId=${model.id} AND assetId=${model.assetId} AND geometryId=${comparison}
        ORDER BY revision DESC LIMIT 1`)
    : null
  const file = comparison ?? `${model.sourceModelId}.gltf`
  return {
    exteriorUrl: `/api/location-exterior/${encodeURIComponent(model.id)}/${encodeURIComponent(model.assetId)}/${encodeURIComponent(file)}`,
    exteriorVariant: comparison ? 'AI-generated' : null,
    frontViewId: comparison ? (alignment?.frontViewId ?? null) : model.frontViewId,
  }
}
