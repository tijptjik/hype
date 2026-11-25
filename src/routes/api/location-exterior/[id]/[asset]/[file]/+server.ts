// SVELTE
import { error, type RequestHandler } from '@sveltejs/kit'
// DATABASE
import { eq, sql } from 'drizzle-orm'
import { setupRequestHandler } from '#lib/api/index.js'
import { locationExteriorModel } from '#lib/db/schema/locationExteriorModel.js'
// AUTHORIZATION
import { authorizeExteriorLocation } from '#lib/locations/exterior/authorize.server.js'
// STORAGE
import {
  textureComparisonBucket,
  textureComparisonFile,
} from '#lib/locations/exterior/textureComparison.server.js'
import { premisesMapBucket } from '#lib/indoor/server/storage.js'

/** Serve a file from the current authorized exterior model. @param event Request context. @returns Model file. */
export const GET: RequestHandler = async event => {
  const { params, locals, platform, request } = event
  const comparison = /^comparison-[0-9a-f]{64}\.glb$/.test(params.file ?? '')
  if (
    !params.id ||
    !params.asset ||
    !params.file ||
    !/^[a-f0-9-]{36}$/.test(params.asset) ||
    (params.file !== 'placement.json' &&
      !comparison &&
      !/^[a-zA-Z0-9_.-]+\.(gltf|bin|jpg|jpeg|png)$/i.test(params.file))
  )
    error(404, 'MODEL_NOT_FOUND')
  const ctx = {
    ...(await setupRequestHandler({
      locals,
      platform: locals.platform ?? platform,
      request,
    })),
    event,
  }
  await authorizeExteriorLocation(ctx, params.id)
  const model = await ctx.db
    .select()
    .from(locationExteriorModel)
    .where(eq(locationExteriorModel.locationId, params.id))
    .get()
  if (!model || model.assetId !== params.asset) error(404, 'MODEL_NOT_FOUND')
  // Pair each immutable geometry with its own reviewed floor alignment.
  if (params.file === 'placement.json') {
    const comparisonFile = await textureComparisonFile(locals.platform, model.assetId)
    const query = new URL(request.url).searchParams
    const savedRevision = query.get('revision')
    const alignmentFilter =
      savedRevision === null
        ? sql`a.revision=(SELECT max(b.revision) FROM locationExteriorAlignment b WHERE b.locationId=a.locationId AND b.assetId=a.assetId AND b.geometryId=a.geometryId)`
        : sql`a.geometryId=${query.get('geometry')} AND a.revision=${Number(savedRevision)}`
    const alignments = await ctx.db.all<{
      geometryId: string
      revision: number
      alignment: string
    }>(sql`
      SELECT a.geometryId, a.revision, a.alignment FROM locationExteriorAlignment a
      WHERE a.locationId=${model.locationId} AND a.assetId=${model.assetId}
      AND ${alignmentFilter}`)
    return Response.json(
      {
        comparisonFile,
        alignments: Object.fromEntries(
          alignments.map(row => [
            row.geometryId,
            { revision: row.revision, ...JSON.parse(row.alignment) },
          ]),
        ),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  const bucket = comparison
    ? textureComparisonBucket(locals.platform)
    : premisesMapBucket(locals.platform)
  const object = await bucket.get(`location-exteriors/${params.asset}/${params.file}`)
  if (!object) error(404, 'MODEL_NOT_FOUND')
  return new Response(object.body as unknown as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
