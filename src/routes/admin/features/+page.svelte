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
import ScrollableText from '$lib/components/common/ScrollableText.svelte';
// STAT COMPONENTS
import StatusStats from '$lib/components/features/stats/StatusStats.svelte';
import TranslationStats from '$lib/components/features/stats/TranslationStats.svelte';
import ContentStats from '$lib/components/features/stats/ContentStats.svelte';
import ImageStats from '$lib/components/features/stats/ImageStats.svelte';
import CategoryStats from '$lib/components/features/stats/CategoryStats.svelte';
import SpecifierStats from '$lib/components/features/stats/SpecifierStats.svelte';
// ENUMS
import { FirstClassResource, ImageContextResource } from '$lib/enums';
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
// UTILS
import { getURLfromImage } from '$lib/client/services/image';

// CONTEXT
const adminCtx = getAdminCtx();
adminCtx.setFacet(false, false, FirstClassResource.feature);

// STATE
let layoutMode: LayoutMode = $state('table');
let controlMode: ControlMode = $state('filter');
let selectedImage = $state<ImageDB | null>(null);
let selectedFeature = $state<Feature | null>(null);
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

function openModal(image: ImageDBBasic | ImageDB, feature: Feature) {
  selectedImage = image as ImageDB;
  selectedFeature = feature;
}

function closeModal() {
  selectedImage = null;
  selectedFeature = null;
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
  if (event.key === 'Enter') {
    event.preventDefault();
    navigateToResource(entity);
  } else if (event.key === ' ') {
    event.preventDefault();
    if (entity.image) {
      openModal(entity.image as ImageDBBasic, entity);
    }
  }
}



function focusFirstItem(e: CustomEvent<KeyboardEvent>) {
  e.detail.preventDefault();
  const firstItem = listContainer?.querySelector('[tabindex="0"]') as HTMLElement;
  firstItem?.focus();
}
</script>

