// SVELTEKIT
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { desc, eq } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded.js'
import { authorizeExteriorLocation } from '#lib/locations/exterior/authorize.server.js'
// DATABASE
import { locationRevision } from '#lib/db/schema/location.js'
// DOMAIN
import { loadExteriorFootprints } from '#lib/locations/exterior/footprints.server.js'
import { convertWGS84ToHK1980 } from '#lib/utils/geocoding.js'
import { footprintFloorplan } from '#lib/indoor/floorplans/footprint.js'
import { mapHash } from '#lib/indoor/releases.js'
import { premisesMapStorage } from '#lib/indoor/server/storage.js'
// TYPES
import type { Database } from '#lib/types.js'

// TOC: Building position | Nearby footprints | Retained review source
const identity = z.object({ locationId: z.string().min(1).max(200) })

/** Read the authorized building's retained position rather than accepting a client search centre.
 * @param db Request database. @param locationId Authorized building ID.
 * @returns Geographic centre and revision used to fence the selection.
 */
async function buildingPosition(
  db: Database,
  locationId: string,
): Promise<{ coordinates: [number, number]; revisionId: string }> {
  const revision = await db
    .select()
    .from(locationRevision)
    .where(eq(locationRevision.locationId, locationId))
    .orderBy(desc(locationRevision.version))
    .get()
  const coordinates = revision?.facts.location.geometry.coordinates
  if (!revision || !coordinates)
    error(409, 'Add a building position before choosing a footprint.')
  return { coordinates, revisionId: revision.id }
}

/** Find building outlines near the saved address position without loading exterior models.
 * @param input Building ID. @returns Footprints and the position used by the map.
 */
export const findLocationInteriorFootprints = guardedQuery(
  identity,
  async (input, ctx) => {
    if (!ctx.user.superAdmin || ctx.user.isAnonymous) error(403, 'SUPER_ADMIN_REQUIRED')
    await authorizeExteriorLocation(ctx, input.locationId)
    const position = await buildingPosition(ctx.db, input.locationId)
    const [x, y] = convertWGS84ToHK1980(...position.coordinates)
    return { ...position, footprints: await loadExteriorFootprints(x, y) }
  },
)

/** Retain an explicitly selected source outline for the existing interior review/save flow.
 * @param input Building, source footprint/part, floor label and observed revision.
 * @returns Opaque review job ID; the current indoor draft is unchanged until Save.
 * @remarks Source geometry is fetched again server-side; no rooms or canonical parts are inferred.
 */
export const prepareLocationInteriorFootprint = guardedCommand(
  identity.extend({
    revisionId: z.string().min(1).max(200),
    footprintId: z.string().min(1).max(200),
    footprintHash: z.string().regex(/^[a-f0-9]{64}$/),
    polygonIndex: z.number().int().min(0).max(2999),
    label: z.string().trim().min(1).max(200),
  }),
  async (input, ctx) => {
    if (!ctx.user.superAdmin || ctx.user.isAnonymous) error(403, 'SUPER_ADMIN_REQUIRED')
    await authorizeExteriorLocation(ctx, input.locationId)
    const position = await buildingPosition(ctx.db, input.locationId)
    if (position.revisionId !== input.revisionId)
      error(409, 'Building changed; reopen the footprint map.')
    const [x, y] = convertWGS84ToHK1980(...position.coordinates)
    const footprints = await loadExteriorFootprints(x, y)
    const feature = footprints.features.find(
      item => item.properties.csuid === input.footprintId,
    )
    if (!feature) error(409, 'Footprint is no longer available; reopen the map.')
    if ((await mapHash(JSON.stringify(feature))) !== input.footprintHash)
      error(409, 'Footprint changed; reopen the map and review the updated outline.')
    let prepared: ReturnType<typeof footprintFloorplan>
    try {
      prepared = footprintFloorplan(feature, input.polygonIndex, input.label)
    } catch {
      error(
        400,
        'This footprint part cannot be used as a floor boundary. Choose another part or upload a plan.',
      )
    }
    const id = crypto.randomUUID()
    const bucket = premisesMapStorage(ctx.event.locals.platform)
    const prefix = `interior-jobs/${input.locationId}/${id}`
    const floor = prepared.extraction.floors[0]
    const receipt = {
      id,
      actorId: ctx.user.id,
      createdAt: new Date().toISOString(),
      locationRevisionId: position.revisionId,
      pages: [[floor.width, floor.height]],
      source: prepared.source,
    }
    // Publish the recoverable job pointer only after its immutable source and result exist.
    await bucket.put(`${prefix}/footprint.svg`, prepared.image)
    await bucket.put(`${prefix}/receipt.json`, JSON.stringify(receipt))
    await bucket.put(
      `${prefix}/result.json`,
      JSON.stringify({
        status: 'needs-review',
        extraction: prepared.extraction,
        pages: ['footprint.svg'],
        receipt,
      }),
    )
    await bucket.put(
      `interior-jobs/${input.locationId}/active.json`,
      JSON.stringify({ id }),
    )
    return { id }
  },
)
