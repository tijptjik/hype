<script lang="ts">
// COMPONENTS
import TaskHeader from '$lib/components/layout/TaskIndexHeader.svelte';
import TaskRow from '$lib/components/layout/TaskIndexRow.svelte';
import BackgroundLines from './BackgroundLines.svelte';
// TYPES
import type { Task } from '$lib/types';

// STATE
let { tasks }: { tasks: Task[] } = $props();

// Group tasks by projectId
let groupedTasks = $derived(
  tasks.reduce(
    (acc, task) => {
      const projectId = task.data.projectId;
      if (!acc[projectId]) {
        acc[projectId] = [];
      }
      acc[projectId].push(task.data);
      return acc;
    },
    {} as Record<string, Task[]>
  )
);
</script>

<div class="flex flex-col gap-4 overflow-x-clip">
  {#if groupedTasks}
    {#each Object.entries(groupedTasks) as [projectId, projectTasks]}
      <div class="relative">
        <BackgroundLines 
          numberOfTasks={projectTasks.length} 
          key={projectId} />
        <TaskHeader
          project={projectTasks[0].project}
          organisation={projectTasks[0].organisation} />
        <div class="relative pt-4">
          <div class="flex flex-col gap-4 px-6 overflow-x-clip">
            {#each projectTasks as projectTask}
              <TaskRow task={projectTask} />
            {/each}
          </div>
        </div>
      </div>
    {/each}
  {:else}
    <div>No tasks found</div>
  {/if}
</div>
