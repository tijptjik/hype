// VALIDATION
import { z } from 'zod'
// API
import { guardedQuery } from '#lib/api/server/guarded.js'
// DB
import { authorizeMessagingOrganisation } from '#lib/db/services/messaging.js'
// MESSAGING
import { readChatAppearance } from '#lib/messaging/appearance.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. ORGANISATION CHAT APPEARANCE
// - getMessagingAppearance
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
