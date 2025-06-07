<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
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
  title: 'organisations.i18n.name',
  subtitle: 'domain',
  description: 'organisations.i18n.description',
  image: 'organisations.image'
};

// CONTEXT
const resourceState = getHierarchicalResourceState();
resourceState.setResource(FirstClassResource.hub);
resourceState.setEntity(false);
resourceState.setFacet(false);

// Use filteredHubs from resource state (requires superadmin access)
let entities = $derived(resourceState.filteredHubs);
</script>

<!-- LAYOUT -->
<ResourceHeader />
<ResourceIndex {entities}>
  {#snippet children(entity)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex> 