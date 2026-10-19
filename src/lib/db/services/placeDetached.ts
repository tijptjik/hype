// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { featurePlaceDetached } from '../schema/place'
// VALIDATION
import { PlaceFactsSchema } from '#lib/places/validation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { PlaceBrand } from '#lib/places/model.js'

/**
 * Read Feature-owned brands after unlink under the persisted Feature scope.
 * @param db Request-local database.
 * @param featureId Feature already authorized for reading.
 * @param projectId Persisted project from the authorization probe.
 * @returns Detached revision and brands, or null for linked, draft or missing Features.
 */
export async function getDetachedFeatureBrands(
  db: Database,
  featureId: string,
  projectId: string,
): Promise<{ revision: string; brands: PlaceBrand[] } | null> {
  const row = await db
    .select({
      revision: featurePlaceDetached.revision,
      brands: featurePlaceDetached.brands,
    })
    .from(featurePlaceDetached)
    .innerJoin(feature, eq(feature.id, featurePlaceDetached.featureId))
    .where(
      and(
        eq(feature.id, featureId),
        eq(feature.projectId, projectId),
        eq(feature.isDraft, false),
        sql`NOT EXISTS (SELECT 1 FROM featurePlace WHERE featureId=${featureId})`,
      ),
    )
    .get()
  return row
    ? {
        revision: row.revision,
        brands: PlaceFactsSchema.shape.brands.parse(row.brands),
      }
    : null
}
