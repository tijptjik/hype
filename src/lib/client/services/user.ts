// TYPES
import type { Id, Locale, UserPreferences, UserLayer } from '$lib/types';

/**
 * Update the user's preferred locale on the server and in Paraglide's locale store. This triggers a page reload so the user can see the new locale immediately.
 * @param userId - The user's ID
 * @param locale - The new locale
 */
export const updateLocale = async (userId: Id, locale: Locale) => {
  if (!userId) return;

  // API : Update user's preferred locale
  try {
    await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale })
    });
  } catch (error) {
    console.error('Failed to update preferred language:', error);
  }
};

// Generic debounced timers
const debouncedTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Generic debounced user update function
 * @param userId - The user's ID
 * @param data - Partial user data to update
 * @param options - Configuration options
 */
const debouncedUpdateUser = async (
  userId: Id,
  data: Record<string, any>,
  options: {
    delay?: number;
    timerKey?: string;
    onSuccess?: (data: any) => void;
    onError?: (error: any) => void;
  } = {}
) => {
  const { delay = 750, timerKey = 'default', onSuccess, onError } = options;

  // ASSERT : We have a userId
  if (!userId) {
    console.warn('User session not found. Cannot update user data.');
    return;
  }

  // TIMER : Clear previous timeout for this key
  const existingTimer = debouncedTimers.get(timerKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // TIMER : Set new timeout
  const timer = setTimeout(async () => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        onSuccess?.(data);
      } else {
        const errorText = await response.text();
        console.error('Failed to update user data:', errorText);
        onError?.(new Error(errorText));
      }
    } catch (error) {
      console.error('Error updating user data:', error);
      onError?.(error);
    } finally {
      debouncedTimers.delete(timerKey);
    }
  }, delay);

  debouncedTimers.set(timerKey, timer);
};

export const debouncedUpdateUserPreferences = (
  userId: Id,
  userPreferences: UserPreferences
) => {
  // ASSERT : We have userPreferences
  if (!userPreferences) return;

  debouncedUpdateUser(
    userId,
    { preferences: userPreferences },
    {
      delay: 750,
      timerKey: 'preferences'
    }
  );
};

export const debouncedUpdateUserAttribution = async (
  userId: Id,
  attribution: string,
  onSuccess?: (attribution: string) => void,
  onError?: (error: any) => void
) => {
  await debouncedUpdateUser(
    userId,
    { attribution },
    {
      delay: 800,
      timerKey: 'attribution',
      onSuccess: () => onSuccess?.(attribution),
      onError
    }
  );
};

export const debouncedUpdateUserLayers = (userId: Id, userLayers: UserLayer[]) => {
  // ASSERT : We have userLayers
  if (!userLayers) return;

  debouncedUpdateUser(
    userId,
    { userLayers },
    {
      delay: 750,
      timerKey: 'userLayers'
    }
  );
};

export const debouncedUpdateUserExperimental = (
  userId: Id,
  experimental: {
    contributorMode?: boolean;
    noLabelsMode?: boolean;
    [key: string]: boolean | undefined;
  }
) => {
  // ASSERT : We have experimental features
  if (!experimental) return;

  debouncedUpdateUser(
    userId,
    { experimental },
    {
      delay: 750,
      timerKey: 'experimental'
    }
  );
};
