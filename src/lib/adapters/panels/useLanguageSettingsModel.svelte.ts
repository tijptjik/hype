// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { m, getLocale, getLocaleKey, setLocale as setRuntimeLocale } from '#lib/i18n.js'
// API
import { getUser, updateUserProfile } from '#lib/api/user.remote.js'
// SERVICES
import { refreshUserSession } from '#lib/client/services/user.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { Locale } from '#lib/types.js'
import type { UserPreferences } from '#lib/db/zod/schema/user.types.js'

/**
 * Owns language preference mutations and optimistic rollback.
 * @param appCtx - Route-owned application context.
 * @returns Reactive values and preference callbacks for the section.
 */
export function useLanguageSettingsModel(appCtx: ResourceViewCtx) {
  // Ensure user preferences object exists and is reactive
  const userPreferences: UserPreferences = $derived(appCtx.getUserPreferences())
  const currentLocale = $derived(getLocale())
  const currentLocaleKey = $derived(getLocaleKey())

  // Advanced section features
  const advancedSettings = $derived([
    {
      name: m.settings_language_auto_translate(),
      description: m.settings_language_auto_translate_description(),
      code: 'allowMachineTranslation',
      currentValue: userPreferences.allowMachineTranslation,
    },
    {
      name: m.settings_language_show_translate_button(),
      description: m.settings_language_show_translate_button_description(),
      code: 'isTranslateButtonVisible',
      currentValue: userPreferences.isTranslateButtonVisible,
    },
    {
      name: m.settings_language_prefer_placeholders(),
      description: m.settings_language_prefer_placeholders_description(),
      code: 'preferFallbackInCurrentLocale',
      currentValue: userPreferences.preferFallbackInCurrentLocale,
    },
  ])

  // For collapsible sections
  let pendingLocale = $state<Locale | null>(null)
  let isSavingPreferences = $state(false)

  /**
   * Optimistically saves the preferred locale and refreshes the auth session before reload.
   *
   * @param locale - Supported locale selected by the user.
   * @returns Nothing after the updated locale has been persisted or reverted.
   */
  async function handleLocaleChange(locale: Locale): Promise<void> {
    if (pendingLocale || locale === currentLocale) return

    const user = appCtx.getUser()
    if (!user) return

    const previousLocale = currentLocale
    pendingLocale = locale
    appCtx.applyUserProfile({ locale })
    await setRuntimeLocale(locale, { reload: false })

    try {
      const response = await updateUserProfile({
        id: user.id,
        data: { locale },
      }).updates(
        getUser({
          ref: user.id,
          refKey: 'id',
          meta: { profile: 'self' },
        }),
      )

      appCtx.applyUserProfile(response?.data ?? { locale })
      await refreshUserSession()

      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    } catch (error) {
      console.error('Error updating preferred language:', error)
      appCtx.applyUserProfile({ locale: previousLocale })
      await setRuntimeLocale(previousLocale, { reload: false })
      toast.error('Failed to update preferred language')
    } finally {
      pendingLocale = null
    }
  }

  /**
   * Optimistically persists language display preferences through a remote command.
   *
   * @param nextPreferences - Complete next preference state to save.
   * @returns Nothing after the local preferences settle to the server result.
   */
  async function updatePreferences(nextPreferences: UserPreferences): Promise<void> {
    if (isSavingPreferences) return

    const user = appCtx.getUser()
    if (!user) return

    const previousPreferences = appCtx.getUserPreferences(false)
    isSavingPreferences = true
    appCtx.applyUserProfile({ preferences: nextPreferences })

    try {
      const response = await updateUserProfile({
        id: user.id,
        data: { preferences: JSON.stringify(nextPreferences) },
      }).updates(
        getUser({
          ref: user.id,
          refKey: 'id',
          meta: { profile: 'self' },
        }),
      )

      appCtx.applyUserProfile(response?.data ?? { preferences: nextPreferences })
      await refreshUserSession()
    } catch (error) {
      console.error('Error updating language preferences:', error)
      appCtx.applyUserProfile({ preferences: previousPreferences })
      toast.error('Failed to update language preferences')
    } finally {
      isSavingPreferences = false
    }
  }

  /**
   * Returns the next fallback-locale preference state.
   *
   * @param locale - Locale to add or remove from fallbacks.
   * @param checked - Whether the locale should be included.
   * @returns Updated user preferences.
   */
  function getNextFallbackPreferences(
    locale: Locale,
    checked: boolean,
  ): UserPreferences {
    const fallbackLocales = userPreferences.fallbackLocales ?? []
    const nextFallbackLocales = checked
      ? [...new Set([...fallbackLocales, locale])]
      : fallbackLocales.filter(fallbackLocale => fallbackLocale !== locale)

    return { ...userPreferences, fallbackLocales: nextFallbackLocales }
  }

  /**
   * Returns the next boolean language-preference state.
   *
   * @param code - Boolean preference to update.
   * @param checked - Requested value.
   * @returns Updated user preferences.
   */
  function getNextAdvancedPreferences(
    code: keyof Pick<
      UserPreferences,
      | 'allowMachineTranslation'
      | 'isTranslateButtonVisible'
      | 'preferFallbackInCurrentLocale'
    >,
    checked: boolean,
  ): UserPreferences {
    return { ...userPreferences, [code]: checked }
  }

  return {
    get userPreferences() {
      return userPreferences
    },
    get currentLocale() {
      return currentLocale
    },
    get currentLocaleKey() {
      return currentLocaleKey
    },
    get advancedSettings() {
      return advancedSettings
    },
    get pendingLocale() {
      return pendingLocale
    },
    get isSavingPreferences() {
      return isSavingPreferences
    },
    handleLocaleChange,
    updatePreferences,
    getNextFallbackPreferences,
    getNextAdvancedPreferences,
  }
}
