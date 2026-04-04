<script lang="ts">
// ICONS
import { Icon } from '$lib/bits'
import ScrollableText from '$lib/bits/custom/text/ScrollableText.svelte'
import Check from 'virtual:icons/lucide/check'
import PencilSquare from 'virtual:icons/lucide/square-pen'
import Star from 'virtual:icons/lucide/star'
// SERVICES
import {
  getFeatureCardEditableProperties,
  updateNewFeatureProperty,
} from '$lib/client/services/property'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getCardCtx } from '$lib/context/card.svelte'
// I18N
import { getI18n, m } from '$lib/i18n'
// TYPES
import type {
  Feature,
  FeatureProperty,
  UserContributedFeature,
} from '$lib/db/zod/schema/feature.types'
import type { LayerPropertyAdminProfile } from '$lib/db/zod/schema/layer.types'
import type { Id } from '$lib/types'

let titleInput = $state<HTMLInputElement | undefined>()

let {
  feature,
  expanded = false,
  showDescriptionToggle = false,
  onToggleDescription,
}: {
  feature: Feature | UserContributedFeature
  expanded?: boolean
  showDescriptionToggle?: boolean
  onToggleDescription?: (expanded: boolean) => void
} = $props()

const appCtx = getAppCtx()
const cardCtx = getCardCtx()
const userPreferences = $derived(appCtx.getUserPreferences())

const gradePropertyId: Id = $derived(
  appCtx.cache.layer
    .get(feature.layerId)
    ?.properties?.find((property: LayerPropertyAdminProfile) => {
      const resolved = appCtx.cache.property.get(property.propertyId)
      return resolved?.key === 'grade'
    })?.propertyId as Id,
)
const grade = $derived(
  (feature.properties as FeatureProperty[])?.find(
    property => property.propertyId === gradePropertyId,
  )?.value || '',
)
const hasGradeProperty = $derived(
  feature?.layerId
    ? getFeatureCardEditableProperties(appCtx, feature.layerId, true).length > 0
    : false,
)

let isEditing = $state(false)
let title = $derived(
  getI18n(
    feature as Feature,
    'title',
    userPreferences,
    m.empty_lofty_meerkat_support(),
  ),
)
let originalTitle = $state('')

/**
 * Enters title edit mode for new-feature flows.
 *
 * @param event Trigger event.
 */
function handleEditMode(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  originalTitle = title

  if (title === m.empty_lofty_meerkat_support()) {
    title = ''
  }

  isEditing = true
  setTimeout(() => titleInput?.focus(), 0)
}

/**
 * Saves the edited title back into the new-feature draft.
 */
function handleTitleSubmit(): void {
  if (!title.trim()) return

  isEditing = false

  if (cardCtx.isNewMode) {
    appCtx.updateNewFeatureValueI18n('title', title)
  }
}

/**
 * Restores the last non-editing title value.
 */
function handleTitleCancel(): void {
  title = originalTitle
  isEditing = false
}

/**
 * Updates the draft grade rating for new features.
 *
 * @param newGrade Grade value from 1-5.
 */
function handleGradeSelect(newGrade: number): void {
  updateNewFeatureProperty(appCtx, gradePropertyId, {
    propertyId: gradePropertyId,
    value: newGrade.toString(),
  })
}

/**
 * Toggles the content description between collapsed and expanded states.
 *
 * @param event Trigger event.
 */
function handleDescriptionToggle(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  onToggleDescription?.(!expanded)
}
</script>

<div
  class="pointer-events-auto flex min-h-0 shrink-0 items-start justify-between bg-black px-(--feature-card-breadcrumbs-padding) pb-[2px]"
>
  {#if cardCtx.isNewMode}
    {#if isEditing}
      <div class="flex w-full items-center gap-2">
        <input
          type="text"
          class="input input-bordered w-full bg-black caret-white focus:outline-none"
          bind:value={title}
          bind:this={titleInput}
          placeholder={m.fluffy_wide_ladybug_file()}
          onkeydown={event => {
            event.stopPropagation()
            if (event.key === 'Enter') handleTitleSubmit()
            else if (event.key === 'Escape') handleTitleCancel()
            else if (event.key === 'Tab') handleTitleSubmit()
          }}
          onblur={handleTitleSubmit}
        >
        <button
          type="button"
          class="btn btn-ghost btn-sm rounded-none rounded-l-lg px-3 py-1 hover:bg-base-300 active:scale-100 active:bg-base-200"
          onclick={handleTitleSubmit}
          disabled={!title.trim()}
        >
          <Icon src={Check} class="h-5 w-5" />
        </button>
      </div>
    {:else}
      <div class="flex h-12 w-full items-center gap-2" onclick={handleEditMode}>
        <h2
          class="w-full overflow-visible text-lg text-white"
          class:text-gray-500={!title.trim()}
          class:font-bold={!title.trim()}
        >
          {title || m.empty_lofty_meerkat_support()}
        </h2>
        <button
          type="button"
          class="btn btn-ghost btn-sm rounded-none rounded-l-lg px-3 py-1 hover:bg-base-300 active:scale-100 active:bg-base-200"
        >
          <Icon src={PencilSquare} class="h-5 w-5" />
        </button>
      </div>
    {/if}
  {:else}
    <ScrollableText
      text={getI18n(feature as Feature, 'title', userPreferences)}
      padding={16}
      class="block h-full min-w-0 flex-1"
      containerClass="block w-full"
      textClass="text-lg text-white"
    />
  {/if}

  <div class="m-0 flex items-start gap-3 caret-transparent">
    {#if expanded && showDescriptionToggle}
      <div class="flex h-6 shrink-0 items-start justify-end">
        <div class="sticky top-0 z-40 self-start">
          <button
            type="button"
            class="inline-flex h-6 items-start justify-end whitespace-nowrap bg-black pl-3 pr-0 pt-0 font-mono text-right text-xs uppercase tracking-[0.18em] text-primary transition-opacity hover:opacity-80"
            onclick={handleDescriptionToggle}
          >
            {m.common__read_less()}
          </button>
        </div>
      </div>
    {/if}

    {#if cardCtx.isNewMode && hasGradeProperty}
      <div class="mt-1 flex gap-1">
        {#each Array(5) as _, index}
          <button
            type="button"
            class="group btn btn-ghost btn-sm p-1 focus:text-primary focus:outline-none"
            onclick={() => handleGradeSelect(index + 1)}
          >
            <Icon
              src={Star}
              class={`h-6 w-6 group-hover:text-primary group-focus:text-primary ${Number(
                grade,
              ) > index
                ? 'text-primary'
                : 'text-neutral-content'}`}
              theme="solid"
            />
          </button>
        {/each}
      </div>
    {:else if !cardCtx.isNewMode && grade}
      <Icon src={Star} class="h-6 w-6" filled />
      <span>{grade}/5</span>
    {/if}
  </div>
</div>
