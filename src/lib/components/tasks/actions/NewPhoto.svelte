<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import { XCircle, CheckCircle, CheckBadge } from '@steeze-ui/heroicons';
import Info from '$lib/components/forms/extra/Info.svelte';
import NewPhotoContent from '$lib/components/tasks/info/NewPhoto.svelte';
import Actions from '$lib/components/tasks/common/Actions.svelte';
// SERVICES
import { updateTaskReview } from '$lib/client/services/task';
// NAVIGATION
import { goToNextTask } from '$lib/navigation';
// TYPES
import type { Task } from '$lib/types';
import type { IconSource } from '@steeze-ui/svelte-icon';
// I18N
import { m } from '$lib/i18n';

let { task }: { task: Task } = $props();

// CONFIG
let rejectActions = [
  {
    label: m.quiet_late_worm_startle(),
    icon: XCircle as IconSource,
    action: 'reject',
    onHoverClass: 'text-rose-300'
  }
];

let acceptActions = [
  {
    label: m.each_funny_cow_radiate(),
    icon: CheckCircle as IconSource,
    action: 'acceptAll',
    onHoverClass: 'text-success'
  },
  {
    label: m.shy_sunny_hare_revive(),
    icon: CheckBadge as IconSource,
    action: 'acceptSome',
    onHoverClass: 'text-success'
  }
];

// CONTEXT :: ROUTER
const adminCtx = getAdminCtx();

// ACTIONS
const handleAction = async (action: string, e: Event, reviewReason?: string) => {
  e.preventDefault();
  try {
    let reviewOutcome: string;
    let reviewAction: string;

    switch (action) {
      case 'reject':
        reviewOutcome = 'rejected';
        reviewAction = 'ignored';
        break;
      case 'acceptSome':
        reviewOutcome = 'accepted';
        reviewAction = 'added-all-photos-with-intent';
        break;
      case 'acceptAll':
        reviewOutcome = 'accepted';
        reviewAction = 'added-all-photos';
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Then update the task
    const response = await updateTaskReview(task.id, {
      type: 'newPhoto',
      reviewOutcome,
      reviewAction,
      reviewReason
    });

    // Update the task cache
    adminCtx.appCtx.setTaskResourceAndCache(await response.json());

    goToNextTask(adminCtx);
  } catch (error) {
    console.error(`Failed to ${action} task:`, error);
  }
};
</script>

<div class="flex items-center gap-4">
  <Actions {task} {rejectActions} {acceptActions} onAction={handleAction} />
  <Info borderColor="border-info">
    <NewPhotoContent />
  </Info>
</div>
