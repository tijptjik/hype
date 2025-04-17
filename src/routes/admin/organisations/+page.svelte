<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/layout/ResourceIndex.svelte';
import EntityCard from '$lib/components/layout/EntityCard.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';
// TYPES
import type { KeyMap } from '$lib/components/layout/EntityCard.svelte';

// CONFIG :: KEY MAP
const RESOURCE = HierarchicalResource.organisation;
const keyMap: KeyMap = {
  id: 'code',
  title: 'name',
  subtitle: 'nameShort',
  description: 'description',
  image: 'image'
};

// CONTEXT
const resourceState = getHierarchicalResourceState();
resourceState.setResource(RESOURCE);
</script>

<ResourceHeader />
<ResourceIndex entities={resourceState.filteredOrganisations}>
  {#snippet children(entity, idx)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
