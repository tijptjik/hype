<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/layout/ResourceIndex.svelte';
import EntityCard from '$lib/components/layout/EntityCard.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';
// CONFIG :: KEY MAP
import type { KeyMap } from '$lib/components/layout/EntityCard.svelte';
// TYPES
import type { Feature } from '$lib/types';

// CONTEXT
const resourceState = getHierarchicalResourceState();
resourceState.setResource(HierarchicalResource.feature);
resourceState.setEntity(false);
resourceState.setFacet(false);
// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'id',
  title: 'title',
  subtitle: 'addressProperties.neighbourhood',
  description: 'displayAddress',
  image: 'image',
  badges: [
    { label: 'isPublished', variant: 'primary' },
    { label: 'isVisitable', variant: 'outline' }
  ]
};
</script>

<!-- LAYOUT -->
<ResourceHeader />
<ResourceIndex entities={resourceState.filteredFeatures}>
  {#snippet children(entity, idx)}
    <EntityCard {entity} {keyMap}>
      {#snippet badges(entity: Feature)}
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
