import { updateUserProfile } from '$lib/api/server/user.remote'
import { useSession } from '$lib/auth/client'
import { m } from '$lib/i18n'
import { normalizeUsername, validateUsername } from '$lib/utils/username'
// TYPES
import type { Id } from '$lib/types'
import type { UserPreferences } from '$lib/db/zod/schema/user.types'
import type { RemoteFormIssue } from '@sveltejs/kit'

/**
 * Refreshes the shared Better Auth session atom after a successful user-profile mutation.
 *
 * @returns Nothing after the session refresh succeeds or its failure is logged.
 * @remarks
 * Session refresh is intentionally non-fatal: callers have already received a confirmed
 * database response and should not roll that change back if the client cache is unavailable.
 */
export const refreshUserSession = async (): Promise<void> => {
  try {
    await useSession().get().refetch()
  } catch (error) {
    console.warn('Failed to refresh user session after profile update:', error)
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
