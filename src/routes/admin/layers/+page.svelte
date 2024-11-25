<script lang="ts">
import { fade } from 'svelte/transition';
// STORES
import { filteredResources } from '$lib/stores/resources.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/layout/ResourceIndex.svelte';
import EntityCard from '$lib/components/layout/EntityCard.svelte';
import Image from '$lib/components/common/Image.svelte';
// TYPES
import type { EntityWithData, Layer } from '$lib/types';

// CONFIG :: KEY MAP
const keyMap = {
  id: 'id',
  title: 'name',
  subtitle: 'nameShort',
  description: 'description',
  image: 'name' // Using name for placeholder image
};

// STATE :: DERIVED :: PROJECTS
const entities = $derived(filteredResources.layer);
</script>

<!-- LAYOUT -->
<ResourceHeader />
<ResourceIndex {entities}>
  {#snippet children(entity)}
    <EntityCard {entity} {keyMap}>
      {#snippet header(entity)}
        <Image
          src="https://placehold.co/600x400?text={entity.name}"
          alt={entity.name}
          layout="cover" />
      {/snippet}
    </EntityCard>
  {/snippet}
</ResourceIndex>
