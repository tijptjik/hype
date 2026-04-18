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
  isCardOpeningPending,
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
  class="flex w-full items-center select-none justify-between gap-1 overflow-hidden py-0 transition-[height] {showCollectionSwitcher
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
    class="btn btn-ghost btn-sm omnibar-close-button relative m-0 inline-flex h-10 w-10 flex-none items-center justify-center overflow-visible rounded-full p-0 text-base-content transition-[transform,filter,color] duration-300 hover:bg-transparent hover:text-base-content/80"
    class:omnibar-close-button--pending={isCardOpeningPending}
    onclick={handleCloseClick}
  >
    <Icon
      src={XCircle}
      size="xl"
      class="omnibar-close-button__icon relative z-10 transition-[transform,filter,color] duration-300 {isCardOpen
        ? 'rotate-90'
        : 'rotate-0'}"
    />
  </button>
</div>

<style>
.omnibar-close-button::before,
.omnibar-close-button::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  pointer-events: none;
  opacity: 0;
}

.omnibar-close-button--pending::before {
  background: color-mix(in srgb, currentColor 14%, transparent);
  box-shadow:
    0 0 0 1px color-mix(in srgb, currentColor 18%, transparent),
    0 0 22px color-mix(in srgb, currentColor 14%, transparent);
  animation: omnibar-close-halo 1080ms cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

.omnibar-close-button--pending::after {
  inset: -6px;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  animation: omnibar-close-ring 1080ms cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

.omnibar-close-button--pending :global(.omnibar-close-button__icon) {
  animation: omnibar-close-icon-pulse 1080ms cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

@keyframes omnibar-close-halo {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(1);
  }

  50% {
    opacity: 0.9;
    transform: scale(1.14);
  }
}

@keyframes omnibar-close-ring {
  0% {
    opacity: 0.18;
    transform: scale(0.94);
  }

  60% {
    opacity: 0.42;
    transform: scale(1.22);
  }

  100% {
    opacity: 0;
    transform: scale(1.34);
  }
}

@keyframes omnibar-close-icon-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
    filter: brightness(1);
  }

  50% {
    opacity: 0.92;
    transform: scale(1.2);
    filter: brightness(1.26);
  }
}
</style>
