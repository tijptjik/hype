<script lang="ts">
import { flip } from 'svelte/animate';
import { cubicOut } from 'svelte/easing';
import { blur, fade } from 'svelte/transition';
import { onMount } from 'svelte';
// COMPONENTS
import TaskHeader from '$lib/components/tasks/layout/IndexHeader.svelte';
import TaskRow from '$lib/components/tasks/layout/Row.svelte';
import BackgroundLines from '../../layout/BackgroundLines.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// TYPES
import type { Id, Task, Project, Organisation } from '$lib/types';
import {
  PUBLIC_GIPHY_KEY
} from '$env/static/public';
// STATE
const resourceState = getHierarchicalResourceState();
// Group tasks by projectId
let groupedTasks: Record<Id, Task[]> = $derived(
  resourceState.filteredTasks.reduce(
    (acc, task) => {
      const projectId = task.projectId;
      if (!projectId) return acc;
      if (!acc[projectId]) {
        acc[projectId] = [];
      }
      acc[projectId].push(task);
      return acc;
    },
    {} as Record<Id, Task[]>
  )
);

// Function to get random GIF from Giphy API
async function getRandomGif(topic = 'zero') {
  try {
    const response = await fetch(`https://api.giphy.com/v1/gifs/random?api_key=${PUBLIC_GIPHY_KEY}&tag=${encodeURIComponent(topic)}`);
    const data = await response.json();
    return data.data.images.original.webp;
  } catch (error) {
    console.warn('Failed to fetch random GIF:', error);
    return null;
  }
}
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
    {#await getRandomGif('cyperpunk art')}
    <div class="spinner"></div>
      {:then randomGifUrl} 
    <div class="flex h-full items-center justify-center">
      <img src={randomGifUrl} alt="Zero" class="cover scale-150" />
    </div>
    {/await}
  {/if}
</div>
