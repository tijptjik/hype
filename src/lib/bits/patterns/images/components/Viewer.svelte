<script lang="ts">
import { onDestroy, tick } from 'svelte'
import { cx } from '$lib/bits/utils'
import { m } from '$lib/i18n'
import ViewerEmpty from './ViewerEmpty.svelte'
import ViewerFullScreen from './ViewerFullScreen.svelte'
import ViewerNav from './ViewerNav.svelte'
import ViewerStage from './ViewerStage.svelte'
import type { ViewerProps, ViewerRenderable } from '../images.types'

type StartViewTransitionCapableDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => {
    finished: Promise<void>
  }
}

let {
  items,
  activeId = $bindable<string | null>(null),
  retainedItem = null,
  isFullscreen = $bindable(false),
  fullscreenRequestKey = 0,
  fit = 'fit',
  viewerFit = fit,
  wrapNavigation = true,
  showNavButtons = true,
  railPadding = 6,
  leftRail,
  centerRail,
  rightRail,
  emptyState,
  centerAction = 'none',
  centerActionLabel,
  onCenterAction,
  onActiveIdChange,
  onNavigateToItem,
  onCurrentItemLoad,
}: ViewerProps = $props()

const EMPTY_STATE_CLEAR_DELAY_MS = 320
const SWIPE_MIN_DISTANCE_PX = 48
const SWIPE_MAX_DURATION_MS = 360
const RAIL_PADDING_CLASSES = [
  'p-0',
  'p-1',
  'p-2',
  'p-3',
  'p-4',
  'p-5',
  'p-6',
  'p-7',
  'p-8',
] as const

const activeIndex = $derived.by(() => {
  if (!items.length) return -1
  if (!activeId) return -1
  return items.findIndex(item => item.id === activeId)
})
const resolvedActiveIndex = $derived.by(() => {
  if (!items.length) return -1
  if (activeIndex >= 0) return activeIndex
  return 0
})
const resolvedActiveId = $derived.by(() => {
  if (resolvedActiveIndex < 0) return null
  return items[resolvedActiveIndex]?.id ?? null
})

const rawCurrentItem = $derived.by(() => {
  if (!items.length) return null
  if (resolvedActiveIndex < 0) return null
  return items[resolvedActiveIndex] ?? null
})
let currentItem = $state<ViewerRenderable | null>(null)
let lastHandledFullscreenRequestKey = $state<number | null>(null)
let emptyStateTimer: ReturnType<typeof setTimeout> | null = null
let touchStartX = 0
let touchStartY = 0
let touchStartAt = 0
const isFirefox = $derived.by(() => {
  if (typeof navigator === 'undefined') return false
  return navigator.userAgent.includes('Firefox/')
})

const canWrapNavigation = $derived(wrapNavigation && items.length > 1)
const canGoPrev = $derived(
  items.length > 1 && (canWrapNavigation || resolvedActiveIndex > 0),
)
const canGoNext = $derived(
  items.length > 1 && (canWrapNavigation || resolvedActiveIndex < items.length - 1),
)
const hasCenterAction = $derived(
  centerAction === 'fullscreen' ||
    (centerAction === 'custom' && Boolean(onCenterAction)),
)
const effectiveCenterActionLabel = $derived.by(() => {
  if (centerActionLabel) return centerActionLabel
  if (centerAction === 'fullscreen') {
    return isFullscreen
      ? m.gallery__fullscreen_exit_viewer()
      : m.gallery__fullscreen_view_image()
  }
  if (centerAction === 'custom') {
    return m.gallery__activate_image_action()
  }
  return m.gallery__image_action_unavailable()
})
const inlineViewTransitionName = $derived(
  currentItem && !isFullscreen && !isFirefox
    ? `gallery-viewer-image-${currentItem.id}`
    : undefined,
)
const fullscreenViewTransitionName = $derived(
  currentItem && isFullscreen && !isFirefox
    ? `gallery-viewer-image-${currentItem.id}`
    : undefined,
)
const currentSceneActiveId = $derived(currentItem?.id ?? resolvedActiveId)
const railPaddingClass = $derived.by(() => {
  const normalizedRailPadding = Math.min(
    RAIL_PADDING_CLASSES.length - 1,
    Math.max(0, Math.round(railPadding)),
  )
  return RAIL_PADDING_CLASSES[normalizedRailPadding] ?? 'p-6'
})

