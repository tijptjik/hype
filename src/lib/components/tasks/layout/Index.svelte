<script lang="ts">
import { flip } from 'svelte/animate';
import { cubicOut } from 'svelte/easing';
import { blur, fade } from 'svelte/transition';
// COMPONENTS
import TaskHeader from '$lib/components/tasks/layout/IndexHeader.svelte';
import TaskRow from '$lib/components/tasks/layout/Row.svelte';
import BackgroundLines from '../../layout/BackgroundLines.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// TYPES
import type { Id, EntityWithData, TaskAPI, Project, Organisation } from '$lib/types';

// STATE
const resourceState = getHierarchicalResourceState();

// Group tasks by projectId
let groupedTasks: Record<Id, TaskAPI[]> = $derived(
  resourceState.filteredTasks.reduce(
    (acc, task) => {
      const projectId = task.projectId;
      if (!acc[projectId]) {
        acc[projectId] = [];
      }
      acc[projectId].push(task);
      return acc;
    },
    {} as Record<Id, TaskAPI[]>
  )
);
</script>

<div class="flex h-full flex-col overflow-x-clip">
  {#if Object.keys(groupedTasks).length > 0}
    {#each Object.entries(groupedTasks) as [projectId, projectTasks]}
      <TaskHeader
        project={projectTasks[0].project as Project}
        organisation={projectTasks[0].organisation as Organisation} />
      <div class="relative" transition:fade={{ duration: 250, easing: cubicOut }}>
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
    <div class="flex h-full items-center justify-center">
      <div class="monospace text-3xl text-base-content/75">
        <pre>
_________/\\\________________________________________________        
 ________\/\\\________________________________________________       
  ________\/\\\________________________________________________      
   ________\/\\\_______/\\\\\______/\\/\\\\\\________/\\\\\\\\__     
    ___/\\\\\\\\\_____/\\\///\\\___\/\\\////\\\_____/\\\/////\\\_    
     __/\\\////\\\____/\\\__\//\\\__\/\\\__\//\\\___/\\\\\\\\\\\__   
      _\/\\\__\/\\\___\//\\\__/\\\___\/\\\___\/\\\__\//\\///////___  
       _\//\\\\\\\/\\___\///\\\\\/____\/\\\___\/\\\___\//\\\\\\\\\\_ 
        __\///////\//______\/////______\///____\///_____\//////////__
      </pre>
      </div>
    </div>
  {/if}
</div>
