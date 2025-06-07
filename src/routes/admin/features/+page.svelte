<script lang="ts">
// LOCALE
import { getLocale } from '$lib/i18n';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// COMPONENTS
import ResourceHeader from '$lib/components/layout/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/layout/ResourceIndex.svelte';
import EntityCard from '$lib/components/layout/EntityCard.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// CONFIG :: KEY MAP
import type { KeyMap } from '$lib/components/layout/EntityCard.svelte';
// TYPES
import type { Resource, Feature } from '$lib/types';

// CONTEXT
const resourceState = getHierarchicalResourceState();
resourceState.setResource(FirstClassResource.feature);
resourceState.setEntity(false);
resourceState.setFacet(false);

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'id',
  title: 'title',
  subtitle: 'addressProperties.neighbourhood',
  description: 'displayAddress',
  image: 'image',
  badges: [
    { label: 'isPublished', variant: 'primary' },
    { label: 'isVisitable', variant: 'outline' }
  ]
};
let entities = $derived(resourceState.filteredFeatures);
</script>

<!-- LAYOUT -->
<ResourceHeader />
<ResourceIndex {entities}>
  {#snippet children(entity: Feature, idx: number)}
    <EntityCard {entity} {keyMap}>
      {#snippet badges(entity: Feature)}
        <div>
          <span class="badge badge-primary  my-0.5 h-8 bg-base-300"
            >{entity.isPublished ? 'Published' : 'Draft'}</span>
          <span class="badge badge-outline my-0.5 h-8 bg-base-300">
            {entity.isVisitable ? 'Visitable' : 'Not Visitable'}
          </span>
          {#each entity.properties.filter((p) => p.propertyValueId) as property}
            <span class="bage-primary badge my-0.5 h-8 bg-base-300">
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
        </div>
      {/snippet}
    </EntityCard>
  {/snippet}
</ResourceIndex>
