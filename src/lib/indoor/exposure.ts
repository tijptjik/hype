// GEOMETRY
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping'
// DOMAIN
import { bounds, value, type IndoorData, type IndoorFeature, type Place } from './model'
import { isConnector } from './spatial'

const cache = new WeakMap<IndoorData, Map<string, IndoorFeature>>()

/** Units in floor paint order, excluding duplicate schematic hotspots.
 * @param data Published snapshot. @returns Source units, with connector surfaces last.
 */
export function paintedIndoorUnits(data: IndoorData): IndoorFeature[] {
  // Blank duplicate website hotspots must not cover a named tenant or its mark.
  const units = data.unit_polygon.features.filter(
    unit =>
      data.coordinateSpace !== 'image-pixels' ||
      unit.properties.source_shop_id !== 'shop_' ||
      !data.unit_polygon.features.some(
        other =>
          other !== unit &&
          other.properties.level_id === unit.properties.level_id &&
          other.properties.source_coords === unit.properties.source_coords &&
          other.properties.source_shop_id !== 'shop_',
      ),
  )
  return units.toSorted(
    (a, b) =>
      Number(isConnector(value(a.properties, 'unit_category'))) -
      Number(isConnector(value(b.properties, 'unit_category'))),
  )
}

/** Convert polygon geometry for boolean operations.
 * @param feature Source polygon. @returns Polygon coordinates or null for point/line features.
 */
function polygon(feature: IndoorFeature): Polygon | MultiPolygon | null {
  return feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'
    ? (feature.geometry.coordinates as Polygon | MultiPolygon)
    : null
}

/** Remove later opaque units on the same floor, preserving holes and partial exposure.
 * @param feature Target polygon. @param covering Later painted polygons.
 * @returns Remaining selectable geometry, or null when completely covered.
 */
function exposed(
  feature: IndoorFeature,
  covering: IndoorFeature[],
): IndoorFeature | null {
  const shape = polygon(feature)
  if (!shape) return feature
  const box = bounds(feature)
  const overlaps = covering.filter(other => {
    if (other.properties.level_id !== feature.properties.level_id || !polygon(other))
      return false
    const b = bounds(other)
    return b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1]
  })
  if (!overlaps.length) return feature
  const coordinates = polygonClipping.difference(
    shape,
    ...overlaps.flatMap(other => {
      const shape = polygon(other)
      return shape ? [shape] : []
    }),
  )
  return coordinates.length
    ? { ...feature, geometry: { type: 'MultiPolygon', coordinates } }
    : null
}

/** Exposed click shapes shared by the directory and the map.
 * @param data Immutable published snapshot. @returns Source unit identities with remaining geometry.
 * @remarks Source geometry is never changed. Other floors and point markers do not occlude units.
 */
export function exposedIndoorUnits(data: IndoorData): Map<string, IndoorFeature> {
  const cached = cache.get(data)
  if (cached) return cached
  const units = paintedIndoorUnits(data)
  const result = new Map<string, IndoorFeature>()
  for (const [index, unit] of units.entries()) {
    const visible = exposed(unit, units.slice(index + 1))
    if (visible) result.set(value(unit.properties, 'unit_id'), visible)
  }
  cache.set(data, result)
  return result
}

/** Exclude covered polygon destinations while retaining independent point amenities.
 * @param data Published snapshot. @param entries Joined directory entries.
 * @returns Places with some exposed geometry or a visible point marker.
 */
export function exposedIndoorPlaces(data: IndoorData, entries: Place[]): Place[] {
  const visible = exposedIndoorUnits(data)
  const units = paintedIndoorUnits(data)
  return entries.filter(place => {
    if ((place.markerFeature ?? place.feature).geometry.type === 'Point') return true
    const unitId = value(place.feature.properties, 'unit_id')
    const index = units.findIndex(unit => value(unit.properties, 'unit_id') === unitId)
    if (index < 0)
      return !data.unit_polygon.features.some(
        unit => value(unit.properties, 'unit_id') === unitId,
      )
    if (!visible.has(unitId)) return false
    return Boolean(exposed(place.feature, units.slice(index + 1)))
  })
}
