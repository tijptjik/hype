<script lang="ts">
// COMPONENTS
import OrganisationCapabilitiesSkeleton from '#lib/bits/patterns/capabilities/organisationCapabilities/OrganisationCapabilitiesSkeleton.svelte'
import OrganisationCapabilities from '#lib/bits/patterns/capabilities/organisationCapabilities/OrganisationCapabilities.svelte'
import OrganisationUserSettings from '#lib/bits/patterns/organisationUsers/OrganisationUserSettings.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// STYLES
import { resourceTabsStyles } from '#lib/bits/patterns/forms/formSurface/resourceTabs.styles.js'
// TYPES
import type { CapabilityKey } from '#lib/capabilities.types.js'
setResponsiveCtx()
let ready = $state(false)
const keys: CapabilityKey[] = ['manageBakeries', 'manageVolunteers', 'manageDropOffs']
const labels = ['Donor Manager', 'Event Manager', 'Drop Point Manager']
const fields = Object.fromEntries(
  keys.map((key, index) => [
    key,
    {
      i18n: {
        en: {
          as: () => ({ value: labels[index] }),
          set: () => {},
          issues: () => undefined,
        },
      },
    },
  ]),
)
</script>
<div class="bits-theme flex min-h-screen flex-col">
  <button type="button" class="h-12 shrink-0" onclick={() => (ready = !ready)}>
    Toggle loaded
  </button>
  <div data-content class="flex min-h-0 flex-1 flex-col">
    {#if !ready}
      <OrganisationCapabilitiesSkeleton />
    {:else}
      <FormSurface class={`${resourceTabsStyles} flex min-h-0 flex-1 flex-col`}>
        <OrganisationCapabilities
          selectedCapabilityKeys={keys}
          selectedCapabilityIds={keys}
          capabilitySearchOptions={[]}
          currentLocaleKey="en"
          locales={['en']}
          isEditing={false}
          capabilityLabelsByKey={{}}
          formCapabilityFields={fields}
          isRequiredInPreflight={() => false}
          getCapabilityDisplayLabel={key => labels[keys.indexOf(key)]}
          onAddCapability={() => {}}
          onRemoveCapability={() => {}}
          onEnterEditMode={() => {}}
        >
          {#snippet users()}
            <OrganisationUserSettings
              policy={{
                enabled: true,
                hubSignIn: true,
                emailDomain: null,
                contribution: false,
                customCard: true,
                revision: 0,
              }}
              hubId="hub"
              hubDomain="breadline.hk"
              disabled
              onChange={() => {}}
            />
          {/snippet}
        </OrganisationCapabilities>
      </FormSurface>
    {/if}
  </div>
</div>
