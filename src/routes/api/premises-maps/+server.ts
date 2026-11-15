// SVELTE
import { json, type RequestHandler } from '@sveltejs/kit'
// DATABASE
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
// DRIZZLE
import { isNotNull } from 'drizzle-orm'
// SCHEMA
import { premisesMap } from '#lib/db/schema/premisesMap.js'

/** Return the small published discovery projection, never drafts. @param event Request context. @returns Revalidated catalogue. */
export const GET: RequestHandler = async ({ locals }) => {
  const { db } = await getDatabaseWithoutAuth(locals.platform)
  const maps = await db
    .select({
      id: premisesMap.id,
      code: premisesMap.code,
      name: premisesMap.name,
      nameZh: premisesMap.nameZh,
      kind: premisesMap.kind,
      publishedHash: premisesMap.publishedHash,
      footprint: premisesMap.footprint,
    })
    .from(premisesMap)
    .where(isNotNull(premisesMap.publishedHash))
  return json(maps, { headers: { 'Cache-Control': 'no-cache' } })
}
