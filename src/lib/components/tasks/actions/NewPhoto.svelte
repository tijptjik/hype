<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import Reject from '$lib/components/common/buttons/Reject.svelte';
import Accept from '$lib/components/common/buttons/Accept.svelte';
import Info from '$lib/components/forms/extra/Info.svelte';
import NewPhotoContent from '$lib/components/tasks/info/NewPhoto.svelte';
// TYPES
import type { TaskAPI } from '$lib/types';

let { task }: { task: TaskAPI } = $props();

// CONTEXT :: ROUTER
const resourceState = getHierarchicalResourceState();

// ENHANCEMENT : Support multiple images
const handleReject = async (e: Event) => {
  e.preventDefault();
  try {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewOutcome: 'rejected',
        reviewAction: 'ignored'
      })
    });

    if (task.images?.[0]?.id) {
      await fetch(`/api/images/${task.images[0].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isArchived: true,
          refType: 'feature',
          refId: task.featureId
        })
      });
    }

    // TODO Navigate to the next Task
    // goToResource(e, routerState, 'task');
  } catch (error) {
    console.error('Failed to reject:', error);
  }
};

// TODO Support multiple images
const handleAccept = async (e: Event) => {
  e.preventDefault();
  try {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewOutcome: 'accepted',
        reviewAction: 'add-photo'
      })
    });

    if (task.images?.[0]?.id) {
      await fetch(`/api/images/${task.image.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refType: 'feature',
          refId: task.featureId,
          featureImage: {
            isPublished: true
          }
        })
      });
    }

    // TODO Navigate to the next Task
    // goToResource(e, routerState, 'task');
  } catch (error) {
    console.error('Failed to accept:', error);
  }
};
</script>

<div class="flex items-center gap-4">
  {#if task.reviewOutcome}
    <div class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2">
      <p class="uppercase text-base-content">REVIEW ACTION</p>
      <p class="font-mono text-sm uppercase text-neutral-content">
        {task.reviewAction?.replace('-', ' ')}
      </p>
    </div>
  {:else}
    <Reject onclick={handleReject} />
    <Accept onclick={handleAccept} />
  {/if}
  <Info borderColor="border-info">
    <NewPhotoContent />
  </Info>
</div>
