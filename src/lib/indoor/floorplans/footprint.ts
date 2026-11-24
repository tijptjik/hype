// DOMAIN
import { floorplanExtractionSchema, type FloorplanExtraction } from './extraction.js'
// TYPES
import type { ExteriorFootprint } from '#lib/locations/exterior/footprints.server.js'

export type FootprintFloorplan = {
  extraction: FloorplanExtraction
  image: string
  source: {
    kind: 'map-footprint'
    feature: ExteriorFootprint
    polygonIndex: number
    metresPerPixel: number
  }
}

/** Prepare a selected footprint as an unclassified, editable floor template.
 * @param feature Retained government footprint. @param polygonIndex Explicitly selected part.
 * @param label Authored floor label. @returns Review geometry, a numeric-only source diagram and provenance.
 * @remarks A footprint supplies an outline, not rooms, floor identity or evidence that every level has this shape.
 */
export function footprintFloorplan(
  feature: ExteriorFootprint,
  polygonIndex: number,
  label: string,
): FootprintFloorplan {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates
  const polygon = polygons[polygonIndex]
  if (!polygon?.length || polygon.length > 101 || !label.trim())
    throw new Error('Select a footprint part and name the floor.')
  if (polygon.some(ring => ring.length < 4 || ring.length > 512))
    throw new Error(
      'This footprint is too complex for the floor editor. Use an uploaded plan.',
    )
  const points = polygon.flat()
  if (
    points.some(
      p =>
        p.length < 2 ||
        !Number.isFinite(p[0]) ||
        !Number.isFinite(p[1]) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 85,
    )
  )
    throw new Error('Invalid footprint coordinates.')
  const west = Math.min(...points.map(p => p[0]))
  const east = Math.max(...points.map(p => p[0]))
  const north = Math.max(...points.map(p => p[1]))
  const south = Math.min(...points.map(p => p[1]))
  const metresPerDegree = (Math.PI * 6371008.8) / 180
  const longitudeScale = metresPerDegree * Math.cos(((north + south) * Math.PI) / 360)
  const widthMetres = (east - west) * longitudeScale
  const heightMetres = (north - south) * metresPerDegree
  if (
    widthMetres <= 0 ||
    heightMetres <= 0 ||
    Math.max(widthMetres, heightMetres) > 5000
  )
    throw new Error('Invalid building footprint extent.')
  // Preserve aspect ratio and all courtyard rings in a bounded, north-up source diagram.
  const metresPerPixel = Math.max(widthMetres, heightMetres) / 960
  const width = Math.ceil(widthMetres / metresPerPixel) + 40
  const height = Math.ceil(heightMetres / metresPerPixel) + 40
  const rings = polygon.map(ring =>
    ring.map(([lng, lat]): [number, number] => [
      20 + ((lng - west) * longitudeScale) / metresPerPixel,
      20 + ((north - lat) * metresPerDegree) / metresPerPixel,
    ]),
  )
  const extraction = floorplanExtractionSchema.parse({
    warnings: [
      'Map footprint only. Verify the outline for this floor and draw its interior spaces.',
    ],
    floors: [
      {
        id: 'footprint-floor',
        label: label.trim(),
        page: 1,
        width,
        height,
        boundary: rings[0],
        holes: rings.slice(1),
        warnings: [],
        units: [],
      },
    ],
  })
  const path = rings
    .map(ring => `M${ring.map(point => point.join(',')).join('L')}Z`)
    .join(' ')
  return {
    extraction,
    image: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="#e2e8f0" fill-rule="evenodd" stroke="#64748b" stroke-width="2"/></svg>`,
    source: { kind: 'map-footprint', feature, polygonIndex, metresPerPixel },
  }
}
