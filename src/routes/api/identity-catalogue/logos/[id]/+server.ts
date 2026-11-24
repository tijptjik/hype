// SVELTE
import { dev } from '$app/env'
import { error, type RequestHandler } from '@sveltejs/kit'
// STORAGE
import { getDerivedBucketForStage, toImageStage } from '#lib/images/storage.js'

/** Serve an immutable public catalogue logo from the current environment's asset bucket.
 * @param event Request with a validated opaque asset identity. @returns PNG or SVG response, or 404.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!/^[a-f0-9-]{36}$/.test(params.id ?? '')) error(404, 'LOGO_NOT_FOUND')
  const bucket = getDerivedBucketForStage(
    locals.platform,
    toImageStage(locals.platform?.env.ENVIRONMENT),
  )
  // Research stays in local R2; published logos retain their configured bucket fallback.
  const localBucket = dev ? locals.platform?.env.CATALOGUE_LOCAL_ASSETS : undefined
  const prefix = `identity-catalogue/${params.id}`
  const object =
    (await localBucket?.get(`${prefix}.png`)) ??
    (await localBucket?.get(`${prefix}.svg`)) ??
    (await bucket.get(`${prefix}.png`)) ??
    (await bucket.get(`${prefix}.svg`))
  if (!object) error(404, 'LOGO_NOT_FOUND')
  return new Response(await object.arrayBuffer(), {
    headers: {
      'Content-Type': object.key.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
