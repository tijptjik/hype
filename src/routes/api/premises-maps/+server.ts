// SVELTE
import { json, type RequestHandler } from '@sveltejs/kit'
// DATABASE
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
// DRIZZLE
import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm'
// SCHEMA
import { premisesMap } from '#lib/db/schema/premisesMap.js'
import { location } from '#lib/db/schema/location.js'
import {
  locationOperator,
  locationPremisesMap,
  operator,
  operatorI18n,
} from '#lib/db/schema/operator.js'

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
      operator: { id: operator.id, logo: operator.logo, name: operatorI18n.name },
    })
    .from(premisesMap)
    // Only explicit operator assignments on public, current Locations identify a map.
    .leftJoin(locationPremisesMap, eq(locationPremisesMap.mapId, premisesMap.id))
    .leftJoin(
      location,
      and(
        eq(location.id, locationPremisesMap.locationId),
        isNull(location.ownerOrganisationId),
        ne(location.state, 'redirect'),
      ),
    )
    .leftJoin(locationOperator, eq(locationOperator.locationId, location.id))
    .leftJoin(operator, eq(operator.id, locationOperator.operatorId))
    .leftJoin(
      operatorI18n,
      and(eq(operatorI18n.operatorId, operator.id), eq(operatorI18n.locale, 'en')),
    )
    .where(isNotNull(premisesMap.publishedHash))
  return json(maps, { headers: { 'Cache-Control': 'no-cache' } })
}
