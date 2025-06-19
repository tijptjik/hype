<script lang="ts">
// LOCALE
import { getLocale } from '$lib/i18n';
import { goto } from '$app/navigation';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import CompletionFooter from '$lib/components/layout/CompletionFooter.svelte';
import ResourceHeader from '$lib/components/resources/headers/ResourceHeader.svelte';
import ResourceIndex from '$lib/components/resources/ResourceIndex.svelte';
import LayoutModes from '$lib/components/resources/controls/ResourceIndexLayoutModes.svelte';
import ControlModes from '$lib/components/resources/controls/ResourceIndexControlModes.svelte';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
import EntityCard from '$lib/components/resources/EntityCard.svelte';
import FilterControlBar from '$lib/components/resources/filters/features/Root.svelte';
import FullScreenViewer from '$lib/components/modals/FullScreenViewer.svelte';
import FeatureRow from '$lib/components/resources/rows/FeatureRow.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type {
  KeyMap,
  ImageDBBasic,
  Feature,
  ControlMode,
  LayoutMode,
  ImageDB,
  Organisation,
  Project
} from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();
adminCtx.setFacet(false, false, FirstClassResource.feature);

// STATE
let layoutMode: LayoutMode = $state('table');
let controlMode: ControlMode = $state('filter');
let selectedImage = $state<ImageDB | null>(null);
let selectedFeature = $state<Feature | null>(null);
let selectedFeatureIndex = $state<number>(-1);
let selectedOrganisation = $derived<Organisation | undefined>(
  selectedFeature
    ? adminCtx.appCtx.cache.organisation.get(selectedFeature.organisationId)
    : undefined
);
let selectedProject = $derived<Project | undefined>(
  selectedFeature
    ? adminCtx.appCtx.cache.project.get(selectedFeature.projectId)
    : undefined
);
let listContainer: HTMLElement | null = $state(null);

// CONFIG :: KEY MAP
const keyMap: KeyMap = {
  id: 'id',
  title: 'i18n.title',
  subtitle: 'i18n.addressProperties.neighbourhood',
  description: 'i18n.displayAddress',
  image: 'image',
  badges: [
    {
      label: 'isPublished',
      variant: 'primary',
      type: 'boolean',
      trueText: 'Published',
      falseText: 'Draft'
    },
    {
      label: 'isVisitable',
      variant: 'outline',
      type: 'boolean',
      trueText: 'Visitable',
      falseText: 'Not Visitable'
    },
    {
      label: 'isArchived',
      variant: 'outline',
      type: 'boolean',
      trueText: 'Dead',
      falseText: 'Alive',
      superAdminOnly: true
    }
  ]
};
let entities: Feature[] = $derived(
  adminCtx.getViewFilteredResource<Feature>(FirstClassResource.feature)
);
let graphemeProperty = $derived(
  adminCtx.appCtx.cache.property.values().find((p) => p.key === 'graphemes')
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
    setTimeout(() => updateRowFocus(indexToFocus), 100);
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
  // Update focus on the corresponding row in the virtual list
  setTimeout(() => {
    const rowSelector = `[data-entity-index="${index}"][role="button"]`;
    let targetRow = listContainer?.querySelector(rowSelector) as HTMLElement;

    if (targetRow) {
      targetRow.focus();
      // Ensure the row is visible by scrolling it into view
      targetRow.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    } else {
      // If row is not in DOM (virtual list), try to scroll to approximate position
      console.log(
        'Row not in virtual DOM, scrolling to approximate position for index:',
        index
      );
      const approximateHeight = 80; // Row height
      const scrollTop = index * approximateHeight;

      const viewport = listContainer?.querySelector('.virtual-list-viewport');
      if (viewport) {
        viewport.scrollTo({
          top: scrollTop,
          behavior: 'smooth'
        });

        // Try again after scroll
        setTimeout(() => {
          const retryRow = listContainer?.querySelector(rowSelector) as HTMLElement;
          if (retryRow) {
            retryRow.focus();
          }
        }, 300);
      }
    }
  }, 0);
}

function restoreFocusAfterModalClose() {
  // When modal closes, focus the last selected row
  if (selectedFeatureIndex >= 0) {
    updateRowFocus(selectedFeatureIndex);
  }
}

