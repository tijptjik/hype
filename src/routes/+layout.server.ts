import { drizzle } from 'drizzle-orm/d1'
import * as schema from '#lib/db/schema/index.js'
import { getHubUserSubscriptionState } from '#lib/db/services/hub.js'
import { getTitleEnvironmentLabel } from '#lib/navigation/title.js'
import type { D1Database as MiniflareD1Database } from '@cloudflare/workers-types'
import type { LayoutServerLoad } from './$types'

/**
 * Loads root app data shared by all route trees.
 *
 * @param event The root layout server load event.
 * @returns Hub, subscription, and runtime display metadata.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
  const { platform } = locals
  const db = platform?.env?.DB
    ? drizzle(platform.env.DB as unknown as MiniflareD1Database, { schema })
    : null
  let hubUserState = null

  if (db && locals.user?.id && locals.hub?.id) {
    try {
      hubUserState = await getHubUserSubscriptionState(db, {
        hubId: locals.hub.id,
        userId: locals.user.id,
      })
    } catch (error) {
      console.error('Failed to fetch hub user subscription state:', error)
    }
  }

  return {
    devPersona: locals.devPersona ?? null,
    hub: locals.hub,
    hubUserState,
    titleEnvironmentLabel: getTitleEnvironmentLabel(platform?.env?.ENVIRONMENT),
  }
}
