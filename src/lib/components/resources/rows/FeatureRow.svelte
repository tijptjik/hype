<script lang="ts">
// SVELTE
import { goto } from '$app/navigation';
// I18N
import { m } from '$lib/i18n';
import { getI18n } from '$lib/i18n';
// COMPONENTS
import ScrollableText from '$lib/components/common/ScrollableText.svelte';
import StatusStats from '$lib/components/features/stats/StatusStats.svelte';
import TranslationStats from '$lib/components/features/stats/TranslationStats.svelte';
import ContentStats from '$lib/components/features/stats/ContentStats.svelte';
import ImageStats from '$lib/components/features/stats/ImageStats.svelte';
import CategoryStats from '$lib/components/features/stats/CategoryStats.svelte';
import SpecifierStats from '$lib/components/features/stats/SpecifierStats.svelte';
// SERVICES
import { getURLfromImage } from '$lib/client/services/image';
// I18N
import { getLocale } from '$lib/i18n';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { Feature, ImageDB, ImageDBBasic } from '$lib/types';
import type { AdminCtx } from '$lib/context/admin.svelte';

type Props = {
  adminCtx: AdminCtx;
  entity: Feature;
  index: number;
  onImageClick?: (image: ImageDBBasic, feature: Feature) => void;
  isSelected?: boolean;
};

// STATE : PROPS
let { adminCtx, entity, index, onImageClick, isSelected = false }: Props = $props();

// STATE : DERIVED
const appCtx = adminCtx.appCtx;
const locale = $derived(getLocale());
const graphemeProperty = $derived(
  appCtx.cache.property.values().find((p) => p.key === 'graphemes')
);
const grapheme = $derived(
  entity.properties.find((p) => p.propertyId === graphemeProperty?.id)?.value || ''
);

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
    event.stopPropagation();
    navigateToResource(entity);
  } else if (event.key === ' ' || event.key === 'Space') {
    event.preventDefault();
    event.stopPropagation();
    if (entity.image && onImageClick) {
      onImageClick(entity.image as ImageDBBasic, entity);
    }
  }
}

function handleThumbnailClick(e: Event, image: ImageDBBasic, feature: Feature) {
  e.preventDefault();
  e.stopPropagation();
  if (onImageClick) {
    onImageClick(image, feature);
  }
}
</script>

<div class="@container/main">
  <div
    onclick={() => navigateToResource(entity)}
    onkeydown={(e) => handleRowKeyDown(e, entity)}
    tabindex="0"
    role="button"
    data-entity-index={index}
    class="focus:outline:none grid cursor-pointer grid-cols-[minmax(300px,40%)_1fr_100px] items-center gap-4
         rounded-lg bg-base-100 p-2 caret-transparent shadow-sm transition-shadow hover:shadow-md focus:ring-2 focus:ring-offset-2
         focus:ring-offset-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-secondary
        @[50rem]/main:grid-cols-[minmax(300px,35%)_1fr_100px]
        @[62rem]/main:grid-cols-[minmax(320px,32%)_1fr_130px]
        @[74rem]/main:grid-cols-[minmax(360px,30%)_1fr_140px]
        @[86rem]/main:grid-cols-[minmax(380px,28%)_1fr_150px]
        @[98rem]/main:grid-cols-[minmax(420px,25%)_1fr_160px]"
    class:ring-2={isSelected}
    class:ring-primary={isSelected}
    class:ring-offset-2={isSelected}>
    <!-- Left Section: Image + Title/Address -->
    <div class="flex items-center gap-4">
      <div
        class="relative h-16 w-16 flex-shrink-0 cursor-pointer"
        onclick={(e) => {
          if (entity.image)
            handleThumbnailClick(e, entity.image as ImageDBBasic, entity);
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (entity.image)
              handleThumbnailClick(e, entity.image as ImageDBBasic, entity);
          }
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
          text={getI18n(
            entity,
            'title',
            appCtx.getUserPreferences(),
            m.deft_dry_chipmunk_blink()
          )}
          textClass="font-medium text-base-content"
          separator="⸱"
          padding={32} />
        <div
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            goto(`/admin/features/${entity.id}#address`);
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              goto(`/admin/features/${entity.id}#address`);
            }
          }}
          role="button"
          class="cursor-pointer hover:text-primary">
          <ScrollableText
            text={entity.i18n?.[locale]?.displayAddress || 'No address'}
            textClass="text-sm text-base-content/60 hover:text-primary"
            separator="⚲"
            padding={24} />
        </div>
      </div>
    </div>

    <!-- Middle Section: All Stats Centered -->
    <div
      class="pointer-events-none flex items-center justify-center gap-8 @[62rem]/main:gap-8 @[74rem]/main:gap-9 @[86rem]/main:gap-10 @[98rem]/main:gap-12 @[120rem]/main:gap-20">
      <style>
      .tooltip,
      [data-tip] {
        pointer-events: auto;
      }
      </style>
      <!-- Grapheme -->
      <div class="flex flex-col items-center justify-center gap-1">
        <small class="text-xs text-base-content/60">{m.feature__graphemes()}</small>
        <div class="tooltip" data-tip={grapheme}>
          <p
            class="w-[80px] truncate text-sm text-base-content @[62rem]/main:w-[120px] @[74rem]/main:w-[160px] @[86rem]/main:w-[200px]">
            {grapheme || '-'}
          </p>
        </div>
      </div>

      <!-- Status Stats -->
      <StatusStats feature={entity} appCtx={adminCtx.appCtx} />

      <!-- Translation Stats -->
      <div class="hidden @[50rem]/main:block">
        <TranslationStats feature={entity} appCtx={adminCtx.appCtx} />
      </div>

      <!-- Content Stats -->
      <div class="hidden @[50rem]/main:block">
        <ContentStats feature={entity} appCtx={adminCtx.appCtx} />
      </div>

      <!-- Image Stats -->
      <div class="hidden @[62rem]/main:block">
        <ImageStats feature={entity} appCtx={adminCtx.appCtx} />
      </div>

      <!-- Category Stats -->
      <div class="hidden @[78rem]/main:block">
        <CategoryStats feature={entity} appCtx={adminCtx.appCtx} />
      </div>

      <!-- Specifier Stats -->
      <div class="hidden @[84rem]/main:block">
        <SpecifierStats feature={entity} appCtx={adminCtx.appCtx} />
      </div>
    </div>

    <!-- Status Badge -->
    <div class="flex items-center justify-end px-3">
      <span
        class="badge rounded-lg bg-base-200 px-3 py-3 text-xs uppercase"
        class:text-orange-500={entity.isPendingReview}
        class:text-ok={entity.isPublished}
        class:text-error={!entity.isPublished && !entity.isPendingReview}>
        {entity.isPendingReview
          ? m.tangy_zany_capybara_arise()
          : entity.isPublished
            ? m.yummy_ornate_snail_bend()
            : m.weak_super_guppy_nail()}
      </span>
    </div>
  </div>
</div>
