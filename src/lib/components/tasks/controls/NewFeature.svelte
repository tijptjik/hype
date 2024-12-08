<script lang="ts">
// COMPONENTS
import Map from '$lib/components/common/Map.svelte';
// TYPES
import type { TaskAPI } from '$lib/types';

let { task }: { task: TaskAPI } = $props();
</script>

<aside class="w-[420px] flex flex-col gap-3 rounded-lg bg-base-200 p-6">
  <h3 class="flex-grow-0 flex-shrink-0 mb-6 text-xl font-bold text-base-content">New Feature Details</h3>

  <div class="flex-grow-1 flex-shrink-0 stats stats-vertical w-full bg-base-200">
    <div class="stat">
      <div class="stat-title">Title</div>
      <div class="stat-value text-lg">{task.feature?.title || '-'}</div>
    </div>

    <div class="stat">
      <div class="stat-title">Description</div>
      <div class="stat-value text-wrap text-lg">
        {task.feature?.description || '-'}
      </div>
    </div>

    <div class="stat">
      <div class="stat-title">Address</div>
      <div class="stat-value text-wrap text-lg">
        {task.feature?.displayAddress || '-'}
      </div>
    </div>
  </div>

  {#if task.image?.longitude && task.image?.latitude}
    <div class="flex-grow mt-6 h-full">
      <Map
        coordinates={[
          parseFloat(task.image?.longitude),
          parseFloat(task.image?.latitude)
        ]}
        draggable={false}
      />
    </div>
  {:else}
    <div class="mt-6 text-sm text-base-content/50">No GPS data captured</div>
  {/if}
</aside>
