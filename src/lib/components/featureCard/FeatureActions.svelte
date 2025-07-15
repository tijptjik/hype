<script lang="ts">
// SVELTE
import { page } from '$app/state';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Star, Check, Map } from '@steeze-ui/heroicons';
// I18N
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// UTILS
import { formatDistanceToNow } from 'date-fns';
import { enGB, zhCN, zhHK } from 'date-fns/locale';
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniCtx } from '$lib/context/omni.svelte';
// SERVICES
import {
  submitMissingReport as submitMissingReportAPI,
  submitNewFeature as submitNewFeatureAPI,
  submitNewPhotos as submitNewPhotosAPI
} from '$lib/client/services/task';
import {
  toggleWishlistStatus,
  toggleVisitedStatus
} from '$lib/client/services/userFeatures';
// ENUMS
import { FeatureCardMode } from '$lib/enums';
// COMPONENTS
import ValidationError from './ValidationError.svelte';
import { getFlash } from 'sveltekit-flash-message';
// TYPES
import type { Feature, NewFeatureTask, UserContributedFeature } from '$lib/types';
import type { Point } from 'geojson';

// CONTEXT
const appCtx = getAppCtx();
let cardCtx = getCardCtx();
let omniCtx = getOmniCtx();
const flash = getFlash(page);

// STATE : SESSION
let attribution = $derived(appCtx.getUser()!.attribution || m.anonymous());

// STATE : PROPS
let { feature }: { feature: Feature | UserContributedFeature } = $props();

// STATE : DERIVED
let isSubmittingWishlist = $state(false);
let isSubmittingVisit = $state(false);

let wishlistedFeature = $derived(
  'id' in feature
    ? appCtx.getWishlistUserFeatures().find((uf) => uf.featureId === feature.id)
    : undefined
);
let isWishlisted = $derived(!!wishlistedFeature);
let visitedFeature = $derived(
  'id' in feature
    ? appCtx.getVisitedUserFeatures().find((uf) => uf.featureId === feature.id)
    : undefined
);
let isVisited = $derived(!!visitedFeature);

async function toggleWishlisted() {
  if (isSubmittingWishlist || !('id' in feature)) return;
  isSubmittingWishlist = true;

  try {
    await toggleWishlistStatus(
      appCtx.user!.id,
      feature.id,
      isWishlisted,
      visitedFeature?.isVisited || false,
      visitedFeature?.visitedAt || null
    );

    // Optimistically update the UI
    await appCtx.invalidateAndRefresh('userFeatures');
  } catch (error) {
    console.error('Error updating wishlist status:', error);
    $flash = { type: 'error', message: 'Failed to update wishlist status' };
  } finally {
    isSubmittingWishlist = false;
  }
}

async function toggleVisited() {
  if (isSubmittingVisit || !('id' in feature)) return;
  isSubmittingVisit = true;

  try {
    // If marking as visited and item is wishlisted, remove from wishlist
    const shouldRemoveFromWishlist = !isVisited && isWishlisted;
    const newWishlistStatus = shouldRemoveFromWishlist
      ? false
      : wishlistedFeature?.isWishlisted || false;

    await toggleVisitedStatus(
      appCtx.user!.id,
      feature.id,
      isVisited,
      newWishlistStatus
    );

    // Optimistically update the UI
    await appCtx.invalidateAndRefresh('userFeatures');
  } catch (error) {
    console.error('Error updating visited status:', error);
    $flash = { type: 'error', message: 'Failed to update visited status' };
  } finally {
    isSubmittingVisit = false;
  }
}

async function submitMissingReport() {
  // Validate inputs
  if (cardCtx.userData.photos.length === 0) {
    cardCtx.validationError = m.validation__at_least_one_image_as_evidence();
    return;
  }

  if (cardCtx.userData.missingReason.trim().length < 5) {
    cardCtx.validationError = m.validation__at_least_five_characters();
    return;
  }

  try {
    cardCtx.isSubmitting = true;

    const { layer, project, organisation } = await appCtx.getHierarchy(
      feature as Feature
    );

    // Submit using client service
    await submitMissingReportAPI(
      feature as Feature,
      layer!,
      project!,
      organisation!,
      cardCtx.userData.missingReason,
      cardCtx.userData.photos,
      appCtx.user!.id
    );

    // Reset form and show success message
    cardCtx.userData.missingReason = '';
    cardCtx.userData.photos = [];

    // Set flash message instead of alert
    $flash = { type: 'success', message: m.report_missing__success() };

    // Optionally reset the feature card mode
    cardCtx.state.mode = FeatureCardMode.Display;
    cardCtx.validationError = '';
  } catch (error) {
    console.error('Error submitting missing report:', error);
    $flash = { type: 'error', message: m.long_crazy_peacock_care() };
    cardCtx.validationError = m.long_crazy_peacock_care();
  } finally {
    cardCtx.isSubmitting = false;
  }
}

async function submitNewFeature() {
  const newFeature = appCtx.getNewFeature() as NewFeatureTask;

  // Validate inputs
  if (cardCtx.userData.photos.length === 0) {
    cardCtx.validationError = m.validation__at_least_one_image();
    return;
  }

  if (!newFeature?.feature?.i18n?.[getLocale()]?.title) {
    cardCtx.validationError = m.validation__title_required();
    return;
  }

  try {
    cardCtx.isSubmitting = true;

    if (!newFeature) return;

    // Submit using client service
    await submitNewFeatureAPI(newFeature, cardCtx.userData.photos);

    // Set flash message
    $flash = { type: 'success', message: m.new_feature__success() };

    // Close the feature card
    omniCtx.close();
    cardCtx.setMode(FeatureCardMode.Display);
    // Reset form and show success message
    cardCtx.userData.photos = [];
    appCtx.resetNewFeature();
    cardCtx.validationError = '';
  } catch (error) {
    console.error('Error submitting new feature:', error);
    $flash = { type: 'error', message: m.long_crazy_peacock_care() };
    cardCtx.validationError = m.long_crazy_peacock_care();
  } finally {
    cardCtx.isSubmitting = false;
  }
}

