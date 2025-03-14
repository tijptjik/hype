<script lang="ts">
// SVELTE
import { goto } from '$app/navigation';
// I18N
import { i18n } from '$lib/i18n';
// LIB
import { ADMIN_PATH } from '$lib/index';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { PencilSquare } from '@steeze-ui/heroicons';
import Title from '$lib/components/tasks/common/Title.svelte';

// TYPES
import type { TaskAPI, ResourceRouter } from '$lib/types';

// PROPS
let { task }: { task: TaskAPI } = $props();

export const typeColors = {
  reportedMissing: 'border-error',
  newPhoto: 'border-info',
  newFeature: 'border-success'
};

function onclick(e: Event) {
  e.preventDefault();
  const url = new URL(window.location.href);
  url.pathname = `${ADMIN_PATH}/tasks/${task.id}`;
  // UPDATE ROUTER STATE
  // routerState.updateWith({
  //   resource: 'task',
  //   entity: task.id,
  //   facet: false
  // });
  // NAVIGATE
  goto(i18n.resolveRoute(url.toString()));
}
</script>

<div
  class="mx-auto flex w-full flex-row items-center justify-between rounded-lg border-b-4 bg-base-100 px-6 py-6 {typeColors[
    task.type
  ]} cursor-pointer transition-colors duration-300 hover:bg-base-200"
  {onclick}>
  <Title {task} />
  <button class="btn btn-ghost btn-sm hover:bg-transparent">
    <Icon src={PencilSquare} class="mr-2 h-4 w-4" />
    REVIEW
  </button>
</div>
