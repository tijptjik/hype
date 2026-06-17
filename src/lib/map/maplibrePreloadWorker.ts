// @ts-expect-error - TODO Fix Maplibre types
import * as tilebelt from '@mapbox/tilebelt'
import { bounds } from '@placemarkio/geo-viewport'
import type { BBox } from 'geojson'
import type { LngLatLike } from 'maplibre-gl'

type PrecacheMessagePayload = {
  abort?: boolean
  center: LngLatLike | [number, number]
  startCenter: LngLatLike | [number, number]
  zoom: number
  zmin: number
  dimensions: [number, number]
  tilesize: number
  sources: string[] | null
  debug?: boolean
}

let controller: AbortController | undefined
let signal: AbortSignal | undefined

globalThis.onmessage = (event: MessageEvent<PrecacheMessagePayload>) => {
  if (
    controller !== undefined &&
    controller.signal !== undefined &&
    !controller.signal.aborted
  ) {
    controller.abort()
  }
  if (event.data.abort) {
    postMessage({ t: Date.now(), e: true })
    return
  }
  controller = new AbortController()
  signal = controller.signal
  precache_function(event.data)
}

const precache_function = (o: PrecacheMessagePayload) => {
  // Final scenario bbox
  if (Array.isArray(o.center)) {
    o.center = { lon: o.center[0], lat: o.center[1] }
  }
  if (Array.isArray(o.startCenter)) {
    o.startCenter = { lon: o.startCenter[0], lat: o.startCenter[1] }
  }
  const finalbbox = bounds(o.center, o.zoom, o.dimensions, o.tilesize)

  // all the tiles in a bounding box for a given zoom level
  // including a buffer of 1 tile
  const bboxtiles = (bbox: BBox, zoom: number) => {
    const sw = tilebelt.pointToTile(bbox[0], bbox[1], zoom)
    const ne = tilebelt.pointToTile(bbox[2], bbox[3], zoom)
    const result = []
    for (let x = sw[0] - 1; x < ne[0] + 2; x++) {
      for (let y = ne[1] - 1; y < sw[1] + 2; y++) {
        result.push([x, y, zoom])
      }
    }
    return result
  }

  // Bresenham algorithm for retrieving only the diagonal tiles + siblings
  const diagonaltiles = (p1: LngLatLike, p2: LngLatLike, zoom: number) => {
    const [lon1, lat1] = Array.isArray(p1)
      ? p1
      : 'lon' in p1
        ? [p1.lon, p1.lat]
        : [p1.lng, p1.lat]
    const [lon2, lat2] = Array.isArray(p2)
      ? p2
      : 'lon' in p2
        ? [p2.lon, p2.lat]
        : [p2.lng, p2.lat]
    const [x0, y0] = tilebelt.pointToTile(lon1, lat1, zoom)
    const [x1, y1] = tilebelt.pointToTile(lon2, lat2, zoom)
    const [dx, dy] = [Math.abs(x1 - x0), Math.abs(y1 - y0)]
    const [sx, sy] = [x0 < x1 ? 1 : -1, y0 < y1 ? 1 : -1]
    let err = (dx > dy ? dx : -dy) / 2
    let [x, y] = [x0, y0]
    const tt = []
    while (x !== x1 || y !== y1) {
      tt.push([x, y, zoom], ...tilebelt.getSiblings([x, y, zoom]))
      const e2 = err
      if (e2 > -dx) {
        err -= dy
        x += sx
      }
      if (e2 < dy) {
        err += dx
        y += sy
      }
    }
    tt.push([x1, y1, zoom], ...tilebelt.getSiblings([x1, y1, zoom]))
    // Remove duplicates
    return [...new Set(tt)]
  }

  let tz: number

  // Get the animation pan diagonal tiles
  let tiles = [...diagonaltiles(o.startCenter, o.center, o.zmin)]
  // CORRECTNESS: Simple trick to fix eventual miscalculations of zmin for flyTo
  //   if (o.type == 'fly' || o.type == 'fitBounds') {
  //     tiles.push(
  //       ...diagonaltiles(o.startCenter, o.center, o.zmin - 1),
  //       ...diagonaltiles(o.startCenter, o.center, o.zmin + 1)
  //     );
  //   }
  // Build the tiles pyramid for final scenario
  for (let z = o.zoom; z > o.zmin - 1; z--) {
    const tt = bboxtiles(finalbbox, z)
    tiles.push(...tt)
    tz = tt.length
  }

  // Remove duplicates
  tiles = [...new Set(tiles)]

  // CORRECTNESS : Remove hardcoded zoom level filter
  // Currently the hype.hk tile server only supports zoom levels 1-14
  // So it doesn't make sense to fetch tiles for zoom levels higher than 14
  tiles = tiles.filter(t => t[2] <= 14)

  // From tiles [x,y,z] to URLs
  const urls = tiles.flatMap(t => {
    if (o.sources == null) return []
    return o.sources.map((s: string) => {
      return s
        .replace('{x}', t[0].toString())
        .replace('{y}', t[1].toString())
        .replace('{z}', t[2].toString())
    })
  })

  // Fetch all
  Promise.all(urls.map(u => fetch(u, { signal })))
    .then(_d => {
      if (o.debug) console.log(`Estimated gain: ${Math.round((900 * tz) / 6)}ms`)
      if (o.debug)
        console.log(
          `Prefetched ${urls.length} tiles at zoom levels [${o.zmin} - ${o.zoom}]`,
        )
      postMessage({ t: Date.now(), e: false })
    })
    .catch(e => {
      if (o.debug && e.name !== 'AbortError') console.log('🔴 Precache error')
    })
}