async function submitNewPhotos() {
  // Validate inputs
  if (cardCtx.userData.photos.length === 0) {
    cardCtx.setError(m.validation__at_least_one_image());
    return;
  }

  if (
    (attribution.trim().length || 0) < 1 &&
    cardCtx.getAttribution().trim().length < 1
  ) {
    cardCtx.setError(m.validation__attribution_required());
    return;
  }

  try {
    cardCtx.isSubmitting = true;

    const { layer, project, organisation } = await appCtx.getHierarchy(
      feature as Feature
    );

    // Submit using client service
    await submitNewPhotosAPI(
      feature as Feature,
      layer!,
      project!,
      organisation!,
      cardCtx.userData.photos,
      appCtx.user!.id
    );

    // Reset form and show success message
    cardCtx.userData.photos = [];

    // Set flash message instead of alert
    $flash = { type: 'success', message: m.add_photos__success() };

    // reset the feature card mode
    cardCtx.state.mode = FeatureCardMode.Display;
    cardCtx.validationError = '';
  } catch (error) {
    console.error('Error submitting new photos:', error);
    $flash = { type: 'error', message: m.long_crazy_peacock_care() };
    cardCtx.validationError = m.long_crazy_peacock_care();
  } finally {
    cardCtx.isSubmitting = false;
  }
}

// Utils
function getDirections() {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${(feature.geometry as Point).coordinates[1]},${(feature.geometry as Point).coordinates[0]}`;
  window.open(url, '_blank');
}
</script>

<div
  class="pointer-events-auto flex min-h-16 flex-shrink-0 flex-row items-center justify-between rounded-b-lg bg-black px-3 py-2 caret-transparent w-100:px-4 w-100:py-4">
  {#if cardCtx.isDisplayMode}
    <div class="flex gap-2">
      <button
        class="btn h-12 w-12 bg-base-400 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300 w-64:h-auto w-64:w-auto"
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
            <!-- TODO Use a map for Proper locale handling -->
            {formatDistanceToNow(new Date(visitedFeature!.visitedAt!), {
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
          class="btn h-12 w-12 bg-base-400 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300 w-64:h-auto w-64:w-auto"
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
      class="btn h-12 w-12 bg-base-400 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300 w-64:h-auto w-64:w-auto"
      onclick={getDirections}>
      <Icon
        src={Map}
        class="h-6 w-6 stroke-2 font-bold text-primary w-64:hidden w-100:inline-block" />
      <span class="hidden w-64:inline-block">{m.alive_large_hawk_hunt()}</span>
    </button>
  {:else if cardCtx.state.mode === FeatureCardMode.New}
    <div class="flex min-h-12 w-full flex-col">
      <ValidationError />
      <div class="flex flex-row items-baseline justify-between">
        <h3 class="text-lg font-bold uppercase text-primary">
          {m.smart_crazy_cuckoo_play()}
        </h3>
        <button
          class="btn btn-outline btn-primary uppercase"
          onclick={submitNewFeature}
          disabled={cardCtx.isSubmitting}>
          {#if cardCtx.isSubmitting}
            <span class="loading loading-ring loading-md"></span>
            {m.fun_fuzzy_shrike_compose()}
          {:else}
            {m.proof_active_eagle_urge()}
          {/if}
        </button>
      </div>
    </div>
  {:else if cardCtx.state.mode === FeatureCardMode.Missing}
    <div class="flex w-full flex-col">
      <ValidationError />
      <div class="mt-4 flex items-center justify-between">
        <h3 class="text-lg font-bold uppercase text-error">
          {m.sour_minor_lamb_cry()}
        </h3>
        <button
          class="btn btn-outline btn-error uppercase"
          onclick={submitMissingReport}
          disabled={cardCtx.isSubmitting}>
          {#if cardCtx.isSubmitting}
            <span class="loading loading-ring loading-md"></span>
            {m.fun_fuzzy_shrike_compose()}
          {:else}
            {m.proof_active_eagle_urge()}
          {/if}
        </button>
      </div>
    </div>
  {:else if cardCtx.state.mode === FeatureCardMode.AddPhoto}
    <div class="flex w-full flex-col">
      <ValidationError />
      <div class="mt-4 flex items-center justify-between">
        <h3 class="text-lg font-bold uppercase text-primary">
          {@html cardCtx.userData.photos.length > 0
            ? `<span class="text-white px-2">${cardCtx.userData.photos.length}</span> ${cardCtx.userData.photos.length == 1 ? 'Photo' : 'Photos'}`
            : 'Add Photos'}
        </h3>
        <div class="flex gap-3">
          <button
            class="btn btn-outline border-base-100 uppercase hover:bg-base-200 hover:text-base-content"
            onclick={() => (cardCtx.state.mode = FeatureCardMode.Display)}>
            {m.cancel()}
          </button>
          <button
            class="btn btn-outline btn-primary uppercase"
            onclick={submitNewPhotos}
            disabled={cardCtx.isSubmitting}>
            {#if cardCtx.isSubmitting}
              <span class="loading loading-ring loading-md"></span>
              {m.fun_fuzzy_shrike_compose()}
            {:else}
              {m.proof_active_eagle_urge()}
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
