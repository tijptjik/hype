<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// UTILS
import { calculateDistance } from '$lib/map';
import { formatDistanceToNow } from 'date-fns';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { Task } from '$lib/types';
import type { Point } from 'geojson';

// CONTEXT
const appCtx = getAppCtx();

let { task }: { task: Task } = $props();

let distance = $derived(
  calculateDistance(
    (task.feature?.geometry as Point).coordinates[0] || 0,
    (task.feature?.geometry as Point).coordinates[1] || 0,
    parseFloat(task.images?.[0]?.image?.metadata?.latitude || '0'),
    parseFloat(task.images?.[0]?.image?.metadata?.longitude || '0')
  )
);

// Format dates using relative time
let captureDate = $derived(
  task.images?.[0]?.image?.metadata?.capturedAt
    ? formatDistanceToNow(new Date(task.images?.[0]?.image?.metadata?.capturedAt), {
        addSuffix: true
      })
    : '-'
);

let reportDate = $derived(
  task.createdAt
    ? formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })
    : '-'
);
</script>

<aside class="w-[420px] rounded-br-lg bg-base-200 p-6">
  <h3 class="mb-6 text-xl font-bold text-base-content">
    {m.witty_slow_chipmunk_hush()}
  </h3>
  <div class="stat">
    <div class="stat-title">{m.noisy_lime_tuna_charm()}</div>
    <div class="stat-value text-lg">{task.message}</div>
  </div>
  <div class="stat">
    <div class="stat-title">{m.bland_tasty_lizard_rest()}</div>
    <div class="stat-value text-lg">{reportDate}</div>
  </div>
  <div class="stats stats-vertical w-full bg-base-200">
    <div class="stat">
      <div class="stat-title">{m.weary_bad_dog_revive()}</div>
      <div class="stat-value text-lg">{captureDate}</div>
    </div>
    <div class="stat">
      <div class="stat-title">{m.house_watery_jaguar_edit()}</div>
      <div class="stat-value text-lg">
        {distance ? `${distance.toFixed(0)} ${m.plane_zany_fish_value()}` : '-'}
      </div>
    </div>
    <div class="stat">
      <div class="stat-title">{m.male_silly_jannes_feel()}</div>
      <div class="stat-value text-wrap text-lg">
        {getI18n(task.feature, 'displayAddress', appCtx.getUserPreferences())}
      </div>
    </div>
  </div>
</aside>
