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
import type { Organisation } from '$lib/types';

// CONFIG :: KEY MAP
const RESOURCE = FirstClassResource.organisation;
const keyMap: KeyMap = {
  id: 'code',
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
      falseText: 'Live',
      superAdminOnly: true
    }
  ]
};

// CONTEXT
const resourceState = getHierarchicalResourceState();
resourceState.setResource(RESOURCE);
resourceState.setEntity(false);
resourceState.setFacet(false);
</script>

<ResourceHeader />
<ResourceIndex entities={resourceState.filteredOrganisations}>
  {#snippet children(entity, idx)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
