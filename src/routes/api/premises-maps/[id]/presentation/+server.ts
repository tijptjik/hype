// SVELTE
import { json, error, type RequestHandler } from '@sveltejs/kit'
// DATABASE
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
// DRIZZLE
import { eq } from 'drizzle-orm'
// SCHEMA
import { premisesMap } from '#lib/db/schema/premisesMap.js'
// SERVICES
import { premisesMapArtwork } from '#lib/db/services/premisesMapPresentation.js'

/** Return current public occupancy artwork without pinning it to geometry. @param event Map request. @returns Live database-derived logo projection. */
export const GET: RequestHandler = async ({ locals, params }) => {
  const { db } = await getDatabaseWithoutAuth(locals.platform)
  const map = await db
    .select({ hash: premisesMap.publishedHash })
    .from(premisesMap)
    .where(eq(premisesMap.id, params.id))
    .get()
  if (!map?.hash) error(404, 'MAP_NOT_PUBLISHED')
  return json(await premisesMapArtwork(db, params.id), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
