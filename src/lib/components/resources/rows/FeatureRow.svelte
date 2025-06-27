<script lang="ts">
// I18N
import { m } from '$lib/i18n';
import { getI18n } from '$lib/i18n';
// SERVICES
import { navigateOnAdmin } from '$lib/navigation';
// COMPONENTS
import ResourceTitleBlock from '$lib/components/resources/common/ResourceTitleBlock.svelte';
import ResourceRowStats from '$lib/components/resources/common/ResourceRowStats.svelte';
import ResourceStatusBadge from '$lib/components/resources/common/ResourceStatusBadge.svelte';
import RowRoot from '$lib/components/resources/common/RowRoot.svelte';
// I18N
import { getLocale } from '$lib/i18n';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { Feature, ImageDBBasic } from '$lib/types';
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

function handleRowKeyDown(event: KeyboardEvent) {
  if (isSelected) return;

  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    navigateOnAdmin(adminCtx, FirstClassResource.feature, entity.id);
  } else if (event.key === ' ' || event.key === 'Space') {
    event.preventDefault();
    event.stopPropagation();
    if (entity.image && onImageClick) {
      onImageClick(entity.image as ImageDBBasic, entity);
    }
  }
}

function handleImageClick(image: ImageDBBasic) {
  if (onImageClick) onImageClick(image, entity);
}

function handleTitleClick() {
  navigateOnAdmin(adminCtx, FirstClassResource.feature, entity.id);
}

function handleDescriptionClick() {
  navigateOnAdmin(adminCtx, FirstClassResource.feature, entity.id, 'address');
}

let gridColsClass =
  'grid-cols-[minmax(300px,40%)_1fr_100px] @[50rem]/main:grid-cols-[minmax(300px,35%)_1fr_100px] @[62rem]/main:grid-cols-[minmax(320px,32%)_1fr_130px] @[74rem]/main:grid-cols-[minmax(360px,30%)_1fr_140px] @[86rem]/main:grid-cols-[minmax(380px,28%)_1fr_150px] @[98rem]/main:grid-cols-[minmax(420px,25%)_1fr_160px]';
</script>

<div class="@container/main">
  <RowRoot
    onclick={handleTitleClick}
    onkeydown={handleRowKeyDown}
    {index}
    {isSelected}
    {gridColsClass}>
    <!-- Left Section: Image + Title/Address -->
    <ResourceTitleBlock
      image={entity.image}
      alt={(entity.image as any)?.altText ?? 'Feature image'}
      onImageClick={entity.image ? handleImageClick : undefined}
      title={getI18n(
        entity as Record<'i18n', any>,
        'title',
        appCtx.getUserPreferences(),
        m.deft_dry_chipmunk_blink()
      )}
      onTitleClick={handleTitleClick}
      description={entity.i18n?.[locale]?.displayAddress || 'No address'}
      onDescriptionClick={handleDescriptionClick} />

    <!-- Middle Section: All Stats Centered -->
    <ResourceRowStats feature={entity} {appCtx} {grapheme} />

    <!-- Status Badge -->
    <div class="flex items-center justify-end px-3">
      <ResourceStatusBadge
        isPublished={entity.isPublished}
        isPendingReview={entity.isPendingReview} />
    </div>
  </RowRoot>
</div>
