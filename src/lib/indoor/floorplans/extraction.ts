// VALIDATION
import { z } from 'zod'
// GEOMETRY
import polygonClipping, { type MultiPolygon } from 'polygon-clipping'
// DOMAIN
import { collection, layerNames, type IndoorData } from '../model.js'
import { polygonLabels } from '../labels.js'
import { stairFlightsSchema } from '../stairFlights.js'
import { validateMapBundle, type MapBundle } from '../releases.js'

// TOC: Review schema | Indoor map conversion
export const floorplanCategories = [
  'room',
  'corridor',
  'stairs',
  'elevator',
  'toilet',
  'kitchen',
  'lavatory',
  'balcony',
  'void',
  'retail',
  'roof',
  'canopy',
  'utility',
  'structure',
  'unknown',
] as const

const point = z.tuple([
  z.number().finite().nonnegative(),
  z.number().finite().nonnegative(),
])
/** Reject crossed or zero-area outlines before they reach the indoor renderer.
 * @param points Closed source-pixel ring. @returns Whether it is a simple nondegenerate polygon.
 */
function simpleRing(points: [number, number][]): boolean {
  const cross = (a: number[], b: number[], c: number[]): number =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  let area = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1]
    if (a[0] === b[0] && a[1] === b[1]) return false
    area += a[0] * b[1] - b[0] * a[1]
    for (let j = i + 2; j < points.length - 1; j++) {
      if (i === 0 && j === points.length - 2) continue
      const c = points[j],
        d = points[j + 1]
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
        return false
    }
  }
  return Math.abs(area) > 0.01
}
const ring = z
  .array(point)
  .min(4)
  .max(512)
  .refine(simpleRing, 'Polygon crosses itself or has no area')
  .refine(
    points => points[0][0] === points.at(-1)![0] && points[0][1] === points.at(-1)![1],
    'Close polygon rings',
  )
export const floorplanExtractionSchema = z
  .object({
    venue: z
      .object({
        name: z.string().trim().min(1).max(200),
        nameZh: z.string().max(200).optional(),
        address: z.string().max(500).optional(),
      })
      .optional(),
    warnings: z.array(z.string().max(2000)).max(1000),
    floors: z
      .array(
        z.object({
          id: z
            .string()
            .regex(/^[a-z0-9-]+$/)
            .max(100),
          label: z.string().max(200),
          page: z.number().int().min(1).max(12),
          width: z.number().positive().max(10000),
          height: z.number().positive().max(10000),
          boundary: ring,
          holes: z.array(ring).max(100).optional(),
          locationId: z.string().min(1).max(200).optional(),
          sourceFloorId: z.string().max(100).optional(),
          outlineOnly: z.literal(true).optional(),
          alignment: z
            .object({
              x: z.number().finite().min(-10000).max(10000),
              y: z.number().finite().min(-10000).max(10000),
              scale: z.number().finite().positive().max(100),
              rotation: z.number().finite().min(-180).max(180),
            })
            .optional(),
          warnings: z.array(z.string().max(2000)).max(1000),
          units: z
            .array(
              z.object({
                id: z
                  .string()
                  .regex(/^[a-z0-9-]+$/)
                  .max(100),
                label: z.string().max(300),
                category: z.enum(floorplanCategories),
                unitReference: z.string().trim().min(1).max(80).optional(),
                showUnitReference: z.boolean().optional(),
                stairFlights: stairFlightsSchema.optional(),
                polygon: ring,
                holes: z.array(ring).max(100).optional(),
                locationId: z.string().min(1).max(200).optional(),
                confidence: z.number().min(0).max(1),
                evidence: z.string().max(2000),
              }),
            )
            .max(300),
        }),
      )
      .min(1)
      .max(24),
  })
  .superRefine((result, ctx) => {
    const ids = new Set<string>()
    for (const floor of result.floors) {
      if (ids.has(floor.id))
        ctx.addIssue({ code: 'custom', message: 'Duplicate floor identity' })
      ids.add(floor.id)
      // Voids must be wholly enclosed; overlapping or external rings are not valid holes.
      for (const shape of [
        { polygon: floor.boundary, holes: floor.holes },
        ...floor.units,
      ]) {
        for (const [index, hole] of (shape.holes ?? []).entries()) {
          if (
            polygonClipping.difference([hole], [shape.polygon]).length ||
            (shape.holes ?? [])
              .slice(0, index)
              .some(other => polygonClipping.intersection([hole], [other]).length)
          )
            ctx.addIssue({
              code: 'custom',
              message: 'Void rings must be enclosed and must not overlap.',
            })
        }
      }
      const units = new Set<string>()
      for (const unit of floor.units) {
        if (units.has(unit.id))
          ctx.addIssue({ code: 'custom', message: 'Duplicate unit identity' })
        units.add(unit.id)
        for (const flight of unit.stairFlights ?? []) {
          const footprint = [
            ...flight.first,
            ...[...flight.last].reverse(),
            flight.first[0],
          ]
          if (
            unit.category !== 'stairs' ||
            !simpleRing(footprint) ||
            polygonClipping.difference(
              [footprint],
              [unit.polygon, ...(unit.holes ?? [])],
            ).length
          )
            ctx.addIssue({
              code: 'custom',
              message: 'Stair flights must lie inside their stair enclosure.',
            })
        }
      }
      for (const polygon of [
        floor.boundary,
        ...(floor.holes ?? []),
        ...floor.units.flatMap(unit => [unit.polygon, ...(unit.holes ?? [])]),
      ])
        if (polygon.some(([x, y]) => x > floor.width || y > floor.height))
          ctx.addIssue({
            code: 'custom',
            message: 'Polygon lies outside its source page',
          })
    }
  })
