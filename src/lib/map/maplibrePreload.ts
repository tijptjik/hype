import type { Map, LngLatLike } from 'maplibre-gl'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. OPTION NORMALIZATION
//    - toPlainMaplibreOptions
//    - normalizeMaplibreOptions
//
// 2. MAPLIBRE PATCHING
//    - monkeyPatchMapLibre

type MaplibreOptions = {
  type?: 'pan' | 'zoom' | 'jump' | 'ease' | 'fly' | 'fitBounds'
  center?: [number, number]
  zoom?: number
  offset?: [number, number]
  curve?: number
  minZoom?: number
  bounds?: [[number, number], [number, number]]
  debug?: boolean
  run?: boolean
  [key: string]: any
}

interface MapSource {
  type: string
  url?: string
  tiles?: string[]
  [key: string]: any
}

type appCtx = {
  sources: string[] | null
  dimensions: [number, number]
  tilesize: number
  startCenter: [number, number]
  startZoom: number
  zmin: number
}

type MapLibre = any // typeof globalThis.maplibregl when available
type ExtendedMapLibre = MapLibre & {
  _context: (options: MaplibreOptions) => appCtx
  _get_sources_from_style: () => string[] | null
  _precache: (o: MaplibreOptions) => void
}

const toPlainMaplibreOptions = (value: unknown): unknown => {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(item => toPlainMaplibreOptions(item))
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'object') {
    const plainObject: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value)) {
      plainObject[key] = toPlainMaplibreOptions(nestedValue)
    }
    return plainObject
  }

  return undefined
}

const normalizeMaplibreOptions = (options: MaplibreOptions = {}): MaplibreOptions =>
  (toPlainMaplibreOptions(options) as MaplibreOptions | undefined) ?? {}

/**
 * Adds cache-aware navigation helpers onto a MapLibre namespace at runtime.
 *
 * @param maplibregl - Optional MapLibre namespace to patch. Falls back to `globalThis`.
 * @returns Patched MapLibre namespace with helper methods attached.
 */
