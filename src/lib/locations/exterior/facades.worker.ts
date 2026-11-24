// DOMAIN
import { exteriorTriangles } from './facadeGeometry'
import { segmentFacades, type FloorElevation } from './facades'

self.onmessage = (
  event: MessageEvent<{
    buffer: ArrayBuffer
    assetId: string
    floors: FloorElevation[]
    storeyHeight: number
  }>,
) => {
  try {
    const { buffer, ...options } = event.data
    self.postMessage({ result: segmentFacades(exteriorTriangles(buffer), options) })
  } catch (cause) {
    self.postMessage({
      error:
        cause instanceof Error ? cause.message : 'Could not analyse exterior geometry.',
    })
  }
}
