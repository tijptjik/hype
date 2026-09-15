<script lang="ts">
// THIRD PARTY
// I18N
import { getLocale, getLocaleKey, setLocale as setRuntimeLocale } from '$lib/i18n'
import { m } from '$lib/i18n'
// API
// SERVICES
// BITS
import { Switch } from '$lib/bits'
// COMPONENTS
import { Icon } from '$lib/bits'
import Language from 'virtual:icons/tabler/language'
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import ChevronUp from 'virtual:icons/proicons/chevron-up'
import Section from '$lib/bits/patterns/panels/components/common/Section.svelte'
// CONTEXT
import type {
  useLanguageSettingsModel,
} from '$lib/adapters/panels/useLanguageSettingsModel.svelte'
// ENUMS
import {
  localeNames,
  LocaleKeysMap,
  SupportedLocales,
  supportedLocales,
  supportedLocaleKeys,
} from '$lib/enums'
// TYPES
import type { PanelProps } from '$lib/bits/patterns/panels/panel.types'
import type { Locale, LocaleKey } from '$lib/types'
import type { UserPreferences } from '$lib/db/zod/schema/user.types'

// CONTEXT

let {
  model,
  ...panelProps
}: PanelProps & { model: ReturnType<typeof useLanguageSettingsModel> } = $props()

let additionalOpen = $state(true)
let advancedOpen = $state(false)
const userPreferences = $derived(model.userPreferences)
const currentLocale = $derived(model.currentLocale)
const currentLocaleKey = $derived(model.currentLocaleKey)
const advancedSettings = $derived(model.advancedSettings)
const pendingLocale = $derived(model.pendingLocale)
const isSavingPreferences = $derived(model.isSavingPreferences)
const handleLocaleChange = (...args: Parameters<typeof model.handleLocaleChange>) =>
  model.handleLocaleChange(...args)
const updatePreferences = (...args: Parameters<typeof model.updatePreferences>) =>
  model.updatePreferences(...args)
const getNextFallbackPreferences = (
  ...args: Parameters<typeof model.getNextFallbackPreferences>
) => model.getNextFallbackPreferences(...args)
const getNextAdvancedPreferences = (
  ...args: Parameters<typeof model.getNextAdvancedPreferences>
) => model.getNextAdvancedPreferences(...args)
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
    <div class="flex flex-col gap-2 pt-2">
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
