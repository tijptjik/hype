<script lang="ts">
// I18N
import { getI18n, getFPI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// COMPONENTS
import Map from '$lib/components/common/Map.svelte'
import TaskSection from '../common/TaskSection.svelte'
import TaskStat from '../common/TaskStat.svelte'
// TYPES
import type { Task } from '$lib/types'
import type { Point } from 'geojson'

// CONTEXT
let appCtx = getAppCtx()

let { task }: { task: Task } = $props()

// STATE: Map expansion
let isMapCollapsed = $state(true)

// FUNCTIONS: Map controls
function handleMapCollapse(collapsed: boolean): void {
  isMapCollapsed = collapsed
}
</script>

<aside class="w-[380px]">
  <!-- 3-Row Grid -->
  <div class="flex h-full flex-col items-stretch gap-4 rounded-xl font-bold">
    <!-- Core Details -->
    <div class="flex-none" class:hidden={!isMapCollapsed}>
      <TaskSection>
        <TaskStat
          title={m.feature__title()}
          value={getI18n(task.feature as any, 'title', appCtx.getUserPreferences())}
        />
        <TaskStat
          title={m.feature__description()}
          value={getI18n(
            task.feature as any,
            'description',
            appCtx.getUserPreferences()
          )}
          textWrap={true}
        />
        <TaskStat
          title={m.feature__address()}
          value={getI18n(
            task.feature as any,
            'displayAddress',
            appCtx.getUserPreferences()
          )}
          textWrap={true}
        />
      </TaskSection>
    </div>

    <!-- Properties -->
    <div class="flex-none" class:hidden={!isMapCollapsed}>
      <TaskSection>
        {#if task.feature?.properties && task.feature.properties.length > 0}
          <div class="grid grid-cols-2 gap-2 pt-2">
            {#each task.feature.properties as property (property.propertyId)}
              {#if property.property}
                <div class="stat flex flex-col gap-1 rounded-lg bg-glass-100 p-3">
                  <div class="stat-title text-xs">
                    {getI18n(
                      property.property as any,
                      'label',
                      appCtx.getUserPreferences()
                    )}
                  </div>
                  <div class="stat-value text-wrap text-sm font-medium">
                    {getFPI18n(property, appCtx.getUserPreferences())}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {:else}
          <div class="text-sm text-base-content/50">{m.bland_sad_goat_gasp()}</div>
        {/if}
      </TaskSection>
    </div>

    <!-- Location -->
    <div class="min-h-0 flex-1" class:h-full={!isMapCollapsed}>
      {#if (task.feature?.geometry as Point)?.coordinates}
        <div
          class="h-full w-full overflow-hidden rounded-lg"
          class:min-h-48={!isMapCollapsed}
        >
          <Map
            coordinates={(task.feature?.geometry as Point)?.coordinates}
            draggable={false}
            addressMeta={null}
            toggleCollapsed={handleMapCollapse}
          />
        </div>
      {:else}
        <TaskSection title={!isMapCollapsed ? undefined : m.loose_grassy_snake_hug()}>
          <div class="text-sm text-base-content/50">{m.active_real_cuckoo_stop()}</div>
        </TaskSection>
      {/if}
    </div>
  </div>
</aside>
