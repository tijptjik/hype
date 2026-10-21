// VALIDATION
import { z } from 'zod'
import { OperatingStatusSchema, BuildingStatusSchema } from './entityStatus'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. SOURCE AND GEOMETRY REFERENCES
// 2. ENTITY-SPECIFIC FACTS
// ---

const names = z.record(z.string(), z.string())
export const LocationBrandsSchema = z.array(
  z.strictObject({ identifiers: names, names }),
)
const identifier = z.string().trim().min(1)
// Mutable aliases cannot pin historical geometry even when a revision token is present.
const immutableIdentifier = identifier.refine(
  value => !['latest', 'current'].includes(value.toLowerCase()),
  'An immutable release or geometry revision is required',
)
const metres = z.number().finite()
const count = z.number().int().nonnegative()
const day = z.iso.date()

/** Publisher identity and inventory remain distinct from HYPE/SaanSeoi identity. */
export const BuildingSourceSchema = z.discriminatedUnion('inventory', [
  z.strictObject({
    inventory: z.literal('landsd'),
    buildingCSUID: identifier,
    buildingId: z.number().int().nonnegative().optional(),
    geoRefNo: identifier.optional(),
    // Inventory status is not a claim of business operation or physical demolition.
    recordStatus: identifier.optional(),
    recordCreatedOn: day.optional(),
    recordUpdatedOn: day.optional(),
  }),
  z.strictObject({ inventory: z.literal('overture'), gersId: identifier }),
])

const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
const ring = z
  .array(coordinate)
  .min(4)
  .refine(
    points =>
      points[0][0] === points[points.length - 1][0] &&
      points[0][1] === points[points.length - 1][1],
    'Polygon rings must be closed',
  )
const polygon = z.array(ring).min(1)
export const BuildingFootprintGeometrySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('Polygon'), coordinates: polygon }),
  z.strictObject({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(polygon).min(1),
  }),
])

/** An immutable geometry reference avoids copying footprints for attribute-only revisions. */
export const BuildingFootprintSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('reference'),
    inventory: z.enum(['landsd', 'overture']),
    sourceRecordId: identifier,
    releaseId: immutableIdentifier,
    geometryRevisionId: immutableIdentifier,
    areaSquareMetres: z.number().finite().nonnegative().optional(),
  }),
  z.strictObject({
    mode: z.literal('inline'),
    geometry: BuildingFootprintGeometrySchema,
    areaSquareMetres: z.number().finite().nonnegative().optional(),
  }),
])

export const EstablishmentDetailsSchema = z.strictObject({
  brands: LocationBrandsSchema,
  operatingStatus: OperatingStatusSchema.nullable().optional(),
})

/** Practical building facts; no material, roof, inferred construction-date or occupancy fields. */
export const BuildingDetailsSchema = z
  .strictObject({
    buildingStatus: BuildingStatusSchema.nullable().optional(),
    structureType: z
      .enum(['tower', 'podium', 'temporary_structure', 'open_sided_structure'])
      .optional(),
    storeysAboveGround: count.optional(),
    storeysBelowGround: count.optional(),
    elevations: z
      .strictObject({
        verticalDatum: z.literal('HKPD'),
        baseMetres: metres.optional(),
        topMetres: metres.optional(),
      })
      .refine(
        value => value.baseMetres !== undefined || value.topMetres !== undefined,
        'At least one elevation is required',
      )
      .optional(),
    heightMetres: z.number().finite().nonnegative().optional(),
    heightMethod: z.enum(['source', 'top_minus_base']).optional(),
    footprint: BuildingFootprintSchema.optional(),
    source: BuildingSourceSchema.optional(),
  })
  .superRefine((value, ctx) => {
    // Different inventories must never be silently combined into one source assertion.
    if (
      value.footprint?.mode === 'reference' &&
      value.source &&
      value.footprint.inventory !== value.source.inventory
    )
      ctx.addIssue({
        code: 'custom',
        path: ['footprint'],
        message: 'Footprint and building must use the same inventory',
      })
    if (
      value.footprint?.mode === 'reference' &&
      value.source &&
      value.footprint.sourceRecordId !==
        (value.source.inventory === 'landsd'
          ? value.source.buildingCSUID
          : value.source.gersId)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['footprint'],
        message: 'Footprint must reference the same publisher building identity',
      })
    if ((value.heightMetres === undefined) !== (value.heightMethod === undefined))
      ctx.addIssue({
        code: 'custom',
        path: ['heightMetres'],
        message: 'Height and its derivation method must be supplied together',
      })
    if (value.heightMethod === 'top_minus_base') {
      const base = value.elevations?.baseMetres,
        top = value.elevations?.topMetres
      if (
        base === undefined ||
        top === undefined ||
        top < base ||
        Math.abs(top - base - (value.heightMetres ?? NaN)) > 0.000001
      )
        ctx.addIssue({
          code: 'custom',
          path: ['heightMetres'],
          message:
            'Derived height must equal top minus base in the same vertical datum',
        })
    }
  })

/** Preserve classification vocabulary until the natural-feature source adapter is available. */
export const NaturalDetailsSchema = z.strictObject({
  classification: z
    .strictObject({
      scheme: z.enum(['overture', 'saanseoi', 'local']),
      category: identifier,
      subcategory: identifier.optional(),
    })
    .optional(),
})

/** Unclassified legacy entities may retain contacts/lifecycle without inventing a classification. */
export const UnknownDetailsSchema = z.strictObject({
  brands: LocationBrandsSchema.optional(),
  operatingStatus: OperatingStatusSchema.nullable().optional(),
  buildingStatus: BuildingStatusSchema.nullable().optional(),
})

export const LocationEntitySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('establishment'),
    details: EstablishmentDetailsSchema,
  }),
  z.strictObject({ kind: z.literal('building'), details: BuildingDetailsSchema }),
  z.strictObject({ kind: z.literal('natural'), details: NaturalDetailsSchema }),
  z.strictObject({ kind: z.literal('address'), details: z.strictObject({}) }),
  z.strictObject({ kind: z.literal('unknown'), details: UnknownDetailsSchema }),
])
export type LocationEntity = z.infer<typeof LocationEntitySchema>
export type BuildingDetails = z.infer<typeof BuildingDetailsSchema>
