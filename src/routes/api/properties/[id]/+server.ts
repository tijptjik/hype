// SVELTEKIT
import { error, type RequestHandler } from '@sveltejs/kit'
// MESSAGES
import { m } from '$lib/i18n'
// DB
import { eq } from 'drizzle-orm'
// LIB
import { getDatabase, JSONResponseOrError } from '$lib/api'
import {
  getPropertyQueryContext,
  propertyEntityWithRelations,
} from '$lib/api/services/property'
import { getProperty, toResponseShape } from '$lib/db/services/property'
// SCHEMA
import { property } from '$lib/db/schema/index'
// TYPES
import type { PropertyValueI18nDB } from '$lib/types'

export const GET: RequestHandler = async ({ params, locals, platform, request }) => {
  // ASSERT : User Logged in
  const { db, user, userRoles } = await getDatabase(locals, platform)
  try {
    // GET : Context for property query
    const { params: queryParams, conditions } = getPropertyQueryContext(
      user,
      request,
      {},
      userRoles,
    )

    // EXTEND : Add GET identifier (id)
    if (params.id) {
      conditions.push(eq(property.id, params.id))
    }

    // DB : Get the property
    const result = await getProperty(db, propertyEntityWithRelations, conditions)

    if (!result) {
      return error(404, m.brief_jumpy_firefox_bump({ key: 'Property' }))
    }

    // RESPONSE : Build the response shape
    const data = toResponseShape(
      result,
      result.i18n,
      result.values,
      result.values
        ?.flatMap(v => v.i18n || [])
        .filter((item): item is PropertyValueI18nDB => item != null) || [],
    )

    return JSONResponseOrError(data)
  } catch (e) {
    console.error('Database query error:', e)
    return error(500, 'Dust Accumulation Critical')
  }
}
