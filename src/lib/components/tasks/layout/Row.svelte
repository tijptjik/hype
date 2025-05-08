<script lang="ts">
// LIB
import { navigateOnAdmin } from '$lib/navigation';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { CheckCircle, PencilSquare, XCircle } from '@steeze-ui/heroicons';
import Title from '$lib/components/tasks/common/Title.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';
// TYPES
import type { TaskAPI } from '$lib/types';

// PROPS
let { task }: { task: TaskAPI } = $props();

// CONTEXT
const resourceState = getHierarchicalResourceState();

export const typeColors = {
  reportedMissing: 'border-error',
  newPhoto: 'border-info',
  newFeature: 'border-success'
};
</script>

<div
  class="mx-auto flex w-full flex-row items-center justify-between rounded-lg border-b-4 bg-base-100 px-6 py-6 {typeColors[
    task.type
  ]} cursor-pointer transition-colors duration-300 hover:bg-base-200"
  onclick={(e) => {
    e.preventDefault();
    navigateOnAdmin(resourceState, HierarchicalResource.task, task.id);
  }}>
  <Title {task} />
  <button
    class="btn btn-ghost btn-sm {task.reviewOutcome
      ? 'text-neutral-500'
      : 'text-white'} hover:bg-transparent">
    {#if task.reviewOutcome === 'accepted'}
      <Icon src={CheckCircle} class="mr-2 h-4 w-4 text-success" />
      {task.reviewOutcome.toUpperCase()}
    {:else if task.reviewOutcome === 'rejected'}
      <Icon src={XCircle} class="mr-2 h-4 w-4 text-error" />
      {task.reviewOutcome.toUpperCase()}
    {:else}
      <Icon src={PencilSquare} class="mr-2 h-4 w-4" />
      {task.reviewOutcome?.toUpperCase() || 'REVIEW'}
    {/if}
  </button>
</div>
