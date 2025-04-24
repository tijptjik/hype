<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Star, Check, Map } from '@steeze-ui/heroicons';
// I18N
import { m, getLocale } from '$lib/i18n';
// UTILS
import { formatDistanceToNow } from 'date-fns';
import { enGB, zhCN, zhHK } from 'date-fns/locale';
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
let featureCardContext = getFeatureCardContext();
let mapContext = getMapContext();
const flash = getFlash(page);

// STATE : DERIVED
let isSubmittingWishlist = $state(false);
let isSubmittingVisit = $state(false);

let wishlistedFeature = $derived(
  mapContext.getWishlistUserFeatures().find((uf) => uf.featureId === feature.id)
);
let isWishlisted = $derived(!!wishlistedFeature);
let visitedFeature = $derived(
  mapContext.getVisitedUserFeatures().find((uf) => uf.featureId === feature.id)
);
let isVisited = $derived(!!visitedFeature);

async function toggleWishlisted() {
  if (isSubmittingWishlist) return;
  isSubmittingWishlist = true;

  try {
    const data = {
      userId: mapContext.userId,
      featureId: feature.id,
      isWishlisted: !isWishlisted,
      isVisited: visitedFeature?.isVisited || false,
      visitedAt: visitedFeature?.visitedAt || null
    };

    const response = await fetch('/api/userFeatures', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Failed to update wishlist status');

    // Optimistically update the UI
    await mapContext.invalidateAndRefresh('userFeatures');
  } catch (error) {
    console.error('Error updating wishlist status:', error);
    $flash = { type: 'error', message: 'Failed to update wishlist status' };
  } finally {
    isSubmittingWishlist = false;
  }
}

async function toggleVisited() {
  if (isSubmittingVisit) return;
  isSubmittingVisit = true;

  try {
    const data = {
      userId: mapContext.userId,
      featureId: feature.id,
      isVisited: !isVisited,
      isWishlisted: false, // Always set wishlist to false when marking as visited
      visitedAt: !isVisited ? new Date().toISOString() : null
    };

    const response = await fetch('/api/userFeatures', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Failed to update visited status');

    // Optimistically update the UI
    await mapContext.invalidateAndRefresh('userFeatures');
  } catch (error) {
    console.error('Error updating visited status:', error);
    $flash = { type: 'error', message: 'Failed to update visited status' };
  } finally {
    isSubmittingVisit = false;
  }
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
    $flash = { type: 'error', message: m.report_missing__error() };
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
  class="pointer-events-auto flex flex-shrink-0 items-center justify-between rounded-b-lg bg-black px-2 py-2 caret-transparent w-100:px-4 w-100:py-4">
  {#if featureCardContext.state.mode === FeatureCardMode.Display}
    <div class="flex gap-2">
      <button
        class="bg-base-400 btn h-12 w-12 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300 w-64:h-auto w-64:w-auto"
        onclick={toggleWishlisted}
        disabled={isSubmittingWishlist}>
        {#if isSubmittingWishlist}
          <span class="loading loading-ring loading-md"></span>
        {:else}
          <Icon
            src={Star}
            class="h-6 w-6 transition-colors duration-300 {isWishlisted
              ? 'text-primary'
              : 'text-neutral-content'}"
            theme="solid" />
        {/if}
        <span class="hidden w-120:block">
          {isWishlisted ? m.weird_short_orangutan_kiss() : m.legal_silly_mammoth_link()}
        </span>
      </button>
      {#if isVisited}
        <div
          class="flex h-full flex-col items-start justify-center pl-2 text-sm text-neutral-content">
          <p class="text-xs uppercase">{m.white_dizzy_clownfish_quiz()}</p>
          <p class="font-mono text-white">
            {formatDistanceToNow(new Date(visitedFeature!.visitedAt), {
              addSuffix: true,
              locale:
                getLocale() === 'zh-hant'
                  ? zhHK
                  : getLocale() === 'zh-hans'
                    ? zhCN
                    : enGB
            }).replace('minute', 'min')}
          </p>
        </div>
      {:else}
        <button
          class="bg-base-400 btn h-12 w-12 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300 w-64:h-auto w-64:w-auto"
          onclick={toggleVisited}
          disabled={isSubmittingVisit}>
          {#if isSubmittingVisit}
            <span class="loading loading-ring loading-md"></span>
          {:else}
            <Icon
              src={Check}
              class="h-6 w-6 font-bold transition-colors duration-300 {isVisited
                ? 'text-primary'
                : 'text-neutral-content'}" />
            <span class="hidden w-120:block">
              {isVisited ? 'Forget' : m.noble_fine_ibex_pinch()}
            </span>
          {/if}
        </button>
      {/if}
    </div>
    <button
      class="bg-base-400 btn h-12 w-12 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300 w-64:h-auto w-64:w-auto"
      onclick={getDirections}>
      <Icon
        src={Map}
        class="h-6 w-6 stroke-2 font-bold text-primary w-64:hidden w-100:inline-block" />
      <span class="hidden w-64:inline-block">{m.alive_large_hawk_hunt()}</span>
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
