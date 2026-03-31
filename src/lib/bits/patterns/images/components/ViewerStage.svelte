<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
// LIB
import {
  buildGallerySceneAssetUrls,
  getGalleryBackgroundSrc,
  getGalleryForegroundRotationStyle,
  getGalleryForegroundSrc,
  getGallerySceneKey,
  shouldUseDirectGalleryScene,
} from '$lib/client/services/image'
// BITS
import ImageSurface from './ImageSurface.svelte'
// TYPES
import type { ViewerStageProps } from './imagePrimitives.types'
import type { ViewerRenderable } from '../images.types'

const VIEWER_TRANSITION_MS = 260
const ROTATION_TRANSITION_MS = 240

type SceneSnapshot = {
  key: string
  item: ViewerRenderable
  fit: 'fit' | 'cover'
}

/**
 * Clones a renderable so crossfade layers keep the exact scene payload they
 * started with, even if live viewer state mutates during the transition.
 *
 * @param item - Renderable being frozen into a scene snapshot.
 * @returns Detached renderable copy for transition-safe rendering.
 */
function cloneViewerRenderable(item: ViewerRenderable): ViewerRenderable {
  return {
    ...item,
    status: item.status ? { ...item.status } : item.status,
    meta: item.meta ? { ...item.meta } : item.meta,
  }
}

/**
 * Freezes a scene snapshot so outgoing/incoming layers retain their original
 * fit mode and render payload for the full crossfade lifecycle.
 *
 * @param scene - Scene to clone.
 * @returns Detached scene snapshot.
 */
function cloneSceneSnapshot(scene: SceneSnapshot): SceneSnapshot {
  return {
    key: scene.key,
    fit: scene.fit,
    item: cloneViewerRenderable(scene.item),
  }
}

let {
  currentItem,
  activeId = null,
  fit = 'fit',
  status = 'idle',
  class: className = '',
  rounded = 'rounded-2xl',
  showBackdrop = true,
  viewTransitionName,
  onCurrentItemLoad,
}: ViewerStageProps = $props()

let displayedScene = $state<SceneSnapshot | null>(null)
let previousScene = $state<SceneSnapshot | null>(null)
let incomingScene = $state<SceneSnapshot | null>(null)
let pendingScene = $state<SceneSnapshot | null>(null)
let pendingSceneAssetUrls = $state<string[]>([])
let loadedSceneAssetUrls = $state<string[]>([])
let crossfadeActive = $state(false)
let cleanupTimer: ReturnType<typeof setTimeout> | null = null
let activationFrame: number | null = null

/**
 * Returns the rotation transition class only when the current scene opts into
 * animated rotation updates.
 *
 * @param item - Scene item being rendered in the active layer.
 * @returns Tailwind transition classes or an empty string.
 */
function getForegroundRotationClass(item: ViewerRenderable | null): string {
  return item?.animateRotation
    ? `transition-transform duration-[${ROTATION_TRANSITION_MS}ms] ease-out`
    : ''
}

/**
 * Chooses the richer `ImageSurface` pipeline for uploads and fallback-backed
 * images, while direct scenes render plain image layers.
 *
 * @param item - Scene item being rendered.
 * @returns `true` when the scene should use `ImageSurface`.
 */
function shouldRenderImageSurface(item: ViewerRenderable | null): boolean {
  return Boolean(item?.status?.uploadStatus) || !shouldUseDirectGalleryScene(item)
}

/**
 * Applies a view-transition name only to the layer that matches the currently
 * active gallery scene.
 *
 * @param sceneKey - Stable scene key for the layer being rendered.
 * @returns Inline style for the browser view transition, when applicable.
 */
function getLayerTransitionStyle(sceneKey: string): string | undefined {
  if (!viewTransitionName) return undefined

  return getGallerySceneKey(currentItem, activeId) === sceneKey
    ? `view-transition-name: ${viewTransitionName};`
    : undefined
}

/**
 * Clears delayed activation and cleanup work for the current crossfade cycle.
 *
 * @returns Nothing.
 */
