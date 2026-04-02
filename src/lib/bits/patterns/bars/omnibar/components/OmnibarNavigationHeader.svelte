<script lang="ts">
// BITS
import { Icon, ScrollableText } from '$lib/bits'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import type { Feature } from '$lib/db/zod/schema/feature.types'
// I18N
import { getI18n, m } from '$lib/i18n'
// ICONS
import XCircle from 'virtual:icons/lucide/circle-x'
import QueueList from 'virtual:icons/lucide/panel-top-bottom-dashed'
// TYPES
import type { Locale, LocaleKey } from '$lib/types'

const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

const collectionTitle = $derived(
  omniCtx.isFeatureMode
    ? (() => {
        const feature = appCtx.getActiveFeature()
        return feature
          ? getI18n(feature, 'displayAddress', {
              ...appCtx.getUserPreferences(),
              allowMachineTranslation: true,
            })
          : ''
      })()
    : (() => {
        const collection = appCtx.getActiveCollection()
        return collection
          ? getI18n(
              collection.i18n as Record<Locale | LocaleKey, { name: string }>,
              'name',
              appCtx.getUserPreferences(),
              m.place(),
            )
          : ''
      })(),
)
const featureTitle = $derived(
  (() => {
    const activeFeature = appCtx.getActiveFeature()
    return getI18n(
      activeFeature ?? undefined,
      'title',
      appCtx.getUserPreferences(),
      m.deft_dry_chipmunk_blink(),
    )
  })(),
)
const newFeatureTitle = $derived(
  getI18n(
    appCtx.getNewFeature() as Feature,
    'title',
    appCtx.getUserPreferences(),
    m.red_arable_herring_trust(),
  ),
)
const collectionMode = $derived(omniCtx.state.mode)
const isNotFeatureMode = $derived(collectionMode !== 'feature')
const isNewFeatureMode = $derived(collectionMode === 'new-feature')
const collectionIndex = $derived(omniCtx.navIndex + 1)
const collectionSize = $derived(appCtx.getActiveCollection()?.items.length)
const fullCollectionText = $derived(
  isNewFeatureMode
    ? m.smart_crazy_cuckoo_play()
    : isNotFeatureMode
      ? `${collectionTitle} (${collectionIndex} of ${collectionSize})`
      : collectionTitle,
)

function handleTitleClick(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  omniCtx.closeTray()
  omniCtx.toggleCard()
}

function handleToggleTray(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  omniCtx.toggleTray(event)
}

function handleClose(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  omniCtx.close()
}
</script>

<div
  class="flex w-full select-none justify-between gap-1 overflow-hidden py-0 transition-[height] {isNotFeatureMode &&
  !isNewFeatureMode
    ? 'px-0'
    : 'px-6'}"
>
  <div
    class="min-w-0 flex-1 overflow-hidden transition-[height]"
    onclick={handleTitleClick}
  >
    <div class="flex items-start gap-3">
      {#if isNotFeatureMode && !isNewFeatureMode}
        <button
          type="button"
          class="btn btn-ghost btn-sm m-0 h-auto p-0 pt-2 hover:bg-transparent hover:text-base-content/80 focus:outline-none"
          onclick={handleToggleTray}
        >
          <Icon src={QueueList} class="h-6 w-6 stroke-2" />
        </button>
      {/if}
      <div
        class="flex min-w-0 flex-1 -translate-y-0.5 flex-col overflow-hidden transition-[height] duration-300"
      >
        <ScrollableText
          text={fullCollectionText}
          containerClass="h-5.5"
          textClass="text-xs text-base-content/60"
          separator="•"
          padding={20}
        />
        <ScrollableText
          text={isNewFeatureMode ? newFeatureTitle : featureTitle}
          containerClass="h-6"
          textClass="font-medium"
          separator="•"
          padding={20}
        />
      </div>
    </div>
  </div>

  <button
    type="button"
    class="btn btn-ghost btn-sm m-0 h-auto flex-none p-0 hover:bg-transparent hover:text-base-content/80"
    onclick={handleClose}
  >
    <Icon
      src={XCircle}
      size="xl"
      class="transition-transform duration-300 {omniCtx.state.isCardOpen
        ? 'rotate-90'
        : 'rotate-0'}"
    />
  </button>
</div>
