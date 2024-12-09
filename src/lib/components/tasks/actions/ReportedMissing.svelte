<script lang="ts">
// LIB
import { goToResource } from '$lib';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Trash, EyeSlash, XCircle, CubeTransparent } from '@steeze-ui/heroicons';
import Info from '$lib/components/forms/extra/Info.svelte';
import ReportedMissingContent from '$lib/components/tasks/info/ReportedMissing.svelte';
// TYPES
import type {
  TaskAPI,
  ReportedMissingAction,
  EntityRouter,
} from '$lib/types';

// STATE :: PROPS
let { task }: { task: TaskAPI } = $props();

// CONFIG
let actions = [
  {
    label: 'Delete ',
    icon: Trash,
    action: 'set-archived',
    onHoverClass: 'text-rose-300'
  },
  {
    label: 'Unlist',
    icon: EyeSlash,
    action: 'set-unpublished',
    onHoverClass: 'text-rose-300'
  },
  {
    label: 'Intangibilize',
    icon: CubeTransparent,
    action: 'set-intangible',
    onHoverClass: 'text-rose-300'
  },
  {
    label: 'Reject Report',
    icon: XCircle,
    action: 'rejected',
    onHoverClass: 'text-rose-300'
  }
];

// CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

// ACTIONS
const handleReject = async (e: Event) => {
  e.preventDefault();
  try {
    if (task.id) {
      // Update task
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewOutcome: 'rejected',
          reviewAction: 'ignored'
        })
      });
    }

    // Update image
    if (task.imageId) {
      await fetch(`/api/images/${task.imageId!}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isArchived: true,
          refType: 'feature',
          refId: task.featureId
        })
      });
    }

    // TODO Navigate to the next Task
    goToResource(e, routerState, 'task');
  } catch (error) {
    console.error('Failed to reject:', error);
  }
};

const handleSet = async (e: Event, action: ReportedMissingAction) => {
  e.preventDefault();
  try {
    let changeSet: Record<string, unknown> = {};
    if (action === 'set-archived') {
      changeSet.isArchived = true;
      changeSet.isPublished = false;
      changeSet.isVisitable = false;
    } else if (action === 'set-unpublished') {
      changeSet.isPublished = false;
      changeSet.isVisitable = false;
    } else if (action === 'set-intangible') {
      changeSet.isIntangible = true;
    }
    // Update feature
    if (task.feature?.id) {
      await fetch(`/api/features/${task.feature.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changeSet)
      });
    }

    // Update task
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewOutcome: 'accepted',
        reviewAction: action
      })
    });

    // TODO Navigate to the next Task
    goToResource(e, routerState, 'task');
  } catch (error) {
    console.error('Failed to archive:', error);
  }
};
</script>

{#snippet button(icon, label, onHoverClass, onclick)}
  <button
    class="btn btn-ghost btn-sm hover:bg-transparent hover:{onHoverClass}"
    onclick={(e: Event, ...args: any[]) => onclick(e, ...args)}>
    <Icon src={icon} class="h-4 w-4" />
    {label}
  </button>
{/snippet}

<div class="flex items-center gap-4">
  {#each actions.slice(3) as action}
    {@render button(action.icon, action.label, action.onHoverClass, handleReject)}
  {/each}
  <div class="divider divider-horizontal"></div>
  {#each actions.slice(0, 3) as action}
    <div>
      {@render button(action.icon, action.label, action.onHoverClass, (e: Event) =>
        handleSet(e, action.action as ReportedMissingAction)
      )}
    </div>
  {/each}
  <Info>
    <ReportedMissingContent />
  </Info>
</div>