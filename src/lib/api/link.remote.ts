// SVELTEKIT
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// API
import { guardedQuery } from '#lib/api/server/guarded.js'
// SERVER
import { fetchLinkTitle } from '#lib/server/link-title.js'

/** Looks up a pasted link's title for an authenticated property editor.
 * @param params Absolute public page URL and explicit admin intent.
 * @returns Plain title and locale, or null when metadata is unavailable.
 * @remarks Retrieval failure never prevents manual link editing.
 */
export const getLinkTitle = guardedQuery(
  z.object({
    url: z.string().url().max(2048),
    meta: z.object({ isAdminRequest: z.literal(true) }),
  }),
  async (params, ctx) => {
    if (!ctx.user || ctx.user.isAnonymous)
      throw error(401, 'Sign in to look up link titles')
    try {
      return await fetchLinkTitle(params.url)
    } catch {
      return null
    }
  },
)
