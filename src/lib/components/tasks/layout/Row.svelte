<script lang="ts">
// LIB
import { navigateOnAdmin } from '$lib/navigation'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import { CheckCircle, PencilSquare, XCircle } from '@steeze-ui/heroicons'
import Title from '$lib/components/tasks/common/Title.svelte'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// ENUMS
import { FirstClassResource, TaskTypeColor, TaskType } from '$lib/enums'
// TYPES
import type { Task } from '$lib/types'

// PROPS
let { task }: { task: Task } = $props()

// CONTEXT
const adminCtx = getAdminCtx()
</script>

<div
  class="mx-auto flex w-full flex-row items-center justify-between rounded-lg border-b-4 bg-base-100 px-6 py-6 {task?.type
    ? TaskTypeColor[task.type as TaskType]
    : ''} cursor-pointer transition-colors duration-300 hover:bg-base-200"
  onclick={(e) => {
    e.preventDefault();
    navigateOnAdmin(adminCtx, FirstClassResource.task, task.id);
  }}
>
  <Title {task} />
  <button
    class="btn btn-ghost btn-sm {task.reviewOutcome
      ? 'text-neutral-500'
      : 'text-white'} hover:bg-transparent"
  >
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
