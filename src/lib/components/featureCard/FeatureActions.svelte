<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { MapPin } from '@steeze-ui/heroicons';
// I18N
import * as m from '$lib/paraglide/messages';
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';
import { getMapContext } from '$lib/context/map.svelte';
// TYPES
import type { Feature } from '$lib/types';
// ENUMS
import { FeatureCardMode } from '$lib/types';
// COMPONENTS
import ValidationError from './ValidationError.svelte';
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/stores';

// STATE : PROPS
let { feature }: { feature: Feature } = $props();

// STATE : LOCAL
let isStarred = false; // This should be fetched from API
let featureCardContext = getFeatureCardContext();
let mapContext = getMapContext();
const flash = getFlash(page);

function toggleSave() {
  // TODO: Implement
}

async function submitMissingReport() {
  // Validate inputs
  if (featureCardContext.userData.photos.length === 0) {
    featureCardContext.validationError = m.validation__at_least_one_image_as_evidence();
    return;
  }

  if (featureCardContext.userData.missingReason.trim().length < 5) {
    featureCardContext.validationError = m.validation__at_least_five_characters();
    return;
  }

  try {
    featureCardContext.isSubmitting = true;

    // Create FormData for file uploads
    const formData = new FormData();

    const layer = mapContext.getLayer(feature)!;
    const project = mapContext.getProject(layer)!;
    const organisation = mapContext.getOrganisation(project)!;

    // Add task data
    const taskData = {
      type: 'reportedMissing',
      featureId: feature.id,
      layerId: layer?.id,
      projectId: project?.id,
      organisationId: organisation?.id,
      message: featureCardContext.userData.missingReason
    };

    formData.append('taskData', JSON.stringify(taskData));

    // Add photos
    featureCardContext.userData.photos.forEach((photo, index) => {
      formData.append(`photo_${index}`, photo.file);
    });

    // Submit the form
    const response = await fetch('/api/tasks', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Failed to submit report');
    }

    // Reset form and show success message
    featureCardContext.userData.missingReason = '';
    featureCardContext.userData.photos = [];

    // Set flash message instead of alert
    $flash = { type: 'success', message: m.report_missing__success() };

    // Optionally reset the feature card mode
    featureCardContext.state.mode = FeatureCardMode.Display;
  } catch (error) {
    console.error('Error submitting missing report:', error);
    featureCardContext.validationError = m.report_missing__error();
  } finally {
    featureCardContext.isSubmitting = false;
  }
}

async function submitNewFeature() {
  // TODO: Implement
}

// Utils
function getDirections() {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${feature.geometry.coordinates[1]},${feature.geometry.coordinates[0]}`;
  window.open(url, '_blank');
}
</script>

<div
  class="pointer-events-auto flex flex-shrink-0 flex-grow-0 items-center justify-between rounded-b-lg bg-black px-4 py-4">
  {#if featureCardContext.state.mode === FeatureCardMode.Display}
    <div class="flex gap-2">
      <button class="btn btn-outline uppercase" onclick={toggleSave}>
        {isStarred ? 'Remove' : 'Save'}
      </button>
      <button class="btn btn-outline uppercase">Check In</button>
    </div>

    <button
      class="btn btn-outline btn-primary gap-2 uppercase tracking-tight"
      onclick={getDirections}>
      <Icon src={MapPin} class="min-[400px]:block hidden h-4 w-4" />
      Get There
    </button>
  {:else if featureCardContext.state.mode === FeatureCardMode.Missing}
    <div class="flex w-full flex-col">
      <ValidationError />
      <div class="mt-4 flex items-center justify-between">
        <h3 class="text-lg font-bold uppercase text-error">Missing Report</h3>
        <button
          class="btn btn-outline btn-error uppercase"
          onclick={submitMissingReport}
          disabled={featureCardContext.isSubmitting}>
          {#if featureCardContext.isSubmitting}
            <span class="loading loading-ring loading-md"></span>
            Submitting...
          {:else}
            Submit
          {/if}
        </button>
      </div>
    </div>
  {:else if featureCardContext.state.mode === FeatureCardMode.New}
    <div class="flex w-full flex-col">
      <ValidationError />
      <div class="mt-4 flex items-center justify-between">
        <h3 class="text-lg font-bold uppercase text-error">New Feature</h3>
        <button
          class="btn btn-outline btn-error uppercase"
          onclick={submitNewFeature}
          disabled={featureCardContext.isSubmitting}>
          {#if featureCardContext.isSubmitting}
            <span class="loading loading-ring loading-md"></span>
            Submitting...
          {:else}
            Submit
          {/if}
        </button>
      </div>
    </div>
  {/if}
</div>
