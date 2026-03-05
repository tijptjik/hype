<script lang="ts">
import { getCapabilityLabel } from '$lib/capabilities'
import { LocalSearch } from '$lib/bits/custom'
import type { OrganisationCapabilitiesSearchProps } from '../organisationCapabilities.types'

let {
  isEditing,
  capabilitySearchOptions,
  selectedCapabilityIds,
  currentFormLocale,
  onAddCapability,
}: OrganisationCapabilitiesSearchProps = $props()
</script>

{#if isEditing}
  <div class="bits-form__capabilities-search">
    <LocalSearch
      options={capabilitySearchOptions}
      placeholder="Search capabilities..."
      maxResults={5}
      excludeIds={selectedCapabilityIds}
      getItemId={item => item.id}
      getSearchText={item => `${item.key} ${getCapabilityLabel(item.key, currentFormLocale)}`}
      onSelect={onAddCapability}
      resultMap={{
        image: () => null,
        title: item => getCapabilityLabel(item.key, currentFormLocale),
        descriminator: item => item.key,
      }}
    />
  </div>
{/if}
