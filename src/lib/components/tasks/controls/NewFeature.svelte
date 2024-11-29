<script lang="ts">
// COMPONENTS
import Map from '$lib/components/common/Map.svelte';
// TYPES
import type { TaskAPI } from '$lib/types';

let { task }: { task: TaskAPI } = $props();
</script>

<aside class="flex w-[420px] flex-col rounded-lg bg-base-200 p-4">
  <h3 class="mb-4 text-lg font-semibold">New Feature Details</h3>
  <div class="flex-grow space-y-2">
    <p><span class="font-medium">Title</span> {task.feature?.title || '-'}</p>
    <p>
      <span class="font-medium">Description</span>
      {task.feature?.description || '-'}
    </p>
    <p>
      <span class="font-medium">Address</span>
      {task.feature?.displayAddress || '-'}
    </p>
  </div>
  {#if task.image?.longitude && task.image?.latitude}
    <div class="mt-4 h-[200px]">
      <Map coordinates={[task.image?.longitude, task.image?.latitude]} />
    </div>
  {:else}
    <p class="text-sm text-base-content/50">No GPS data captured</p>
  {/if}
</aside>
