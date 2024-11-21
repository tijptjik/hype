<script lang="ts">
// STORES
import { filteredResources } from '$lib/stores/resources.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/layout/ResourceIndex.svelte';
import EntityCard from '$lib/components/layout/EntityCard.svelte';

// CONFIG :: KEY MAP
const keyMap = {
  id: 'code',
  title: 'name',
  subtitle: 'nameShort',
  description: 'description',
  image: 'image',
};

// STATE :: DERIVED :: PROJECTS
const entities = $derived(filteredResources.project);
</script>

<!-- LAYOUT -->
<ResourceHeader />
<ResourceIndex {entities}>
  {#snippet children(entity)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
