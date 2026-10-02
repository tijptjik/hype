<script lang="ts">
import { m } from '#lib/i18n.js'
import { Button } from '#lib/bits/core/index.js'
import { SectionHeader, SectionHeaderPrimitive } from '#lib/bits/custom/form/index.js'
import {
  FormI18nCapabilities,
  FormI18nSection,
} from '#lib/bits/patterns/forms/formI18nSection/index.js'
import type { OrganisationCapabilitiesProps } from './organisationCapabilities.types'
import OrganisationCapabilitiesEmpty from './components/OrganisationCapabilitiesEmpty.svelte'
import OrganisationCapabilitiesSearch from './components/OrganisationCapabilitiesSearch.svelte'
import OrganisationCapabilitiesList from './components/OrganisationCapabilitiesList.svelte'
import Trash2Icon from 'virtual:icons/proicons/delete'
import XIcon from 'virtual:icons/proicons/cancel'

let {
  selectedCapabilityKeys,
  capabilitySearchOptions,
  selectedCapabilityIds,
  currentLocaleKey,
  locales,
  isEditing,
  isArchived = false,
  resetVersion = 0,
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
}: OrganisationCapabilitiesProps = $props()

let isRemoveMode = $state(false)
let lastResetVersion = $derived(resetVersion)
const hasCapabilities = $derived(selectedCapabilityKeys.length > 0)
const showInitialAddLayout = $derived(isEditing && !hasCapabilities)

const sectionClass = $derived(
  [
    'bits-form__section',
    'bits-form__parent-resource',
    'bits-form__capabilities-section',
    showInitialAddLayout ? 'bits-form__capabilities-section--initial' : '',
  ]
    .filter(Boolean)
    .join(' '),
)

const headerClass = $derived(
  [
    'bits-form__capabilities-header',
    showInitialAddLayout ? 'bits-form__capabilities-header--initial' : '',
  ]
    .filter(Boolean)
    .join(' '),
)

function onToggleRemoveMode(): void {
  isRemoveMode = !isRemoveMode
}

$effect(() => {
  if (isEditing) return
  isRemoveMode = false
})

$effect(() => {
  if (resetVersion === lastResetVersion) return
  lastResetVersion = resetVersion
  isRemoveMode = false
})
</script>

{#if !hasCapabilities && !isEditing}
  <OrganisationCapabilitiesEmpty {onEnterEditMode} disabled={isArchived} />
{:else}
  <section class={sectionClass}>
    {#if shouldSubmitEmptyCapabilities && emptyCapabilitiesInputAttrs}
      <input {...emptyCapabilitiesInputAttrs}>
    {/if}

    <SectionHeader
      title={m.resources__capabilities()}
      description={m.admin__forms_capabilities_add_subtitle()}
      class={headerClass}
    >
      {#snippet right()}
        {#if isEditing && hasCapabilities}
          <Button
            text={isRemoveMode
              ? m.moving_each_orangutan_care()
              : m.admin__forms_capabilities_remove_mode_enable()}
            style="ghost"
            color="light"
            size="sm"
            iconComponent={isRemoveMode ? XIcon : Trash2Icon}
            onClick={onToggleRemoveMode}
            class="h-10 whitespace-nowrap min-w-max"
          />
        {/if}
      {/snippet}
    </SectionHeader>

    <div class="bits-form__capabilities-search-row">
      <OrganisationCapabilitiesSearch
        {isEditing}
        {capabilitySearchOptions}
        {selectedCapabilityIds}
        {currentLocaleKey}
        focusOnMount={showInitialAddLayout}
        {onAddCapability}
      />
    </div>

    {#if capabilityIssues.length > 0}
      <SectionHeaderPrimitive.Issues issues={capabilityIssues} />
    {/if}

    {#if hasCapabilities}
      <OrganisationCapabilitiesList
        {selectedCapabilityKeys}
        {isEditing}
        {isRemoveMode}
        {getCapabilityDisplayLabel}
        {onRemoveCapability}
      />
    {/if}
  </section>

  {#if hasCapabilities}
    <FormI18nSection
      title={m.admin__forms_capabilities_localization_title()}
      subtitle={m.admin__forms_capabilities_labels_subtitle()}
      {locales}
      {isEditing}
    >
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
  {/if}
{/if}
