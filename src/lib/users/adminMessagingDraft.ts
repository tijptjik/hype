import { z } from 'zod'
import { displayMessagingContact } from '#lib/messaging/contactInput.js'
import type { MessagingProfileSettings } from '#lib/messaging/contactValidation.js'

export const AdminMessagingDraftSchema = z.object({
  whatsapp: z.string().max(100),
  telegram: z.string().max(100),
  preferredPlatform: z.enum(['whatsapp', 'telegram']).nullable(),
})
export type AdminMessagingDraft = z.infer<typeof AdminMessagingDraftSchema>

/** Copy saved messaging fields into the resource editor's resettable draft.
 * @param settings Private profile data, if available.
 * @returns Independent field values; creating a draft never saves or checks accounts.
 */
export function createAdminMessagingDraft(
  settings?: MessagingProfileSettings | null,
): AdminMessagingDraft {
  return {
    whatsapp: displayMessagingContact(
      settings?.identities.find(row => row.platform === 'whatsapp'),
    ),
    telegram: displayMessagingContact(
      settings?.identities.find(row => row.platform === 'telegram'),
    ),
    preferredPlatform: settings?.preferredPlatform ?? null,
  }
}

/** Canonical values acknowledged by a successful atomic profile save. */
export interface AdminProfileSaveResult {
  username: string
  displayUsername: string | null
  settings: import('./adminProfile.js').AdminUserSettings
  updatedAt: string
  messagingSettings?: MessagingProfileSettings
}

/** Apply an acknowledged save without discarding contributions or querying stale cached data.
 * @param profile Current rendered profile.
 * @param result Canonical server response after commit.
 * @returns The new authoritative profile snapshot used for display and Reset.
 */
export function applyAdminProfileSave(
  profile: import('#lib/db/zod/schema/user.types.js').AdminUserProfile,
  result: AdminProfileSaveResult,
): import('#lib/db/zod/schema/user.types.js').AdminUserProfile {
  return {
    ...profile,
    settings: result.settings,
    details: profile.details
      ? {
          ...profile.details,
          name: result.settings.name,
          username: result.username,
          displayUsername: result.displayUsername,
          telephone: result.settings.telephone,
          email: result.settings.email,
          image: result.settings.image,
          attribution: result.settings.attribution,
          locale: result.settings.locale,
          isArchived: result.settings.isArchived,
        }
      : null,
    updatedAt: result.updatedAt,
    messagingSettings: result.messagingSettings ?? profile.messagingSettings,
    profile: {
      ...profile.profile,
      username: result.username,
      displayUsername: result.displayUsername,
      image: result.settings.image,
      attribution: result.settings.attribution,
    },
  }
}