export type FloorplanExtraction = z.infer<typeof floorplanExtractionSchema>

/** Identify uncovered floor space without inventing a circulation classification.
 * @param floor Source-page floor geometry. @returns Residual polygons, including holes, for explicit review.
 * @remarks Residuals can include walls or omitted rooms; they are never inferred to be walkable.
 */
export function floorplanUnclassified(
  floor: FloorplanExtraction['floors'][number],
): MultiPolygon {
  if (!floor.units.length) return [[floor.boundary, ...(floor.holes ?? [])]]
  const residual = polygonClipping.difference(
    [floor.boundary, ...(floor.holes ?? [])],
    ...floor.units.map(unit => [unit.polygon, ...(unit.holes ?? [])]),
  )
  // Intersections along a fully covered sloping edge can produce a floating-point sliver.
  return residual.filter(([outer]) => {
    const [x, y] = outer[0]
    let twiceArea = 0
    for (let i = 1; i < outer.length - 1; i++) {
      const a = outer[i],
        b = outer[i + 1]
      twiceArea += (a[0] - x) * (b[1] - y) - (a[1] - y) * (b[0] - x)
    }
    return Math.abs(twiceArea) > 1e-8
  })
}

/** Convert reviewed extraction to existing indoor layers, without fabricating routes or geographic positions.
 * @param input Original scan-coordinate extraction. @returns Unpublished image-pixel indoor bundle.
 * @remarks Each floor uses its boundary origin and explicitly reviewed offset, scale and rotation. No floor range, geographic placement or cross-floor alignment is inferred.
 */
