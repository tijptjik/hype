<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/layout/ResourceIndex.svelte';
import EntityCard from '$lib/components/layout/EntityCard.svelte';
import Image from '$lib/components/common/Image.svelte';
// TYPES
import type { KeyMap } from '$lib/components/layout/EntityCard.svelte';
import type { Layer } from '$lib/types';

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'id',
  title: 'name',
  subtitle: 'nameShort',
  description: 'description',
  image: 'image'
};

// CONTEXT
const resourceState = getHierarchicalResourceState();
</script>

<ResourceHeader />
<ResourceIndex entities={resourceState.filteredLayers}>
  {#snippet children(entity)}
    <EntityCard {entity} {keyMap}>
      {#snippet header(entity: Layer)}
        <!-- TODO Render these placeholders with the graphemes -->
        <Image
          src="https://placehold.co/600x400?text={entity.name}"
          alt={entity.name}
          layout="cover" />
      {/snippet}
    </EntityCard>
  {/snippet}
</ResourceIndex>
