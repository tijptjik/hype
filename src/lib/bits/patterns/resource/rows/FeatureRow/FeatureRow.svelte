<script lang="ts">
// I18N
import { getI18n, getLocaleKey, m } from '$lib/i18n'
// BITS
import { Row } from '$lib/bits/custom'
import * as FeatureRowPrimitive from './components'
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { FeatureRowProps } from './featureRow.types'

let {
  adminCtx,
  entity,
  index,
  onImageClick,
  isSelected = false,
}: FeatureRowProps = $props()

let appCtx = $derived(adminCtx.appCtx)
const localeKey = $derived(getLocaleKey())
const graphemeProperty = $derived(
  appCtx.cache.property.values().find(property => property.key === 'graphemes'),
)
const grapheme = $derived(
  entity.properties.find(property => property.propertyId === graphemeProperty?.id)
    ?.i18n?.[localeKey]?.value ||
    entity.properties.find(property => property.propertyId === graphemeProperty?.id)
      ?.value ||
    '',
)

function handleRowKeyDown(event: KeyboardEvent): void {
  if (isSelected) return

  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    navigateOnAdmin(adminCtx, FirstClassResource.feature, entity.id)
    return
  }

  if (event.key === ' ' || event.key === 'Space') {
    event.preventDefault()
    event.stopPropagation()
    if (entity.image && onImageClick) {
      onImageClick(entity.image as ImageCtxEnvelope, entity)
    }
  }
}

function handleImageClick(image: ImageCtxEnvelope): void {
  onImageClick?.(image, entity)
}

function handleTitleClick(): void {
  navigateOnAdmin(adminCtx, FirstClassResource.feature, entity.id)
}

function handleDescriptionClick(): void {
  navigateOnAdmin(adminCtx, FirstClassResource.feature, entity.id, 'address')
}
</script>

<Row
  {index}
  {isSelected}
  variant="feature"
  onclick={handleTitleClick}
  onkeydown={handleRowKeyDown}
  image={entity.image}
  alt={(entity.image as { altText?: string } | null)?.altText ?? 'Feature image'}
  onImageClick={entity.image ? (handleImageClick as (image: unknown) => void) : undefined}
  title={getI18n(
    entity as any,
    'title',
    appCtx.getUserPreferences(),
    m.deft_dry_chipmunk_blink(),
  )}
  onTitleClick={handleTitleClick}
  description={entity.i18n?.[localeKey]?.displayAddress || 'No address'}
  onDescriptionClick={handleDescriptionClick}
>
  <FeatureRowPrimitive.StatsSection feature={entity} {appCtx} {grapheme} />
  <FeatureRowPrimitive.StatusSection
    isPublished={entity.isPublished}
    isPendingReview={entity.isPendingReview}
  />
</Row>
