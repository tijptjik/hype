// TYPES
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

export type ExteriorFootprintProperties = {
  csuid: string
  name: string
  nameZh: string
  geoRef: string
}
export type ExteriorFootprint = Feature<
  Polygon | MultiPolygon,
  ExteriorFootprintProperties
>

/** Load Lands Department building polygons around the location for visual comparison.
 * @param x Hong Kong 1980 easting. @param y Hong Kong 1980 northing.
 * @returns Source polygons and their official names and CSUIDs.
 * @remarks A shared coordinate key proposes a model match and does not establish identity.
 */
export async function loadExteriorFootprints(
  x: number,
  y: number,
): Promise<FeatureCollection<Polygon | MultiPolygon, ExteriorFootprintProperties>> {
  const url = new URL(
    'https://portal.csdi.gov.hk/server/rest/services/common/landsd_rcd_1637211194312_35158/FeatureServer/0/query',
  )
  for (const [key, value] of Object.entries({
    geometry: `${x - 250},${y - 250},${x + 250},${y + 250}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '2326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'BuildingCSUID,BuildingNameEN,BuildingNameTC,GeoRefNo',
    returnGeometry: 'true',
    resultRecordCount: '3000',
    f: 'geojson',
  }))
    url.searchParams.set(key, value)
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error('Could not load building footprints')
  const result = (await response.json()) as FeatureCollection<
    Polygon | MultiPolygon,
    Record<string, unknown>
  > & { exceededTransferLimit?: boolean }
  if (
    result.type !== 'FeatureCollection' ||
    !Array.isArray(result.features) ||
    result.exceededTransferLimit
  )
    throw new Error('Incomplete building footprint results')
  return {
    type: 'FeatureCollection',
    features: result.features.flatMap(feature => {
      const props = feature.properties
      if (
        !feature.geometry ||
        !['Polygon', 'MultiPolygon'].includes(feature.geometry.type) ||
        typeof props?.BuildingCSUID !== 'string' ||
        typeof props.GeoRefNo !== 'string'
      )
        return []
      return [
        {
          type: 'Feature' as const,
          geometry: feature.geometry,
          properties: {
            csuid: props.BuildingCSUID,
            geoRef: props.GeoRefNo,
            name: typeof props.BuildingNameEN === 'string' ? props.BuildingNameEN : '',
            nameZh:
              typeof props.BuildingNameTC === 'string' ? props.BuildingNameTC : '',
          },
        },
      ]
    }),
  }
}
