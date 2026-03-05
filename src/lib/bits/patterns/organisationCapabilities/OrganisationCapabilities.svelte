<script lang="ts">
import { m } from '$lib/i18n'
import { Button } from '$lib/bits/core'
import { SectionHeader, SectionHeaderPrimitive } from '$lib/bits/custom/form'
import {
  FormI18nCapabilities,
  FormI18nSection,
} from '$lib/bits/patterns/formI18nSection'
import { toLocaleKey } from '$lib/i18n'
import type { OrganisationCapabilitiesProps } from './organisationCapabilities.types'
import OrganisationCapabilitiesEmpty from './components/OrganisationCapabilitiesEmpty.svelte'
import OrganisationCapabilitiesSearch from './components/OrganisationCapabilitiesSearch.svelte'
import OrganisationCapabilitiesList from './components/OrganisationCapabilitiesList.svelte'
import Trash2Icon from 'virtual:icons/lucide/trash-2'
import XIcon from 'virtual:icons/lucide/x'

let {
  selectedCapabilityKeys,
  capabilitySearchOptions,
  selectedCapabilityIds,
  currentFormLocale,
  locales,
  isEditing,
  capabilityLabelsByKey,
  formCapabilityFields,
  shouldSubmitEmptyCapabilities = false,
  capabilityIssues = [],
  isRequiredInPreflight,
  getCapabilityDisplayLabel,
  onAddCapability,
  onRemoveCapability,
  onEnterEditMode,
}: OrganisationCapabilitiesProps = $props()

let isRemoveMode = $state(false)
const emptyCapabilitiesJson = '{}'

function onToggleRemoveMode(): void {
  isRemoveMode = !isRemoveMode
}

$effect(() => {
  if (isEditing) return
  isRemoveMode = false
})
</script>

{#if selectedCapabilityKeys.length === 0 && !isEditing}
  <OrganisationCapabilitiesEmpty {onEnterEditMode} />
{:else}
  <section
    class="bits-form__section bits-form__hub-orgs bits-form__capabilities-section"
  >
    {#if shouldSubmitEmptyCapabilities}
      <input type="hidden" name="data.capabilities" value={emptyCapabilitiesJson}>
    {/if}

    <SectionHeader
      title={m.resources__capabilities()}
      description={m.admin__forms_capabilities_add_subtitle()}
      class="bits-form__hub-orgs-header"
    >
      {#snippet center()}
        <OrganisationCapabilitiesSearch
          {isEditing}
          {capabilitySearchOptions}
          {selectedCapabilityIds}
          {currentFormLocale}
          {onAddCapability}
        />
      {/snippet}
      {#snippet right()}
        {#if isEditing}
          <Button
            text={isRemoveMode
              ? m.moving_each_orangutan_care()
              : m.admin__forms_capabilities_remove_mode_enable()}
            style="ghost"
            color="light"
            size="sm"
            iconComponent={isRemoveMode ? XIcon : Trash2Icon}
            onClick={onToggleRemoveMode}
            class="bits-form__capabilities-remove-toggle"
          />
        {/if}
      {/snippet}
    </SectionHeader>

    {#if capabilityIssues.length > 0}
      <SectionHeaderPrimitive.Issues issues={capabilityIssues} />
    {/if}

    <OrganisationCapabilitiesList
      {selectedCapabilityKeys}
      {isEditing}
      {isRemoveMode}
      {getCapabilityDisplayLabel}
      {onRemoveCapability}
    />
  </section>

  {#if selectedCapabilityKeys.length > 0}
    <FormI18nSection
      title={m.admin__forms_capabilities_localization_title()}
      subtitle={m.admin__forms_capabilities_labels_subtitle()}
      {locales}
      {isEditing}
    >
      {#snippet children(locale)}
        {@const formLocale = toLocaleKey(locale)}
        <FormI18nCapabilities
          fields={formCapabilityFields}
          capabilityKeys={selectedCapabilityKeys}
          capabilityLabels={capabilityLabelsByKey}
          {formLocale}
          {locale}
          {isEditing}
          {isRequiredInPreflight}
        />
      {/snippet}
    </FormI18nSection>
  {/if}
{/if}
