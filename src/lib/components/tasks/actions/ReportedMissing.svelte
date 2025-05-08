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
import type { ComponentType } from 'svelte';

// STATE :: PROPS
let { task }: { task: TaskAPI } = $props();

// CONFIG
let actions = [
  {
    label: m.white_cozy_goldfish_heal(),
    icon: Trash,
    action: 'set-archived',
    onHoverClass: 'text-rose-300'
  },
  {
    label: m.loose_knotty_cow_propel(),
    icon: EyeSlash,
    action: 'set-unpublished',
    onHoverClass: 'text-rose-300'
  },
  {
    label: m.awful_this_dingo_glow(),
    icon: CubeTransparent,
    action: 'set-intangible',
    onHoverClass: 'text-rose-300'
  },
  {
    label: m.quiet_late_worm_startle(),
    icon: XCircle,
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

    // Update all associated images
    if (task.images && task.images.length > 0) {
      const imageUpdatePromises = task.images.map((image) =>
        fetch(`/api/images/${image.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isArchived: true,
            refType: 'feature',
            refId: task.featureId
          })
        })
      );

      await Promise.all(imageUpdatePromises);
    }

    resourceState.goToNextTask();
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

    resourceState.goToNextTask();
  } catch (error) {
    console.error('Failed to archive:', error);
  }
};
</script>

{#snippet button(
  icon: ComponentType,
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
        {task.reviewAction?.replace('-', ' ')}
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
