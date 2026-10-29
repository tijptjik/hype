// SVELTE
import { error } from '@sveltejs/kit'
// REMOTE
import { guardedQuery } from '#lib/api/server/guarded.js'
// DRIZZLE
import { and, eq, ne } from 'drizzle-orm'
// DOMAIN
import { BuildingSourceSchema } from '#lib/locations/buildingSource.js'
import { buildingLocationId } from '#lib/locations/buildingLocationId.js'
import { loadBuildingNames, loadBuildingDetails } from '#lib/sources/saanseoi.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { fillBuildingDetails } from '#lib/addresses/buildingSelection.js'
// SCHEMA
import { location } from '#lib/db/schema/location.js'

/** Open an imported shared building or read its release-pinned catalogue details.
 * @param source Catalogue building, release, and selected address alternative.
 * @returns A permanent Location target or a read-only preview; never writes records.
 * @remarks Requires an account. Private manual records cannot be discovered by catalogue ID.
 */
export const getBuildingLocationDetails = guardedQuery(BuildingSourceSchema, async (source, ctx) => {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  const id = await buildingLocationId(source.id, 'shared')
  // Prefer the existing shared record, preserving its retained corrections and stable identity.
  const existing = await ctx.db.select({ id: location.id }).from(location)
    .where(and(eq(location.id, id), ne(location.state, 'manual'))).get()
  if (existing) return { type: 'location' as const, locationId: existing.id }

  // Validate the selected release and address before exposing a catalogue-only preview.
  const bundle = await loadBuildingNames()
  if (bundle.release !== source.release) error(409, 'BUILDING_PUBLICATION_CHANGED')
  const record = bundle.records.find(row => row.id === source.id)
  if (!record) error(404, 'BUILDING_NOT_FOUND')
  const details = await loadBuildingDetails(source.id, source.release)
  const candidate = source.addressId ? details.addresses.find(row => row.id === source.addressId) : details.addresses[0]
  if (source.addressId && !candidate) error(404, 'BUILDING_ADDRESS_NOT_FOUND')
  const names = Object.fromEntries(Object.entries(record.names).filter((entry): entry is [string, string] => Boolean(entry[1])))
  if (!Object.keys(names).length && record.name) names.und = record.name
  const address = fillBuildingDetails(emptyFeatureAddress(), { ...record, names, release: bundle.release }, details, candidate, false, 'en')
  return { type: 'preview' as const, names, address }
})
