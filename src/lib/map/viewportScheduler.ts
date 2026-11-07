// TYPES
import type { Map as MapLibreMap } from 'maplibre-gl'

/** Starting cadence for sustained direct pans; this is not a measured device limit. */
export const FEATURE_VIEWPORT_PAN_INTERVAL_MS = 600

/** Public camera state used to distinguish a held drag from flights and inertia. */
type FeatureViewportCamera = Pick<
  MapLibreMap,
  'dragPan' | 'isMoving' | 'isZooming' | 'isRotating'
>

/** Public events and camera state needed by the viewport scheduler. */
type FeatureViewportMap = FeatureViewportCamera & Pick<MapLibreMap, 'on' | 'off'>

/** Callbacks keep query ownership and viewport calculation in the consuming map. */
export type FeatureViewportSchedulerOptions = {
  /** Read and publish the current camera, rather than a previously captured viewport. */
  publish: () => void
  /** Whether the active map query is still waiting for a response. */
  isLoading: () => boolean
  /** Reconcile retained marker visibility; true requests a final unthrottled scan. */
  updateCamera?: (force: boolean) => void
}

/**
 * Identifies direct panning without treating a pinch or inertia as continued dragging.
 * @param map - Public MapLibre gesture and camera state.
 * @returns Whether the user is holding a pan gesture without zooming or rotating.
 * @remarks Inertia carries the original input event, so originalEvent is insufficient.
 * MapLibre 6 exposes isEasing only on its internal camera; no private state is used.
 */
export function isDirectFeatureViewportPan(map: FeatureViewportCamera): boolean {
  return map.dragPan.isActive() && !map.isZooming() && !map.isRotating()
}

/**
 * Checks whether a delayed viewport request may start at the current camera state.
 * @param map - Public MapLibre gesture and camera state.
 * @returns Whether the camera is settled or the user is directly panning.
 * @remarks Recheck this after a separate request debounce: a flight may have begun
 * since the last settled viewport was published.
 */
export function canLoadFeatureViewport(map: FeatureViewportCamera): boolean {
  return !map.isMoving() || isDirectFeatureViewportPan(map)
}

/**
 * Publishes settled viewports and occasional updates during sustained direct panning.
 * @param map - Owning MapLibre map with public movement events.
 * @param options - Current-camera publication, query state and optional marker callbacks.
 * @returns Cleanup that removes every listener and cancels pending work.
 * @remarks Short gestures, zooms, inertia and scripted flights wait for moveend.
 * A held pan can discover new markers every 600 ms, unless a query is still loading.
 * Settling always publishes the latest camera, including after an interrupted flight.
 */
export function installFeatureViewportScheduler(
  map: FeatureViewportMap,
  options: FeatureViewportSchedulerOptions,
): () => void {
  let movementTimer: ReturnType<typeof setTimeout> | undefined
  let moving = map.isMoving()
  let disposed = false

  /** Cancels an obsolete direct-pan deadline. @returns Nothing. */
  const cancelMovementTimer = (): void => {
    if (movementTimer !== undefined) clearTimeout(movementTimer)
    movementTimer = undefined
  }

  /** Tracks starts before resize or the first movement frame. @returns Nothing. */
  const onMoveStart = (): void => {
    moving = true
    if (!isDirectFeatureViewportPan(map)) cancelMovementTimer()
  }

  /** Reveals warm markers while limiting new viewport work. @returns Nothing. */
  const onMove = (): void => {
    moving = true
    options.updateCamera?.(false)
    if (!isDirectFeatureViewportPan(map)) {
      cancelMovementTimer()
      return
    }
    if (movementTimer !== undefined) return

    // Recheck the live gesture when the deadline arrives: release can start inertia.
    movementTimer = setTimeout(() => {
      movementTimer = undefined
      if (disposed || !isDirectFeatureViewportPan(map) || options.isLoading()) return
      options.publish()
    }, FEATURE_VIEWPORT_PAN_INTERVAL_MS)
  }

  /** Publishes the actual endpoint even when a prior query is busy. @returns Nothing. */
  const onMoveEnd = (): void => {
    moving = false
    cancelMovementTimer()
    options.updateCamera?.(true)
    options.publish()
  }

  /** Defers moving resizes to moveend while supporting idle resizes. @returns Nothing. */
  const onResize = (): void => {
    if (!moving && !map.isMoving()) options.publish()
  }

  map.on('movestart', onMoveStart)
  map.on('move', onMove)
  map.on('moveend', onMoveEnd)
  map.on('resize', onResize)
  // A stationary startup has no movement event to supply its first viewport.
  options.publish()

  return (): void => {
    disposed = true
    cancelMovementTimer()
    map.off('movestart', onMoveStart)
    map.off('move', onMove)
    map.off('moveend', onMoveEnd)
    map.off('resize', onResize)
  }
}
