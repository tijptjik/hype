<script lang="ts">
// I18N
import { getLocale, getLocaleKey, toLocaleCode } from '$lib/i18n'
import { m } from '$lib/i18n'
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
import type { PanelProps, LocaleKey } from '$lib/types'
import type { UserPreferences } from '$lib/db/zod/schema/user.types'

// CONTEXT
const appCtx = getAppCtx()

const { ...panelProps }: PanelProps = $props()

// Ensure user preferences object exists and is reactive
const userPreferences: UserPreferences = $derived(appCtx.getUserPreferences())
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
</script>

{#snippet summary(title: string, isOpen: boolean)}
  <summary class="flex cursor-pointer list-none items-center justify-between py-2 pr-3">
    <h2 class="pl-0.5 text-base-content">{title}</h2>
    <Icon src={isOpen ? ChevronUp : ChevronDown} class="h-5 w-5 text-base-content" />
  </summary>
{/snippet}

<Section
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
      {@render summary(m.settings_language_preferred(), preferredOpen)}
      <div class="ml-4 flex flex-col gap-2 pt-2">
        {#each supportedLocaleKeys as localeKey}
          <div class="flex h-12 flex-row items-center justify-between gap-4">
            <div class="flex flex-row items-center gap-4">
              <Icon src={Language} class="h-5 w-5" />
              <p class="font-normal text-base-content">
                {localeNames[localeKey][localeKey]}
              </p>
              {#if localeKey !== getLocaleKey() && localeNames[currentLocaleKey][localeKey]}
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
              checked={getLocaleKey() === localeKey}
              onclick={() => appCtx.setLocale(SupportedLocales[localeKey])}
            >
          </div>
        {/each}
      </div>
    </details>

    <!-- Additional Languages Section -->
    <details class="mt-2" bind:open={additionalOpen}>
      {@render summary(m.settings_language_additional(), additionalOpen)}
      <div class="ml-4 flex flex-col gap-2 pt-2">
        {#each supportedLocales.filter((locale) => locale !== getLocale()) as locale (locale)}
          {@const localeKey = LocaleKeysMap[locale] as LocaleKey}
          <div
            class="flex w-full flex-row items-start justify-between gap-3 py-1 pr-1.5"
          >
            <label
              for={`fallback-${locale}`}
              class="flex min-w-0 grow cursor-pointer flex-col"
            >
              <span class="font-normal text-base-content"
                >{localeNames[localeKey][localeKey]}</span
              >
              {#if localeNames[currentLocaleKey][localeKey]}
                <span class="text-sm text-neutral-content"
                  >({localeNames[currentLocaleKey][localeKey]})</span
                >
              {/if}
            </label>
            <Switch
              id={`fallback-${locale}`}
              class="mt-0.5 shrink-0"
              size="sm"
              color="primary"
              checked={userPreferences.fallbackLocales?.includes(locale) || false}
              onCheckedChange={(checked) =>
                appCtx.setFallbackLocales(locale, checked === true)}
            />
          </div>
        {/each}
      </div>
    </details>

    <!-- Advanced Settings Section -->
    <details class="mt-2" bind:open={advancedOpen}>
      {@render summary(m.settings_language_advanced(), advancedOpen)}
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
              onCheckedChange={(checked) =>
                appCtx.setAdvancedFeature(
                  setting.code as keyof UserPreferences,
                  checked === true
                )}
            />
          </div>
        {/each}
      </div>
    </details>
  </div>
</Section>
