// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { sql } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded'
// DOMAIN
import { authorizeExteriorLocation } from '#lib/locations/exterior/authorize.server.js'
import { textureComparisonFile } from '#lib/locations/exterior/textureComparison.server.js'

// TOC: Model identity | Alignment read and save
const identity = z.object({
  locationId: z.string().min(1).max(200),
  assetId: z.uuid(),
  geometryId: z.union([z.uuid(), z.string().regex(/^comparison-[0-9a-f]{64}\.glb$/)]),
})
const line = z.object({
  id: z.string().min(1).max(100),
  locked: z.boolean(),
  elevation: z.number().finite(),
  designation: z
    .object({
      type: z.enum(['basement', 'ground', 'floor']),
      number: z.number().int().min(1).max(999),
      name: z.string().max(1000).optional(),
    })
    .optional(),
})
const alignment = z.object({
  frontViewId: z
    .string()
    .regex(/^view-[0-9]+$/)
    .max(30),
  lines: z
    .array(line)
    .min(2)
    .max(301)
    .refine(
      rows =>
        new Set(rows.map(row => row.id)).size === rows.length &&
        rows.every((row, i) => i === 0 || row.elevation > rows[i - 1].elevation),
    ),
})

/** Read the latest reviewed alignment for the current model and geometry.
 * @param input Location, government asset and exact geometry.
 * @returns Saved floor boundaries and front view, or null on first review.
 */
export const getExteriorAlignment = guardedQuery(identity, async (input, ctx) => {
  await authorizeExteriorLocation(ctx, input.locationId)
  const row = await ctx.db.get<{ revision: number; alignment: string }>(sql`
    SELECT a.revision,a.alignment FROM locationExteriorAlignment a
    JOIN locationExteriorModel m ON m.locationId=a.locationId AND m.assetId=a.assetId
    WHERE a.locationId=${input.locationId} AND a.assetId=${input.assetId} AND a.geometryId=${input.geometryId}
    ORDER BY a.revision DESC LIMIT 1`)
  return row
    ? { revision: row.revision, ...alignment.parse(JSON.parse(row.alignment)) }
    : null
})

/** Append a reviewed model revision when both the source and previous save still match.
 * @param input Model identity, expected revision and reviewed floor alignment.
 * @returns The committed revision number.
 */
export const saveExteriorAlignment = guardedCommand(
  identity.extend({
    expectedRevision: z.number().int().nonnegative(),
    alignment,
  }),
  async (input, ctx) => {
    await authorizeExteriorLocation(ctx, input.locationId)
    if (!ctx.user.superAdmin) error(403, 'INSUFFICIENT_ROLE')
    const { locationId, assetId, geometryId, expectedRevision } = input
    if (
      geometryId !== assetId &&
      geometryId !== (await textureComparisonFile(ctx.event.locals.platform, assetId))
    )
      error(409, 'The model changed. Reload before saving.')
    const revision = expectedRevision + 1
    // A single D1 statement compares the current source and version while appending the edit.
    const saved = await ctx.db.get<{ revision: number }>(sql`
    INSERT INTO locationExteriorAlignment (locationId,assetId,geometryId,revision,alignment,actorId,savedAt)
    SELECT ${locationId},${assetId},${geometryId},${revision},${JSON.stringify(input.alignment)},${ctx.user.id},${new Date().toISOString()}
    WHERE EXISTS (SELECT 1 FROM locationExteriorModel WHERE locationId=${locationId} AND assetId=${assetId})
    AND ${expectedRevision}=COALESCE((SELECT MAX(revision) FROM locationExteriorAlignment WHERE locationId=${locationId} AND assetId=${assetId} AND geometryId=${geometryId}),0)
    RETURNING revision`)
    if (!saved) error(409, 'A newer model or alignment was saved. Reload to review it.')
    return { revision: saved.revision }
  },
)
