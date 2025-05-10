<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// i18n
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Trash, EyeSlash, XCircle, CubeTransparent } from '@steeze-ui/heroicons';
import Info from '$lib/components/forms/extra/Info.svelte';
import ReportedMissingContent from '$lib/components/tasks/info/ReportedMissing.svelte';
// TYPES
import type { TaskAPI, ReportedMissingAction } from '$lib/types';
import type { IconSource } from '@steeze-ui/svelte-icon';

// STATE :: PROPS
let { task }: { task: TaskAPI } = $props();

// CONFIG
let actions = [
  {
    label: m.white_cozy_goldfish_heal(),
    icon: Trash as IconSource,
    action: 'set-archived',
    onHoverClass: 'text-rose-300'
  },
  {
    label: m.loose_knotty_cow_propel(),
    icon: EyeSlash as IconSource,
    action: 'set-unpublished',
    onHoverClass: 'text-rose-300'
  },
  {
    label: m.awful_this_dingo_glow(),
    icon: CubeTransparent as IconSource,
    action: 'set-intangible',
    onHoverClass: 'text-rose-300'
  },
  {
    label: m.quiet_late_worm_startle(),
    icon: XCircle as IconSource,
    action: 'rejected',
    onHoverClass: 'text-rose-300'
  }
];

// CONTEXT :: ROUTER
const resourceState = getHierarchicalResourceState();

// ACTIONS
const handleReject = async (e: Event) => {
  e.preventDefault();
  try {
    console.log('Rejecting task:', task.id);
    if (task.id) {
      // Update task - image handling is done in the PATCH endpoint
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reportedMissing',
          reviewOutcome: 'rejected',
          reviewAction: 'ignored'
        })
      });
    }

    resourceState.goToNextTask();
  } catch (error) {
    console.error('Failed to reject:', error);
  }
};

const handleSet = async (e: Event, action: ReportedMissingAction) => {
  e.preventDefault();
  try {
    console.log('Setting task action:', task.id, action);
    let changeSet: Record<string, unknown> = {};
    switch (action) {
      case 'set-archived':
        changeSet.isArchived = true;
        changeSet.isPublished = false;
        changeSet.isVisitable = false;
        break;
      case 'set-unpublished':
        changeSet.isPublished = false;
        changeSet.isVisitable = false;
        break;
      case 'set-intangible':
        changeSet.isIntangible = true;
        break;
    }

    // Update feature
    if (task.feature?.id) {
      await fetch(`/api/features/${task.feature.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changeSet)
      });
    }

    // Update task - image handling is done in the PATCH endpoint
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'reportedMissing',
        reviewOutcome: 'accepted',
        reviewAction: action
      })
    });

    resourceState.goToNextTask();
  } catch (error) {
    console.error('Failed to set task state:', error);
  }
};
</script>

{#snippet button(
  icon: IconSource,
  label: string,
  onHoverClass: string,
  onclick: (e: Event, ...args: any[]) => void
)}
  <button
    class="btn btn-ghost btn-sm hover:bg-transparent hover:{onHoverClass}"
    onclick={(e: Event, ...args: any[]) => onclick(e, ...args)}>
    <Icon src={icon} class="h-4 w-4" />
    {label}
  </button>
{/snippet}

<div class="flex items-center gap-4">
  {#if task.reviewOutcome}
    <div class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2">
      <p class="uppercase text-base-content">{m.mad_fresh_swan_trip()}</p>
      <p class="font-mono text-sm uppercase text-neutral-content">
        {task.reviewAction?.replaceAll('-', ' ')}
      </p>
    </div>
  {:else}
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
  {/if}
  <Info>
    <ReportedMissingContent />
  </Info>
</div>