function shouldReuseCurrentItem(
  previous: ViewerRenderable | null,
  next: ViewerRenderable | null,
): boolean {
  if (!previous || !next) return false

  return (
    previous.id === next.id &&
    previous.renderKey === next.renderKey &&
    previous.src === next.src &&
    previous.sourceFallbackSrc === next.sourceFallbackSrc &&
    previous.blurSrc === next.blurSrc &&
    previous.thumbnailSrc === next.thumbnailSrc &&
    previous.rotationDegrees === next.rotationDegrees &&
    previous.animateRotation === next.animateRotation &&
    previous.meta?.forceSourceTransition === next.meta?.forceSourceTransition
  )
}

function clearEmptyStateTimer(): void {
  if (!emptyStateTimer) return

  clearTimeout(emptyStateTimer)
  emptyStateTimer = null
}

$effect(() => {
  if (!currentItem && retainedItem) {
    currentItem = retainedItem
  }
})

$effect(() => {
  const nextItem = rawCurrentItem

  if (nextItem) {
    clearEmptyStateTimer()

    if (shouldReuseCurrentItem(currentItem, nextItem)) {
      return
    }

    currentItem = nextItem
    return
  }

  clearEmptyStateTimer()

  if (!currentItem) {
    isFullscreen = false
    return
  }

  // Keep the previous resource image alive briefly so a newly loaded item from
  // the next resource can reuse the existing stage crossfade instead of
  // dropping straight to empty.
  emptyStateTimer = setTimeout(() => {
    currentItem = null
    isFullscreen = false
    emptyStateTimer = null
  }, EMPTY_STATE_CLEAR_DELAY_MS)
})

$effect(() => {
  if (lastHandledFullscreenRequestKey == null) {
    lastHandledFullscreenRequestKey = fullscreenRequestKey
    return
  }

  if (fullscreenRequestKey === lastHandledFullscreenRequestKey) return

  lastHandledFullscreenRequestKey = fullscreenRequestKey
  void toggleFullscreen()
})

async function runViewTransition(update: () => void | Promise<void>): Promise<void> {
  if (typeof document === 'undefined') {
    await update()
    return
  }

  const transitionDocument = document as StartViewTransitionCapableDocument

  if (isFirefox || typeof transitionDocument.startViewTransition !== 'function') {
    await update()
    await tick()
    return
  }

  const transition = transitionDocument.startViewTransition(async () => {
    await update()
    await tick()
  })

  try {
    await transition.finished
  } catch {
    // Ignore aborted transitions and keep the latest viewer state.
  }
}

function moveToIndex(nextIndex: number): void {
  if (items.length === 0) return

  const resolvedNextIndex = canWrapNavigation
    ? ((nextIndex % items.length) + items.length) % items.length
    : nextIndex

  if (resolvedNextIndex < 0 || resolvedNextIndex >= items.length) return

  const nextItem = items[resolvedNextIndex]

  if (!nextItem || nextItem.id === currentItem?.id) return

  onActiveIdChange?.(nextItem.id)
  onNavigateToItem?.(nextItem.id)
}

function handleSwipeDirection(direction: 'left' | 'right'): void {
  if (items.length <= 1) return

  if (direction === 'left') {
    moveToIndex(resolvedActiveIndex + 1)
    return
  }

  if (direction === 'right') {
    moveToIndex(resolvedActiveIndex - 1)
  }
}

function handleTouchStart(event: TouchEvent): void {
  const touch = event.touches[0]

  if (!touch) return

  touchStartX = touch.clientX
  touchStartY = touch.clientY
  touchStartAt = Date.now()
}

function handleTouchEnd(event: TouchEvent): void {
  const touch = event.changedTouches[0]

  if (!touch || touchStartAt === 0) return

  const deltaX = touch.clientX - touchStartX
  const deltaY = touch.clientY - touchStartY
  const duration = Date.now() - touchStartAt

  touchStartAt = 0

  if (
    duration > SWIPE_MAX_DURATION_MS ||
    Math.abs(deltaX) < SWIPE_MIN_DISTANCE_PX ||
    Math.abs(deltaX) <= Math.abs(deltaY)
  ) {
    return
  }

  handleSwipeDirection(deltaX < 0 ? 'left' : 'right')
}

