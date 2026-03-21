import { setUserLayerDefaults, updateUserProfile } from '$lib/api/server/user.remote'
import { m } from '$lib/i18n'
import { normalizeUsername, validateUsername } from '$lib/utils/username'
// TYPES
import type { Id, Locale } from '$lib/types'
import type { UserLayer, UserPreferences } from '$lib/db/zod/schema/user.types'
import type { RemoteFormIssue } from '@sveltejs/kit'

/**
 * Update the user's preferred locale on the server and in Paraglide's locale store. This triggers a page reload so the user can see the new locale immediately.
 * @param userId - The user's ID
 * @param locale - The new locale
 */
export const updateLocale = async (userId: Id, locale: Locale) => {
  if (!userId) return

  // API : Update user's preferred locale
  try {
    await updateUserProfile({
      id: userId,
      data: { locale },
    })

    // AUTH : Signal to client that it should refresh its session
    const { authClient } = await import('$lib/auth/client')
    try {
      // Force session refresh by calling getSession with disableCookieCache
      await authClient.getSession({
        query: { disableCookieCache: true },
      })
    } catch (error) {
      console.warn('⚠️ Failed to refresh session after locale update:', error)
    }
  } catch (error) {
    console.error('Failed to update preferred language:', error)
  }
}

// Generic debounced timers
const debouncedTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const validateUsernameIssues = (
  username: string,
): { normalizedUsername: string; issues: RemoteFormIssue[] } => {
  const normalizedUsername = normalizeUsername(username)
  const issues = validateUsername(normalizedUsername)
    ? []
    : [
        {
          message: m.validation__username_invalid(),
          path: ['username'],
        } satisfies RemoteFormIssue,
      ]

  return {
    normalizedUsername,
    issues,
  }
}

/**
 * Generic debounced user update function
 * @param userId - The user's ID
 * @param data - Partial user data to update
 * @param options - Configuration options
 */
export const debouncedUpdateUser = async (
  userId: Id,
  data: Record<string, unknown>,
  options: {
    delay?: number
    timerKey?: string
    onSuccess?: (data: Record<string, unknown>) => void
    onError?: (error: unknown) => void
  } = {},
) => {
  const { delay = 750, timerKey = 'default', onSuccess, onError } = options

  // ASSERT : We have a userId
  if (!userId) {
    console.warn('User session not found. Cannot update user data.')
    return
  }

  // TIMER : Clear previous timeout for this key
  const existingTimer = debouncedTimers.get(timerKey)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  // TIMER : Set new timeout
  const timer = setTimeout(async () => {
    try {
      const response = await updateUserProfile({
        id: userId,
        data,
      })

      if (response?.data) {
        onSuccess?.(data)
      } else {
        const errorText = 'Failed to update user data'
        console.error(errorText)
        onError?.(new Error(errorText))
      }
    } catch (error) {
      console.error('Error updating user data:', error)
      onError?.(error)
    } finally {
      debouncedTimers.delete(timerKey)
    }
  }, delay)

  debouncedTimers.set(timerKey, timer)
}

export const debouncedUpdateUserPreferences = (
  userId: Id,
  userPreferences: UserPreferences,
) => {
  // ASSERT : We have userPreferences
  if (!userPreferences) return

  debouncedUpdateUser(
    userId,
    { preferences: JSON.stringify(userPreferences) },
    {
      delay: 750,
      timerKey: 'preferences',
    },
  )
}

export const debouncedUpdateUserAttribution = async (
  userId: Id,
  attribution: string,
  onSuccess?: (attribution: string) => void,
  onError?: (error: unknown) => void,
) => {
  await debouncedUpdateUser(
    userId,
    { attribution },
    {
      delay: 800,
      timerKey: 'attribution',
      onSuccess: () => onSuccess?.(attribution),
      onError,
    },
  )
}

export const debouncedUpdateUsername = async (
  userId: Id,
  username: string,
  options: {
    onSuccess?: (username: string) => void
    onInvalid?: (issues: RemoteFormIssue[]) => void
    onError?: (error: unknown) => void
  } = {},
) => {
  const { normalizedUsername, issues } = validateUsernameIssues(username)
  if (issues.length > 0) {
    options.onInvalid?.(issues)
    return { normalizedUsername, issues }
  }

  await debouncedUpdateUser(
    userId,
    { username: normalizedUsername },
    {
      delay: 300,
      timerKey: 'username',
      onSuccess: () => options.onSuccess?.(normalizedUsername),
      onError: options.onError,
    },
  )

  return {
    normalizedUsername,
    issues,
  }
}

export const debouncedUpdateUserLayers = (
  userId: Id,
  hubId: Id,
  userLayers: UserLayer[],
) => {
  // ASSERT : We have userLayers
  if (!userLayers) return

  const existingTimer = debouncedTimers.get('userLayers')
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const timer = setTimeout(async () => {
    try {
      await setUserLayerDefaults({
        userId,
        hubId,
        layers: userLayers.map(layer => ({
          layerId: layer.layerId,
          hubId: layer.hubId,
          isDefaultVisible: Boolean(layer.isDefaultVisible),
        })),
      })
    } finally {
      debouncedTimers.delete('userLayers')
    }
  }, 750)

  debouncedTimers.set('userLayers', timer)
}

export const debouncedUpdateUserExperimental = (
  userId: Id,
  experimental: {
    contributorMode?: boolean
    noLabelsMode?: boolean
    [key: string]: boolean | undefined
  },
) => {
  // ASSERT : We have experimental features
  if (!experimental) return

  debouncedUpdateUser(
    userId,
    { experimental: JSON.stringify(experimental) },
    {
      delay: 750,
      timerKey: 'experimental',
    },
  )
}
