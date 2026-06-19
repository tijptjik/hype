import { drizzle } from 'drizzle-orm/d1'
import * as schema from '$lib/db/schema/index'
import { getHubUserSubscriptionState } from '$lib/db/services/hub'
import { getTitleEnvironmentLabel } from '$lib/navigation/title'
import type { D1Database as MiniflareD1Database } from '@miniflare/d1'
import type { LayoutServerLoad } from './$types'

/**
 * Loads root app data shared by all route trees.
 *
 * @param event The root layout server load event.
 * @returns Hub, subscription, and runtime display metadata.
 */
export const load: LayoutServerLoad = async ({ platform, locals }) => {
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
    hub: locals.hub,
    hubUserState,
    titleEnvironmentLabel: getTitleEnvironmentLabel(platform?.env?.ENVIRONMENT),
  }
}
