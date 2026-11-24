// SVELTE
import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
// DATABASE
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
// DRIZZLE
import { eq } from 'drizzle-orm'
// SCHEMA
import { premisesMap } from '#lib/db/schema/premisesMap.js'

/** Resolve the current published release without caching a mutable pointer. @param event Map request. @returns Public release URL and metadata. */
export const GET: RequestHandler = async ({ locals, params }) => {
  const { db } = await getDatabaseWithoutAuth(locals.platform)
  const map = await db
    .select()
    .from(premisesMap)
    .where(eq(premisesMap.id, params.id))
    .get()
  if (!map?.publishedHash) error(404, 'MAP_NOT_PUBLISHED')
  return json(
    {
      id: map.id,
      code: map.code,
      name: map.name,
      nameZh: map.nameZh,
      kind: map.kind,
      hash: map.publishedHash,
      version: map.publishedVersion,
      url: `/api/premises-maps/${map.id}/releases/${map.publishedHash}`,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
