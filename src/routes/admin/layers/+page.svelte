<script lang="ts">
// I18N
import { getLocale } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/resources/headers/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/resources/ResourceIndex.svelte';
import LayoutModes from '$lib/components/resources/controls/ResourceIndexLayoutModes.svelte';
import ControlModes from '$lib/components/resources/controls/ResourceIndexControlModes.svelte';
import EntityCard from '$lib/components/resources/EntityCard.svelte';
import Image from '$lib/components/common/Image.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { KeyMap, Layer, LayoutMode, ControlMode } from '$lib/types';

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
const adminCtx = getAdminCtx();
adminCtx.setFacet(false, false, FirstClassResource.layer);

// STATE
let layoutMode: LayoutMode = $state('card');
let controlMode: ControlMode = $state('filter');
let entities: Layer[] = $derived(adminCtx.filteredLayers);
</script>

<ResourceHeader>
  {#snippet modes()}
    <ControlModes bind:controlMode defaultMode="filter" />
    <LayoutModes bind:layoutMode defaultMode="card" />
  {/snippet}
</ResourceHeader>

<ResourceIndex {entities} {layoutMode} {controlMode}>
  {#snippet card(entity: Layer)}
    <EntityCard {entity} {keyMap}>
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
