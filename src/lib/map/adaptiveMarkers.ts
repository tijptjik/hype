// PRESENTATION
import { resolveMarkerStyle } from '#lib/features/markerStyle.js'
// MAP
import { createMarkerRenderer, type MarkerRenderer } from './markers'
import { getFeaturePointCoordinates } from './featureSpatial'
import { createMarkerVisibilityTest } from './markerRetention'
import { createMarkerPointLayer, type MarkerPoint } from './markerPointLayer'
// TYPES
import type { Map as MapLibreMap, PointLike } from 'maplibre-gl'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { MapMarkerTheme } from './styles/catalog'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PRESENTATION POLICY
// - getPhotoMarkerBudget
// - pointTheme
// - presentationScope
// 2. ADAPTIVE RENDERER
// - createAdaptiveMarkerRenderer
// ---

type MarkerOptions = NonNullable<Parameters<MarkerRenderer['sync']>[1]>
type MarkerFactory = Parameters<typeof createMarkerRenderer>[1]

/** Individual canvas points remain selectable even when no photo overlay is attached. */
export type AdaptiveMarkerRenderer = MarkerRenderer & {
  getFeatureIdAt: (point: PointLike) => string | null
}

const POINT_PALETTES: Record<MapMarkerTheme, { color: string; strokeColor: string }> = {
  light: { color: '#fffaff', strokeColor: '#7b3fb4' },
  dark: { color: '#08070d', strokeColor: '#f7e7ef' },
  'etch-light': { color: '#fffaff', strokeColor: '#7b3fb4' },
  'etch-dark': { color: '#08070d', strokeColor: '#f7e7ef' },
  ghostery: { color: '#4ab6ec', strokeColor: '#d7f5ff' },
  hyperpop: { color: '#f04d7f', strokeColor: '#d4dbff' },
  neon: { color: '#f97316', strokeColor: '#fff2cb' },
  rosepunk: { color: '#e57ac5', strokeColor: '#fff0fb' },
}

/**
 * Reserves a conservative photo overlay budget independently of the feature count.
 * @param width - Map width in CSS pixels.
 * @param coarsePointer - Whether the primary input is touch-like, including tablets.
 * @returns Maximum photo overlays; individual canvas points do not use these slots.
 * @remarks This is a measured desktop starting policy, not an iPhone hardware estimate.
 */
export function getPhotoMarkerBudget(width: number, coarsePointer = false): number {
  return width < 768 || coarsePointer ? 150 : 500
}

/**
 * Resolves the same layer/project/map palette precedence as native markers.
 * @param feature - Feature whose hierarchy selects its presentation.
 * @param coordinates - Validated point coordinates.
 * @param options - Current map and hierarchy presentation choices.
 * @returns Point fill and contrasting outline.
 */
function pointTheme(
  feature: FeatureFromCollection,
  coordinates: [number, number],
  options: MarkerOptions,
): MarkerPoint {
  const fallback = options.markerTheme ?? 'ghostery'
  const layer = options.markerThemesByLayerId?.get(feature.layerId)
  const theme =
    layer === null
      ? fallback
      : (layer ?? options.markerThemesByProjectId?.get(feature.projectId) ?? fallback)
  return {
    id: feature.id,
    coordinates,
    ...POINT_PALETTES[theme],
    emphasisColor:
      options.selectedId === feature.id
        ? theme === 'light' || theme === 'etch-light'
          ? '#af245a'
          : '#d85f89'
        : theme === 'light' || theme === 'etch-light'
          ? '#08776f'
          : '#76d9ad',
    selected: options.selectedId === feature.id,
    highlighted: options.highlightedIds?.has(feature.id) ?? false,
  }
}

/**
 * Invalidates presentation retention at the existing filter/auth/style boundary.
 * @param options - Current query scope and renderer presentation.
 * @returns Stable identity excluding camera and transient selection state.
 */
