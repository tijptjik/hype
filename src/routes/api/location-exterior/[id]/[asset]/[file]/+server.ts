// SVELTE
import { error, type RequestHandler } from '@sveltejs/kit'
// DATABASE
import { eq } from 'drizzle-orm'
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
  // Check access to the current model before Recorder reuses its downloaded assets.
  if (params.file === 'placement.json') {
    const comparisonFile = await textureComparisonFile(locals.platform, model.assetId)
    return Response.json(
      { comparisonFile },
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
