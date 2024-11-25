<script lang="ts">
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
  title: 'title',
  subtitle: 'addressProperties.neighbourhood',
  description: 'displayAddress',
  image: 'id', // Using id for placeholder image
  badges: [
    { label: 'isPublished', variant: 'primary' },
    { label: 'isVisitable', variant: 'outline' }
  ]
};

// STATE :: DERIVED :: PROJECTS
const entities = $derived(filteredResources.feature);
</script>

<!-- LAYOUT -->
<ResourceHeader />
<ResourceIndex {entities}>
  {#snippet children(entity, idx)}
    <EntityCard {entity} {keyMap}>
      {#snippet header(entity)}
        <Image
          src="https://picsum.photos/384/{192 + idx}"
          alt={entity.displayAddress}
          layout="cover" />
      {/snippet}

      {#snippet badges(entity)}
        <div class="flex flex-row flex-wrap justify-center gap-2 pb-2 align-middle">
          <span class="badge badge-primary"
            >{entity.isPublished ? 'Published' : 'Draft'}</span>
          {#each entity.properties as property}
            <span class="badge badge-secondary">{property.property.label}</span>
          {/each}
          <span class="badge badge-outline">
            {entity.isVisitable ? 'Visitable' : 'Not Visitable'}
          </span>
        </div>
      {/snippet}
    </EntityCard>
  {/snippet}
</ResourceIndex>
