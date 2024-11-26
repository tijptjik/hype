<script lang="ts">
import { goto } from '$app/navigation';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronRight, PencilSquare } from '@steeze-ui/heroicons';
// TYPES
import type { TaskAPI, ResourceRouter } from '$lib/types';

// PROPS
let { task }: TaskAPI = $props();

// CONTEXT
let routerState = getRouterState() as ResourceRouter;

const typeColors = {
  reportedMissing: 'border-error',
  newPhoto: 'border-info',
  newFeature: 'border-success'
};

const typeDisplay = {
  reportedMissing: 'Reported Missing',
  newPhoto: 'New Photo',
  newFeature: 'New Feature'
};

function onclick(e: Event) {
  e.preventDefault();
  const url = new URL(window.location.href);
  url.pathname = `/admin/tasks/${task.id}`;
  // UPDATE ROUTER STATE
  routerState.updateWith({
    resource: 'task',
    entity: task.id,
    facet: false
  });
  // NAVIGATE
  goto(url.toString());
}
</script>

  <div
    class="mx-auto flex flex-row w-full rounded-lg border-b-4 px-6 py-6 {typeColors[task.type]} transition-colors duration-300 bg-base-100 hover:bg-base-200 flex cursor-pointer items-center justify-between"
    {onclick}>
    <div class="text-lg flex flex-row gap-4 items-center">
      <Icon src={ChevronRight} class="h-6 w-6" />
      <h3 class="text-lg">
        {typeDisplay[task.type]}
        <small class="pl-3 text-sm text-base-content/50"
          ><span class="font-normal"></span> {task.feature?.title || ''}</small>
      </h3>
    </div>
    <button class="variant-filled btn btn-sm">
      <Icon src={PencilSquare} class="mr-2 h-4 w-4" />
      REVIEW
    </button>
  </div>
