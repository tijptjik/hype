<script lang="ts">
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
import { normalizeContentLocale } from '#lib/content-locales/model.js'
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
import type { SimpleLanguageSettingsModel } from '#lib/bits/patterns/settingsPanel/settingsPanel.types.js'
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
}: PanelProps & {
  model: ReturnType<typeof useLanguageSettingsModel> | SimpleLanguageSettingsModel
} = $props()

const languageId = $props.id()

let additionalOpen = $state(false)
let advancedOpen = $state(false)
const fullModel = $derived('userPreferences' in model ? model : null)
const currentLocale = $derived(model.currentLocale)
const currentLocaleKey = $derived(model.currentLocaleKey)
const pendingLocale = $derived(model.pendingLocale)
const handleLocaleChange = (...args: Parameters<typeof model.handleLocaleChange>) =>
  model.handleLocaleChange(...args)
</script>

<Section
  {...panelProps}
  title={m.settings__language()}
  icon={Language}
  position="right"
  iconColorClass="text-base-content"
  defaultOpen={!fullModel}
  iconVerticalPaddingClass="py-3 pr-4.5"
>
  <div class="flex flex-col gap-4 px-6 pt-2 pb-6 caret-transparent">
    <!-- Primary Language Section -->
    <fieldset class="flex min-w-0 flex-col gap-2 pb-2">
      <legend class="text-muted-foreground mb-3 text-xs font-medium">
        {m.settings_language_preferred()}
      </legend>
      {#each supportedLocaleKeys.filter(
        key =>
          !('availableLocales' in model) ||
          !model.availableLocales ||
          model.availableLocales.includes(SupportedLocales[key]),
      ) as localeKey}
        <label
          class="hover:bg-surface has-[:checked]:bg-surface flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 has-[:disabled]:cursor-wait"
        >
          <span class="min-w-0">
            <span class="text-base-content block text-sm font-medium"
              >{localeNames[localeKey][localeKey]}</span
            >
            {#if localeKey !== currentLocaleKey &&
              localeNames[currentLocaleKey][localeKey]}
              <span class="text-muted-foreground block text-xs"
                >{localeNames[currentLocaleKey][localeKey]}</span
              >
            {/if}
          </span>
          <input
            type="radio"
            name={languageId}
            value={SupportedLocales[localeKey]}
            class="accent-primary size-4 shrink-0 cursor-pointer"
            checked={currentLocaleKey === localeKey}
            disabled={pendingLocale !== null}
            onchange={() => handleLocaleChange(SupportedLocales[localeKey])}
          >
        </label>
      {/each}
    </fieldset>

    {#if fullModel}
      <!-- Reading language is independent of the interface language. -->
      <label class="flex min-w-0 flex-col gap-2 text-sm">
        {m.translation_reading_language()}
        <select
          class="border-border bg-panel min-w-0 rounded-md border px-3 py-2"
          value={normalizeContentLocale(
            fullModel.userPreferences.contentLocale ?? currentLocale,
          ) ?? 'en'}
          disabled={fullModel.isSavingPreferences}
          onchange={event =>
            void fullModel.updatePreferences({
              ...fullModel.userPreferences,
              contentLocale: event.currentTarget.value,
            })}
        >
          {#each contentLocaleOptions(currentLocaleKey) as option (option.tag)}
            <option value={option.tag}>{option.name} · {option.autonym}</option>
          {/each}
        </select>
        <span class="text-muted-foreground text-xs"
          >{m.translation_fallback_help()}</span
        >
      </label>

      <!-- Advanced Settings Section -->
      <SettingsDisclosure
        title={m.settings_language_advanced()}
        bind:open={advancedOpen}
      >
        <div class="flex flex-col gap-6 px-1 pt-3 pb-3">
          {#each fullModel.advancedSettings as setting (setting.code)}
            <div class="flex w-full flex-row items-start justify-between gap-4 py-1">
              <div class="flex min-w-0 grow flex-col gap-2">
                <label
                  for={`${languageId}-${setting.code}`}
                  class="text-base-content cursor-pointer text-sm font-medium"
                  >{setting.name}</label
                >
                {#if setting.description}
                  <p class="text-muted-foreground text-xs leading-relaxed">
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
                  disabled={fullModel.isSavingPreferences}
                  onCheckedChange={checked =>
                    void fullModel.updatePreferences(
                      fullModel.getNextAdvancedPreferences(
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
    {/if}
  </div>
</Section>
