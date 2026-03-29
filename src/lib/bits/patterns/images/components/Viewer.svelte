<script lang="ts">
import { tick } from 'svelte'
import { m } from '$lib/i18n'
import EmptyState from './EmptyState.svelte'
import FullScreen from './FullScreen.svelte'
import ViewerControls from './ViewerControls.svelte'
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
  isFullscreen = $bindable(false),
  fullscreenRequestKey = 0,
  fit = 'fit',
  viewerFit = fit,
  leftRail,
  centerRail,
  rightRail,
  centerAction = 'none',
  centerActionLabel,
  onCenterAction,
  onActiveIdChange,
  onNavigateToItem,
  onCurrentItemLoad,
}: ViewerProps = $props()

const activeIndex = $derived.by(() => {
  if (!items.length) return -1
  if (!activeId) return -1
  return items.findIndex(item => item.id === activeId)
})

const rawCurrentItem = $derived.by(() => {
  if (!items.length) return null
  if (activeIndex < 0) return null
  return items[activeIndex] ?? null
})
let currentItem = $state<ViewerRenderable | null>(null)
let lastHandledFullscreenRequestKey = $state<number | null>(null)
const isFirefox = $derived.by(() => {
  if (typeof navigator === 'undefined') return false
  return navigator.userAgent.includes('Firefox/')
})

const canGoPrev = $derived(activeIndex > 0)
const canGoNext = $derived(activeIndex >= 0 && activeIndex < items.length - 1)
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

$effect(() => {
  const nextItem = rawCurrentItem

  if (!nextItem) {
    currentItem = null
    isFullscreen = false
    return
  }

  if (shouldReuseCurrentItem(currentItem, nextItem)) {
    return
  }

  currentItem = nextItem
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
  if (nextIndex < 0 || nextIndex >= items.length) return

  const nextItem = items[nextIndex]

  if (!nextItem || nextItem.id === currentItem?.id) return

  onActiveIdChange?.(nextItem.id)
  onNavigateToItem?.(nextItem.id)
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
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="flex h-full w-full min-h-0 flex-col gap-3">
  {#if currentItem}
    <div class="group/viewer relative min-h-0 flex-1 overflow-hidden">
      <ViewerStage
        {currentItem}
        {activeId}
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
            onclick={() => moveToIndex(activeIndex - 1)}
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
            onclick={() => moveToIndex(activeIndex + 1)}
            disabled={!canGoNext}
            aria-label={m.gallery__next_image()}
          ></button>
        </div>
      {/if}

      {#if items.length > 1}
        {#key currentItem.id}
          <ViewerControls
            {canGoPrev}
            {canGoNext}
            onPrev={() => moveToIndex(activeIndex - 1)}
            onNext={() => moveToIndex(activeIndex + 1)}
          />
        {/key}
      {/if}

      {#if leftRail || centerRail || rightRail}
        <div
          class="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-3 p-6 px-8"
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
    <EmptyState
      title={m.gallery__empty_state_title()}
      description={m.gallery__empty_state_description()}
    />
  {/if}
</div>

{#if currentItem && isFullscreen}
  <FullScreen
    {currentItem}
    {activeId}
    fit={viewerFit}
    viewTransitionName={fullscreenViewTransitionName}
    {onCurrentItemLoad}
    onDismiss={() => toggleFullscreen(false)}
  />
{/if}
