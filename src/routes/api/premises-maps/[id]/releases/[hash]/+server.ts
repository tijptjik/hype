// SVELTE
import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
// DATABASE
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
// DOMAIN
import { mapIdSchema, releaseHashSchema, mapReleaseKey } from '#lib/indoor/releases.js'
import { publishedMapReader } from '#lib/indoor/server/storage.js'
import { publishedMapRelease } from '#lib/db/services/premisesMap.js'

/** Serve only published immutable R2 objects; hashes are not authorization for draft access. @param event Release request. @returns Cacheable exact bundle bytes. */
export const GET: RequestHandler = async ({ locals, params, request }) => {
  const { db } = await getDatabaseWithoutAuth(locals.platform)
  if (
    !mapIdSchema.safeParse(params.id).success ||
    !releaseHashSchema.safeParse(params.hash).success
  )
    error(404, 'MAP_RELEASE_NOT_FOUND')
  if (!(await publishedMapRelease(db, params.id, params.hash)))
    error(404, 'MAP_RELEASE_NOT_FOUND')
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: `"${params.hash}"`,
    'X-Content-Type-Options': 'nosniff',
  }
  if (request.headers.get('If-None-Match') === headers.ETag)
    return new Response(null, { status: 304, headers })
  const object = await publishedMapReader(locals.platform).get(
    mapReleaseKey(params.id, params.hash),
  )
  if (!object) error(503, 'MAP_RELEASE_UNAVAILABLE')
  return new Response(object.body as unknown as ReadableStream<Uint8Array>, { headers })
}
