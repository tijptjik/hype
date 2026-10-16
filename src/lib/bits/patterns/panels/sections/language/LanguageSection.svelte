<script lang="ts">
// THIRD PARTY
// I18N
import { getLocale, getLocaleKey, setLocale as setRuntimeLocale } from '#lib/i18n.js'
import { m } from '#lib/i18n.js'
// API
// SERVICES
// BITS
import { Switch } from '#lib/bits/index.js'
// COMPONENTS
import { Icon } from '#lib/bits/index.js'
import Language from 'virtual:icons/tabler/language'
import SettingsDisclosure from '#lib/bits/patterns/settingsPanel/components/SettingsDisclosure.svelte'
import Section from '#lib/bits/patterns/panels/components/common/Section.svelte'
// CONTEXT
import type { useLanguageSettingsModel } from '#lib/adapters/panels/useLanguageSettingsModel.svelte.js'
// ENUMS
import {
  localeNames,
  LocaleKeysMap,
  SupportedLocales,
  supportedLocales,
  supportedLocaleKeys,
} from '#lib/enums.js'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
import type { Locale, LocaleKey } from '#lib/types.js'
import type { UserPreferences } from '#lib/db/zod/schema/user.types.js'

// CONTEXT

let {
  model,
  ...panelProps
}: PanelProps & { model: ReturnType<typeof useLanguageSettingsModel> } = $props()

const languageId = $props.id()

let additionalOpen = $state(false)
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
  icon={Language}
  position="right"
  iconColorClass="text-base-content"
  defaultOpen={!panelProps.isAdmin}
  iconVerticalPaddingClass="py-3 pr-4.5"
>
  <div class="flex flex-col gap-4 px-6 pt-2 pb-6 caret-transparent">
    <!-- Primary Language Section -->
    <fieldset class="flex min-w-0 flex-col gap-2 pb-2">
      <legend class="mb-3 text-xs font-medium text-muted-foreground">
        {m.settings_language_preferred()}
      </legend>
      {#each supportedLocaleKeys as localeKey}
        <label
          class="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-surface has-[:checked]:bg-surface has-[:disabled]:cursor-wait"
        >
          <span class="min-w-0">
            <span class="block text-sm font-medium text-base-content"
              >{localeNames[localeKey][localeKey]}</span
            >
            {#if localeKey !== currentLocaleKey &&
              localeNames[currentLocaleKey][localeKey]}
              <span class="block text-xs text-muted-foreground"
                >{localeNames[currentLocaleKey][localeKey]}</span
              >
            {/if}
          </span>
          <input
            type="radio"
            name={languageId}
            value={SupportedLocales[localeKey]}
            class="size-4 shrink-0 cursor-pointer accent-primary"
            checked={currentLocaleKey === localeKey}
            disabled={pendingLocale !== null}
            onchange={() => handleLocaleChange(SupportedLocales[localeKey])}
          >
        </label>
      {/each}
    </fieldset>

    <!-- Additional Languages Section -->
    <SettingsDisclosure
      title={m.settings_language_additional()}
      bind:open={additionalOpen}
    >
      <div class="flex flex-col gap-6 px-1 pt-3 pb-3">
        {#each supportedLocales.filter(
          locale => locale !== currentLocale,
        ) as locale (locale)}
          {@const localeKey = LocaleKeysMap[locale] as LocaleKey}
          {@const isFallbackSelected =
            userPreferences.fallbackLocales?.includes(locale) || false}
          <div class="flex w-full flex-row items-start justify-between gap-4 py-1">
            <label
              for={`${languageId}-fallback-${locale}`}
              class="flex min-w-0 grow cursor-pointer flex-col text-left"
            >
              <span class="text-sm font-medium text-base-content"
                >{localeNames[localeKey][localeKey]}</span
              >
              {#if localeNames[currentLocaleKey][localeKey]}
                <span class="text-xs leading-relaxed text-muted-foreground"
                  >{localeNames[currentLocaleKey][localeKey]}</span
                >
              {/if}
            </label>
            <div class="flex h-5 shrink-0 items-center">
              <Switch
                id={`${languageId}-fallback-${locale}`}
                class="shrink-0"
                size="sm"
                color="primary"
                checked={isFallbackSelected}
                disabled={isSavingPreferences}
                onCheckedChange={checked =>
                  void updatePreferences(
                    getNextFallbackPreferences(locale, checked === true),
                  )}
              />
            </div>
          </div>
        {/each}
      </div>
    </SettingsDisclosure>

    <!-- Advanced Settings Section -->
    <SettingsDisclosure title={m.settings_language_advanced()} bind:open={advancedOpen}>
      <div class="flex flex-col gap-6 px-1 pt-3 pb-3">
        {#each advancedSettings as setting (setting.code)}
          <div class="flex w-full flex-row items-start justify-between gap-4 py-1">
            <div class="min-w-0 grow flex flex-col gap-2">
              <label
                for={`${languageId}-${setting.code}`}
                class="cursor-pointer text-sm font-medium text-base-content"
                >{setting.name}</label
              >
              {#if setting.description}
                <p class="text-xs leading-relaxed text-muted-foreground">
                  {setting.description}
                </p>
              {/if}
            </div>
            <div class="flex h-5 shrink-0 items-center">
              <Switch
                name={setting.code}
                id={`${languageId}-${setting.code}`}
                class="shrink-0"
                size="sm"
                color="primary"
                checked={setting.currentValue}
                disabled={isSavingPreferences}
                onCheckedChange={checked =>
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
          </div>
        {/each}
      </div>
    </SettingsDisclosure>
  </div>
</Section>
