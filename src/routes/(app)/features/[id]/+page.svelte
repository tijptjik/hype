<script lang="ts">
// SVELTE
import { page } from '$app/state';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// COMPONENTS
import FeatureCard from '$lib/components/featureCard/Root.svelte';
import FeatureGallery from '$lib/components/featureCard/FeatureGallery.svelte';
import FeatureText from '$lib/components/featureCard/layout/FeatureText.svelte';
import FeatureBreadcrumbs from '$lib/components/featureCard/FeatureBreadcrumbs.svelte';
import FeatureTitle from '$lib/components/featureCard/FeatureTitle.svelte';
import FeatureDescription from '$lib/components/featureCard/FeatureDescription.svelte';
import FeatureProperties from '$lib/components/featureCard/FeatureProperties.svelte';
import FeaturePortal from '$lib/components/featureCard/FeaturePortal.svelte';
import FeatureActions from '$lib/components/featureCard/FeatureActions.svelte';
// ACTION COMPONENTS
import WishlistAction from '$lib/components/featureCard/actions/WishlistAction.svelte';
import VisitAction from '$lib/components/featureCard/actions/VisitAction.svelte';
import DirectionsAction from '$lib/components/featureCard/actions/DirectionsAction.svelte';
import SubmitNewFeatureAction from '$lib/components/featureCard/actions/SubmitNewFeatureAction.svelte';
import SubmitMissingReportAction from '$lib/components/featureCard/actions/SubmitMissingReportAction.svelte';
import SubmitNewPhotosAction from '$lib/components/featureCard/actions/SubmitNewPhotosAction.svelte';
import ValidationError from '$lib/components/featureCard/ValidationError.svelte';
// ACTION LABELS
import NewFeatureLabel from '$lib/components/featureCard/actions/labels/NewFeatureLabel.svelte';
import MissingReportLabel from '$lib/components/featureCard/actions/labels/MissingReportLabel.svelte';
import AddPhotoLabel from '$lib/components/featureCard/actions/labels/AddPhotoLabel.svelte';
import MissingReportBody from '$lib/components/featureCard/MissingReportBody.svelte';
import AddPhotoBody from '$lib/components/featureCard/AddPhotoBody.svelte';
import Container from '$lib/components/featureCard/layout/Container.svelte';
import FeaturePortalSection from '$lib/components/featureCard/layout/FeaturePortalSection.svelte';
import FullScreenCarousel from '$lib/components/modals/FullScreenCarousel.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniCtx } from '$lib/context/omni.svelte';
import { setCardCtx, getCardCtx } from '$lib/context/card.svelte';
// ENUMS
import { FeatureCardMode, ImageContextResource } from '$lib/enums';
// TYPES
import type { Feature, Image } from '$lib/types';

// PARAMS
let featureId: string = $state(page.params.id);

// CONTEXT
const appCtx = getAppCtx();
const omniCtx = getOmniCtx();

// CONTEXT :: FEATURE CARD
setCardCtx();
const cardCtx = getCardCtx();
omniCtx.setCardCtx(cardCtx);

let mode = $derived(cardCtx.state.mode);

// Use state instead of async derived to prevent component destruction
let feature: Feature | undefined = $state()!;

// ELEMENTS
let portalElement: HTMLElement = $state()!;
let wrapperElement: HTMLElement = $state()!;
let descriptionElement: HTMLDivElement = $state()!;
let viewport: HTMLElement = $state()!;

// STATE :: LAYOUT
let isDescriptionExpanded: boolean = $state(false);
let availableHeight: number = $state(0);
let wrapperFixedHeight: number | null = $state(null);
let minOverflowedHeight: number = $state(72);

// ═══════════════════════
// 1. LOADING
// ═══════════════════════

const loadFeatureAndSetContext = async () => {
  const id = page.params.id;
  if (!id) return;

  // 1. Set featureId for consistency
  featureId = id;
  // 2. Load the fresh feature data
  const loadedFeature = await appCtx.getFeatureById(id);
  // 3. Update the feature state atomically
  feature = loadedFeature as Feature;
  // 4. Reset description expansion when feature changes
  isDescriptionExpanded = false;

  if (omniCtx.isColdStart(id)) {
    // Cold start: initialize the feature with card open
    // Prevent navigation since we're already on the feature page
    await omniCtx.initFeature(id, {
      focus: false
    });
  }
};

// Load feature in effect to avoid component hierarchy destruction
$effect(() => {
  if (!page.params.id) {
    return;
  }
  loadFeatureAndSetContext();
});

// ═══════════════════════
// 2.1 LAYOUT :: HANDLERS
// ═══════════════════════

function handleDescriptionToggle(expanded: boolean) {
  // FIRST: Measure wrapper height before any state changes
  if (wrapperElement) {
    wrapperFixedHeight = wrapperElement.offsetHeight;
  }

  // THEN: Wait for next frame to ensure measurement is captured
  requestAnimationFrame(() => {
    if (expanded) {
      // Expanding: Calculate available height considering viewport visibility
      availableHeight = calculateVisibleHeight();
      isDescriptionExpanded = true;
    } else {
      // Collapsing: Just change state
      isDescriptionExpanded = false;
    }
  });

  // Remove fixed height after transition completes + buffer time
  setTimeout(() => {
    wrapperFixedHeight = null;
  }, 350); // Transition duration + 50ms buffer
}

