<script lang="ts">
// UTILS
import { calculateDistance } from '$lib/map';
// TYPES
import type { TaskAPI } from '$lib/types';

let { task }: { task: TaskAPI } = $props();
let distance: number = $derived(
  calculateDistance(
    task.feature?.geometry.coordinates[0] || 0,
    task.feature?.geometry.coordinates[1] || 0,
    parseFloat(task.image?.latitude || '0'),
    parseFloat(task.image?.longitude || '0')
  )
);
</script>

<aside class="w-[420px] rounded-lg bg-base-200 p-4">
  <h3 class="mb-4 text-lg font-semibold">Details</h3>
  <div class="space-y-2">
    <p>
      <span class="font-medium">Capture Date</span>
      {task.image?.capturedAt || '-'}
    </p>
    <p>
      <span class="font-medium">Report Date</span>
      {task.createdAt ? new Date(task.createdAt).toLocaleString() : '-'}
    </p>
    <p>
      <span class="font-medium">Feature Address</span>
      {task.feature?.displayAddress || '-'}
    </p>
    <p>
      <span class="font-medium">Distance from point</span>
      {distance ? `${distance.toFixed(2)} meters` : '-'}
    </p>
  </div>
</aside>
