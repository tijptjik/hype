<script lang="ts">
// LIB
import { ADMIN_PATH } from '$lib/index';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/layout/ResourceIndex.svelte';
import EntityCard from '$lib/components/layout/EntityCard.svelte';
// TYPES
import type { KeyMap } from '$lib/components/layout/EntityCard.svelte';
import type { Organisation } from '$lib/types';

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
</script>

<ResourceHeader />
<ResourceIndex entities={resourceState.state.resources.organisation as Organisation[]}>
  {#snippet children(entity, idx)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
