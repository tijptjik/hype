<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Trash, EyeSlash, XCircle, CubeTransparent } from '@steeze-ui/heroicons';
import GradeRating from '$lib/components/common/GradeRating.svelte';
// TYPES
import type { TaskAPI, ReportedMissingAction, FeatureProperty } from '$lib/types';

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

// ACTIONS
const handleReject = async () => {
  try {
    if (task.id) {
      // Update task
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewResult: 'rejected',
          reviewAction: 'ignored'
        })
      });
    }

    // Update image
    if (task.imageId) {
      await fetch(`/api/images/${task.imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isArchived: true
        })
      });
    }
  } catch (error) {
    console.error('Failed to reject:', error);
  }
};
const handleSet = async (action: ReportedMissingAction) => {
  try {
    let changeSet: Record<string, unknown> = {};
    if (action === 'set-archived') {
      changeSet.isArchived = true;
      changeSet.isPublished = false;
    } else if (action === 'set-unpublished') {
      changeSet.isPublished = false;
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
        reviewResult: 'accepted',
        reviewAction: action
      })
    });
  } catch (error) {
    console.error('Failed to archive:', error);
  }
};
</script>

{#snippet button(icon, label, onHoverClass, onclick)}
  <button
    class="btn btn-ghost btn-sm hover:bg-transparent hover:{onHoverClass}"
    {onclick}>
    <Icon src={icon} class="h-4 w-4" />
    {label}
  </button>
{/snippet}

<div class="flex items-center gap-4">
  <!-- <GradeRating
    grade={(
      task.feature?.properties.find(
        (p) => p.property.key === 'grade'
      ) as FeatureProperty
    )?.propertyValue?.value} /> -->

  {#each actions.slice(0, 3) as action}
    <div>
      {@render button(action.icon, action.label, action.onHoverClass, () =>
        handleSet(action.action as ReportedMissingAction)
      )}
    </div>
  {/each}

  <div class="divider divider-horizontal"></div>
  {#each actions.slice(3) as action}
    {@render button(action.icon, action.label, action.onHoverClass, () =>
      handleSet(action.action as ReportedMissingAction)
    )}
  {/each}
</div>