export function floorplanBundle(input: unknown): MapBundle {
  const parsed = floorplanExtractionSchema.parse(input)
  const data = Object.fromEntries(
    layerNames.map(name => [name, collection([])]),
  ) as unknown as IndoorData
  data.coordinateSpace = 'image-pixels'
  data.retrievedAt = new Date().toISOString()
  data.connections = []
  data.source = 'Reviewed GBP extraction draft'
  for (const [index, floor] of parsed.floors.entries()) {
    const left = Math.min(...floor.boundary.map(point => point[0]))
    const top = Math.min(...floor.boundary.map(point => point[1]))
    const alignment = floor.alignment ?? { x: 0, y: 0, scale: 1, rotation: 0 }
    const radians = (alignment.rotation * Math.PI) / 180
    const transform = ([x, y]: number[]): number[] => {
      const dx = (x - left) * alignment.scale,
        dy = (y - top) * alignment.scale
      return [
        dx * Math.cos(radians) - dy * Math.sin(radians) + alignment.x,
        dx * Math.sin(radians) + dy * Math.cos(radians) + alignment.y,
      ]
    }
    const polygon = (points: number[][], holes: number[][][] = []) => ({
      type: 'Polygon' as const,
      coordinates: [points.map(transform), ...holes.map(ring => ring.map(transform))],
    })
    data.level_polygon.features.push({
      type: 'Feature',
      geometry: polygon(floor.boundary, floor.holes),
      properties: {
        level_id: floor.id,
        ...(floor.locationId ? { canonical_location_id: floor.locationId } : {}),
        level_name_en: floor.label,
        level_short_name_en: floor.label,
        level_ordinal: index,
        source_page: floor.page,
        source_floor_id: floor.sourceFloorId ?? floor.id,
        review_required: true,
      },
    })
    if (index === 0)
      data.venue_polygon.features.push({
        type: 'Feature',
        geometry: polygon(floor.boundary, floor.holes),
        properties: {
          venue_id: 'building',
          ...(parsed.venue
            ? {
                venue_name_en: parsed.venue.name,
                venue_name_zh: parsed.venue.nameZh,
                venue_address_en: parsed.venue.address,
              }
            : {}),
        },
      })
    // Retain uncovered space explicitly, rather than letting the floor background imply circulation.
    // An explicitly empty footprint is a coordinate surface without a selectable unit.
    const residual =
      floor.outlineOnly && !floor.units.length ? [] : floorplanUnclassified(floor)
    if (residual.length)
      data.unit_polygon.features.push({
        type: 'Feature',
        geometry: {
          type: 'MultiPolygon',
          coordinates: residual.map(part => part.map(ring => ring.map(transform))),
        },
        properties: {
          unit_id: floor.id + '-unclassified-space',
          level_id: floor.id,
          unit_name_en: 'Unclassified space — review required',
          unit_category: 'unknown',
          source_page: floor.page,
          review_required: true,
          extraction_residual: true,
          source_evidence:
            'Uncovered floor area; may include walls, columns or omitted compartments. Not inferred circulation.',
        },
      })
    for (const unit of floor.units) {
      const geometry = polygon(unit.polygon, unit.holes)
      const unitId = floor.id + '-' + unit.id
      const shortAddress = [unit.unitReference, floor.label].filter(Boolean).join(', ')
      data.unit_polygon.features.push({
        type: 'Feature',
        geometry,
        properties: {
          unit_id: unitId,
          ...(parsed.venue?.address
            ? { unit_address_en: [shortAddress, parsed.venue.address].join(', ') }
            : {}),
          ...(unit.unitReference && unit.showUnitReference
            ? { unit_unitnumbername: shortAddress }
            : {}),
          ...(unit.stairFlights
            ? {
                stair_flights: unit.stairFlights.map(flight => ({
                  ...flight,
                  first: flight.first.map(transform),
                  last: flight.last.map(transform),
                })),
              }
            : {}),
          ...(unit.locationId ? { canonical_location_id: unit.locationId } : {}),
          level_id: floor.id,
          unit_name_en: unit.label,
          unit_category: unit.category,
          extraction_confidence: unit.confidence,
          source_evidence: unit.evidence,
          source_page: floor.page,
          review_required: true,
        },
      })
      if (['kitchen', 'lavatory', 'toilet'].includes(unit.category)) {
        const [anchor] = polygonLabels(
          { type: 'Feature', geometry, properties: {} },
          p => [p[0], p[1]],
        )
        if (anchor)
          data.amenity_point.features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: anchor.point },
            properties: {
              level_id: floor.id,
              unit_id: unitId,
              amenity_id: unitId + '-symbol',
              amenity_category: unit.category,
              amenity_name_en: unit.label,
              marker_role: 'unit_symbol',
            },
          })
      }
    }
  }
  return validateMapBundle({ schemaVersion: 1, data, documents: [] })
}
