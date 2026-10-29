import type { Map as MapLibreMap } from 'maplibre-gl'

/** Fixes the renderer's dimensions while its surrounding pane changes size.
 * @param map Renderer whose geographic centre must remain stable.
 * @param disableInteraction Whether a static snapshot will cover the renderer.
 * @param minimumWidth Extra canvas width to cover an expanding pane during a flight.
 * @returns Cleanup restoring the container's original inline styles.
 */
function holdMapSize(
  map: MapLibreMap,
  disableInteraction: boolean,
  minimumWidth = 0,
): () => void {
  const container = map.getContainer()
  const originalStyle = container.getAttribute('style')
  const { width, height } = container.getBoundingClientRect()
  // Fix the live renderer's dimensions before the parent changes, preventing resize churn.
  Object.assign(container.style, {
    position: 'absolute',
    width: `${Math.max(width, minimumWidth)}px`,
    height: `${height}px`,
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    ...(disableInteraction ? { pointerEvents: 'none' } : {}),
  })
  return () => {
    if (originalStyle === null) container.removeAttribute('style')
    else container.setAttribute('style', originalStyle)
  }
}

/** Keeps a flight's screen centre stable while the adjacent gallery changes width.
 * @param map Renderer whose camera continues animating at stable dimensions.
 * @returns Cleanup fitting the renderer to its pane after the flight finishes.
 * @remarks MapLibre captures the screen centre at flight start; resizing mid-flight shifts its destination.
 */
export function holdMapSizeDuringFlight(map: MapLibreMap): () => void {
  // Render enough width for the expanding pane; its overflow clips the extra canvas.
  const restore = holdMapSize(
    map,
    false,
    map.getContainer().ownerDocument.documentElement.clientWidth,
  )
  map.resize()
  return () => {
    restore()
    map.resize()
  }
}

/** Holds the map at its original size and covers its canvas with a rendered snapshot.
 * @param map Renderer being resized by its surrounding layout.
 * @returns Cleanup restoring layout and revealing the next complete map frame.
 * @remarks Markers remain in the fixed map container, above the canvas snapshot.
 */
export function freezeMapForResize(map: MapLibreMap): () => void {
  map.stop()
  const canvas = map.getCanvas()
  const originalOpacity = canvas.style.opacity
  const snapshot = document.createElement('canvas')
  snapshot.setAttribute('aria-hidden', 'true')
  snapshot.dataset.mapResizeSnapshot = ''
  Object.assign(snapshot.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  })
  const restore = holdMapSize(map, true)
  let released = false
  const capture = (): void => {
    if (released) return
    snapshot.width = canvas.width
    snapshot.height = canvas.height
    const context = snapshot.getContext('2d')
    if (!context) return
    context.drawImage(canvas, 0, 0)
    canvas.after(snapshot)
    canvas.style.opacity = '0'
  }
  // Read WebGL pixels during render; preserveDrawingBuffer is unnecessary.
  map.once('render', capture)
  map.triggerRepaint()
  return () => {
    released = true
    map.off('render', capture)
    restore()
    const reveal = (): void => {
      map.off('render', reveal)
      map.off('remove', reveal)
      snapshot.remove()
      canvas.style.opacity = originalOpacity
    }
    map.once('render', reveal)
    map.resize()
    map.triggerRepaint()
    // Also release resources when the map is removed before another frame is rendered.
    map.once('remove', reveal)
  }
}
