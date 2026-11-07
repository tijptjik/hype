// VALIDATION
import { z } from 'zod'
import { OperatingStatusSchema, BuildingStatusSchema } from './entityStatus'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. ENTITY-SPECIFIC FACTS
// ---

const names = z.record(z.string(), z.string())
export const LocationBrandsSchema = z.array(
  z.strictObject({ identifiers: names, names }),
)
const identifier = z.string().trim().min(1)

export const EstablishmentDetailsSchema = z.strictObject({
  brands: LocationBrandsSchema,
  operatingStatus: OperatingStatusSchema.nullable().optional(),
})

/** Building-specific lifecycle only. Optional footprint is a shared common fact.
 * Publisher identifiers and unneeded building attributes stay in SaanSeoi evidence;
 * address components already describe blocks, portions and floors.
 */
export const BuildingDetailsSchema = z.strictObject({
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
])
export type LocationEntity = z.infer<typeof LocationEntitySchema>
export type BuildingDetails = z.infer<typeof BuildingDetailsSchema>
