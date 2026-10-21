// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
// VALIDATION
import { LocationFactsSchema } from '#lib/locations/validation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationBrand } from '#lib/locations/model.js'

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
): Promise<{ revision: string; brands: LocationBrand[] } | null> {
  const row = await db
    .select({
      data: feature.localLocationBrands,
    })
    .from(feature)
    .where(
      and(
        eq(feature.id, featureId),
        eq(feature.projectId, projectId),
        eq(feature.isDraft, false),
        sql`NOT EXISTS (SELECT 1 FROM featureLocation WHERE featureId=${featureId})`,
      ),
    )
    .get()
  return row?.data
    ? {
        revision: row.data.revision,
        brands: LocationFactsSchema.shape.brands.parse(row.data.brands),
      }
    : null
}