function presentationScope(options: MarkerOptions): string {
  return JSON.stringify([
    options.retention?.scope,
    options.markerStyle ?? 'image',
    [...(options.markerStylesByProjectId ?? [])],
    [...(options.markerStylesByLayerId ?? [])],
    [...(options.breadlineStateByFeatureId ?? [])],
    options.markerTheme,
    [...(options.markerThemesByProjectId ?? [])],
    [...(options.markerThemesByLayerId ?? [])],
  ])
}

/**
 * Combines individual GPU points with stable, progressively created photo overlays.
 * @param map - Owning public map.
 * @param maplibre - Native marker factory.
 * @param coarsePointer - Current primary-input hint; evaluated again on resize.
 * @returns Renderer and canvas hit testing using only supplied, scoped feature rows.
 * @remarks Flags and Breadline status markers retain their full native presentation.
 * They do not consume the photo allowance. No generic cached selected record is added:
 * selection is promoted only within this renderer's current authorized scope.
 */
export function createAdaptiveMarkerRenderer(
  map: MapLibreMap,
  maplibre: MarkerFactory,
  coarsePointer: () => boolean = () => false,
): AdaptiveMarkerRenderer {
  const points = createMarkerPointLayer(map)
  const records = new Map<string, FeatureFromCollection>()
  let activeIds = new Set<string>()
  let chosenPhotos = new Set<string>()
  let scope: string | undefined
  let options: MarkerOptions = {}
  let disposed = false
  let moving = map.isMoving()
  let nativeLimit = 500
  const native = createMarkerRenderer(map, maplibre, undefined, {
    frameBudgetMs: 4,
    deferWhileMoving: true,
    attachRetained: false,
    maxAttached: () => nativeLimit,
  })

  /** Selects a bounded nearby return cache without expanding the old 64-slot policy. @returns Active and recent cached records. */
  const presentationRows = (): FeatureFromCollection[] => {
    const active = [...records.values()].filter(row => activeIds.has(row.id))
    const cached = [...records.values()].reverse().filter(row => !activeIds.has(row.id))
    const selected = cached.find(row => row.id === options.selectedId)
    const recent = selected
      ? [selected, ...cached.filter(row => row.id !== selected.id)].slice(0, 64)
      : cached.slice(0, 64)
    return [...active, ...recent]
  }

  /** Reconciles overlay detail at data changes and settled camera endpoints. @returns Nothing. */
  const reconcile = (): void => {
    if (disposed) return
    const rows = presentationRows()
    const near = createMarkerVisibilityTest(map)
    const inMotion = map.isMoving()
    const budget = getPhotoMarkerBudget(map.getContainer().clientWidth, coarsePointer())
    const custom: FeatureFromCollection[] = []
    const photos: FeatureFromCollection[] = []
    const dots: FeatureFromCollection[] = []
    const pointRows: MarkerPoint[] = []
    const distance = new Map<string, number>()
    const container = map.getContainer()
    const centerLongitude = map.getCenter().lng
    for (const row of rows) {
      const coordinates = getFeaturePointCoordinates(row.geometry)
      if (!coordinates) continue
      const style = resolveMarkerStyle(
        options.markerStylesByProjectId?.get(row.projectId),
        options.markerStylesByLayerId?.get(row.layerId),
        options.markerStyle ?? 'image',
      )
      if (style === 'flag' || style === 'breadline') custom.push(row)
      else {
        // Canvas anchors remain under photos, so attachment never rebuilds the GPU source.
        pointRows.push(pointTheme(row, coordinates, options))
        // Preserve the current detail during gestures without projecting every new row.
        // The final camera selects new overlays; a tapped point alone may promote now.
        if (inMotion) {
          if (style === 'dot') {
            if (row.id === options.selectedId) dots.push(row)
          } else if (chosenPhotos.has(row.id) || row.id === options.selectedId)
            photos.push(row)
          continue
        }
        if (near(coordinates)) {
          if (style === 'dot') dots.push(row)
          else {
            photos.push(row)
            const longitude =
              coordinates[0] +
              Math.round((centerLongitude - coordinates[0]) / 360) * 360
            const point = map.project([longitude, coordinates[1]])
            distance.set(
              row.id,
              Math.hypot(
                point.x - container.clientWidth / 2,
                point.y - container.clientHeight / 2,
              ),
            )
          }
        }
      }
    }
    // Keep existing overlays stable; selection and highlighted points get first claim.
    const rank = (row: FeatureFromCollection): number =>
      row.id === options.selectedId
        ? 0
        : options.highlightedIds?.has(row.id)
          ? 1
          : activeIds.has(row.id)
            ? chosenPhotos.has(row.id)
              ? 2
              : 3
            : chosenPhotos.has(row.id)
              ? 4
              : 5
    photos.sort(
      (left, right) =>
        rank(left) - rank(right) ||
        (rank(left) === 2 || rank(left) === 4
          ? 0
          : (distance.get(left.id) ?? 0) - (distance.get(right.id) ?? 0)),
    )
    const chosen = photos.slice(0, budget)
    const selectedDot = dots.find(row => row.id === options.selectedId)
    // Active operational markers keep their slots before decorative cached overlays.
    // Selection is pinned first even when the 500 native-slot ceiling is reached.
    const candidates = [...custom, ...chosen, ...(selectedDot ? [selectedDot] : [])]
    const selected = candidates.find(row => row.id === options.selectedId)
    const nativeRows = [
      ...new Map(
        [
          ...(selected ? [selected] : []),
          ...custom.filter(row => activeIds.has(row.id)),
          ...chosen,
          ...(selectedDot ? [selectedDot] : []),
          ...custom.filter(row => !activeIds.has(row.id)),
        ].map(row => [row.id, row]),
      ).values(),
    ].slice(0, 500)
    const admitted = new Set(nativeRows.map(row => row.id))
    chosenPhotos = new Set(
      chosen.filter(row => admitted.has(row.id)).map(row => row.id),
    )
    nativeLimit = Math.max(1, nativeRows.length)
    points.sync(pointRows)
    native.sync(nativeRows, options)
  }

  /** Refreshes the current endpoint; warm nodes may reattach during the gesture itself. @returns Nothing. */
  const onSettled = (): void => {
    moving = false
    reconcile()
  }
  /** Tracks synthetic resize movement as well as camera animations. @returns Nothing. */
  const onMoving = (): void => {
    moving = true
  }
  /** Defers intermediate resize work while a camera gesture is still active. @returns Nothing. */
  const onResize = (): void => {
    if (!moving && !map.isMoving()) reconcile()
  }
  map.on('movestart', onMoving)
  map.on('moveend', onSettled)
  map.on('resize', onResize)

  return {
    sync: (features, nextOptions = {}): void => {
      if (disposed) return
      const nextScope = presentationScope(nextOptions)
      if (scope !== nextScope || !nextOptions.retention) {
        records.clear()
        chosenPhotos.clear()
        points.sync([])
      }
      scope = nextScope
      options = nextOptions
      activeIds = new Set()
      for (const row of features) {
        records.delete(row.id)
        if (!getFeaturePointCoordinates(row.geometry)) continue
        records.set(row.id, row)
        activeIds.add(row.id)
      }
      const requested = options.retention?.budget ?? features.length
      const limit = Number.isFinite(requested)
        ? Math.max(activeIds.size, Math.min(1500, requested))
        : 1000
      // Match native retention: evict old offscreen records before returning neighbours.
      const near = createMarkerVisibilityTest(map)
      const cached = [...records.values()]
        .filter(row => !activeIds.has(row.id))
        .map(row => {
          const coordinates = getFeaturePointCoordinates(row.geometry)
          return { row, near: coordinates ? near(coordinates) : false }
        })
      cached.sort((left, right) => Number(left.near) - Number(right.near))
      for (const { row } of cached) {
        if (records.size <= limit) break
        records.delete(row.id)
      }
      reconcile()
    },
    getElement: id => native.getElement(id),
    getFeatureIdAt: point => points.getFeatureIdAt(point),
    updateCamera: force => native.updateCamera(force),
    clear: (): void => {
      if (disposed) return
      disposed = true
      map.off('movestart', onMoving)
      map.off('moveend', onSettled)
      map.off('resize', onResize)
      points.clear()
      native.clear()
      records.clear()
      chosenPhotos.clear()
      activeIds.clear()
    },
  }
}
