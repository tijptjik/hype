<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import Reject from '$lib/components/common/buttons/Reject.svelte';
import AcceptSome from '$lib/components/common/buttons/AcceptSome.svelte';
import AcceptAll from '$lib/components/common/buttons/AcceptAll.svelte';
import Info from '$lib/components/forms/extra/Info.svelte';
import NewPhotoContent from '$lib/components/tasks/info/NewPhoto.svelte';
// TYPES
import type { TaskAPI, Image } from '$lib/types';
// I18N
import * as m from '$lib/paraglide/messages';

let { task }: { task: TaskAPI } = $props();

// CONTEXT :: ROUTER
const resourceState = getHierarchicalResourceState();

// ======== HELPER API FUNCTIONS ========

/**
 * Updates the status of a task.
 * @param {string} taskId - The ID of the task to update.
 * @param {string} reviewOutcome - The outcome of the review (e.g., 'accepted', 'rejected').
 * @param {string} reviewAction - The specific action taken (e.g., 'ignored', 'add-all-photos', 'add-all-photos-with-intent').
 */
async function updateTaskStatus(
  taskId: string,
  reviewOutcome: string,
  reviewAction: string
) {
  await fetch(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'newPhoto',
      reviewOutcome,
      reviewAction
    })
  });
}

// ======== EVENT HANDLERS ========

type ActionType = 'reject' | 'acceptSome' | 'acceptAll';

const handleAction = async (action: ActionType, e: Event) => {
  e.preventDefault();
  try {
    let reviewOutcome: string;
    let reviewAction: string;

    console.log(action, 'for task:', task.id, 'with images:', task.images);

    switch (action) {
      case 'reject':
        reviewOutcome = 'rejected';
        reviewAction = 'ignored';
        break;
      case 'acceptSome':
        reviewOutcome = 'accepted';
        reviewAction = 'add-all-photos-with-intent';
        break;
      case 'acceptAll':
        reviewOutcome = 'accepted';
        reviewAction = 'add-all-photos';
        break;
    }
    await updateTaskStatus(task.id, reviewOutcome, reviewAction);
    resourceState.goToNextTask();
  } catch (error) {
    console.error(`Failed to ${action} task:`, error);
  }
};
</script>

<div class="flex items-center gap-4">
  {#if task.reviewOutcome}
    <div class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2">
      <p class="uppercase text-base-content">{m.mad_fresh_swan_trip()}</p>
      <p class="font-mono text-sm uppercase text-neutral-content">
        {task.reviewAction?.replaceAll('-', ' ')}
      </p>
    </div>
  {:else}
    <Reject onclick={(e: Event) => handleAction('reject', e)} />
    <AcceptAll onclick={(e: Event) => handleAction('acceptAll', e)} />
    <AcceptSome onclick={(e: Event) => handleAction('acceptSome', e)} />
  {/if}
  <Info borderColor="border-info">
    <NewPhotoContent />
  </Info>
</div>