export const monkeyPatchMapLibre = (maplibregl?: MapLibre): ExtendedMapLibre => {
  const _lib = maplibregl || globalThis.maplibregl
  // run only in the main thread
  if (_lib !== undefined) {
    /*

    Map methods

    */
    const cachedpanto = function (
      this: Map,
      lnglat: LngLatLike,
      options: MaplibreOptions = {},
    ) {
      const safeOptions = normalizeMaplibreOptions(options)
      const o = Object.assign(
        {},
        safeOptions,
        { type: 'pan', center: lnglat },
        this._context(safeOptions),
      )
      this._precache(o)
      if (safeOptions.run) return this.panTo(lnglat, safeOptions)
    }
    _lib.Map.prototype.cachedPanTo = cachedpanto

    const cachedzoomto = function (
      this: typeof _lib.Map,
      zoom: number,
      options: MaplibreOptions = {},
    ) {
      const safeOptions = normalizeMaplibreOptions(options)
      const o = Object.assign(
        {},
        safeOptions,
        { type: 'zoom', zoom },
        this._context(safeOptions),
      )
      this._precache(o)
      if (safeOptions.run) return this.zoomTo(zoom, safeOptions)
    }
    _lib.Map.prototype.cachedZoomTo = cachedzoomto

    const cachedjumpto = function (
      this: typeof _lib.Map,
      options: MaplibreOptions = {},
    ) {
      const safeOptions = normalizeMaplibreOptions(options)
      const o = Object.assign(
        {},
        safeOptions,
        { type: 'jump' },
        this._context(safeOptions),
      )
      this._precache(o)
      if (safeOptions.run) return this.jumpTo(safeOptions)
    }
    _lib.Map.prototype.cachedJumpTo = cachedjumpto

    const cachedeaseto = function (
      this: typeof _lib.Map,
      options: MaplibreOptions = {},
    ) {
      const safeOptions = normalizeMaplibreOptions(options)
      const o = Object.assign(
        {},
        safeOptions,
        { type: 'ease' },
        this._context(safeOptions),
      )
      this._precache(o)
      if (safeOptions.run) return this.easeTo(safeOptions)
    }
    _lib.Map.prototype.cachedEaseTo = cachedeaseto

    const cachedflyto = function (
      this: typeof _lib.Map,
      options: MaplibreOptions = {},
    ) {
      const safeOptions = normalizeMaplibreOptions(options)
      safeOptions.type = 'fly'
      safeOptions.debug = false
      const o = Object.assign(
        {},
        safeOptions,
        { type: 'fly' },
        this._context(safeOptions),
      )
      this._precache(o)
      if (safeOptions.run) return this.flyTo(safeOptions)
    }
    _lib.Map.prototype.cachedFlyTo = cachedflyto

    const cachedfitbounds = function (
      this: typeof _lib.Map,
      bounds: [[number, number], [number, number]],
      options: MaplibreOptions = {},
    ) {
      const safeOptions = normalizeMaplibreOptions(options)
      safeOptions.type = 'fitBounds'
      safeOptions.bounds = bounds
      safeOptions.debug = false
      const o = Object.assign(
        {},
        safeOptions,
        { type: 'fitBounds' },
        this._context(safeOptions),
      )
      this._precache(o)
      if (safeOptions.run) return this.fitBounds(bounds, safeOptions)
    }
    _lib.Map.prototype.cachedFitBounds = cachedfitbounds

    /*

        Logic

    */

    const _get_sources_from_style = function (this: typeof _lib.Map): string[] | null {
      const style = this.getStyle()
      if (!style) {
        console.warn('Style not loaded')
        return null
      }

      // Get sources with proper type checking
      const sources = style.sources
      if (!sources) {
        console.warn('No sources in style')
        return null
      }

      // Filter and map sources with type checking
      const _sources = Object.entries(sources)
        .filter(([_, source]) => {
          if (!source) return false

          const typedSource = source as MapSource

          // Type guard for source types
          const isVectorOrRaster =
            typedSource.type === 'vector' || typedSource.type === 'raster'

          // Check for either url or tiles property
          const hasTileSource =
            typedSource.url || (typedSource.tiles && Array.isArray(typedSource.tiles))

          return isVectorOrRaster && hasTileSource
        })
        .map(([sourceId, _]) => {
          const source = this.getSource(sourceId)
          if (!source?.tiles?.[0]) {
            console.warn(`Invalid tiles in source: ${sourceId}`)
            return null
          }
          return source.tiles[0]
        })
        .filter((tile): tile is string => tile !== null)

      if (_sources.length === 0) {
        console.warn('No valid tile sources found')
        return null
      }
      return _sources
    }

    // Gets the needed information related to the Map object
    const _context = function (
      this: typeof _lib.Map,
      options: MaplibreOptions,
    ): appCtx {
      const _sources = this._get_sources_from_style()
      const _dimensions: [number, number] = [
        this.getCanvas().width,
        this.getCanvas().height,
      ]
      // TODO: get tile size from style
      const _tilesize = 512 // Standard tile size
      const currentCenter = this.getCenter()
      let zmin = Math.min(this.getZoom(), options.zoom || 0)
      if (options.type === 'fly' || options.type === 'fitBounds') {
        // From the flyTo logic itself
        const offsetAsPoint = options.offset
          ? { x: options.offset[0], y: options.offset[1] }
          : { x: 0, y: 0 }
        const mercatorCoord = _lib.MercatorCoordinate.fromLngLat(this.getCenter())
        const offsetMercator = new _lib.MercatorCoordinate(
          offsetAsPoint.x / this.transform.width,
          offsetAsPoint.y / this.transform.height,
        )
        const pointAtOffset = {
          x: mercatorCoord.x + offsetMercator.x,
          y: mercatorCoord.y + offsetMercator.y,
        }
        const locationAtOffset = this.unproject(pointAtOffset)
        const center = new _lib.LngLat(
          options.center?.[0] || 0,
          options.center?.[1] || 0,
        ).wrap()
        const from = this.project(locationAtOffset)
        const delta = this.project(center).sub(from)
        const rho = options.curve || 1.42
        const u1 = Math.sqrt(delta.x * delta.x + delta.y * delta.y)
        const wmax = 2 * rho * rho * u1
        const zd = this.getZoom() + Math.log2(1 / wmax)
        zmin = Math.floor(
          Math.max(Math.min(zmin + zd, options.minZoom || zmin + zd), 0),
        )
      }
      return {
        sources: _sources,
        dimensions: _dimensions,
        tilesize: _tilesize,
        startCenter: [currentCenter.lng, currentCenter.lat],
        startZoom: this.getZoom(),
        // TODO Remove hardcoded zoom level filter
        // Currently the hype.hk tile server only supports zoom levels 1-14
        // So it doesn't make sense to fetch tiles for zoom levels higher than 14
        zmin: Math.min(zmin, 14),
      }
    }

    _lib.Map.prototype._context = _context
    _lib.Map.prototype._get_sources_from_style = _get_sources_from_style

    // build and manage the preloader worker
    const precache_run = function (this: typeof _lib.Map, o: MaplibreOptions) {
      if (window === self && !this.precache_worker) {
        this.precache_worker = new Worker(
          new URL('./maplibrePreloadWorker.ts', import.meta.url),
          { type: 'module' },
        )
        this.precache_worker.onmessage = (e: MessageEvent) => {
          this.precache_worker.time1 = e.data.t
          if (o.debug) {
          }
        }
      }
      // Some debugging info
      delete this.precache_worker.time1
      this.once('moveend', () => {
        if (this.precache_worker.time1 === undefined) {
          this.precache_worker.postMessage({ abort: true })
          if (o.debug) console.debug(`🔶 Movement has finished before preloading`)
        } else {
          if (o.debug)
            console.debug(
              `🔚 Movement ends ${
                this.precache_worker.time1
                  ? Date.now() - this.precache_worker.time1
                  : undefined
              } ms after precaching`,
            )
        }
      })
      this.precache_worker.time0 = Date.now()
      this.precache_worker.postMessage(o)
    }
    _lib.Map.prototype._precache = precache_run
  }

  console.log(`Built with 🗺️ MapLibre ${_lib.getVersion()}`)

  _lib.prewarm()
  return _lib as ExtendedMapLibre
}
