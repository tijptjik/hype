// SVELTEKIT
import { error, type RequestHandler } from '@sveltejs/kit'
// DOMAIN
import { interiorContext } from '#lib/indoor/floorplans/server.js'
import { premisesMapStorage } from '#lib/indoor/server/storage.js'

/** Serve retained source evidence only to the authorized building editor. @param event Source page route. @returns Original raster page or server-generated footprint diagram. */
export const GET: RequestHandler = async event => {
  await interiorContext(event)
  if (
    !/^[a-f0-9-]{36}$/.test(event.params.job!) ||
    (!/^(?:page|clean)-\d+\.png$/.test(event.params.page!) &&
      event.params.page !== 'footprint.svg')
  )
    error(404)
  const object = await premisesMapStorage(event.locals.platform).get(
    `interior-jobs/${event.params.id}/${event.params.job}/${event.params.page}`,
  )
  if (!object) error(404)
  return new Response(object.body as unknown as ReadableStream, {
    headers: {
      'Content-Type':
        event.params.page === 'footprint.svg' ? 'image/svg+xml' : 'image/png',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'none'; sandbox",
    },
  })
}
