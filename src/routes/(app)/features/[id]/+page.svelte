<script lang="ts">
// SVELTE
import { page } from '$app/state';
import { untrack } from 'svelte';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// COMPONENTS
import FeatureCard from '$lib/components/featureCard/Root.svelte';
import FeatureGallery from '$lib/components/featureCard/FeatureGallery.svelte';
import FeatureBreadcrumbs from '$lib/components/featureCard/FeatureBreadcrumbs.svelte';
import FeatureTitle from '$lib/components/featureCard/FeatureTitle.svelte';
import FeatureDescription from '$lib/components/featureCard/FeatureDescription.svelte';
import FeatureProperties from '$lib/components/featureCard/FeatureProperties.svelte';
import FeaturePortal from '$lib/components/featureCard/FeaturePortal.svelte';
import FeatureActions from '$lib/components/featureCard/FeatureActions.svelte';
import MissingReportReason from '$lib/components/featureCard/MissingReportReason.svelte';
import PhotoCredit from '$lib/components/featureCard/PhotoCredit.svelte';
import Spacer from '$lib/components/featureCard/layout/Spacer.svelte';
import Container from '$lib/components/featureCard/layout/Container.svelte';
import FeaturePortalSection from '$lib/components/featureCard/layout/FeaturePortalSection.svelte';
import FullScreenCarousel from '$lib/components/modals/FullScreenCarousel.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniCtx } from '$lib/context/omni.svelte';
import {
  setFeatureCardContext,
  getFeatureCardContext
} from '$lib/context/featureCard.svelte';
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
setFeatureCardContext();
const cardCtx = getFeatureCardContext();
omniCtx.setFeatureCardContext(cardCtx);

let mode = $derived(cardCtx.state.mode);

// Use state instead of async derived to prevent component destruction
let feature: Feature | undefined = $state()!;

// ELEMENTS
let portalElement: HTMLElement = $state()!;
let wrapperElement: HTMLElement = $state()!;
let descriptionElement: HTMLDivElement = $state()!;

// STATE :: LAYOUT
let isDescriptionExpanded: boolean = $state(false);
let availableHeight: number = $state(0);
let wrapperFixedHeight: number | null = $state(null);
let minOverflowedHeight: number = $state(72);

// ═══════════════════════
// 1. LOADING
// ═══════════════════════

const loadFeatureAndSetContext = async () => {
  // 1. Set featureId for consistency
  featureId = page.params.id;
  // 2. Load the fresh feature data
  const loadedFeature = await appCtx.getFeatureById(page.params.id);
  // 3. Update the feature state atomically
  feature = loadedFeature as Feature;
  // 4. Reset description expansion when feature changes
  isDescriptionExpanded = false;

  if (omniCtx.isColdStart(page.params.id)) {
    // Cold start: initialize the feature with card open
    // Prevent navigation since we're already on the feature page
    await omniCtx.initFeature(page.params.id, {
      focus: false,
      openCard: false // Prevent navigation that would destroy components
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
      // Expanding: Calculate available height first, then expand
      if (wrapperElement) {
        availableHeight = wrapperElement.offsetHeight;
      }
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

// Measure available height when portal section is visible
$effect(() => {
  if (wrapperElement && portalElement && !isDescriptionExpanded) {
    // Wait for next frame to ensure accurate measurements
    requestAnimationFrame(() => {
      availableHeight = wrapperElement.offsetHeight;
    });
  }
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
        {#if mode === FeatureCardMode.Display}
          <Container>
            <FeatureGallery />
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
                  <Spacer />
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
            <Spacer />
          </Container>
        {:else if mode === FeatureCardMode.Missing}
          <FeatureGallery />
          <MissingReportReason />
        {:else if mode === FeatureCardMode.AddPhoto}
          <FeatureGallery />
          <PhotoCredit />
        {/if}
        <FeatureActions feature={feature as Feature} />
      </FeatureCard>
      <FullScreenCarousel {feature} />
    </ImageProvider>
  {/if}
{:else}
  <div class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-300">
    <div class="loading loading-ring loading-lg text-primary"></div>
  </div>
{/if}
