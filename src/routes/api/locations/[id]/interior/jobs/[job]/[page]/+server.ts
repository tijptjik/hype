// SVELTEKIT
import { error, type RequestHandler } from '@sveltejs/kit'
// DOMAIN
import { interiorContext } from '#lib/indoor/floorplans/server.js'
import { premisesMapBucket } from '#lib/indoor/server/storage.js'

/** Serve retained source evidence only to the authorized building editor. @param event Source page route. @returns Original raster page. */
export const GET: RequestHandler = async event => {
  await interiorContext(event)
  if (
    !/^[a-f0-9-]{36}$/.test(event.params.job!) ||
    !/^page-\d+\.png$/.test(event.params.page!)
  )
    error(404)
  const object = await premisesMapBucket(event.locals.platform).get(
    `interior-jobs/${event.params.id}/${event.params.job}/${event.params.page}`,
  )
  if (!object) error(404)
  return new Response(object.body as unknown as ReadableStream, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' },
  })
}
