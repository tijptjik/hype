<script lang="ts">
// ICONS
import LanguagesIcon from 'virtual:icons/tabler/language'
import ShieldIcon from 'virtual:icons/proicons/shield-checkmark'
// I18N
import { m } from '#lib/i18n.js'
import { contentFormKey } from '#lib/i18n/contentRecords.js'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
// COMPONENTS
import { SectionHeader, SectionHeaderPrimitive } from '#lib/bits/custom/form/index.js'
import { FormI18nCapabilities } from '#lib/bits/patterns/forms/formI18nSection/index.js'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import { displayedLocales } from '#lib/bits/custom/localeControls/localeControls.js'
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
import OrganisationCapabilitiesEmpty from './components/OrganisationCapabilitiesEmpty.svelte'
import OrganisationCapabilitiesSearch from './components/OrganisationCapabilitiesSearch.svelte'
import OrganisationCapabilitiesList from './components/OrganisationCapabilitiesList.svelte'
// STYLES
import { formSearchHeaderStyles } from '#lib/bits/patterns/forms/formSurface/formSearchHeader.styles.js'
import { formSectionDividerStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
// TYPES
import type { OrganisationCapabilitiesProps } from './organisationCapabilities.types'

let {
  users,
  selectedCapabilityKeys,
  capabilitySearchOptions,
  selectedCapabilityIds,
  currentLocaleKey,
  locales,
  capabilityLocales = [],
  isEditing,
  isArchived = false,
  resetVersion = 0,
  multilingual = $bindable(false),
  localeSelection = $bindable(null),
  formCapabilityFields,
  emptyCapabilitiesInputAttrs,
  shouldSubmitEmptyCapabilities = false,
  capabilityIssues = [],
  isRequiredInPreflight,
  getCapabilityDisplayLabel,
  onAddCapability,
  onRemoveCapability,
  onAddLocale,
  onEnterEditMode,
  onTranslate,
}: OrganisationCapabilitiesProps = $props()

const hasCapabilities = $derived(selectedCapabilityKeys.length > 0)
const availableLocales: string[] = $derived(
  normalizeContentLocales([...locales, ...capabilityLocales]),
)
const selectedLocales = $derived([
  ...new Set([...(localeSelection?.selectedLocales ?? []), ...availableLocales]),
])
const visibleLocales = $derived(localeSelection?.visibleLocales ?? selectedLocales)
const shownLocales = $derived(
  displayedLocales({ selectedLocales, visibleLocales }, multilingual),
)

const sectionClass =
  '@container bits-form__section bits-form__parent-resource bits-form__capabilities-section'
const headerClass = 'bits-form__capabilities-header'
</script>

<div
  class={`grid flex-1 ${hasCapabilities ? 'grid-rows-[repeat(2,minmax(min-content,1fr))]' : 'grid-rows-[minmax(min-content,1fr)]'}`}
>
  <div class={users ? 'grid min-h-0 grid-cols-1 lg:grid-cols-2' : 'contents'}>
    {#if users}
      {@render users()}
    {/if}
    <section class={`${sectionClass} flex min-h-0 flex-col`}>
      {#if shouldSubmitEmptyCapabilities && emptyCapabilitiesInputAttrs}
        <input {...emptyCapabilitiesInputAttrs}>
      {/if}

      <SectionHeader
        icon={ShieldIcon}
        title={m.resources__capabilities()}
        description={m.admin__forms_capabilities_add_subtitle()}
        class={`${headerClass} ${formSearchHeaderStyles}`}
      >
        {#snippet right()}
          <div
            class="w-full transition-opacity duration-180 ease-in-out motion-reduce:transition-none"
            style:opacity={isEditing ? 1 : 0}
            inert={!isEditing}
            aria-hidden={!isEditing}
          >
            <OrganisationCapabilitiesSearch
              {isEditing}
              {capabilitySearchOptions}
              {selectedCapabilityIds}
              {currentLocaleKey}
              focusOnMount={false}
              {onAddCapability}
            />
          </div>
        {/snippet}
      </SectionHeader>

      {#if !hasCapabilities}
        <div
          class="flex min-h-0 flex-1 flex-col transition-opacity duration-180 ease-in-out motion-reduce:transition-none"
          style:opacity={isEditing ? 0 : 1}
          inert={isEditing}
          aria-hidden={isEditing}
        >
          <OrganisationCapabilitiesEmpty {onEnterEditMode} disabled={isArchived} />
        </div>
      {/if}
      {#if capabilityIssues.length > 0}
        <SectionHeaderPrimitive.Issues issues={capabilityIssues} />
      {/if}

      {#if hasCapabilities}
        <OrganisationCapabilitiesList
          {selectedCapabilityKeys}
          {isEditing}
          {getCapabilityDisplayLabel}
          {onRemoveCapability}
        />
      {/if}
    </section>
  </div>

  {#if hasCapabilities}
    <div class={formSectionDividerStyles}>
      <section>
        <SectionHeader
          title="Capability I18n"
          description={m.admin__forms_capabilities_labels_subtitle()}
          icon={LanguagesIcon}
          class="mb-4 grid-cols-1! gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]! [&_.bits-form\_\_section-header-right]:[container-type:normal]! [&_.bits-form\_\_section-header-right]:block [&_.bits-form\_\_section-header-right]:min-w-0"
        >
          {#snippet right()}
            <LocaleToolbar
              {selectedLocales}
              {visibleLocales}
              expanded={multilingual}
              options={contentLocaleOptions(currentLocaleKey)}
              allowAdd={isEditing && !isArchived}
              onExpandedChange={value => {
                multilingual = value
              }}
              onChange={change => {
                if (change.action === 'add') onAddLocale?.(change.locale)
                localeSelection = {
                  selectedLocales: change.selectedLocales,
                  visibleLocales: change.visibleLocales,
                }
              }}
            />
          {/snippet}
        </SectionHeader>
        <FormI18nCapabilities
          fields={formCapabilityFields}
          capabilityKeys={selectedCapabilityKeys}
          locales={selectedLocales.map(contentFormKey)}
          visibleLocales={shownLocales.map(contentFormKey)}
          expanded={multilingual}
          {currentLocaleKey}
          {resetVersion}
          {onTranslate}
          {isEditing}
          {isRequiredInPreflight}
        />
      </section>
    </div>
  {/if}
</div>
