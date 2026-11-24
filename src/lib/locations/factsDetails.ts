import { LocalizedCurationTextSchema } from './curationIdentity'
// VALIDATION
import { z } from 'zod'
import { OperatingStatusSchema, BuildingStatusSchema } from './entityStatus'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. ENTITY-SPECIFIC FACTS
// ---

const names = z.record(z.string(), z.string())
export const LocationBrandsSchema = z.array(
  z.strictObject({
    identifiers: names,
    names,
    logo: z
      .string()
      .regex(/^\/api\/identity-catalogue\/logos\/[a-f0-9-]+$/)
      .nullable()
      .optional(),
  }),
)
const identifier = z.string().trim().min(1)

export const EstablishmentDetailsSchema = z.strictObject({
  branch: LocalizedCurationTextSchema.optional(),
  format: LocalizedCurationTextSchema.optional(),
  branchId: z.string().max(200).optional(),
  groupId: z.string().min(1).nullable().optional(),
  brandId: z.string().min(1).nullable().optional(),
  brands: LocationBrandsSchema,
  operatingStatus: OperatingStatusSchema.nullable().optional(),
})

/** Building-specific naming and lifecycle facts. Optional footprint is a shared common fact.
 * Publisher identifiers and unneeded building attributes stay in SaanSeoi evidence;
 * address components already describe blocks, portions and floors.
 */
export const BuildingDetailsSchema = z.strictObject({
  confirmedUnnamed: z.boolean().optional(),
  buildingStatus: BuildingStatusSchema.nullable().optional(),
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

/** Unknown entities carry no facts that would establish a more specific kind. */
export const UnknownDetailsSchema = z.strictObject({})

export const PremisesDetailsSchema = z.strictObject({
  type: z.enum(['site', 'complex']).nullable().optional(),
  kind: z
    .enum([
      'estate',
      'mall',
      'office',
      'hotel',
      'school',
      'university',
      'hospital',
      'airport',
      'railway',
      'bus',
      'ferry',
      'industrial',
      'logistics',
      'depot',
      'park',
      'sports',
      'religious',
      'cemetery',
      'government',
    ])
    .nullable()
    .optional(),
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
  z.strictObject({ kind: z.literal('premises'), details: PremisesDetailsSchema }),
  // Physical identity is explicit; address components and occupants remain independent.
  z.strictObject({ kind: z.literal('building_part'), details: z.strictObject({}) }),
  z.strictObject({ kind: z.literal('infrastructure'), details: z.strictObject({}) }),
  z.strictObject({ kind: z.literal('street'), details: z.strictObject({}) }),
  z.strictObject({ kind: z.literal('built'), details: z.strictObject({}) }),
  z.strictObject({ kind: z.literal('structure'), details: z.strictObject({}) }),
  z.strictObject({ kind: z.literal('landform'), details: NaturalDetailsSchema }),
  z.strictObject({ kind: z.literal('coastal_feature'), details: NaturalDetailsSchema }),
  z.strictObject({ kind: z.literal('water_feature'), details: NaturalDetailsSchema }),
  z.strictObject({ kind: z.literal('service_point'), details: z.strictObject({}) }),
  // Retained immutable snapshots only; these are no longer authorable Location classes.
  z.strictObject({ kind: z.literal('premises_address'), details: z.strictObject({}) }),
  z.strictObject({ kind: z.literal('cadastral_address'), details: z.strictObject({}) }),
  z.strictObject({ kind: z.literal('linear_reference'), details: z.strictObject({}) }),
])
export type LocationEntity = z.infer<typeof LocationEntitySchema>
export type BuildingDetails = z.infer<typeof BuildingDetailsSchema>
