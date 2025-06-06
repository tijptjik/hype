<script lang="ts">
// I18N
import { getI18n, getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
// TYPES
import type { Layer, Project, Organisation } from '$lib/types';

const mapCtx = getMapCtx();

// Enhanced layer type with project and organisation
type EnhancedLayer = Layer & {
  project?: Project;
  organisation?: Organisation;
};

// Get layers and user layer preferences from mapCtx
const layers = $derived(
  mapCtx.state.resources.layer.map(
    (layer: Layer): EnhancedLayer => ({
      ...layer,
      project: mapCtx.getProject(layer),
      organisation: mapCtx.getProject(layer)
        ? mapCtx.getOrganisation(mapCtx.getProject(layer)!)
        : undefined
    })
  )
);

const userLayerIds = $derived(new Set(mapCtx.getUserLayerIds()));
</script>

<Section title={m.settings_default_map_title()} icon="/globe.svg" position="right">
  <div
    class="scrollbar-thin flex min-h-0 flex-col gap-2 overflow-y-auto rounded-lg pl-4">
    {#each layers as layer}
      {@const organisation = layer.organisation}
      {@const project = layer.project}
      {@const description = getI18n(layer, 'description', mapCtx.getUserPreferences())}
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
                  >{getI18n(
                    organisation,
                    'nameShort',
                    mapCtx.getUserPreferences()
                  )}</span>
                <span class="px-0">›</span>
                <span class="text-accent"
                  >{getI18n(project, 'nameShort', mapCtx.getUserPreferences())}</span>
              {/if}
            </p>
          {/if}
          <p class="font-normal text-base-content">
            {getI18n(layer, 'name', mapCtx.getUserPreferences())}
            {#if description && description !== '-'}
              <span class="pl-1.5 text-sm text-neutral-content">
                {description}
              </span>
            {/if}
          </p>
        </div>
        <input
          name={layer.id}
          type="checkbox"
          class="flex-grow-1 toggle toggle-primary toggle-sm flex-shrink-0"
          checked={userLayerIds.has(layer.id)}
          onchange={(e) => mapCtx.setUserLayer(layer.id, e.currentTarget.checked)} />
      </div>
    {/each}
  </div>
</Section>
