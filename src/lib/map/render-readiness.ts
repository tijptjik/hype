import type { Map as MapLibreMap } from 'maplibre-gl'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. MAP SETTLEMENT
//    - waitForMapEvent
//    - waitForMarkerImages

/** Maximum time a preview waits for one map or marker settlement step. */
export const MAP_RENDER_READY_TIMEOUT_MS = 10_000

/**
 * Waits for a one-shot MapLibre lifecycle event with a bounded timeout.
 *
 * @param map - Map instance whose lifecycle is being observed.
 * @param event - Lifecycle event required before capture can continue.
 * @param timeoutMs - Maximum wait before rejecting.
 * @returns A promise fulfilled when the event fires.
 * @remarks The listener and timeout are removed on either success or failure so
 * stale render jobs cannot retain a map reference.
 */
export const waitForMapEvent = (
  map: MapLibreMap,
  event: 'load' | 'idle',
  timeoutMs: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    let settled = false
    let timeoutId: number | undefined

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      map.off(event, onEvent)
      error ? reject(error) : resolve()
    }
    const onEvent = (): void => finish()

    timeoutId = window.setTimeout(
      () => finish(new Error(`Map ${event} timed out`)),
      timeoutMs,
    )
    map.once(event, onEvent)
  })

/**
 * Waits for all image-backed marker elements below a render root.
 *
 * @param root - DOM subtree containing the rendered markers.
 * @param timeoutMs - Maximum wait before rejecting.
 * @returns A promise fulfilled when every marker image has loaded.
 * @remarks Already-complete images are checked for a zero natural width so a
 * failed request cannot be mistaken for a settled preview.
 */
export const waitForMarkerImages = (
  root: ParentNode,
  timeoutMs: number,
): Promise<void> => {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img.marker-image'))
  if (images.length === 0) return Promise.resolve()

  return new Promise((resolve, reject) => {
    let pending = images.length
    let settled = false
    let timeoutId: number | undefined

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      images.forEach(image => {
        image.removeEventListener('load', onLoad)
        image.removeEventListener('error', onError)
      })
      error ? reject(error) : resolve()
    }
    const onLoad = (): void => {
      pending -= 1
      if (pending === 0) finish()
    }
    const onError = (): void => finish(new Error('A marker image failed to load'))

    timeoutId = window.setTimeout(
      () => finish(new Error('Marker images timed out')),
      timeoutMs,
    )

    for (const image of images) {
      if (image.complete) {
        if (image.naturalWidth === 0 && image.src) {
          finish(new Error('A marker image failed to load'))
          return
        }
        pending -= 1
      } else {
        image.addEventListener('load', onLoad)
        image.addEventListener('error', onError)
      }
    }

    if (pending === 0) finish()
  })
}
