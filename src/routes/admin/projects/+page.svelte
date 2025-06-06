<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/layout/ResourceIndex.svelte';
import EntityCard from '$lib/components/layout/EntityCard.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/enums';
// TYPES
import type { KeyMap } from '$lib/components/layout/EntityCard.svelte';

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'code',
  title: 'name',
  subtitle: 'nameShort',
  description: 'description',
  image: 'image'
};

// CONTEXT
const resourceState = getHierarchicalResourceState();
resourceState.setResource(HierarchicalResource.project);
resourceState.setEntity(false);
resourceState.setFacet(false);

let entities = $derived(resourceState.filteredProjects);
</script>

<!-- LAYOUT -->
<ResourceHeader />
<ResourceIndex {entities}>
  {#snippet children(entity)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
