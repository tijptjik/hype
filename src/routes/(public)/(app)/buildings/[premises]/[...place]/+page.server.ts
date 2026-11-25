// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, isNotNull } from 'drizzle-orm'
// DATABASE
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
import { premisesMap } from '#lib/db/schema/premisesMap.js'
// TYPES
import type { PageServerLoad } from './$types'

/** Validates a published building map without changing Location classifications.
 * @param event Route parameters and database bindings.
 * @returns Empty data; the shared indoor surface loads the geometry.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
  // Published plan units use a floor slug and a polygon slug, each up to 100 characters.
  if (params.place && !/^places\/[a-z0-9][a-z0-9-]{0,200}$/.test(params.place))
    error(404, 'Place not found')
  const { db } = await getDatabaseWithoutAuth(locals.platform)
  const map = await db
    .select({ id: premisesMap.id })
    .from(premisesMap)
    .where(
      and(
        eq(premisesMap.id, params.premises),
        eq(premisesMap.kind, 'building'),
        isNotNull(premisesMap.publishedHash),
      ),
    )
    .get()
  if (!map) error(404, 'Building map not found')
  return {}
}
