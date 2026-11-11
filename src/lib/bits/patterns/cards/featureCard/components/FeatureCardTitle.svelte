<script lang="ts">
// TRANSLATION
import { resolveContentField } from '#lib/i18n/automatic.js'
import {
  getAutomaticTranslations,
  getAutomaticFeaturePropertyTranslations,
} from '#lib/api/translation.remote.js'
import { contentRowsToForm } from '#lib/i18n/contentRecords.js'
import AutomaticTranslationIndicator from '#lib/bits/custom/text/AutomaticTranslationIndicator.svelte'
// COMPONENTS
import LocationLifecycleBadge from '#lib/bits/patterns/forms/localLocationAddress/LocationLifecycleBadge.svelte'
// ICONS
import { Icon } from '#lib/bits/index.js'
import ScrollableText from '#lib/bits/custom/text/ScrollableText.svelte'
import Check from 'virtual:icons/proicons/checkmark'
import PencilSquare from 'virtual:icons/proicons/compose'
import Star from 'virtual:icons/proicons/star'
// SERVICES
import {
  getFeatureCardEditableProperties,
  updateNewFeatureProperty,
} from '#lib/client/services/property.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getCardCtx } from '#lib/context/card.svelte.js'
// I18N
import { getI18n, getLocale, m } from '#lib/i18n.js'
// TYPES
import type {
  Feature,
  FeatureProperty,
  UserContributedFeature,
} from '#lib/db/zod/schema/feature.types.js'
import type { LayerPropertyAdminProfile } from '#lib/db/zod/schema/layer.types.js'
import type { Id } from '#lib/types.js'

let titleInput = $state<HTMLInputElement | undefined>()

let {
  feature,
}: {
  feature: Feature | UserContributedFeature
} = $props()

const appCtx = getSurfaceCtx()
const cardCtx = getCardCtx()
const userPreferences = $derived(appCtx.getUserPreferences())
const contentLocale = $derived(userPreferences.contentLocale ?? getLocale())
const titleResolution = $derived(
  resolveContentField(
    feature.i18n ?? {},
    'title',
    contentLocale,
    userPreferences.allowMachineTranslation,
  ),
)
let requestedTranslation = ''
$effect(() => {
  if (
    !userPreferences.allowMachineTranslation ||
    cardCtx.isNewMode ||
    !('id' in feature) ||
    !('modifiedAt' in feature)
  )
    return
  const id = feature.id
  const target = contentLocale
  const revision = appCtx.account.revision
  const modifiedAt = feature.modifiedAt
  const requestKey = `${revision}:${id}:${modifiedAt}:${target}`
  if (requestedTranslation === requestKey) return
  requestedTranslation = requestKey
  void Promise.all([
    getAutomaticTranslations({ resource: 'feature', id, target }),
    getAutomaticFeaturePropertyTranslations({ id, target }).catch(
      () => ({}) as Record<string, Record<string, unknown>>,
    ),
  ])
    .then(([rows, properties]) => {
      if (
        appCtx.account.revision !== revision ||
        contentLocale !== target ||
        !userPreferences.allowMachineTranslation
      )
        return
      const current = appCtx.cache.feature.get(id)
      if (!current || current.modifiedAt !== modifiedAt) return
      const i18n = contentRowsToForm(Object.values(rows) as Array<{ locale: string }>)
      appCtx.cache.feature.set(id, {
        ...current,
        i18n: { ...current.i18n, ...i18n } as typeof current.i18n,
        properties: current.properties.map(property => ({
          ...property,
          i18n: {
            ...property.i18n,
            ...contentRowsToForm(
              Object.values(properties[property.propertyId] ?? {}) as Array<{
                locale: string
              }>,
            ),
          } as typeof property.i18n,
        })),
      })
    })
    .catch(() => {
      /* The published fallback remains visible when generation fails. */
    })
})

const gradePropertyId: Id = $derived(
  appCtx.cache.layer
    .get(feature.layerId)
    ?.properties?.find((property: LayerPropertyAdminProfile) => {
      const resolved = appCtx.cache.property.get(property.propertyId ?? '')
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
    appCtx.draft.updateI18n('title', title)
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
</script>

<div
  class="pointer-events-auto flex min-h-0 shrink-0 items-start justify-between bg-(--theme-panel) px-(--feature-card-breadcrumbs-padding) pb-[2px]"
>
  {#if cardCtx.isNewMode}
    {#if isEditing}
      <div class="flex w-full items-center gap-2">
        <input
          type="text"
          class="input input-bordered caret-base-content w-full bg-(--theme-panel) focus:outline-none"
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
          class="btn btn-ghost btn-sm hover:bg-base-300 active:bg-base-200 rounded-none rounded-l-lg px-3 py-1 active:scale-100"
          onclick={handleTitleSubmit}
          disabled={!title.trim()}
        >
          <Icon src={Check} class="h-5 w-5" />
        </button>
      </div>
    {:else}
      <button
        type="button"
        class="flex h-12 w-full appearance-none items-center gap-2 border-0 bg-transparent p-0 text-left"
        onclick={handleEditMode}
      >
        <span
          class="text-base-content w-full overflow-visible text-lg"
          class:text-muted-foreground={!title.trim()}
          class:font-bold={!title.trim()}
        >
          {title || m.empty_lofty_meerkat_support()}
        </span>
        <span
          class="btn btn-ghost btn-sm hover:bg-base-300 active:bg-base-200 rounded-none rounded-l-lg px-3 py-1 active:scale-100"
        >
          <Icon src={PencilSquare} class="h-5 w-5" />
        </span>
      </button>
    {/if}
  {:else}
    <div class="min-w-0 flex-1 space-y-1">
      <ScrollableText
        text={getI18n(feature as Feature, 'title', userPreferences)}
        padding={16}
        class="block h-full min-w-0 flex-1"
        containerClass="block w-full"
        textClass="text-lg text-base-content"
      />
      <AutomaticTranslationIndicator resolution={titleResolution} />
      <LocationLifecycleBadge
        value={'locationLifecycle' in feature ? feature.locationLifecycle : undefined}
      />
    </div>
  {/if}

  <div class="m-0 flex items-start gap-3 caret-transparent">
    {#if cardCtx.isNewMode && hasGradeProperty}
      <div class="mt-1 flex gap-1">
        {#each Array(5) as _, index}
          <button
            type="button"
            class="group btn btn-ghost btn-sm focus:text-primary p-1 focus:outline-none"
            onclick={() => handleGradeSelect(index + 1)}
          >
            <Icon
              src={Star}
              class={`group-hover:text-primary group-focus:text-primary h-6 w-6 ${
                Number(grade) > index ? 'text-primary' : 'text-neutral-content'
              }`}
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
