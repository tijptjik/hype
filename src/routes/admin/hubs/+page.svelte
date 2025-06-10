<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/layout/ResourceIndex.svelte';
import EntityCard from '$lib/components/layout/EntityCard.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { KeyMap } from '$lib/components/layout/EntityCard.svelte';

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'code',
  title: 'i18n.name',
  subtitle: 'domain',
  description: 'i18n.description',
  image: 'organisations.image'
};

// CONTEXT
const adminCtx = getAdminCtx();
adminCtx.setResource(FirstClassResource.hub);
adminCtx.setEntity(false);
adminCtx.setFacet(false);

// Use filteredHubs from resource state (requires superadmin access)
let entities = $derived(adminCtx.filteredHubs);
</script>

<!-- LAYOUT -->
<ResourceHeader />
<ResourceIndex {entities}>
  {#snippet children(entity)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