function clearTransitionTimers(): void {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer)
    cleanupTimer = null
  }

  if (activationFrame != null) {
    cancelAnimationFrame(activationFrame)
    activationFrame = null
  }
}

/**
 * Resets the preload tracker once a pending scene is either cancelled or
 * promoted into the visible crossfade state.
 *
 * @returns Nothing.
 */
function clearPendingScene(): void {
  pendingScene = null
  pendingSceneAssetUrls = []
  loadedSceneAssetUrls = []
}

/**
 * Marks one pending asset as paint-ready after load/decode completes, while
 * ignoring stale or duplicate notifications.
 *
 * @param url - Asset URL associated with the pending scene.
 * @returns Nothing.
 */
function markSceneAssetReady(url: string): void {
  if (!pendingSceneAssetUrls.includes(url) || loadedSceneAssetUrls.includes(url)) {
    return
  }

  loadedSceneAssetUrls = [...loadedSceneAssetUrls, url]
}

/**
 * Starts the staged viewer crossfade by freezing the current scene as the
 * outgoing layer, promoting the next scene as incoming, and flipping opacity on
 * the next paint.
 *
 * @param nextScene - Scene snapshot that should become visible.
 * @returns Nothing.
 */
function startCrossfade(nextScene: SceneSnapshot): void {
  clearTransitionTimers()
  previousScene = displayedScene ? cloneSceneSnapshot(displayedScene) : null
  incomingScene = cloneSceneSnapshot(nextScene)
  crossfadeActive = false
  clearPendingScene()

  // Wait two frames so both layers are mounted before toggling opacity.
  activationFrame = requestAnimationFrame(() => {
    activationFrame = requestAnimationFrame(() => {
      crossfadeActive = true
      activationFrame = null
    })
  })

  // Retire the outgoing layer once the configured crossfade duration completes.
  cleanupTimer = setTimeout(() => {
    displayedScene = incomingScene ? cloneSceneSnapshot(incomingScene) : null
    previousScene = null
    incomingScene = null
    crossfadeActive = false
    cleanupTimer = null
  }, VIEWER_TRANSITION_MS)
}

$effect(() => {
  const nextKey = getGallerySceneKey(currentItem, activeId)
  const currentDisplayedScene = untrack(() => displayedScene)
  const currentPendingScene = untrack(() => pendingScene)
  const currentIncomingScene = untrack(() => incomingScene)
  const currentLoadedSceneAssetUrls = untrack(() => loadedSceneAssetUrls)

  // Rebuild the scene state machine whenever the requested gallery scene changes.
  if (!currentItem || !nextKey) {
    clearTransitionTimers()
    displayedScene = null
    previousScene = null
    incomingScene = null
    crossfadeActive = false
    clearPendingScene()
    return
  }

  const nextScene: SceneSnapshot = {
    key: nextKey,
    item: cloneViewerRenderable(currentItem),
    fit,
  }

  // Seed the viewer immediately on first render without preloading/crossfading.
  if (!currentDisplayedScene) {
    displayedScene = nextScene
    clearPendingScene()
    return
  }

  // Refresh the live scene payload in place when the scene identity is unchanged.
  if (currentDisplayedScene.key === nextScene.key) {
    displayedScene = nextScene

    if (currentPendingScene?.key === nextScene.key) {
      // Keep the pending preload list aligned with in-flight updates for the same scene.
      pendingScene = nextScene
      const nextUrls = buildGallerySceneAssetUrls(nextScene.item, nextScene.fit)
      pendingSceneAssetUrls = nextUrls
      loadedSceneAssetUrls = currentLoadedSceneAssetUrls.filter(url =>
        nextUrls.includes(url),
      )
    }

    return
  }

  // Refresh an already-mounted incoming layer when repeated updates target the same scene.
  if (currentIncomingScene?.key === nextScene.key) {
    incomingScene = nextScene
    pendingScene = nextScene
    const nextUrls = buildGallerySceneAssetUrls(nextScene.item, nextScene.fit)
    pendingSceneAssetUrls = nextUrls
    loadedSceneAssetUrls = currentLoadedSceneAssetUrls.filter(url =>
      nextUrls.includes(url),
    )
    return
  }

  pendingScene = nextScene
  // Hold the scene swap until every required image URL has been decoded and paintable.
  pendingSceneAssetUrls = buildGallerySceneAssetUrls(nextScene.item, nextScene.fit)
  loadedSceneAssetUrls = []
})

