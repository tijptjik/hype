<script lang="ts">
// BITS
import { Icon, ScrollableText } from '$lib/bits'
// ICONS
import XCircle from 'virtual:icons/lucide/circle-x'
import QueueList from 'virtual:icons/lucide/panel-top-bottom-dashed'
// TYPES
import type { OmnibarNavigationHeaderProps } from './omnibarPrimitives.types'

let {
  collectionMetaText,
  featureTitle,
  hasElevatedChrome,
  isCardOpen,
  showCollectionSwitcher,
  onToggleTray,
  onToggleCard,
  onClose,
}: OmnibarNavigationHeaderProps = $props()

function handleTitleClick(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  onToggleCard()
}

function handleToggleTrayClick(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  onToggleTray()
}

function handleCloseClick(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  onClose()
}
</script>

<div
  class="flex w-full select-none justify-between gap-1 overflow-hidden py-0 transition-[height] {showCollectionSwitcher
    ? 'px-0'
    : hasElevatedChrome
      ? 'pl-8 pr-6'
      : 'px-6'}"
>
  <div
    class="min-w-0 flex-1 overflow-hidden transition-[height]"
    onclick={handleTitleClick}
  >
    <div class="flex items-start gap-3">
      {#if showCollectionSwitcher}
        <button
          type="button"
          class="btn btn-ghost btn-sm m-0 h-auto p-0 pt-2 hover:bg-transparent hover:text-base-content/80 focus:outline-none"
          onclick={handleToggleTrayClick}
        >
          <Icon src={QueueList} class="h-6 w-6 stroke-2" />
        </button>
      {/if}
      <div
        class="flex min-w-0 flex-1 -translate-y-0.5 flex-col overflow-hidden transition-[height] duration-300"
      >
        <ScrollableText
          text={collectionMetaText}
          containerClass="h-5.5"
          textClass="text-xs text-base-content/60"
          separator="•"
          padding={20}
        />
        <ScrollableText
          text={featureTitle}
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
    onclick={handleCloseClick}
  >
    <Icon
      src={XCircle}
      size="xl"
      class="transition-transform duration-300 {isCardOpen
        ? 'rotate-90'
        : 'rotate-0'}"
    />
  </button>
</div>
