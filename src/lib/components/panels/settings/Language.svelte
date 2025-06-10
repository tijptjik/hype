<script lang="ts">
// I18N
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Language, ChevronDown, ChevronUp } from '@steeze-ui/heroicons';
import Section from '$lib/components/panels/common/Section.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// ENUMS
import { supportedLocales, localeNames } from '$lib/enums';
// TYPES
import type { UserPreferences } from '$lib/types';

// CONTEXT
const appCtx = getAppCtx();

// Ensure user preferences object exists and is reactive
const userPreferences: UserPreferences = $derived(appCtx.getUserPreferences());

// Advanced section features
const advancedSettings = $derived([
  {
    name: m.settings_language_auto_translate(),
    description: m.settings_language_auto_translate_description(),
    code: 'allowMachineTranslation',
    currentValue: userPreferences.allowMachineTranslation
  },
  {
    name: m.settings_language_show_translate_button(),
    description: m.settings_language_show_translate_button_description(),
    code: 'isTranslateButtonVisible',
    currentValue: userPreferences.isTranslateButtonVisible
  },
  {
    name: m.settings_language_prefer_placeholders(),
    description: m.settings_language_prefer_placeholders_description(),
    code: 'preferFallbackInCurrentLocale',
    currentValue: userPreferences.preferFallbackInCurrentLocale
  }
]);

// For collapsible sections
let preferredOpen = $state(true);
let additionalOpen = $state(true);
let advancedOpen = $state(false);
</script>

{#snippet summary(title: string, isOpen: boolean)}
  <summary class="flex cursor-pointer list-none items-center justify-between py-2 pr-3">
    <h2 class="pl-0.5 text-base-content">
      {title}
    </h2>
    <Icon src={isOpen ? ChevronUp : ChevronDown} class="h-5 w-5 text-base-content" />
  </summary>
{/snippet}

<Section
  title={m.settings__language()}
  icon="/language.svg"
  position="right"
  iconVerticalPaddingClass="py-3 pr-4.5">
  <div class="flex flex-col gap-4 px-4 caret-transparent">
    <!-- Primary Language Section -->
    <details bind:open={preferredOpen}>
      {@render summary(m.settings_language_preferred(), preferredOpen)}
      <div class="ml-4 flex flex-col gap-2 pt-2">
        {#each supportedLocales as locale}
          <div class="flex h-12 flex-row items-center justify-between gap-4">
            <div class="flex flex-row items-center gap-4">
              <Icon src={Language} class="h-5 w-5" />
              <p class="font-normal text-base-content">{localeNames[locale][locale]}</p>
              {#if locale !== getLocale() && localeNames[getLocale()][locale]}
                <p class="text-sm text-neutral-content">
                  ({localeNames[getLocale()][locale]})
                </p>
              {/if}
            </div>
            <input
              type="radio"
              name="language"
              value={locale}
              class="radio-primary radio radio-sm mr-4 h-5 w-5 cursor-pointer"
              checked={getLocale() === locale}
              onclick={async () => await appCtx.setLocale(locale)} />
          </div>
        {/each}
      </div>
    </details>

    <!-- Additional Languages Section -->
    <details class="mt-2" bind:open={additionalOpen}>
      {@render summary(m.settings_language_additional(), additionalOpen)}
      <div class="ml-4 flex flex-col gap-2 pt-2">
        {#each supportedLocales.filter((locale) => locale !== getLocale()) as locale (locale)}
          <div
            class="flex w-full flex-row items-center justify-between gap-4 py-1 pr-1.5">
            <label for={`fallback-${locale}`} class="flex cursor-pointer flex-col">
              <span class="font-normal text-base-content"
                >{localeNames[locale][locale]}</span>
              {#if localeNames[getLocale()][locale]}
                <span class="text-sm text-neutral-content"
                  >({localeNames[getLocale()][locale]})</span>
              {/if}
            </label>
            <input
              type="checkbox"
              id={`fallback-${locale}`}
              class="toggle toggle-primary toggle-sm flex-shrink-0"
              checked={userPreferences.fallbackLocales?.includes(locale) || false}
              onchange={(e) =>
                appCtx.setFallbackLocales(locale, e.currentTarget.checked)} />
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
            class="min-h-18 flex w-full flex-row items-center justify-between gap-4 py-2 pr-1.5">
            <div class="flex flex-col">
              <p class="font-normal text-base-content">
                <span class="pr-1.5">{setting.name}</span>
                {#if setting.description}
                  <span class="text-sm text-neutral-content"
                    >{setting.description}</span>
                {/if}
              </p>
            </div>
            <input
              name={setting.code}
              type="checkbox"
              class="toggle toggle-primary toggle-sm flex-shrink-0"
              checked={setting.currentValue}
              onchange={(e) =>
                appCtx.setAdvancedFeature(setting.code as keyof UserPreferences, e.currentTarget.checked)} />
          </div>
        {/each}
      </div>
    </details>
  </div>
</Section>
