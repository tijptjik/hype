<script lang="ts">
import { fade } from 'svelte/transition'
import LanguagesIcon from 'virtual:icons/tabler/language'
import { formSearchHeaderStyles } from '#lib/bits/patterns/forms/formSurface/formSearchHeader.styles.js'
import { m } from '#lib/i18n.js'
import { SectionHeader, SectionHeaderPrimitive } from '#lib/bits/custom/form/index.js'
import {
  FormI18nCapabilities,
  FormI18nSection,
} from '#lib/bits/patterns/forms/formI18nSection/index.js'
import type { OrganisationCapabilitiesProps } from './organisationCapabilities.types'
import OrganisationCapabilitiesEmpty from './components/OrganisationCapabilitiesEmpty.svelte'
import OrganisationCapabilitiesSearch from './components/OrganisationCapabilitiesSearch.svelte'
import OrganisationCapabilitiesList from './components/OrganisationCapabilitiesList.svelte'
import ShieldIcon from 'virtual:icons/proicons/shield-checkmark'
import { formSectionDividerStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'

let {
  selectedCapabilityKeys,
  capabilitySearchOptions,
  selectedCapabilityIds,
  currentLocaleKey,
  locales,
  isEditing,
  isArchived = false,
  capabilityLabelsByKey,
  formCapabilityFields,
  emptyCapabilitiesInputAttrs,
  shouldSubmitEmptyCapabilities = false,
  capabilityIssues = [],
  isRequiredInPreflight,
  getCapabilityDisplayLabel,
  onAddCapability,
  onRemoveCapability,
  onEnterEditMode,
  onTranslate,
  onResetLocale,
}: OrganisationCapabilitiesProps = $props()

const hasCapabilities = $derived(selectedCapabilityKeys.length > 0)

const sectionClass =
  '@container bits-form__section bits-form__parent-resource bits-form__capabilities-section'
const headerClass = 'bits-form__capabilities-header'
</script>

<div
  class={`grid flex-1 ${hasCapabilities ? 'grid-rows-[repeat(2,minmax(min-content,1fr))]' : 'grid-rows-[minmax(min-content,1fr)]'}`}
>
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
        {#if isEditing}
          <div class="w-full" transition:fade={{ duration: 140 }}>
            <OrganisationCapabilitiesSearch
              {isEditing}
              {capabilitySearchOptions}
              {selectedCapabilityIds}
              {currentLocaleKey}
              focusOnMount={false}
              {onAddCapability}
            />
          </div>
        {/if}
      {/snippet}
    </SectionHeader>

    {#if !hasCapabilities && !isEditing}
      <OrganisationCapabilitiesEmpty {onEnterEditMode} disabled={isArchived} />
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

  {#if hasCapabilities}
    <div class={formSectionDividerStyles}>
      <FormI18nSection
        title={m.admin__forms_capabilities_localization_title()}
        subtitle={m.admin__forms_capabilities_labels_subtitle()}
        localeCodeClass="absolute right-6 top-3 text-base font-medium uppercase text-muted-foreground"
        {locales}
        {isEditing}
        {onTranslate}
        {onResetLocale}
      >
        {#snippet left()}
          <div class="flex items-center gap-3">
            <LanguagesIcon class="size-6 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 class="text-xl font-semibold tracking-tight">
                {m.admin__forms_capabilities_localization_title()}
              </h2>
              <p class="text-xs text-muted-foreground">
                {m.admin__forms_capabilities_labels_subtitle()}
              </p>
            </div>
          </div>
        {/snippet}
        {#snippet children(
          locale,
        )}
          <FormI18nCapabilities
            fields={formCapabilityFields}
            capabilityKeys={selectedCapabilityKeys}
            capabilityLabels={capabilityLabelsByKey}
            {locale}
            {isEditing}
            {isRequiredInPreflight}
          />
        {/snippet}
      </FormI18nSection>
    </div>
  {/if}
</div>
