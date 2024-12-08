<script lang="ts">
// UTILS
import { calculateDistance } from '$lib/map';
import { formatDistanceToNow } from 'date-fns';
// TYPES
import type { TaskAPI } from '$lib/types';

let { task }: { task: TaskAPI } = $props();

let distance = $derived(
  calculateDistance(
    task.feature?.geometry.coordinates[0] || 0,
    task.feature?.geometry.coordinates[1] || 0,
    parseFloat(task.image?.latitude || '0'),
    parseFloat(task.image?.longitude || '0')
  )
);

// Format dates using relative time
let captureDate = $derived(
  task.image?.capturedAt
    ? formatDistanceToNow(new Date(task.image.capturedAt), { addSuffix: true })
    : '-'
);

let reportDate = $derived(
  task.createdAt
    ? formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })
    : '-'
);
</script>

<aside class="w-[420px] rounded-lg bg-base-200 p-6">
  <h3 class="mb-6 text-xl font-bold text-base-content">Report Details</h3>

  <div class="stat">
    <div class="stat-title">Reported</div>
    <div class="stat-value text-lg">{reportDate}</div>
  </div>
  <div class="stats stats-vertical w-full bg-base-200">
    <div class="stat">
      <div class="stat-title">Captured</div>
      <div class="stat-value text-lg">{captureDate}</div>
    </div>
    <div class="stat">
      <div class="stat-title">Distance from Feature</div>
      <div class="stat-value text-lg">
        {distance ? `${distance.toFixed(0)} meters` : '-'}
      </div>
    </div>
    <div class="stat">
      <div class="stat-title">Feature Address</div>
      <div class="stat-value text-wrap text-lg">
        {task.feature?.displayAddress || '-'}
      </div>
    </div>
  </div>
</aside>
