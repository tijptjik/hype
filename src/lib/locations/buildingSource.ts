// VALIDATION
import { z } from 'zod'

/** Public export identity, independent of SaanSeoi Places ssIDs and Address IDs. */
export const BuildingSourceSchema = z.strictObject({
  id: z.string().min(1).max(200),
  release: z.string().min(1).max(200),
  addressId: z.string().min(1).max(200).optional(),
})
export type BuildingSource = z.infer<typeof BuildingSourceSchema>

/** Link to a building in a specific publication, optionally focusing an address.
 * @param source Published building identity, release and optional candidate address.
 * @param preferImported Whether to open the shared HYPE Location when one exists.
 * @returns Admin detail URL for this source and address.
 */
export function buildingSourceHref(
  source: BuildingSource,
  preferImported = false,
): string {
  const params = new URLSearchParams({ release: source.release })
  if (source.addressId) params.set('address', source.addressId)
  if (preferImported) params.set('view', 'location')
  return `/admin/locations/building/${encodeURIComponent(source.id)}?${params}`
}
