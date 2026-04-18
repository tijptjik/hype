import { drizzle } from 'drizzle-orm/d1'
import * as schema from '$lib/db/schema/index'
import { getHubUserSubscriptionState } from '$lib/db/services/hub'
import type { D1Database as MiniflareD1Database } from '@miniflare/d1'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ platform, locals }) => {
  const db = platform?.env?.DB
    ? drizzle(platform.env.DB as unknown as MiniflareD1Database, { schema })
    : null
  const hubUserState =
    db && locals.user?.id && locals.hub?.id
      ? await getHubUserSubscriptionState(db, {
          hubId: locals.hub.id,
          userId: locals.user.id,
        })
      : null

  return {
    hub: locals.hub,
    hubUserState,
  }
}
