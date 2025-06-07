<script lang="ts">
// I18N
import { getLocale } from '$lib/i18n';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/layout/ResourceIndex.svelte';
import EntityCard from '$lib/components/layout/EntityCard.svelte';
import Image from '$lib/components/common/Image.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { KeyMap } from '$lib/components/layout/EntityCard.svelte';
import type { Layer } from '$lib/types';

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'id',
  title: 'i18n.name',
  subtitle: 'i18n.nameShort',
  description: 'i18n.description',
  image: 'image',
  badges: [
    { 
      label: 'isPublished', 
      variant: 'primary',
      type: 'boolean',
      trueText: 'Published',
      falseText: 'Draft'
    },
    { 
      label: 'isArchived', 
      variant: 'outline',
      type: 'boolean',
      trueText: 'Dead',
      falseText: 'Alive',
      superAdminOnly: true
    }
  ]
};

// CONTEXT
const resourceState = getHierarchicalResourceState();
resourceState.setResource(FirstClassResource.layer);
let entities = $derived(resourceState.filteredLayers);
</script>

<ResourceHeader />
<ResourceIndex {entities}>
  {#snippet children(entity)}
    <EntityCard entity={entity as Layer} {keyMap}>
      {#snippet header(entity: Layer)}
        <Image
          src="https://placehold.co/600x400/000000/CB37C1?font=source-sans-pro&text={entity
            .i18n?.[getLocale()]?.name}"
          alt={entity.i18n?.[getLocale()]?.name || ''}
          layout="cover" />
      {/snippet}
    </EntityCard>
  {/snippet}
</ResourceIndex>
