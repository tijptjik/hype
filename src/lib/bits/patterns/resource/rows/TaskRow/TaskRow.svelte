<script lang="ts">
// I18N
import { getI18n, m } from '$lib/i18n'
// BITS
import { Row } from '$lib/bits/custom'
import * as TaskRowPrimitive from './components'
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { TaskRowProps } from './taskRow.types'

let {
  adminCtx,
  entity,
  index,
  onImageClick,
  isSelected = false,
}: TaskRowProps = $props()

let appCtx = $derived(adminCtx.appCtx)
const taskTypeColors = {
  reportedMissing: 'error',
  newPhoto: 'info',
  newFeature: 'ok',
} as const
type TaskTypeColorKey = keyof typeof taskTypeColors
const type = $derived(entity?.type as TaskTypeColorKey | undefined)
const typeDisplay = $derived(
  type
    ? {
        reportedMissing: m.filters__missing(),
        newPhoto: m.aware_sea_goose_nail(),
        newFeature: m.smart_crazy_cuckoo_play(),
      }[type]
    : 'Undefined',
)
const colorSuffix = $derived<'error' | 'info' | 'ok' | 'base'>(
  type ? (taskTypeColors[type] ?? 'base') : 'base',
)
const reviewAction = $derived(entity?.reviewAction)
const reviewActionDisplay = $derived(
  reviewAction
    ? {
        ignored: 'Declined',
        'set-unpublished': 'Unpublished',
        'set-intangible': 'Set Intangible',
        'set-archived': 'Archived',
        'added-all-photos': '+ Photos',
        'added-all-photos-with-intent': '+ Some Photos',
        'added-feature': '+ Feature',
      }[reviewAction]
    : '',
)

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

<Row
  {index}
  entityId={entity.id}
  {isSelected}
  variant="task"
  onclick={handleTitleClick}
  onkeydown={handleRowKeyDown}
  image={entity.feature ? entity.images?.[0] : undefined}
  alt={`Task image for feature ${entity?.feature?.id || 'unknown'}`}
  onImageClick={entity.images?.[0] ? (handleImageClick as (image: unknown) => void) : undefined}
  title={entity.feature
    ? (getI18n(
        entity.feature,
        'title',
        appCtx.getUserPreferences(),
      ) as string)
    : ''}
  onTitleClick={entity.feature ? handleTitleClick : undefined}
  description={entity.feature
    ? (getI18n(
        entity.feature,
        'displayAddress',
        appCtx.getUserPreferences(),
      ) as string)
    : ''}
>
  <TaskRowPrimitive.Watermark
    typeDisplay={String(typeDisplay)}
    {colorSuffix}
    message={entity?.message || ''}
    {reviewActionDisplay}
  />

  <TaskRowPrimitive.MetaSection
    createdAt={entity?.createdAt}
    contributorName={entity.contributor?.name || '-'}
    contributorAttribution={entity.contributor?.attribution || ''}
    reviewerName={entity.reviewer?.name || '-'}
    reviewerAttribution={entity.reviewer?.attribution || ''}
  />

  <TaskRowPrimitive.StatusSection {entity} />
</Row>
