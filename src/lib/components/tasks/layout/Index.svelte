<script lang="ts">
import { flip } from 'svelte/animate';
import { cubicOut } from 'svelte/easing';
import { blur, fade } from 'svelte/transition';
// COMPONENTS
import TaskHeader from '$lib/components/tasks/layout/IndexHeader.svelte';
import TaskRow from '$lib/components/tasks/layout/Row.svelte';
import BackgroundLines from '../../layout/BackgroundLines.svelte';
// TYPES
import type { Id, EntityWithData, TaskAPI, Project, Organisation } from '$lib/types';

// STATE
let { tasks }: { tasks: EntityWithData<TaskAPI>[] } = $props();

// Group tasks by projectId
let groupedTasks: Record<Id, TaskAPI[]> = $derived(
  tasks.reduce(
    (acc, task) => {
      const projectId = task.data.projectId;
      if (!acc[projectId]) {
        acc[projectId] = [];
      }
      acc[projectId].push(task.data);
      return acc;
    },
    {} as Record<Id, TaskAPI[]>
  )
);
</script>

<div class="flex flex-col overflow-x-clip">
  {#if groupedTasks}
    {#each Object.entries(groupedTasks) as [projectId, projectTasks]}
    <TaskHeader
          project={projectTasks[0].project as Project}
          organisation={projectTasks[0].organisation as Organisation} />  
    <div
        class="relative"
        transition:fade={{ duration: 250, easing: cubicOut }}>
        <BackgroundLines numberOfTasks={projectTasks.length} key={projectId} />
        
        <div class="relative py-4">
          <div class="flex flex-col gap-4 overflow-x-clip px-6">
            {#each projectTasks as projectTask, idx (projectTask.id)}
              <div
                in:blur={{
                  delay: 0,
                  duration: 250,
                  easing: cubicOut
                }}
                animate:flip={{ duration: 250, easing: cubicOut }}>
                <TaskRow task={projectTask} />
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/each}
  {:else}
    <div>No tasks found</div>
  {/if}
</div>