async function toggleFullscreen(nextState?: boolean): Promise<void> {
  const resolvedNextState = nextState ?? !isFullscreen

  if (!currentItem || resolvedNextState === isFullscreen) return

  await runViewTransition(() => {
    isFullscreen = resolvedNextState
  })
}

async function handleCenterAction(): Promise<void> {
  if (!currentItem || !hasCenterAction) return

  if (centerAction === 'fullscreen') {
    await toggleFullscreen()
    return
  }

  await onCenterAction?.(currentItem)
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (!isFullscreen || event.key !== 'Escape') return

  event.preventDefault()
  void toggleFullscreen(false)
}

onDestroy(() => {
  clearEmptyStateTimer()
})
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="flex h-full w-full min-h-0 flex-col gap-3 select-none">
  {#if currentItem}
    <div
      class="group/viewer relative min-h-0 flex-1 overflow-hidden"
      ontouchstart={handleTouchStart}
      ontouchend={handleTouchEnd}
    >
      <ViewerStage
        {currentItem}
        activeId={currentSceneActiveId}
        fit={viewerFit}
        viewTransitionName={inlineViewTransitionName}
        {onCurrentItemLoad}
      />

      {#if items.length > 1 || hasCenterAction}
        <div
          class="absolute inset-0 z-10 grid grid-cols-4"
          aria-label={m.gallery__viewer_tap_targets()}
        >
          <button
            type="button"
            class={`h-full w-full bg-transparent ${canGoPrev ? 'cursor-w-resize' : 'cursor-default'}`}
            onclick={() => moveToIndex(resolvedActiveIndex - 1)}
            disabled={!canGoPrev}
            aria-label={m.gallery__previous_image()}
          ></button>

          <button
            type="button"
            class={`col-span-2 h-full w-full bg-transparent ${hasCenterAction ? 'cursor-pointer' : 'cursor-default'}`}
            onclick={() => {
              void handleCenterAction()
            }}
            disabled={!hasCenterAction}
            aria-label={effectiveCenterActionLabel}
          ></button>

          <button
            type="button"
            class={`h-full w-full bg-transparent ${canGoNext ? 'cursor-e-resize' : 'cursor-default'}`}
            onclick={() => moveToIndex(resolvedActiveIndex + 1)}
            disabled={!canGoNext}
            aria-label={m.gallery__next_image()}
          ></button>
        </div>
      {/if}

      {#if items.length > 1 && showNavButtons}
        {#key currentItem.id}
          <ViewerNav
            {canGoPrev}
            {canGoNext}
            onPrev={() => moveToIndex(resolvedActiveIndex - 1)}
            onNext={() => moveToIndex(resolvedActiveIndex + 1)}
          />
        {/key}
      {/if}

      {#if leftRail || centerRail || rightRail}
        <div
          class={cx(
            'pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-3 px-8',
            railPaddingClass,
          )}
        >
          <div class="pointer-events-auto flex min-w-0 flex-1 justify-start">
            {#if leftRail}
              {@render leftRail(currentItem)}
            {/if}
          </div>
          <div class="pointer-events-auto flex min-w-0 flex-1 justify-center">
            {#if centerRail}
              {@render centerRail(currentItem)}
            {/if}
          </div>
          <div class="pointer-events-auto flex min-w-0 flex-1 justify-end">
            {#if rightRail}
              {@render rightRail(currentItem)}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    {#if emptyState}
      {@render emptyState()}
    {:else}
      <ViewerEmpty
        title={m.gallery__empty_state_title()}
        description={m.gallery__empty_state_description()}
      />
    {/if}
  {/if}
</div>

{#if currentItem && isFullscreen}
  <ViewerFullScreen
    {currentItem}
    activeId={currentSceneActiveId}
    fit={viewerFit}
    viewTransitionName={fullscreenViewTransitionName}
    {onCurrentItemLoad}
    onDismiss={() => toggleFullscreen(false)}
  />
{/if}
