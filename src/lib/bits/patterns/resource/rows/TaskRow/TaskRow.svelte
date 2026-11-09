<script lang="ts">
// I18N
import { getI18n, m } from '#lib/i18n.js'
// DOMAIN
import { featureCreationPreview } from '#lib/revisions/featureCreationPreview.js'
import { taskRowImage } from './taskRowImage.js'
// SERVICES
import { getTaskReviewActionLabel } from '#lib/client/services/task.js'
import { locationTaskLabel } from '#lib/locations/tasks.js'
// BITS
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
import { Row } from '#lib/bits/custom/index.js'
import * as TaskRowPrimitive from './components'
// NAVIGATION
import { navigateOnAdmin } from '#lib/navigation/index.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// TYPES
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { TaskRowProps } from './taskRow.types'

let {
  adminCtx,
  entity,
  index,
  onImageClick,
  isSelected = false,
}: TaskRowProps = $props()

let appCtx = $derived(adminCtx.view)
const taskTypeColors = {
  reportedMissing: 'error',
  newPhoto: 'info',
  newFeature: 'ok',
  locationFacts: 'warning',
  locationPosition: 'warning',
  locationIdentity: 'warning',
  locationMerge: 'warning',
} as const
type TaskTypeColorKey = keyof typeof taskTypeColors
const type = $derived(entity?.type as TaskTypeColorKey | undefined)
const typeDisplay = $derived(
  type
    ? {
        reportedMissing: m.filters__missing(),
        newPhoto: m.aware_sea_goose_nail(),
        newFeature: m.smart_crazy_cuckoo_play(),
        locationFacts: locationTaskLabel('locationFacts'),
        locationPosition: locationTaskLabel('locationPosition'),
        locationIdentity: locationTaskLabel('locationIdentity'),
        locationMerge: locationTaskLabel('locationMerge'),
      }[type]
    : 'Undefined',
)
const colorSuffix = $derived<'error' | 'info' | 'ok' | 'base' | 'warning'>(
  type ? (taskTypeColors[type] ?? 'base') : 'base',
)
// Keep source identity visible when the linked Feature has no authored title.
const locationTitle = $derived(
  getI18n(
    Object.fromEntries(
      Object.entries(entity.locationTask?.names ?? {}).map(([locale, title]) => [
        locale,
        { title },
      ]),
    ),
    'title',
    appCtx.getUserPreferences(),
    '',
  ),
)
const preview = $derived(
  entity.creationProposal
    ? featureCreationPreview(entity.creationProposal.content)
    : entity.feature,
)
const title = $derived(
  getI18n(preview ?? undefined, 'title', appCtx.getUserPreferences(), '') ||
    locationTitle ||
    `${m.feature_location_title()} · ${entity.featureId}`,
)
const description = $derived(
  entity.locationTask
    ? locationTaskLabel(entity.type)
    : getI18n(preview ?? undefined, 'displayAddress', appCtx.getUserPreferences(), ''),
)
const reviewAction = $derived(entity?.reviewAction)
const reviewActionDisplay = $derived(getTaskReviewActionLabel(reviewAction))
const thumbnail = $derived(taskRowImage(entity))

function handleRowKeyDown(event: KeyboardEvent): void {
  if (isSelected || !entity?.id) return

  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    navigateOnAdmin(adminCtx, FirstClassResource.task, entity.id)
    return
  }

  if (event.key === ' ' || event.key === 'Space') {
    event.preventDefault()
    event.stopPropagation()
    if (entity.images?.[0] && onImageClick) {
      onImageClick(entity.images[0] as unknown as ImageCtxEnvelope, entity)
    }
  }
}

function handleImageClick(image: ImageCtxEnvelope): void {
  onImageClick?.(image, entity)
}

function handleTitleClick(): void {
  if (!entity?.id) return
  navigateOnAdmin(adminCtx, FirstClassResource.task, entity.id)
}
</script>

{#snippet imageFallback()}
  <LocationIcon
    kind={entity.locationTask?.locationKind}
    class="text-muted-foreground size-8"
  />
{/snippet}

<Row
  {index}
  entityId={entity.id}
  {isSelected}
  class="grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 pr-3 @min-[48rem]:grid-cols-[minmax(0,1fr)_11rem_12rem_8rem]"
  onclick={handleTitleClick}
  onkeydown={handleRowKeyDown}
  image={thumbnail}
  alt={`Task image for feature ${entity?.feature?.id || 'unknown'}`}
  onImageClick={entity.images?.[0]
    ? (handleImageClick as (image: unknown) => void)
    : undefined}
  {title}
  {imageFallback}
  onTitleClick={handleTitleClick}
  {description}
>
  <TaskRowPrimitive.Watermark
    typeDisplay={String(typeDisplay)}
    isMock={Boolean(entity.locationTask?.mock)}
    {colorSuffix}
    message={entity?.message || ''}
    {reviewActionDisplay}
  />

  <TaskRowPrimitive.MetaSection
    createdAt={entity?.createdAt}
    contributorName={entity.locationTask
      ? m.feature_location_title()
      : entity.contributor?.name || '-'}
    contributorAttribution={entity.contributor?.attribution || ''}
    reviewerName={entity.reviewer?.name || '-'}
    reviewerAttribution={entity.reviewer?.attribution || ''}
  />

  <TaskRowPrimitive.StatusSection {entity} />
</Row>
