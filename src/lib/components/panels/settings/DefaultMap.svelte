<script lang="ts">
// I18N
import { m, getI18nValue, getLocale } from '$lib/i18n';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Map } from '@steeze-ui/heroicons';
import Section from '$lib/components/panels/common/Section.svelte';
// STORES
import { page } from '$app/stores';
// TYPES
import type { Layer } from '$lib/types';

const mapContext = getMapContext();
const { session } = $page.data;

const userId = $state(session?.user?.id);
let selectedLayers = $state(
  new Set<string>(session?.user?.userLayers?.map((l) => l.layerId))
);
let timer: number;

const cachedData = $state(
  mapContext.queryClient.getQueryData([
    'layers',
    [],
    []
  ])
);

// Get layers from TanStack Query cache
let layers = $state([]);

$effect(() => {
  getLocale;
  layers = cachedData.map((layer: Layer) => ({
    ...layer,
    project: mapContext.getProject(layer),
    organisation: mapContext.getProject(layer)
      ? mapContext.getOrganisation(mapContext.getProject(layer)!)
      : undefined
  }));
});

// Function to handle layer selection with debounce
const handleLayerSelect = (layerId: string) => {
  // Toggle the layer in our Set
  if (selectedLayers.has(layerId)) {
    selectedLayers.delete(layerId);
  } else {
    selectedLayers.add(layerId);
  }

  // Create the userLayers array from selected layers
  const userLayers = Array.from(selectedLayers).map((layerId) => ({
    userId,
    layerId,
    isVisibleOnLoad: true
  }));

  // Debounce the API call
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userLayers
        })
      });
      const updatedUser = await response.json();
      session.user.userLayers = updatedUser.userLayers;
    } catch (error) {
      console.error('Failed to update default maps:', error);
    }
  }, 500);
};
</script>

<Section title={m.settings_default_map_title()} icon="/globe.svg" position="right">
  <div
    class="scrollbar-thin flex min-h-0 flex-col gap-2 overflow-y-auto rounded-lg pl-4">
    {#each layers as layer}
      {@const organisation = layer.organisation}
      {@const project = layer.project}
      <div
        class="min-h-21 flex w-full flex-row items-center justify-between gap-4 px-4 py-2 pr-[27px]">
        <!-- <Icon src={Map} class="flex-grow-1 my-6 h-5 w-5 flex-shrink-0" /> -->
        <div class="flex flex-grow flex-col gap-0.5">
          {#if organisation && project}
            <p class="flex space-x-0.5 font-mono text-xs uppercase tracking-widest">
              {#if getLocale() == 'en'}
                <span class="text-primary"
                  >{organisation.code.replaceAll('_', '').replaceAll(' ', '')}</span>
                <span class="px-0">›</span>
                <span class="text-accent"
                  >{project.code.replaceAll('_', '').replaceAll(' ', '')}</span>
              {:else}
                <span class="text-primary"
                  >{getI18nValue(organisation, 'nameShort')}</span>
                <span class="px-0">›</span>
                <span class="text-accent">{getI18nValue(project, 'nameShort')}</span>
              {/if}
            </p>
          {/if}
          <p class="font-normal text-base-content">
            {getI18nValue(layer, 'name')}
            {#if layer.description}
              <span class="pl-1.5 text-sm text-neutral-content">
                {getI18nValue(layer, 'description')}
              </span>
            {/if}
          </p>
        </div>
        <input
          name={layer.id}
          type="checkbox"
          class="flex-grow-1 toggle toggle-primary toggle-sm flex-shrink-0"
          checked={selectedLayers.has(layer.id)}
          onchange={() => handleLayerSelect(layer.id)} />
      </div>
    {/each}
  </div>
</Section>
