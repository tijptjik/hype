// TYPES
import type { Map as MapLibreMap } from 'maplibre-gl'

/**
 * Reports the first painted style without waiting for tiles, images or an idle camera.
 * @param map - Map whose public render events mark the visual startup boundary.
 * @param onReady - Called once on the frame after the first styled render.
 * @returns Cleanup that cancels both the listener and any queued animation frame.
 * @remarks A following frame lets the hidden initial surface paint before its fade.
 */
export function observeFirstMapFrame(
  map: MapLibreMap,
  onReady: () => void,
): () => void {
  let frame: number | undefined
  let disposed = false
  let rendered = false

  /** Waits for a styled render, then hands the next paint to the entrance. @returns Nothing. */
  const onRender = (): void => {
    if (disposed || rendered || !map.getStyle()) return
    rendered = true
    map.off('render', onRender)
    frame = requestAnimationFrame(() => {
      frame = undefined
      if (!disposed) onReady()
    })
  }

  map.on('render', onRender)
  // The component may bind after the first native render; request one observable frame.
  map.triggerRepaint()

  return () => {
    disposed = true
    map.off('render', onRender)
    if (frame !== undefined) cancelAnimationFrame(frame)
  }
}