$effect(() => {
  if (!pendingScene) return

  // Scenes without preloadable assets can crossfade immediately.
  if (pendingSceneAssetUrls.length === 0) {
    startCrossfade(pendingScene)
    return
  }

  // Defer the scene swap until every pending asset has reported paint readiness.
  if (loadedSceneAssetUrls.length < pendingSceneAssetUrls.length) {
    return
  }

  startCrossfade(pendingScene)
})

onDestroy(() => {
  clearTransitionTimers()
})
</script>

<div
  class={`relative h-full w-full overflow-hidden bg-black/5 ${rounded} ${className}`}
>
  {#if pendingScene}
    {#each pendingSceneAssetUrls as url (url)}
      <img
        src={url}
        alt=""
        aria-hidden="true"
        class="pointer-events-none absolute h-0 w-0 opacity-0"
        onload={async event => {
          const image = event.currentTarget as HTMLImageElement

          try {
            if (typeof image.decode === 'function') {
              await image.decode()
            }
          } catch {
            // Firefox can reject decode() even when an already-loaded image is paintable.
          }

          markSceneAssetReady(url)
        }}
        onerror={() => {
          markSceneAssetReady(url)
        }}
      >
    {/each}
  {/if}

  {#if previousScene}
    {#if showBackdrop && previousScene.fit === 'fit' && getGalleryBackgroundSrc(previousScene.item)}
      <div
        class="viewer-backdrop absolute inset-0"
        style={`opacity: ${crossfadeActive ? '0' : '1'}; transition: opacity ${VIEWER_TRANSITION_MS}ms ease-out;`}
      >
        <img
          src={getGalleryBackgroundSrc(previousScene.item)}
          alt=""
          aria-hidden="true"
          class="h-full w-full scale-[1.04] object-cover blur-lg"
        >
        <div class="viewer-backdrop-tint absolute inset-0"></div>
      </div>
    {/if}

    <div
      class="viewer-scene absolute inset-0"
      style={`opacity: ${crossfadeActive ? '0' : '1'}; transition: opacity ${VIEWER_TRANSITION_MS}ms ease-out;`}
    >
      {#if !shouldRenderImageSurface(previousScene.item)}
        <div
          class="viewer-layer absolute inset-0"
          style={getLayerTransitionStyle(previousScene.key)}
        >
          <div class="absolute inset-0 flex items-center justify-center">
            <img
              src={getGalleryForegroundSrc(previousScene.item)}
              alt={previousScene.item.alt ?? ''}
              style={getGalleryForegroundRotationStyle(previousScene.item)}
              class={`absolute inset-0 h-full w-full ${previousScene.fit === 'cover'
                ? 'object-cover'
                : 'object-contain'} ${getForegroundRotationClass(previousScene.item)}`}
            >
          </div>
        </div>
      {:else}
        <div
          class="viewer-layer absolute inset-0"
          style={getLayerTransitionStyle(previousScene.key)}
        >
          <ImageSurface
            item={previousScene.item}
            fit={previousScene.fit}
            class="h-full w-full"
            showBackdrop={false}
            enableSourceTransition={Boolean(previousScene.item.sourceFallbackSrc)}
            isLoading={false}
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if displayedScene && !previousScene && !incomingScene}
    {#if showBackdrop && displayedScene.fit === 'fit' && getGalleryBackgroundSrc(displayedScene.item)}
      <div class="viewer-backdrop absolute inset-0">
        <img
          src={getGalleryBackgroundSrc(displayedScene.item)}
          alt=""
          aria-hidden="true"
          class="h-full w-full scale-[1.04] object-cover blur-lg"
        >
        <div class="viewer-backdrop-tint absolute inset-0"></div>
      </div>
    {/if}

    <div
      class="viewer-scene absolute inset-0"
      style="opacity: 1; transform: translateX(0);"
    >
      {#if !shouldRenderImageSurface(displayedScene.item)}
        <div
          class="viewer-layer absolute inset-0"
          style={getLayerTransitionStyle(displayedScene.key)}
        >
          <div class="absolute inset-0 flex items-center justify-center">
            <img
              src={getGalleryForegroundSrc(displayedScene.item)}
              alt={displayedScene.item.alt ?? ''}
              style={getGalleryForegroundRotationStyle(displayedScene.item)}
              class={`absolute inset-0 h-full w-full ${displayedScene.fit === 'cover'
                ? 'object-cover'
                : 'object-contain'} ${getForegroundRotationClass(displayedScene.item)}`}
              onload={() => {
                if (displayedScene) {
                  onCurrentItemLoad?.(displayedScene.item)
                }
              }}
            >
          </div>
        </div>
      {:else}
        <div
          class="viewer-layer absolute inset-0"
          style={getLayerTransitionStyle(displayedScene.key)}
        >
          <ImageSurface
            item={displayedScene.item}
            fit={displayedScene.fit}
            class="h-full w-full"
            showBackdrop={false}
            enableSourceTransition={Boolean(displayedScene.item.sourceFallbackSrc)}
            onLoad={() => {
              if (displayedScene) {
                onCurrentItemLoad?.(displayedScene.item)
              }
            }}
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if incomingScene}
    {#if showBackdrop && incomingScene.fit === 'fit' && getGalleryBackgroundSrc(incomingScene.item)}
      <div
        class="viewer-backdrop absolute inset-0"
        style={`opacity: ${crossfadeActive ? '1' : '0'}; transition: opacity ${VIEWER_TRANSITION_MS}ms ease-out;`}
      >
        <img
          src={getGalleryBackgroundSrc(incomingScene.item)}
          alt=""
          aria-hidden="true"
          class="h-full w-full scale-[1.04] object-cover blur-lg"
        >
        <div class="viewer-backdrop-tint absolute inset-0"></div>
      </div>
    {/if}

    <div
      class="viewer-scene absolute inset-0"
      style={`opacity: ${crossfadeActive ? '1' : '0'}; transition: opacity ${VIEWER_TRANSITION_MS}ms ease-out;`}
    >
      {#if !shouldRenderImageSurface(incomingScene.item)}
        <div
          class="viewer-layer absolute inset-0"
          style={getLayerTransitionStyle(incomingScene.key)}
        >
          <div class="absolute inset-0 flex items-center justify-center">
            <img
              src={getGalleryForegroundSrc(incomingScene.item)}
              alt={incomingScene.item.alt ?? ''}
              style={getGalleryForegroundRotationStyle(incomingScene.item)}
              class={`absolute inset-0 h-full w-full ${incomingScene.fit === 'cover'
                ? 'object-cover'
                : 'object-contain'} ${getForegroundRotationClass(incomingScene.item)}`}
              onload={() => {
                if (incomingScene) {
                  onCurrentItemLoad?.(incomingScene.item)
                }
              }}
            >
          </div>
        </div>
      {:else}
        <div
          class="viewer-layer absolute inset-0"
          style={getLayerTransitionStyle(incomingScene.key)}
        >
          <ImageSurface
            item={incomingScene.item}
            fit={incomingScene.fit}
            class="h-full w-full"
            showBackdrop={false}
            enableSourceTransition={Boolean(incomingScene.item.sourceFallbackSrc)}
            onLoad={() => {
              if (incomingScene) {
                onCurrentItemLoad?.(incomingScene.item)
              }
            }}
          />
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
.viewer-scene,
.viewer-backdrop,
.viewer-layer,
.viewer-backdrop-tint {
  pointer-events: none;
}

.viewer-backdrop-tint {
  background:
    radial-gradient(
      circle at center,
      rgba(0, 0, 0, 0.06) 0%,
      rgba(0, 0, 0, 0.16) 62%,
      rgba(0, 0, 0, 0.28) 100%
    ),
    linear-gradient(180deg, rgba(7, 7, 7, 0.08) 0%, rgba(7, 7, 7, 0.18) 100%);
}
</style>
