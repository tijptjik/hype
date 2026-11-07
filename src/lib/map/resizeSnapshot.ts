import type { Map as MapLibreMap } from 'maplibre-gl'

/** Fixes the renderer's dimensions while its surrounding pane changes size.
 * @param map Renderer whose geographic centre must remain stable.
 * @param disableInteraction Whether layout settling should temporarily block map interaction.
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

/** Holds the live map at its original size while its surrounding layout settles.
 * @param map Renderer being resized by its surrounding layout.
 * @returns Cleanup restoring layout and resizing the original renderer.
 * @remarks Markers and the WebGL canvas remain together in the fixed map container.
 */
export function freezeMapForResize(map: MapLibreMap): () => void {
  map.stop()
  // Keep the original WebGL surface: copying it to a 2D canvas can swap colour
  // channels on GPU-backed browsers, flashing a different palette on return.
  const restore = holdMapSize(map, true)
  return () => {
    restore()
    map.resize()
    map.triggerRepaint()
  }
}
