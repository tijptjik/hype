<script lang="ts">
// COMPONENTS
import Reject from '$lib/components/common/buttons/Reject.svelte';
import Accept from '$lib/components/common/buttons/Accept.svelte';
// TYPES
import type { TaskAPI, FeatureProperty } from '$lib/types';

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

    if (task.imageId) {
      await fetch(`/api/images/${task.imageId!}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        reviewAction: 'add-photo'
      })
    });

    if (task.image?.id) {
      await fetch(`/api/images/${task.image.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featureImage: {
            isPublished: true
          }
        })
      });
    }
  } catch (error) {
    console.error('Failed to accept:', error);
  }
};
</script>

<div class="flex items-center gap-4">
  <!-- <GradeRating
    grade={(
      task.feature?.properties.find(
        (p) => p.property.key === 'grade'
      ) as FeatureProperty
    )?.propertyValue?.value} /> -->

  <Reject onclick={handleReject} />
  <Accept onclick={handleAccept} />
</div>
