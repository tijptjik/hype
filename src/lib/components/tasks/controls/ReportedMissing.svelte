<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// UTILS
import { calculateDistance } from '$lib/map'
import { formatDistanceToNow } from 'date-fns'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// COMPONENTS
import TaskSection from '../common/TaskSection.svelte'
import TaskStat from '../common/TaskStat.svelte'
// TYPES
import type { Task } from '$lib/types'
import type { Point } from 'geojson'

// CONTEXT
const appCtx = getAppCtx()

let { task }: { task: Task } = $props()

let distance = $derived(
  calculateDistance(
    (task.feature?.geometry as Point).coordinates[0] || 0,
    (task.feature?.geometry as Point).coordinates[1] || 0,
    parseFloat(
      (task.images?.[0]?.image?.metadata as Record<string, string>)?.latitude || '0',
    ),
    parseFloat(
      (task.images?.[0]?.image?.metadata as Record<string, string>)?.longitude || '0',
    ),
  ),
)

// Format dates using relative time
let captureDate = $derived(
  (task.images?.[0]?.image?.metadata as any)?.capturedAt
    ? formatDistanceToNow(
        new Date((task.images?.[0]?.image?.metadata as any)?.capturedAt),
        {
          addSuffix: true,
        },
      )
    : '-',
)

let reportDate = $derived(
  task.createdAt
    ? formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })
    : '-',
)
</script>

<aside class="w-95">
  <!-- 3-Row Grid -->
  <div class="flex h-full flex-col items-stretch gap-4 rounded-xl font-bold">
    <!-- Report Details -->
    <TaskSection title={m.away_honest_anaconda_honor()}>
      <TaskStat title={m.noisy_lime_tuna_charm()} value={task.message} />
      <TaskStat title={m.bland_tasty_lizard_rest()} value={reportDate} />
    </TaskSection>

    <!-- Photo Details -->
    <TaskSection title={m.true_equal_polecat_surge()}>
      <TaskStat title={m.weary_bad_dog_revive()} value={captureDate} />
      <TaskStat
        title={m.house_watery_jaguar_edit()}
        value={distance
          ? `${distance.toFixed(0)} ${m.plane_zany_fish_value()}`
          : '-'}
      />
    </TaskSection>

    <!-- Location Details -->
    <TaskSection title={m.loose_grassy_snake_hug()}>
      <TaskStat
        title={m.male_silly_jannes_feel()}
        value={getI18n(
          task.feature as any,
          'displayAddress',
          appCtx.getUserPreferences()
        )}
        textWrap={true}
      />
    </TaskSection>
  </div>
</aside>
