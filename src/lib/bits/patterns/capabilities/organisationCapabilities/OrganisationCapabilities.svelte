<script lang="ts">
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
  users,
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
      <FormI18nSection
        title="Capability I18n"
        subtitle={m.admin__forms_capabilities_labels_subtitle()}
        localeCodeClass="absolute right-6 top-3 text-base font-medium uppercase text-muted-foreground"
        {locales}
        {isEditing}
        {onTranslate}
        {onResetLocale}
      >
        {#snippet left()}
          <div class="flex items-center gap-3">
            <LanguagesIcon class="text-primary size-6 shrink-0" aria-hidden="true" />
            <div>
              <h2 class="text-xl font-semibold tracking-tight">Capability I18n</h2>
              <p class="text-muted-foreground text-xs">
                {m.admin__forms_capabilities_labels_subtitle()}
              </p>
            </div>
          </div>
        {/snippet}
        {#snippet children(locale)}
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
