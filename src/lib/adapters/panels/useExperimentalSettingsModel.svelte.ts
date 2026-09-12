// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { m, getLocale, getLocaleKey, setLocale as setRuntimeLocale } from '$lib/i18n'
// API
import { getUser, updateUserProfile } from '$lib/api/server/user.remote'
// SERVICES
import { refreshUserSession } from '$lib/client/services/user'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type { Locale } from '$lib/types'
import type {
  UserPreferences,
  ExperimentalFeatureConfig,
  UserExperimental,
} from '$lib/db/zod/schema/user.types'

/**
 * Owns experimental preference mutations and optimistic rollback.
 * @param appCtx - Route-owned application context.
 * @returns Reactive values and preference callbacks for the section.
 */
export function useExperimentalSettingsModel(appCtx: AppCtx) {
  // Get experimental features from appCtx
  const experimentalFeatures = $derived.by(() => {
    const user = appCtx.getUser()
    return user && 'experimental' in user ? user.experimental : {}
  })
  let isSavingExperimental = $state(false)

  // Helper function to safely get feature state
  const getFeatureState = (code: keyof UserExperimental): boolean => {
    return (experimentalFeatures as UserExperimental)[code] || false
  }

  /**
   * Optimistically saves one experimental setting through a remote command.
   *
   * @param featureCode - Experimental setting to update.
   * @param checked - The requested enabled state.
   * @returns Nothing after the local state settles to the server result.
   */
  const toggleExperimental = async (
    featureCode: keyof UserExperimental,
    checked: boolean,
  ): Promise<void> => {
    if (isSavingExperimental) return

    const user = appCtx.getUser()
    if (!user || !('experimental' in user)) return

    const previousExperimental: UserExperimental = {
      contributorMode: user.experimental?.contributorMode ?? false,
      noLabelsMode: user.experimental?.noLabelsMode ?? false,
    }
    const nextExperimental: UserExperimental = {
      ...previousExperimental,
      [featureCode]: checked,
    }

    isSavingExperimental = true
    appCtx.applyUserProfile({ experimental: nextExperimental })

    try {
      const response = await updateUserProfile({
        id: user.id,
        data: { experimental: JSON.stringify(nextExperimental) },
      }).updates(
        getUser({
          ref: user.id,
          refKey: 'id',
          meta: { profile: 'self' },
        }),
      )

      appCtx.applyUserProfile(response?.data ?? { experimental: nextExperimental })
      await refreshUserSession()
    } catch (error) {
      console.error('Error updating experimental setting:', error)
      appCtx.applyUserProfile({
        experimental: previousExperimental as UserExperimental,
      })
      toast.error('Failed to update experimental setting')
    } finally {
      isSavingExperimental = false
    }
  }

  // Experimental features configuration
  const featuresConfig: ExperimentalFeatureConfig[] = [
    {
      name: m.settings_experimental_contributor_mode(),
      description: m.settings_experimental_contributor_description(),
      code: 'contributorMode',
    },
    {
      name: m.settings_experimental_no_labels_mode(),
      description: m.settings_experimental_no_labels_description(),
      code: 'noLabelsMode',
    },
  ]

  return {
    get featuresConfig() {
      return featuresConfig
    },
    get isSavingExperimental() {
      return isSavingExperimental
    },
    getFeatureState,
    toggleExperimental,
  }
}
