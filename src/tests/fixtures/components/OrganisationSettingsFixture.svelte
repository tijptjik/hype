<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import OrganisationMessaging from '#lib/bits/patterns/messaging/OrganisationMessaging.svelte'
import OrganisationCapabilities from '#lib/bits/patterns/capabilities/organisationCapabilities/OrganisationCapabilities.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import Members from './FormUserRolesSectionFixture.svelte'
setResponsiveCtx()
let editing = $state(false)
let tab = $state('messaging')
</script>

<div class="bits-theme bg-background text-foreground min-h-screen">
  <nav class="flex flex-wrap gap-4 p-4">
    <button type="button" onclick={() => (tab = 'messaging')}>Messaging fixture</button>
    <button type="button" onclick={() => (tab = 'members')}>Members fixture</button>
    <button type="button" onclick={() => (tab = 'capabilities')}>
      Capabilities fixture
    </button>
    <button type="button" onclick={() => (editing = !editing)}>Toggle editing</button>
  </nav>
  {#if tab === 'messaging'}
    <OrganisationMessaging organisationId="synthetic-organisation" />
  {:else if tab === 'members'}
    <FormSurface><Members isEditing={editing} /></FormSurface>
  {:else}
    <FormSurface>
      <OrganisationCapabilities
        selectedCapabilityKeys={[]}
        capabilitySearchOptions={[]}
        selectedCapabilityIds={[]}
        currentLocaleKey="en"
        locales={['en']}
        isEditing={editing}
        capabilityLabelsByKey={{}}
        formCapabilityFields={{}}
        isRequiredInPreflight={() => false}
        getCapabilityDisplayLabel={key => key}
        onAddCapability={() => {}}
        onRemoveCapability={() => {}}
        onEnterEditMode={() => (editing = true)}
      />
    </FormSurface>
  {/if}
</div>
