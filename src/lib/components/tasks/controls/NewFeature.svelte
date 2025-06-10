<script lang="ts">
// I18N
import { getI18n, getFPI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// COMPONENTS
import Map from '$lib/components/common/Map.svelte';
// TYPES
import type { Task } from '$lib/types';
import type { Point } from 'geojson';

// CONTEXT
let appCtx = getAppCtx();

let { task }: { task: Task } = $props();
</script>

<aside class="flex w-[420px] flex-col gap-3 rounded-br-lg bg-base-200 p-6">
  <h3 class="flex-shrink-0 flex-grow-0 text-xl font-bold text-base-content">
    {m.long_male_ostrich_skip()}
  </h3>
  <div class="flex-grow-1 stats stats-vertical w-full flex-shrink-0 bg-base-200 px-2">
    <div class="stat">
      <div class="stat-title">{m.feature__title()}</div>
      <div class="stat-value text-lg">
        {getI18n(task.feature, 'title', appCtx.getUserPreferences())}
      </div>
    </div>

    <div class="stat">
      <div class="stat-title">{m.feature__description()}</div>
      <div class="stat-value text-wrap text-lg">
        {getI18n(task.feature, 'description', appCtx.getUserPreferences())}
      </div>
    </div>

    <div class="stat">
      <div class="stat-title">{m.feature__address()}</div>
      <div class="stat-value text-wrap text-lg">
        {getI18n(task.feature, 'displayAddress', appCtx.getUserPreferences())}
      </div>
    </div>
  </div>
  <h3 class="flex-shrink-0 flex-grow-0 text-xl font-bold text-base-content">
    {m.clean_light_ray_tap()}
  </h3>

  {#if task.feature?.properties && task.feature.properties.length > 0}
    <div class="flex-grow-1 mb-4 max-h-96 w-full flex-shrink-0 overflow-y-auto">
      <div class="grid grid-cols-2 gap-2">
        {#each task.feature.properties as property (property.propertyId)}
          {#if property.property}
            <div class="stat rounded-lg bg-base-200 p-3">
              <div class="stat-title text-xs">
                {getI18n(property.property, 'label', appCtx.getUserPreferences())}
              </div>
              <div class="stat-value text-wrap text-sm font-medium">
                {getFPI18n(property, appCtx.getUserPreferences())}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {:else}
    <div class="mb-4 text-sm text-base-content/50">{m.bland_sad_goat_gasp()}</div>
  {/if}

  <h3 class="flex-shrink-0 flex-grow-0 text-xl font-bold text-base-content">
    {m.loose_grassy_snake_hug()}
  </h3>

  {#if (task.feature?.geometry as Point)?.coordinates}
    <div class="mt-2 h-full flex-grow">
      <Map
        coordinates={(task.feature?.geometry as Point)?.coordinates}
        draggable={false}
        addressMeta={null} />
    </div>
  {:else}
    <div class="mt-6 text-sm text-base-content/50">{m.active_real_cuckoo_stop()}</div>
  {/if}
</aside>
