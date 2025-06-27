<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import CompletionFooter from '$lib/components/layout/CompletionFooter.svelte';
import ResourceIndex from '$lib/components/resources/ResourceIndex.svelte';
import FilterControlBar from '$lib/components/resources/filters/features/Root.svelte';
import FullScreenViewer from '$lib/components/modals/FullScreenViewer.svelte';
import FeatureRow from '$lib/components/resources/rows/FeatureRow.svelte';
import FeatureCard from '$lib/components/resources/cards/FeatureIndexCard.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// I18N
import { m } from '$lib/i18n';
// ICONS
import { MapPin as FeatureIcon } from '@steeze-ui/heroicons';
// TYPES
import type { Feature, ImageDB, ImageDBBasic } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();
adminCtx.setFacet(false, false, FirstClassResource.feature);

// HEADER SETUP
adminCtx.setHeaderForIndex(m.omni__title_features(), FeatureIcon);

// STATE
let listContainer: HTMLElement | null = $state(null);

// MODAL STATE
let selectedImage = $state<ImageDB | null>(null);
let selectedFeature = $state<Feature | null>(null);
let selectedFeatureIndex = $state<number>(-1);

let entities: Feature[] = $derived(
  adminCtx.getViewFilteredResource<Feature>(FirstClassResource.feature)
);
// Derived states for navigation capability
let canNavigatePrevious = $derived(() => {
  if (selectedFeatureIndex <= 0) return false;
  // Check if there's any feature with an image before the current index
  for (let i = selectedFeatureIndex - 1; i >= 0; i--) {
    if (entities[i]?.image) return true;
  }
  return false;
});

let canNavigateNext = $derived(() => {
  if (selectedFeatureIndex < 0) return false;
  // Check if there's any feature with an image after the current index
  for (let i = selectedFeatureIndex + 1; i < entities.length; i++) {
    if (entities[i]?.image) return true;
  }
  return false;
});

function openModal(image: ImageDBBasic | ImageDB, feature: Feature) {
  selectedImage = image as ImageDB;
  selectedFeature = feature;
  selectedFeatureIndex = entities.findIndex((f) => f.id === feature.id);
}

function closeModal() {
  // Store the index before clearing state
  const indexToFocus = selectedFeatureIndex;
  selectedImage = null;
  selectedFeature = null;
  selectedFeatureIndex = -1;
  // Restore focus to the last active row
  if (indexToFocus >= 0) {
    setTimeout(() => updateRowFocus(indexToFocus), 25);
  }
}

function navigateToNextFeature() {
  if (selectedFeatureIndex < 0) return;
  // Find the next feature with an image
  for (let i = selectedFeatureIndex + 1; i < entities.length; i++) {
    const nextFeature = entities[i];
    if (nextFeature?.image) {
      selectedFeature = nextFeature;
      selectedImage = nextFeature.image as ImageDB;
      selectedFeatureIndex = i;
      updateRowFocus(i);
      return;
    }
  }
}

function navigateToPreviousFeature() {
  if (selectedFeatureIndex <= 0) return;

  // Find the previous feature with an image
  for (let i = selectedFeatureIndex - 1; i >= 0; i--) {
    const prevFeature = entities[i];
    if (prevFeature?.image) {
      selectedFeature = prevFeature;
      selectedImage = prevFeature.image as ImageDB;
      selectedFeatureIndex = i;
      updateRowFocus(i);
      return;
    }
  }
}

function updateRowFocus(index: number) {
  // Use the virtual list's scrollToIndex method
  const virtualList = listContainer?.querySelector(
    'svelte-virtual-list-viewport'
  ) as any;

  if (virtualList && virtualList.scrollToIndex) {
    // Scroll to the index using the virtual list's built-in method
    virtualList.scrollToIndex(index, true, false);

    // Focus the row after scrolling
    setTimeout(() => {
      const rowSelector = `[data-entity-index="${index}"][role="button"]`;
      const targetRow = listContainer?.querySelector(rowSelector) as HTMLElement;
      if (targetRow) {
        targetRow.focus();
      }
    }, 50);
  } else {
    // Fallback: focus immediately if row is already visible
    setTimeout(() => {
      const rowSelector = `[data-entity-index="${index}"][role="button"]`;
      const targetRow = listContainer?.querySelector(rowSelector) as HTMLElement;
      if (targetRow) {
        targetRow.focus();
      }
    }, 0);
  }
}
</script>

<ResourceIndex {entities} bind:listContainer>
  {#snippet controlBar()}
    <FilterControlBar count={entities.length} />
  {/snippet}
  {#snippet card(entity: Feature)}
    <FeatureCard {entity} />
  {/snippet}
  {#snippet row(entity, index)}
    <FeatureRow
      {entity}
      {index}
      {adminCtx}
      onImageClick={openModal}
      isSelected={selectedFeatureIndex === index && selectedImage !== null} />
  {/snippet}
</ResourceIndex>
<CompletionFooter {entities} />

<!-- MODAL -->
{#if selectedImage && selectedFeature}
  <FullScreenViewer
    {adminCtx}
    image={selectedImage}
    feature={selectedFeature}
    isAdminMode={true}
    canNavigatePrevious={canNavigatePrevious()}
    canNavigateNext={canNavigateNext()}
    onClose={closeModal}
    onNavigateNext={navigateToNextFeature}
    onNavigatePrevious={navigateToPreviousFeature} />
{/if}
