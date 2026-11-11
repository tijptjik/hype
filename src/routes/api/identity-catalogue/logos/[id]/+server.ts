// SVELTE
import { error, type RequestHandler } from '@sveltejs/kit'
// STORAGE
import { getDerivedBucketForStage, toImageStage } from '#lib/images/storage.js'

/** Serve an immutable public catalogue logo from the current environment's asset bucket.
 * @param event Request with a validated opaque asset identity. @returns PNG response or 404.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!/^[a-f0-9-]{36}$/.test(params.id ?? '')) error(404, 'LOGO_NOT_FOUND')
  const bucket = getDerivedBucketForStage(
    locals.platform,
    toImageStage(locals.platform?.env.ENVIRONMENT),
  )
  const object = await bucket.get(`identity-catalogue/${params.id}.png`)
  if (!object) error(404, 'LOGO_NOT_FOUND')
  return new Response(await object.arrayBuffer(), {
    headers: {
      'Content-Type': 'image/png',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
