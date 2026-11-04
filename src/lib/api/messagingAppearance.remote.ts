// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// DB
import { organisation } from '#lib/db/schema/organisation.js'
import { authorizeMessagingOrganisation } from '#lib/db/services/messaging.js'
// MESSAGING
import { ChatAppearanceSchema, readChatAppearance } from '#lib/messaging/appearance.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. ORGANISATION CHAT APPEARANCE
// - getMessagingAppearance
// - setMessagingAppearance
// ---

const input = z.object({
  meta: z.object({ isAdminRequest: z.literal(true) }),
  organisationId: z.string().min(1).max(100),
})

/** Read the background shared by this organisation's messaging accounts.
 * @param params Organisation identity and admin intent.
 * @returns The validated appearance after organisation messaging authorization.
 */
export const getMessagingAppearance = guardedQuery(
  input,
  async ({ organisationId }, ctx) => {
    const target = await authorizeMessagingOrganisation(ctx, organisationId)
    return readChatAppearance(target.settings)
  },
)

/** Update only messaging appearance, preserving unrelated organisation settings.
 * @param params Organisation identity and bounded appearance values.
 * @returns The saved background.
 * @remarks Uses the same membership policy as shared messaging account configuration.
 */
export const setMessagingAppearance = guardedCommand(
  input.extend({ appearance: ChatAppearanceSchema }),
  async ({ organisationId, appearance }, ctx) => {
    await authorizeMessagingOrganisation(ctx, organisationId)
    // Patch one JSON path in SQL so concurrent locale changes are not overwritten.
    await ctx.db
      .update(organisation)
      .set({
        settings: sql`json_set(coalesce(${organisation.settings}, '{}'), '$.messagingAppearance', json(${JSON.stringify(appearance)}))`,
      })
      .where(eq(organisation.id, organisationId))
    return appearance
  },
)
