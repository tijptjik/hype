<script lang="ts">
// I18N
import { m } from '$lib/i18n'
import { getI18n } from '$lib/i18n'
// UTILS
import { formatDate } from '$lib'
import { formatDistanceToNow } from 'date-fns'
// COMPONENTS
import ResourceTitleBlock from '$lib/components/resources/common/ResourceTitleBlock.svelte'
import ResourceStatusBadgeTask from '$lib/components/resources/common/variants/ResourceStatusBadgeTask.svelte'
import RowRoot from '$lib/components/resources/common/RowRoot.svelte'
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import { ChevronRight } from '@steeze-ui/heroicons'
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { Task, ImageDBBasic } from '$lib/types'
import type { AdminCtx } from '$lib/context/admin.svelte'

let {
  adminCtx,
  entity,
  index,
  onImageClick,
  isSelected = false,
}: {
  adminCtx: AdminCtx
  entity: Task
  index: number
  onImageClick?: (image: ImageDBBasic, task: Task) => void
  isSelected?: boolean
} = $props()

const appCtx = adminCtx.appCtx

function handleRowKeyDown(event: KeyboardEvent) {
  if (isSelected || !entity?.id) return
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    navigateOnAdmin(adminCtx, FirstClassResource.task, entity.id)
  } else if (event.key === ' ' || event.key === 'Space') {
    event.preventDefault()
    event.stopPropagation()
    if (entity.images?.[0]?.image && onImageClick) {
      onImageClick(entity.images[0].image as ImageDBBasic, entity)
    }
  }
}

function handleImageClick(image: ImageDBBasic) {
  if (onImageClick) onImageClick(image, entity)
}

function handleTitleClick() {
  if (!entity?.id) return
  navigateOnAdmin(adminCtx, FirstClassResource.task, entity.id)
}

const type = $derived(entity?.type)
const typeDisplay = $derived(
  type
    ? {
        reportedMissing: m.filters__missing(),
        newPhoto: m.aware_sea_goose_nail(),
        newFeature: m.smart_crazy_cuckoo_play(),
      }[type]
    : 'Undefined',
)
let colorSuffix = $derived(
  type
    ? {
        reportedMissing: 'error',
        newPhoto: 'info',
        newFeature: 'ok',
      }[type]
    : 'base',
)
const reviewAction = $derived(entity?.reviewAction)
const reviewActionDisplay = $derived(
  reviewAction
    ? {
        ignored: 'Ignored',
        'set-unpublished': 'Unpublished',
        'set-intangible': 'Set Intangible',
        'set-archived': 'Archived',
        'added-all-photos': '+ Photos',
        'added-all-photos-with-intent': '+ Some Photos',
        'added-feature': '+ Feature',
      }[reviewAction]
    : '',
)

let gridColsClass =
  'gridColsClass="grid-cols-[minmax(300px,40%)_1fr_1fr_120px] @[50rem]/main:grid-cols-[minmax(300px,35%)_1fr_1fr_120px] @[62rem]/main:grid-cols-[minmax(320px,32%)_1fr_1fr_120px] @[76rem]/main:grid-cols-[minmax(360px,30%)_1fr_1fr_120px] @[86rem]/main:grid-cols-[minmax(380px,28%)_1fr_1fr_120px] @[98rem]/main:grid-cols-[minmax(420px,25%)_1fr_1fr_120px]'
</script>

<div class="select-none @container/main">
  <RowRoot
    onclick={handleTitleClick}
    onkeydown={handleRowKeyDown}
    {index}
    {isSelected}
    {gridColsClass}
  >
    <!-- Left Section: Image + Title/Address -->
    {#if entity.feature}
      <ResourceTitleBlock
        image={entity.images?.[0]?.image}
        alt={`Task image for feature ${entity?.feature?.id || 'unknown'}`}
        onImageClick={entity.images?.[0]?.image ? handleImageClick : undefined}
        title={getI18n(
          entity.feature as Record<'i18n', any>,
          'title',
          appCtx.getUserPreferences()
        )}
        onTitleClick={handleTitleClick}
        description={getI18n(
          entity.feature as Record<'i18n', any>,
          'displayAddress',
          appCtx.getUserPreferences()
        )}
      />
    {/if}

    <!-- Middle Section: All Stats Centered -->
    <div
      class="tilt-neon-watermark absolute -top-[0px] left-[18%] flex h-full flex-shrink-0 items-center justify-center gap-1 text-[375%] uppercase opacity-10 text-{colorSuffix} -rotate-12 font-[weight-700] font-extrabold"
    >
      <div class="tooltip" data-tip={entity?.message || ''}>
        <span class="text-center">{typeDisplay}</span>
      </div>
    </div>
    <div
      class="tilt-neon-watermark justify-left flex h-full flex-shrink-0 items-center gap-1 whitespace-nowrap text-[175%] uppercase opacity-100 text-{colorSuffix}"
    >
      {#if reviewAction}
        <span class="flex items-center gap-2">
          <Icon src={ChevronRight} class="h-4 w-4 stroke-[4]" />
          {reviewActionDisplay}
        </span>
      {/if}
    </div>
    <div class="hidden items-center justify-center gap-0 @[50rem]/main:flex">
      <div class="hidden flex-col items-center justify-center gap-1 @[62rem]/main:flex">
        <small class="text-xs uppercase text-base-content/60">
          {m.close_muddy_trout_clap()}</small
        >
        <div
          class="tooltip"
          data-tip={entity?.createdAt ? formatDate(entity.createdAt) : ''}
        >
          <p
            class="w-[100px] truncate text-sm text-base-content @[62rem]/main:w-[160px] @[74rem]/main:w-[160px] @[86rem]/main:w-[200px]"
          >
            {entity?.createdAt
              ? formatDistanceToNow(new Date(entity.createdAt), { addSuffix: true })
              : '-'}
          </p>
        </div>
      </div>
      <div class="hidden flex-col items-center justify-center gap-1 @[32rem]/main:flex">
        <small class="text-xs uppercase text-base-content/60"
          >{m.profile__role_type__contributor()}</small
        >
        <div class="tooltip" data-tip={entity.contributor?.attribution}>
          <p
            class="w-[120px] truncate text-sm text-base-content @[62rem]/main:w-[160px] @[74rem]/main:w-[160px] @[86rem]/main:w-[200px]"
          >
            {entity.contributor?.name || '-'}
          </p>
        </div>
      </div>
      <div class="hidden flex-col items-center justify-center gap-1 @[79rem]/main:flex">
        <small class="text-xs uppercase text-base-content/60"
          >{m.stock_active_kestrel_offer()}</small
        >
        <div class="tooltip" data-tip={entity.reviewer?.attribution}>
          <p
            class="w-[80px] truncate text-sm text-base-content @[79rem]/main:w-[160px] @[86rem]/main:w-[200px]"
          >
            {entity.reviewer?.name || '-'}
          </p>
        </div>
      </div>
    </div>

    <!-- Status Badge -->
    <div class="flex flex-shrink-0 items-center justify-end px-3">
      <ResourceStatusBadgeTask {entity} />
    </div>
  </RowRoot>
</div>

<style>
.tilt-neon-watermark {
  font-family: "Tilt Neon", sans-serif;
  font-optical-sizing: auto;
  font-weight: 400;
  font-style: normal;
  font-variation-settings:
    "XROT" 0,
    "YROT" 0;
}
</style>
