// DOMAIN
import { facadeViews } from './floorAlignment'
import { exteriorTriangles } from './facadeGeometry'
import { segmentFacades, type FloorElevation } from './facades'

self.onmessage = (
  event: MessageEvent<{
    buffer: ArrayBuffer
    assetId: string
    frontViewId?: string | null
    floors?: FloorElevation[]
    storeyHeight?: number
  }>,
) => {
  try {
    const { buffer, frontViewId, ...options } = event.data
    const result = segmentFacades(exteriorTriangles(buffer), options)
    if (frontViewId === undefined) {
      self.postMessage({ result })
    } else {
      // Gallery previews need only the heading of the reviewed or largest façade.
      const views = facadeViews(result.facades)
      const front = views.find(view => view.id === frontViewId) ?? views[0]
      const heading = front
        ? (Math.atan2(front.normal[0], front.normal[2]) * 180) / Math.PI
        : null
      self.postMessage({ heading })
    }
  } catch (cause) {
    self.postMessage({
      error:
        cause instanceof Error ? cause.message : 'Could not analyse exterior geometry.',
    })
  }
}
