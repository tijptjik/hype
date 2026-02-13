<script lang="ts">
import { onMount } from 'svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
import { getHeaderCtrl } from '$lib/context/header.svelte';
// COMPONENTS
import ResourceIndex from '$lib/components/resources/ResourceIndex.svelte';
import EntityCard from '$lib/components/resources/EntityCard.svelte';
import FilterControlBar from '$lib/components/resources/filters/organisations/Root.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// I18N
import { m } from '$lib/i18n';
// ICONS
import OrganisationIcon from 'virtual:icons/lucide/users-round';
// TYPES
import type { KeyMap, Organisation } from '$lib/types';

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
const headerCtrl = getHeaderCtrl();
adminCtx.setFacet(false, false, RESOURCE);

// HEADER SETUP
adminCtx.setHeaderForIndex(m.maps__organisations(), OrganisationIcon);

// STATE
let entities: Organisation[] = $derived(
  adminCtx.getViewFilteredResource<Organisation>(FirstClassResource.organisation)
);
</script>

<ResourceIndex {entities}>
  {#snippet controlBar()}
    <FilterControlBar count={entities.length} />
  {/snippet}
  {#snippet card(entity: Organisation)}
    <EntityCard {entity} {keyMap} />
  {/snippet}
</ResourceIndex>
