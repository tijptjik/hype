<script lang="ts">
import { getCapabilityLabel } from '#lib/capabilities.js'
import { LocalSearch } from '#lib/bits/custom/index.js'
import { m } from '#lib/i18n.js'
import type { OrganisationCapabilitiesSearchProps } from '../organisationCapabilities.types'

let {
  isEditing,
  capabilitySearchOptions,
  selectedCapabilityIds,
  currentLocaleKey,
  focusOnMount = false,
  onAddCapability,
}: OrganisationCapabilitiesSearchProps = $props()
</script>

{#if isEditing}
  <div class="bits-form__capabilities-search">
    <LocalSearch
      options={capabilitySearchOptions}
      placeholder={m.forms__search_capabilities_placeholder()}
      {focusOnMount}
      maxResults={5}
      excludeIds={selectedCapabilityIds}
      getItemId={item => item.id}
      getSearchText={item =>
        `${item.key} ${getCapabilityLabel(item.key, currentLocaleKey)}`}
      onSelect={onAddCapability}
      resultMap={{
        image: () => null,
        title: item => getCapabilityLabel(item.key, currentLocaleKey),
        descriminator: item => item.key,
      }}
    />
  </div>
{/if}
