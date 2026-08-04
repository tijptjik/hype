<script lang="ts">
// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { getLocale, getLocaleKey, setLocale as setRuntimeLocale } from '$lib/i18n'
import { m } from '$lib/i18n'
// API
import { getUser, updateUserProfile } from '$lib/api/server/user.remote'
// SERVICES
import { refreshUserSession } from '$lib/client/services/user'
// BITS
import { Switch } from '$lib/bits'
// COMPONENTS
import { Icon } from '$lib/bits'
import Language from 'virtual:icons/lucide/languages'
import ChevronDown from 'virtual:icons/lucide/chevron-down'
import ChevronUp from 'virtual:icons/lucide/chevron-up'
import Section from '$lib/components/panels/common/Section.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// ENUMS
import {
  localeNames,
  LocaleKeysMap,
  SupportedLocales,
  supportedLocales,
  supportedLocaleKeys,
} from '$lib/enums'
// TYPES
import type { PanelProps, Locale, LocaleKey } from '$lib/types'
import type { UserPreferences } from '$lib/db/zod/schema/user.types'

// CONTEXT
const appCtx = getAppCtx()

const { ...panelProps }: PanelProps = $props()

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
let preferredOpen = $state(true)
let additionalOpen = $state(true)
let advancedOpen = $state(false)
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
function getNextFallbackPreferences(locale: Locale, checked: boolean): UserPreferences {
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
</script>

<Section
  {...panelProps}
  title={m.settings__language()}
  icon="/language.svg"
  position="right"
  iconGraphicClass="scale-125 origin-bottom-left"
  defaultOpen={!panelProps.isAdmin}
  iconVerticalPaddingClass="py-3 pr-4.5"
>
  <div class="flex flex-col gap-4 px-4 caret-transparent">
    <!-- Primary Language Section -->
    <details bind:open={preferredOpen}>
      <summary
        class="flex cursor-pointer list-none items-center justify-between py-2 pr-3"
      >
        <h2 class="pl-0.5 text-base-content">{m.settings_language_preferred()}</h2>
        <Icon
          src={preferredOpen ? ChevronUp : ChevronDown}
          class="h-5 w-5 text-base-content"
        />
      </summary>
      <div class="ml-4 flex flex-col gap-2 pt-2">
        {#each supportedLocaleKeys as localeKey}
          <div class="flex h-12 flex-row items-center justify-between gap-4">
            <div class="flex flex-row items-center gap-4">
              <Icon src={Language} class="h-5 w-5" />
              <p class="font-normal text-base-content">
                {localeNames[localeKey][localeKey]}
              </p>
              {#if localeKey !== currentLocaleKey && localeNames[currentLocaleKey][localeKey]}
                <p class="text-sm text-neutral-content">
                  ({localeNames[currentLocaleKey][localeKey]})
                </p>
              {/if}
            </div>
            <input
              type="radio"
              name="language"
              value={SupportedLocales[localeKey]}
              class="radio-primary radio radio-sm mr-4 h-5 w-5 cursor-pointer"
              checked={currentLocaleKey === localeKey}
              disabled={pendingLocale !== null}
              onclick={() => handleLocaleChange(SupportedLocales[localeKey])}
            >
          </div>
        {/each}
      </div>
    </details>

    <!-- Additional Languages Section -->
    <details class="mt-2" bind:open={additionalOpen}>
      <summary
        class="flex cursor-pointer list-none items-center justify-between py-2 pr-3"
      >
        <h2 class="pl-0.5 text-base-content">{m.settings_language_additional()}</h2>
        <Icon
          src={additionalOpen ? ChevronUp : ChevronDown}
          class="h-5 w-5 text-base-content"
        />
      </summary>
      <div class="ml-4 flex flex-col gap-2 pt-2">
        {#each supportedLocales.filter(locale => locale !== currentLocale) as locale (locale)}
          {@const localeKey = LocaleKeysMap[locale] as LocaleKey}
          {@const isFallbackSelected =
            userPreferences.fallbackLocales?.includes(locale) || false}
          <div
            class="flex w-full flex-row items-start justify-between gap-3 py-1 pr-1.5"
          >
            <button
              type="button"
              class="flex min-w-0 grow cursor-pointer flex-col text-left"
              disabled={isSavingPreferences}
              onclick={() =>
                void updatePreferences(
                  getNextFallbackPreferences(locale, !isFallbackSelected),
                )}
            >
              <span class="font-normal text-base-content"
                >{localeNames[localeKey][localeKey]}</span
              >
              {#if localeNames[currentLocaleKey][localeKey]}
                <span class="text-sm text-neutral-content"
                  >({localeNames[currentLocaleKey][localeKey]})</span
                >
              {/if}
            </button>
            <Switch
              id={`fallback-${locale}`}
              class="mt-0.5 shrink-0"
              size="sm"
              color="primary"
              checked={isFallbackSelected}
              disabled={isSavingPreferences}
              onCheckedChange={(checked) =>
                void updatePreferences(
                  getNextFallbackPreferences(locale, checked === true),
                )}
            />
          </div>
        {/each}
      </div>
    </details>

    <!-- Advanced Settings Section -->
    <details class="mt-2" bind:open={advancedOpen}>
      <summary
        class="flex cursor-pointer list-none items-center justify-between py-2 pr-3"
      >
        <h2 class="pl-0.5 text-base-content">{m.settings_language_advanced()}</h2>
        <Icon
          src={advancedOpen ? ChevronUp : ChevronDown}
          class="h-5 w-5 text-base-content"
        />
      </summary>
      <div class="ml-4 flex flex-col gap-2 pt-2">
        {#each advancedSettings as setting (setting.code)}
          <div
            class="flex w-full flex-row items-start justify-between gap-3 py-2 pr-1.5"
          >
            <div class="min-w-0 grow flex flex-col gap-0.5">
              <p class="font-normal text-base-content">{setting.name}</p>
              {#if setting.description}
                <p class="text-sm text-neutral-content">{setting.description}</p>
              {/if}
            </div>
            <Switch
              name={setting.code}
              class="mt-0.5 shrink-0"
              size="sm"
              color="primary"
              checked={setting.currentValue}
              disabled={isSavingPreferences}
              onCheckedChange={(checked) =>
                void updatePreferences(
                  getNextAdvancedPreferences(
                    setting.code as keyof Pick<
                      UserPreferences,
                      | 'allowMachineTranslation'
                      | 'isTranslateButtonVisible'
                      | 'preferFallbackInCurrentLocale'
                    >,
                    checked === true,
                  ),
                )}
            />
          </div>
        {/each}
      </div>
    </details>
  </div>
</Section>