function navigateToResource(entity: Feature) {
  goto(
    `/admin/${adminCtx.getEntityPath(
      adminCtx.activeResourceType as FirstClassResource,
      entity.id
    )}`
  );
}

function handleRowKeyDown(event: KeyboardEvent, entity: Feature) {
  // Don't handle row navigation if modal is open
  if (selectedImage) return;

  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    navigateToResource(entity);
  } else if (event.key === ' ' || event.key === 'Space') {
    event.preventDefault();
    event.stopPropagation();
    console.log('Space pressed on row, entity.image:', entity.image);
    if (entity.image) {
      openModal(entity.image as ImageDBBasic, entity);
    } else {
      console.log('No image to show for this entity');
    }
  }
}

function focusFirstItem(event: KeyboardEvent) {
  event.preventDefault();

  // Use setTimeout to ensure virtual list has rendered
  setTimeout(() => {
    // Look specifically for the first row button in the virtual list
    let firstItem = listContainer?.querySelector(
      '.virtual-list-items > div:first-child [role="button"][tabindex="0"]'
    ) as HTMLElement;

    if (!firstItem) {
      // Fallback: any focusable row element with tabindex="0"
      firstItem = listContainer?.querySelector(
        '[role="button"][tabindex="0"]'
      ) as HTMLElement;
    }

    if (!firstItem) {
      // Another fallback: any element with tabindex="0"
      firstItem = listContainer?.querySelector('[tabindex="0"]') as HTMLElement;
    }

    if (firstItem) {
      firstItem.focus();
    } else {
      console.warn('Could not find first item to focus');
    }
  }, 0);
}
</script>

<!-- LAYOUT -->
<ResourceHeader>
  {#snippet filters()}
    <FilterInput
      resourceType={FirstClassResource.feature}
      rounded={true}
      showUnpublishedToggle={false}
      showReviewedToggle={true}
      ontabout={focusFirstItem} />
  {/snippet}
  {#snippet modes()}
    <ControlModes bind:controlMode defaultMode="filter" />
    <LayoutModes bind:layoutMode defaultMode="table" />
  {/snippet}
</ResourceHeader>

<ResourceIndex {entities} {layoutMode} {controlMode} bind:listContainer>
  {#snippet controlBar()}
    <FilterControlBar count={entities.length} />
  {/snippet}
  {#snippet card(entity: Feature)}
    <EntityCard {entity} {keyMap}>
      {#snippet badgesExtra(entity: Feature)}
        {#each entity.properties.filter((p) => p.propertyValueId) as property}
          <span class="badge my-0.5 h-8 bg-base-300">
            <div class="flex h-8 flex-row items-center justify-center gap-2">
              <div
                class="block bg-base-100 font-mono text-xs uppercase text-neutral-content">
                {property.property?.i18n?.[getLocale()]?.label}
              </div>
              <div class="font-normal">
                {property.property?.values?.find(
                  (v) => v.id === property.propertyValueId
                )?.i18n?.[getLocale()]?.value}
              </div>
            </div>
          </span>
        {/each}
      {/snippet}
    </EntityCard>
  {/snippet}
  {#snippet row(entity, index)}
    <FeatureRow
      {entity}
      {index}
      {adminCtx}
      {graphemeProperty}
      {selectedFeatureIndex}
      {selectedImage}
      onNavigateToResource={navigateToResource}
      onRowKeyDown={handleRowKeyDown}
      onOpenModal={openModal} />
  {/snippet}
</ResourceIndex>
<CompletionFooter {entities} />

<!-- MODAL -->

{#if selectedImage && selectedFeature}
  <FullScreenViewer
    {adminCtx}
    image={selectedImage}
    feature={selectedFeature}
    organisation={selectedOrganisation}
    project={selectedProject}
    isAdminMode={true}
    canNavigatePrevious={canNavigatePrevious()}
    canNavigateNext={canNavigateNext()}
    onClose={closeModal}
    onNavigateNext={navigateToNextFeature}
    onNavigatePrevious={navigateToPreviousFeature} />
{/if}
