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
} from '#lib/client/services/image.js'
// BITS
import ImageSurface from './ImageSurface.svelte'
import ImageBackdrop from './ImageBackdrop.svelte'
import ImageForeground from './ImageForeground.svelte'
import ImageSkeleton from './ImageSkeleton.svelte'
import { VIEWER_TRANSITION_MS, VIEWER_TRANSITION_EASING } from '../images.motion'
// TYPES
import type { ViewerStageProps } from './imagePrimitives.types'
import type { ViewerRenderable } from '../images.types'

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
 * Identifies the decoded scene, including source changes within one image record.
 * @param item Requested renderable.
 * @param selectedId Current selection identity.
 * @returns Scene key, or null when no image is selected.
 * @remarks Status-only updates and rotation keep their mounted scene; replacement
 * sources must pass the decode gate before replacing either visible image layer.
 */
function getStageSceneKey(
  item: ViewerRenderable | null,
  selectedId: string | null,
): string | null {
  const identity = getGallerySceneKey(item, selectedId)
  if (!item || !identity) return null
  return JSON.stringify([
    identity,
    getGalleryForegroundSrc(item),
    getGalleryBackgroundSrc(item),
    item.presentationMode,
    shouldRenderImageSurface(item),
  ])
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

  return getStageSceneKey(currentItem, activeId) === sceneKey
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
  const visibleScene = incomingScene ?? displayedScene
  const sameImage =
    visibleScene &&
    getGallerySceneKey(visibleScene.item, visibleScene.item.id) ===
      getGallerySceneKey(nextScene.item, nextScene.item.id)
  const visibleSrc = visibleScene ? getGalleryForegroundSrc(visibleScene.item) : null
  const nextSrc = getGalleryForegroundSrc(nextScene.item)
  const isUploadHandoff =
    sameImage &&
    (visibleSrc === nextSrc ||
      visibleSrc === nextScene.item.sourceFallbackSrc ||
      (visibleSrc?.startsWith('blob:') && !nextSrc.startsWith('blob:')))

  // Preview-to-final delivery and renderer cleanup reuse the settled picture.
  // The caller has already decoded its assets; only a new picture needs a fade.
  if (isUploadHandoff) {
    displayedScene = cloneSceneSnapshot(nextScene)
    previousScene = null
    incomingScene = null
    crossfadeActive = false
    clearPendingScene()
    return
  }

  previousScene = visibleScene ? cloneSceneSnapshot(visibleScene) : null
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
  const nextKey = getStageSceneKey(currentItem, activeId)
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

  // Preload the first scene too: progressive image bytes must stay behind the
  // skeleton until the same decode gate used by subsequent crossfades completes.
  if (!currentDisplayedScene && !currentIncomingScene) {
    pendingScene = nextScene
    const nextUrls = buildGallerySceneAssetUrls(nextScene.item, nextScene.fit)
    pendingSceneAssetUrls = nextUrls
    loadedSceneAssetUrls =
      currentPendingScene?.key === nextScene.key
        ? currentLoadedSceneAssetUrls.filter(url => nextUrls.includes(url))
        : []
    return
  }

  // Refresh the live scene payload in place when the scene identity is unchanged.
  if (currentDisplayedScene?.key === nextScene.key) {
    displayedScene = nextScene

    // A request returning to the displayed source cancels an obsolete transition.
    clearTransitionTimers()
    previousScene = null
    incomingScene = null
    crossfadeActive = false
    clearPendingScene()

    return
  }

  // Refresh an already-mounted incoming layer when repeated updates target the same scene.
  if (currentIncomingScene?.key === nextScene.key) {
    incomingScene = nextScene
    // Its assets already decoded; metadata updates must not restart the fade.
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
  class={`relative h-full w-full overflow-hidden ${showBackdrop ? 'bg-black/5' : ''} ${rounded} ${className}`}
>
  {#if currentItem && !displayedScene && !previousScene}
    <ImageSkeleton />
  {/if}
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

  <!-- Keep each decoded scene mounted while its role changes from incoming to settled. -->
  {#each incomingScene
    ? [...(previousScene ? [previousScene] : []), incomingScene]
    : displayedScene
      ? [displayedScene]
      : [] as scene (scene.key)}
    {@const transitioning = Boolean(incomingScene)}
    {@const opacity = !transitioning
      ? 1
      : scene.key === incomingScene?.key
        ? crossfadeActive
          ? 1
          : 0
        : crossfadeActive
          ? 0
          : 1}
    {@const transitionStyle = transitioning
      ? `opacity: ${opacity}; transition: opacity ${VIEWER_TRANSITION_MS}ms ${VIEWER_TRANSITION_EASING};`
      : 'opacity: 1;'}
    {#if showBackdrop && scene.fit === 'fit' && getGalleryBackgroundSrc(scene.item)}
      <div class="viewer-backdrop absolute inset-0" style={transitionStyle}>
        <ImageBackdrop
          src={getGalleryBackgroundSrc(scene.item)!}
          mode={scene.item.presentationMode === 'cast-edges' ? 'edges' : 'blur'}
          rotationDegrees={scene.item.presentationMode === 'cast-edges'
            ? (scene.item.rotationDegrees ?? 0)
            : 0}
        />
        {#if scene.item.presentationMode !== 'cast-edges'}
          <div class="viewer-backdrop-tint absolute inset-0"></div>
        {/if}
      </div>
    {/if}

    <div class="viewer-scene absolute inset-0" style={transitionStyle}>
      {#if !shouldRenderImageSurface(scene.item)}
        <div
          class="viewer-layer absolute inset-0"
          style={getLayerTransitionStyle(scene.key)}
        >
          <div class="absolute inset-0 flex items-center justify-center">
            <ImageForeground
              fit={scene.fit}
              trimRim={scene.fit === 'fit' &&
                scene.item.presentationMode === 'cast-edges'}
              src={getGalleryForegroundSrc(scene.item)}
              alt={scene.item.alt ?? ''}
              style={getGalleryForegroundRotationStyle(scene.item)}
              class={`absolute inset-0 h-full w-full ${
                scene.fit === 'cover' ? 'object-cover' : 'object-contain'
              } ${getForegroundRotationClass(scene.item)}`}
              onload={() => {
                if (scene.key === (incomingScene ?? displayedScene)?.key) {
                  onCurrentItemLoad?.(scene.item)
                }
              }}
            />
          </div>
        </div>
      {:else}
        <div
          class="viewer-layer absolute inset-0"
          style={getLayerTransitionStyle(scene.key)}
        >
          <ImageSurface
            item={scene.item}
            fit={scene.fit}
            class="h-full w-full"
            showBackdrop={false}
            enableSourceTransition={false}
            animateLoading={false}
            onLoad={() => {
              if (scene.key === (incomingScene ?? displayedScene)?.key) {
                onCurrentItemLoad?.(scene.item)
              }
            }}
          />
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
.viewer-scene,
.viewer-backdrop,
.viewer-layer,
.viewer-backdrop-tint {
  pointer-events: none;
}

.viewer-backdrop-tint {
  /* Lift the blurred photo into the light theme's surface instead of casting a grey shadow. */
  background:
    radial-gradient(
      circle at center,
      light-dark(
          color-mix(in oklab, var(--theme-surface) 24%, transparent),
          rgba(0, 0, 0, 0.06)
        )
        0%,
      light-dark(
          color-mix(in oklab, var(--theme-surface) 40%, transparent),
          rgba(0, 0, 0, 0.16)
        )
        62%,
      light-dark(
          color-mix(in oklab, var(--theme-surface) 56%, transparent),
          rgba(0, 0, 0, 0.28)
        )
        100%
    ),
    linear-gradient(
      180deg,
      light-dark(
          color-mix(in oklab, var(--theme-surface) 12%, transparent),
          rgba(7, 7, 7, 0.08)
        )
        0%,
      light-dark(
          color-mix(in oklab, var(--theme-surface) 24%, transparent),
          rgba(7, 7, 7, 0.18)
        )
        100%
    );
}
</style>
