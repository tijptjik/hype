// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { buildingLocationId } from '#lib/locations/buildingLocationId.js'
// TYPES
import type { Database } from '#lib/types.js'

/** Resolve the shared source identity, including constituents retained before the importer ran.
 * @param db Request database. @param sourceId SaanSeoi Building ID. @returns Stable shared HYPE ID.
 */
export async function sharedBuildingImportId(
  db: Database,
  sourceId: string,
): Promise<string> {
  const legacy = await db.get<{
    id: string
  }>(sql`SELECT l.id FROM location l JOIN locationRevision r ON r.locationId=l.id AND r.version=1
    WHERE l.id=${'building-member:' + sourceId} AND json_extract(r.rawSource,'$.buildingSource.id')=${sourceId}`)
  return legacy?.id ?? buildingLocationId(sourceId, 'shared')
}
