<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/resources/headers/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/resources/ResourceIndex.svelte';
import LayoutModes from '$lib/components/resources/controls/ResourceIndexLayoutModes.svelte';
import ControlModes from '$lib/components/resources/controls/ResourceIndexControlModes.svelte';
import EntityCard from '$lib/components/resources/EntityCard.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { KeyMap, Hub, LayoutMode, ControlMode } from '$lib/types';

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'code',
  title: 'i18n.name',
  subtitle: 'domain',
  description: 'i18n.description',
  image: 'organisations.image'
};

// CONTEXT
const adminCtx = getAdminCtx();
adminCtx.setFacet(false, false, FirstClassResource.hub);

// STATE
let layoutMode: LayoutMode = $state('card');
let controlMode: ControlMode = $state('filter');
// Use filteredHubs from resource state (requires superadmin access)
let entities: Hub[] = $derived(adminCtx.filteredHubs);
</script>

<!-- LAYOUT -->
<ResourceHeader>
  {#snippet modes()}
    <ControlModes bind:controlMode defaultMode="filter" />
    <LayoutModes bind:layoutMode defaultMode="card" />
  {/snippet}
</ResourceHeader>

<ResourceIndex {entities} {layoutMode} {controlMode}>
  {#snippet card(entity: Hub)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
