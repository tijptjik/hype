<script lang="ts">
// LOCALE
import { getLocale } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/resources/headers/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/resources/ResourceIndex.svelte';
import LayoutModes from '$lib/components/resources/controls/ResourceIndexLayoutModes.svelte';
import ControlModes from '$lib/components/resources/controls/ResourceIndexControlModes.svelte';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
import EntityCard from '$lib/components/resources/EntityCard.svelte';
import FilterControlBar from '$lib/components/resources/filters/features/Root.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { KeyMap, Feature, ControlMode, LayoutMode } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();
adminCtx.setFacet(false, false, FirstClassResource.feature);

// STATE
let layoutMode: LayoutMode = $state('table');
let controlMode: ControlMode = $state('filter');

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'id',
  title: 'i18n.title',
  subtitle: 'i18n.addressProperties.neighbourhood',
  description: 'i18n.displayAddress',
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
      label: 'isVisitable',
      variant: 'outline',
      type: 'boolean',
      trueText: 'Visitable',
      falseText: 'Not Visitable'
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
let entities: Feature[] = $derived(adminCtx.getViewFilteredResource<Feature>(FirstClassResource.feature) );
</script>

<!-- LAYOUT -->
<ResourceHeader>
  {#snippet filters()}
    <FilterInput
      resourceType={FirstClassResource.feature}
      rounded={true}
      showUnpublishedToggle={false}
      showReviewedToggle={true} />
  {/snippet}
  {#snippet modes()}
    <ControlModes bind:controlMode defaultMode="filter" />
    <LayoutModes bind:layoutMode defaultMode="table" />
  {/snippet}
</ResourceHeader>

<ResourceIndex {entities} {layoutMode} {controlMode}>
  {#snippet controlBar()}
    <FilterControlBar count={entities.length} />
  {/snippet}
  {#snippet card(entity: Feature)}
    <EntityCard {entity} {keyMap}>
      {#snippet badgesExtra(entity: Feature)}
        {#each entity.properties.filter((p) => p.propertyValueId) as property}
          <span class="badge my-0.5 h-8 bg-base-300">
            <div class="flex h-8 flex-row items-center justify-center gap-2">
              <div
                class="block bg-base-100 font-mono text-xs uppercase text-neutral-content">
                {property.property?.i18n?.[getLocale()]?.label}
              </div>
              <div class="font-normal">
                {property.property?.values?.find(
                  (v) => v.id === property.propertyValueId
                )?.i18n?.[getLocale()]?.value}
              </div>
            </div>
          </span>
        {/each}
      {/snippet}
    </EntityCard>
  {/snippet}
  {#snippet row(entity: Feature, rowIdx: number)}
    <a href={`/admin/${adminCtx.getEntityPath(adminCtx.activeResourceType as FirstClassResource, entity.id)}`}>
    <div
      class="flex flex-row items-center justify-between rounded-lg bg-base-100 p-4 px-8 shadow-sm transition-shadow hover:shadow-md">
      <div class="flex flex-row items-center justify-between">
        <div class="flex-1">
          <h3 class="text-lg font-semibold">
            {entity.i18n?.[getLocale()]?.title || 'Untitled'}
          </h3>
          <p class="text-sm text-base-content/70">
            {entity.i18n?.[getLocale()]?.displayAddress || 'No address'}
          </p>
        </div>
        <div class="divider divider-horizontal mx-4"></div>
      </div>
      <div class="flex flex-row items-center justify-between">
        <div class="divider divider-horizontal mx-4"></div>
        <div class="flex items-center space-x-2">
          <span class="badge {entity.isPublished ? 'badge-primary' : 'badge-ghost'}">
            {entity.isPublished ? 'Published' : 'Draft'}
          </span>
        </div>
      </div>
    </div>
    </a>
  {/snippet}
</ResourceIndex>
