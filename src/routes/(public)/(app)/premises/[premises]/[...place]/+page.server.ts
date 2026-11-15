// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, isNotNull } from 'drizzle-orm'
// DATABASE
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
import { premisesMap } from '#lib/db/schema/premisesMap.js'
// DOMAIN
import { stations } from '#lib/indoor/registry.js'
// TYPES
import type { PageServerLoad } from './$types'

/** Validates the public premises namespace. @param event Route parameters and database bindings. @returns Empty page data; the shared surface loads source geometry. @remarks Published complex paths are resolved from the database because the browser discovery catalogue is not initialized during server rendering. */
export const load: PageServerLoad = async ({ params, locals }) => {
  // Preserve PDF-only station routes while resolving published complexes by their exact map ID.
  if (params.place && !/^places\/[0-9a-f-]{36}$/.test(params.place))
    error(404, 'Place not found')
  if (!stations.some(station => station.slug === params.premises)) {
    const { db } = await getDatabaseWithoutAuth(locals.platform)
    const map = await db
      .select({ id: premisesMap.id, kind: premisesMap.kind })
      .from(premisesMap)
      .where(
        and(eq(premisesMap.id, params.premises), isNotNull(premisesMap.publishedHash)),
      )
      .get()
    if (!map || map.kind === 'building') error(404, 'Premises not found')
  }
  return {}
}
