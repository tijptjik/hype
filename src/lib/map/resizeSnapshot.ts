import type { Map as MapLibreMap } from 'maplibre-gl'

/** Holds the map at its original size and covers its canvas with a rendered snapshot.
 * @param map Renderer being resized by its surrounding layout.
 * @returns Cleanup restoring layout and revealing the next complete map frame.
 * @remarks Markers remain in the fixed map container, above the canvas snapshot.
 */
export function freezeMapForResize(map: MapLibreMap): () => void {
  map.stop()
  const container = map.getContainer()
  const canvas = map.getCanvas()
  const originalStyle = container.getAttribute('style')
  const originalOpacity = canvas.style.opacity
  const { width, height } = container.getBoundingClientRect()
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
  // Fix the live renderer's dimensions before the parent changes, preventing resize churn.
  Object.assign(container.style, {
    position: 'absolute',
    width: `${width}px`,
    height: `${height}px`,
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  })
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
    if (originalStyle === null) container.removeAttribute('style')
    else container.setAttribute('style', originalStyle)
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