// ═══════════════════════
// 2.2 LAYOUT :: MEASUREMENTS
// ═══════════════════════

// Function to calculate visible height
function calculateVisibleHeight() {
  if (wrapperElement && viewport) {
    const wrapperRect = wrapperElement.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();

    // Calculate how much of the wrapper is visible within the viewport
    const visibleTop = Math.max(wrapperRect.top, viewportRect.top);
    const visibleBottom = Math.min(wrapperRect.bottom, viewportRect.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);

    return visibleHeight;
  }
  return 0;
}

// Measure available height when portal section is visible
$effect(() => {
  if (wrapperElement && portalElement && !isDescriptionExpanded && viewport) {
    // Wait for next frame to ensure accurate measurements
    requestAnimationFrame(() => {
      availableHeight = calculateVisibleHeight();
    });
  }
});

// Update available height on viewport scroll when description is expanded
$effect(() => {
  if (!viewport || !wrapperElement || !isDescriptionExpanded) return;

  let rafId: number | null = null;

  const handleScroll = () => {
    if (rafId) return; // Skip if already scheduled

    rafId = requestAnimationFrame(() => {
      availableHeight = calculateVisibleHeight();
      rafId = null;
    });
  };

  viewport.addEventListener('scroll', handleScroll, { passive: true });

  return () => {
    viewport.removeEventListener('scroll', handleScroll);
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
  };
});

const imageProviderProps = $derived({
  isAdminMode: false,
  // Only provide valid props when feature and featureId match
  // This prevents intermediate mismatched state during navigation
  isValid: feature?.id === featureId,
  image: feature?.id === featureId ? (feature.image as Image | null) : undefined,
  images: feature?.id === featureId ? (feature.images as Image[]) : undefined,
  context:
    feature?.id === featureId && feature
      ? {
          ctxType: ImageContextResource.feature,
          ctxId: featureId,
          ...appCtx.getHierarchySync(feature)
        }
      : undefined // Don't provide mismatched context during transitions
});
</script>

{#if appCtx}
  {#if feature}
    <ImageProvider {page} {...imageProviderProps}>
      <FeatureCard>
        <Container bind:viewport>
          <FeatureGallery />
          <FeatureText>
            {#if cardCtx.isDisplayMode || cardCtx.isSubmissionSuccessMode}
              <FeatureBreadcrumbs {feature} />
              <FeatureTitle {feature} />
              <div
                class="relative"
                bind:this={wrapperElement}
                style="
                {wrapperFixedHeight
                  ? `height: ${wrapperFixedHeight}px !important; 
                     min-height: ${wrapperFixedHeight}px !important; 
                     max-height: ${wrapperFixedHeight}px !important; 
                     overflow: hidden !important; 
                     transition: none !important;`
                  : 'height: auto;'}">
                <FeatureDescription
                  {feature}
                  {descriptionElement}
                  expanded={isDescriptionExpanded}
                  onToggle={handleDescriptionToggle}
                  {availableHeight}
                  {minOverflowedHeight} />
                {#if !isDescriptionExpanded}
                  <div bind:this={portalElement}>
                    <FeaturePortalSection>
                      {#snippet left()}
                        <FeatureProperties feature={feature as Feature} />
                      {/snippet}
                      {#snippet right()}
                        <FeaturePortal feature={feature as Feature} />
                      {/snippet}
                    </FeaturePortalSection>
                  </div>
                {/if}
              </div>
            {:else if cardCtx.isMissingMode}
              <MissingReportBody {viewport} />
            {:else if cardCtx.isAddPhotoMode}
              <AddPhotoBody {viewport} />
            {/if}
          </FeatureText>
        </Container>
        <ValidationError />
        <FeatureActions>
          {#snippet leftActions()}
            {#if feature && mode === FeatureCardMode.Display}
              <div class="flex gap-2">
                <WishlistAction {feature} />
                <VisitAction {feature} />
              </div>
            {:else if mode === FeatureCardMode.New}
              <NewFeatureLabel />
            {:else if feature && mode === FeatureCardMode.Missing}
              <MissingReportLabel />
            {:else if feature && mode === FeatureCardMode.AddPhoto}
              <AddPhotoLabel />
            {/if}
          {/snippet}
          {#snippet rightActions()}
            {#if feature && mode === FeatureCardMode.Display}
              <DirectionsAction {feature} />
            {:else if mode === FeatureCardMode.New}
              <SubmitNewFeatureAction />
            {:else if feature && mode === FeatureCardMode.Missing}
              <SubmitMissingReportAction {feature} />
            {:else if feature && mode === FeatureCardMode.AddPhoto}
              <SubmitNewPhotosAction {feature} />
            {/if}
          {/snippet}
        </FeatureActions>
      </FeatureCard>
      {#if mode === FeatureCardMode.Display}
        <FullScreenCarousel {feature} />
      {/if}
    </ImageProvider>
  {/if}
{:else}
  <div class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-300">
    <div class="loading loading-ring loading-lg text-primary"></div>
  </div>
{/if}