<!-- LAYOUT -->
<ResourceHeader>
  {#snippet filters()}
    <FilterInput
      resourceType={FirstClassResource.feature}
      rounded={true}
      showUnpublishedToggle={false}
      showReviewedToggle={true} />
  {/snippet}
  {#snippet modes()}
    <ControlModes bind:controlMode defaultMode="filter" />
    <LayoutModes bind:layoutMode defaultMode="table" />
  {/snippet}
</ResourceHeader>

<ResourceIndex {entities} {layoutMode} {controlMode}>
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
  {#snippet row(entity)}
    {@const grapheme =
      entity.properties.find((p) => p.propertyId === graphemeProperty?.id)?.value || ''}
    <a
      href="/admin/{adminCtx.getEntityPath(
        adminCtx.activeResourceType as FirstClassResource,
        entity.id
      )}"
      class="flex items-center gap-4 rounded-lg bg-base-100 p-2 pr-4 shadow-sm transition-shadow hover:shadow-md"
      onkeydown={(e) => handleRowKeyDown(e, entity)}
      tabindex="0">
      <!-- Left Section: Image + Title/Address -->
      <div class="flex items-center gap-4">
        <div
          class="relative h-16 w-16 flex-shrink-0 cursor-pointer"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (entity.image) openModal(entity.image as ImageDBBasic, entity);
          }}
          onkeydown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Enter' && entity.image) openModal(entity.image as ImageDBBasic, entity);
          }}
          role="button">
          {#if entity.image}
            <img
              src={getURLfromImage({
                image: entity.image as ImageDB,
                transformation: 'c_fill,w_100,h_100,q_auto'
              })}
              alt={(entity.image as any)?.altText ?? 'Feature image'}
              class="h-full w-full rounded-md object-cover" />
          {:else}
            <div
              class="flex h-full w-full items-center justify-center rounded-md bg-base-200">
              <span class="text-xs text-base-content/60"></span>
            </div>
          {/if}
        </div>
        <div class="flex flex-col overflow-hidden">
          <ScrollableText
            text={entity.i18n?.[getLocale()]?.title || 'Untitled'}
            textClass="font-medium text-base-content"
            separator="⸱"
            padding={32} />
          <ScrollableText
            text={entity.i18n?.[getLocale()]?.displayAddress || 'No address'}
            textClass="text-sm text-base-content/60"
            separator="⚲"
            padding={24} />
        </div>
      </div>

      <div class="flex flex-1 items-center justify-around">
        <div class="flex h-10 flex-col items-center justify-between">
          <small class="text-xs text-base-content/60">GRAPHEME</small>
          <div class="tooltip" data-tip={grapheme}>
      <!-- Status Stats -->
      <StatusStats feature={entity} appCtx={adminCtx.appCtx} showTitle={false} />

      <!-- Translation Stats (hidden on small screens) -->
      <div class="hidden md:block">
        <TranslationStats feature={entity} appCtx={adminCtx.appCtx} showTitle={false} />
      </div>

      <!-- Content Stats (hidden on medium screens and smaller) -->
      <div class="hidden lg:block">
        <ContentStats feature={entity} appCtx={adminCtx.appCtx} showTitle={false} />
      </div>

      <!-- Image Stats (hidden on large screens and smaller) -->
      <div class="hidden xl:block">
        <ImageStats feature={entity} appCtx={adminCtx.appCtx} showTitle={false} />
      </div>

      <!-- Category Stats (hidden on xl screens and smaller) -->
      <div class="hidden 2xl:block">
        <CategoryStats feature={entity} appCtx={adminCtx.appCtx} showTitle={false} />
      </div>

      <!-- Specifier Stats (hidden on 2xl screens and smaller) -->
      <div class="hidden 3xl:block">
        <SpecifierStats feature={entity} appCtx={adminCtx.appCtx} showTitle={false} />
            </p>
          </div>
        </div>

      <!-- Status Stats -->
      <StatusStats feature={entity} appCtx={adminCtx.appCtx} showTitle={false} />

      <!-- Translation Stats (hidden on small screens) -->
      <div class="hidden md:block">
        <TranslationStats feature={entity} appCtx={adminCtx.appCtx} showTitle={false} />
      </div>

      <!-- Content Stats (hidden on medium screens and smaller) -->
      <div class="hidden lg:block">
        <ContentStats feature={entity} appCtx={adminCtx.appCtx} showTitle={false} />
      </div>

      <!-- Image Stats (hidden on large screens and smaller) -->
      <div class="hidden xl:block">
        <ImageStats feature={entity} appCtx={adminCtx.appCtx} showTitle={false} />
      </div>

      <!-- Category Stats (hidden on xl screens and smaller) -->
      <div class="hidden 2xl:block">
        <CategoryStats feature={entity} appCtx={adminCtx.appCtx} showTitle={false} />
      </div>

      <!-- Specifier Stats (hidden on 2xl screens and smaller) -->
      <div class="hidden 3xl:block">
        <SpecifierStats feature={entity} appCtx={adminCtx.appCtx} showTitle={false} />
      </div>

      <!-- Right Section: Status -->
      <div class="flex flex-none items-center">
        <div class="divider divider-horizontal mx-4"></div>
        <div class="flex w-24 items-center justify-center gap-2">
          <span
            class="badge rounded-lg bg-base-200 px-3 py-3 uppercase"
            class:text-orange-500={entity.isPendingReview}
            class:text-ok={entity.isPublished}
            class:text-error={!entity.isPublished && !entity.isPendingReview}>
            {entity.isPendingReview
              ? 'Suggested'
              : entity.isPublished
                ? 'Published'
                : 'Draft'}
          </span>
        </div>
      </div>
    </a>
  {/snippet}
</ResourceIndex>
<CompletionFooter {entities} />

<!-- MODAL -->

{#if selectedImage && selectedFeature}
  <FullScreenViewer
    image={selectedImage}
    feature={selectedFeature}
    organisation={selectedOrganisation}
    project={selectedProject}
    isAdminMode={true}
    on:close={closeModal} />
{/if}
