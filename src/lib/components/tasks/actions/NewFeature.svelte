<script lang="ts">
// LIB
import { goToResource, goToEntity } from '$lib';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// COMPONENTS
import Reject from '$lib/components/common/buttons/Reject.svelte';
import Accept from '$lib/components/common/buttons/Accept.svelte';
import Info from '$lib/components/forms/extra/Info.svelte';
import NewFeatureContent from '$lib/components/tasks/info/NewFeature.svelte';
// TYPES
import type { TaskAPI, EntityRouter } from '$lib/types';

let { task }: { task: TaskAPI } = $props();

// CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

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

    if (task.featureId) {
      await fetch(`/api/features/${task.featureId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isPendingReview: false,
          isArchived: true
        })
      });
    }
    // TODO Navigate to the next Task
    goToResource(e, routerState, 'task');
  } catch (error) {
    console.error('Failed to reject:', error);
  }
};

const handleAccept = async (e: Event) => {
  e.preventDefault();
  try {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewOutcome: 'accepted',
        reviewAction: 'add-feature'
      })
    });

    if (task.featureId) {
      await fetch(`/api/features/${task.featureId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isPendingReview: false
        })
      });
    }

    goToEntity(e, routerState, 'feature', task.featureId);
  } catch (error) {
    console.error('Failed to accept:', error);
  }
};
</script>

<div class="flex items-center gap-4">
  <Reject onclick={handleReject} />
  <Accept onclick={handleAccept} />
  <Info borderColor="border-success">
    <NewFeatureContent />
  </Info>
</div>
