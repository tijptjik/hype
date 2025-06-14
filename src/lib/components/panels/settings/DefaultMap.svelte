<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
// TYPES
import type { Layer, Project, Organisation } from '$lib/types';

const appCtx = getAppCtx();

// Enhanced layer type with project and organisation
type EnhancedLayer = Layer & {
  project?: Project;
  organisation?: Organisation;
};

const userLayerIds = $derived(new Set(appCtx.getUserLayerIds()));
</script>

<Section title={m.settings_default_map_title()} icon="/globe.svg" position="right">
  <div
    class="scrollbar-thin flex min-h-0 flex-col gap-2 overflow-y-auto rounded-lg pl-6 pr-3">
    {#each appCtx.state.resources.layer as layer}
      {#await appCtx.getHierarchy(layer) then { organisation, project }}
        {@const organisationName = getI18n(
          organisation,
          'nameShort',
          appCtx.getUserPreferences()
        )}
        {@const projectName = appCtx.getContextualProjectName(project, false)}
        {@const description = getI18n(
          layer,
          'description',
          appCtx.getUserPreferences()
        )}
        <div
          class="min-h-21 flex w-full flex-row items-center justify-between gap-4 px-4 py-2 pl-2">
          <!-- <Icon src={Map} class="flex-grow-1 my-6 h-5 w-5 flex-shrink-0" /> -->
          <div class="flex flex-grow flex-col gap-0.5">
            {#if organisation && project}
              <div class="flex flex-row items-center gap-3">
                <div class="flex flex-col items-start gap-0">
                  <p
                    class="flex space-x-0.5 font-mono text-xs uppercase tracking-widest">
                    {#if organisationName}
                      <span class="text-primary">{organisationName}</span>
                    {/if}
                    {#if projectName}
                      <span class="px-0">›</span>
                      <span class="text-accent">{projectName}</span>
                    {/if}
                  </p>
                  <p class="font-light">
                    {getI18n(layer, 'name', appCtx.getUserPreferences())}
                    {#if description && description !== '-'}
                      <span class="pl-1.5 text-sm text-neutral-content">
                        {description}
                      </span>
                    {/if}
                  </p>
                </div>
              </div>
            {:else}
              <div class="flex flex-row items-center gap-3">
                <p class="font-light">
                  {getI18n(layer, 'name', appCtx.getUserPreferences())}
                </p>
              </div>
            {/if}
          </div>
          <input
            name={layer.id}
            type="checkbox"
            class="flex-grow-1 toggle toggle-primary toggle-sm flex-shrink-0"
            checked={userLayerIds.has(layer.id)}
            onchange={(e) => appCtx.setUserLayer(layer.id, e.currentTarget.checked)} />
        </div>
      {:catch error}
        <p>Error loading layers</p>
      {/await}
    {/each}
  </div>
</Section>
