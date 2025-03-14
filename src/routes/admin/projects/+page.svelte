<script lang="ts">
// LIB
import { ADMIN_PATH } from '$lib/index';
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
import type { Project } from '$lib/types';

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

<!-- LAYOUT -->
<ResourceHeader />
<ResourceIndex entities={resourceState.state.resources.project as Project[]}>
  {#snippet children(entity, idx)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
