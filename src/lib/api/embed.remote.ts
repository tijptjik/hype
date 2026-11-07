// SCHEMA
import { z } from 'zod'
// API
import { guardedQuery } from './server/guarded.js'
import { readEmbedLayers } from '#lib/embed/server.js'
import { canPreviewPublication } from '#lib/publication/permissions.js'
// TYPES
import type { EmbedLayer } from '#lib/embed/embed.types.js'

/** Lists public layers the current administrator can manage on this host.
 * @param input Explicit admin surface intent. @returns Compact share-builder resources.
 * @remarks The generated URL grants no permissions; embeds recheck public visibility.
 */
export const getEmbedResources = guardedQuery(
  z.object({ meta: z.object({ isAdminRequest: z.literal(true) }) }),
  async (_input, ctx): Promise<EmbedLayer[]> => {
    if (ctx.user.isAnonymous) return []
    const rows = await readEmbedLayers(ctx.db, null, ctx.event.locals.hub)
    return rows.filter(row => canPreviewPublication(ctx.user, ctx.userRoles, row))
  },
)
