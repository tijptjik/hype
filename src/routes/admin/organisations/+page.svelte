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
import type { KeyMap, Organisation, LayoutMode, ControlMode } from '$lib/types';

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
const adminCtx = getAdminCtx();
adminCtx.setFacet(false, false, RESOURCE);

// STATE
let layoutMode: LayoutMode = $state('card');
let controlMode: ControlMode = $state('filter');
let entities: Organisation[] = $derived(adminCtx.filteredOrganisations);
</script>

<ResourceHeader>
  {#snippet modes()}
    <ControlModes bind:controlMode defaultMode="filter" />
    <LayoutModes bind:layoutMode defaultMode="card" />
  {/snippet}
</ResourceHeader>

<ResourceIndex {entities} {layoutMode} {controlMode}>
  {#snippet card(entity: Organisation)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
