// SCHEMAS
import { UserSelfProfileAPI } from '$lib/db/zod/schema/user'
// TYPES
import type { CurrentUser } from '$lib/db/zod/schema/user.types'

/**
 * Normalizes stored JSON settings before exposing them in an authenticated session.
 *
 * @param preferences - Stored preference JSON or an already decoded preference object.
 * @param experimental - Stored experimental-setting JSON or decoded object.
 * @returns Validated settings with safe defaults for invalid or absent values.
 * @remarks JSON syntax alone does not ensure the object shape required by the client.
 */
export function parseSessionSettings(
  preferences: unknown,
  experimental: unknown,
): Pick<CurrentUser, 'preferences' | 'experimental'> {
  const parsedPreferences = UserSelfProfileAPI.shape.preferences.safeParse(preferences)
  const parsedExperimental =
    UserSelfProfileAPI.shape.experimental.safeParse(experimental)

  return {
    preferences: parsedPreferences.success
      ? parsedPreferences.data
      : {
          fallbackLocales: [],
          allowMachineTranslation: false,
          preferFallbackInCurrentLocale: false,
          isTranslateButtonVisible: true,
        },
    experimental: (parsedExperimental.success ? parsedExperimental.data : null) ?? {
      contributorMode: false,
      noLabelsMode: false,
    },
  }
}
