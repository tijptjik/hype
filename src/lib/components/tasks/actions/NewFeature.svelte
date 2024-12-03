<script lang="ts">
// CONTEXT
import { goto } from '$app/navigation';
import { getRouterState } from '$lib/context/router.svelte';
// COMPONENTS
import Reject from '$lib/components/common/buttons/Reject.svelte';
import Accept from '$lib/components/common/buttons/Accept.svelte';
// TYPES
import type { TaskAPI } from '$lib/types';

let { task }: { task: TaskAPI } = $props();

const handleReject = async () => {
  try {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewResult: 'rejected',
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
  } catch (error) {
    console.error('Failed to reject:', error);
  }
};

const handleAccept = async () => {
  try {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewResult: 'accepted',
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

    const routerState = getRouterState();

    routerState.updateWith({
      resource: 'feature',
      entity: task.featureId,
      facet: 'core'
    })

    goto(`/admin/feature/${task.featureId}`);
    
  } catch (error) {
    console.error('Failed to accept:', error);
  }
};
</script>

<div class="flex items-center gap-4">
  <Reject onclick={handleReject} />
  <Accept onclick={handleAccept} />
</div>
