<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { XMark } from '@steeze-ui/heroicons';
// I18N
import * as m from '$lib/paraglide/messages';
import { languageTag } from '$lib/paraglide/runtime';
import { getI18nValue } from '$lib/i18n';
// TYPES
import type { Resource, Id } from '$lib/types';

type Neighbourhood = {
  neighbourhood: string;
  data: {
    neighbourhood: string;
    region: string;
    district: string;
  };
};

// First, get the props without destructuring
let props = $props<{
  mapContext: any;
  type: 'organisation' | 'project' | 'layer' | 'neighbourhood';
  resources: Resource[] | Neighbourhood[];
  selectedIds: Id[] | string[];
  colorClass?: string;
}>();

// Then reference props directly or create derived values if needed
let colorClass = $derived(props.colorClass ?? 'text-blue-400');

// Use arrow functions to preserve the this context
function handleToggle(id: Id) {
  switch (props.type) {
    case 'organisation':
      props.mapContext.toggleOrganisation(id);
      break;
    case 'project':
      props.mapContext.toggleProject(id);
      break;
    case 'layer':
      props.mapContext.toggleLayer(id);
      break;
    case 'neighbourhood':
      props.mapContext.toggleNeighbourhood(id);
      break;
  }
}
</script>

{#if props.selectedIds.length > 0}
  <div class="flex flex-wrap gap-2 p-4 px-8 pt-1">
    {#each props.selectedIds as id}
      {@const resource = props.resources.find((r) => r.id === id)}
      {#if resource}
        <span
          class="badge badge-outline cursor-pointer px-3 py-3 {colorClass}"
          onclick={(e) => {
            e.stopPropagation();
            handleToggle(id);
          }}>
          {#if languageTag() === 'en'}
            {props.type === 'neighbourhood'
              ? resource.id
              : resource.nameShort || resource.name}
          {:else}
            {getI18nValue(resource, 'name')}
          {/if}
          <Icon src={XMark} class="ml-1 h-3 w-3" />
        </span>
      {/if}
    {/each}
  </div>
{:else}
  <div class="flex flex-wrap justify-start gap-2 px-11 pt-1">
    <p class="pb-4 text-sm text-base-content/60">
      {@html props.type == 'layer'
        ? m.maps__layers_none()
        : props.type == 'project'
          ? m.maps__projects_none()
          : props.type == 'neighbourhood'
            ? m.maps__neighbourhoods_none()
            : m.maps__organisations_none()}
    </p>
  </div>
{/if}
