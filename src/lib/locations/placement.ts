// VALIDATION
import { z } from 'zod'
// DOMAIN
import {
  type LocalLocationAddressSchema,
  LocalAddressI18nSchema,
} from '#lib/addresses/localLocationAddress.js'
import type { RelationshipEvidence } from './relationships'
import { equalLocationValue } from './baseline'

export const AddressFieldsSchema = z.record(
  z.string().min(1).max(35),
  z.partialRecord(
    z.enum([
      'floorExpression',
      'unitExpression',
      'unitPortion',
      ...Object.keys(LocalAddressI18nSchema.shape),
    ]),
    z.union([z.string().max(4000), z.boolean(), z.null()]),
  ),
)
export const AddressCorrectionSchema = z.strictObject({
  baseAddressRevisionId: z.string().min(1),
  fields: AddressFieldsSchema,
})
export type AddressCorrection = z.infer<typeof AddressCorrectionSchema>
export const PlacementDecisionSchema = z.strictObject({
  action: z.enum(['move', 'keep', 'later']),
  addressChoice: z.enum(['accept', 'keep']).optional(),
  unitDetails: z.enum(['keep', 'clear']).optional(),
  directions: z.enum(['keep', 'clear', 'replace']).optional(),
  accessHints: z.record(z.string(), z.string().max(4000).nullable()).optional(),
  useDestinationPin: z.boolean().optional(),
  geometry: z
    .strictObject({
      type: z.literal('Point'),
      coordinates: z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
      ]),
    })
    .optional(),
})
export type PlacementDecision = z.infer<typeof PlacementDecisionSchema>
export type PlacementEvidence = {
  version: 1
  kind: 'relocation' | 'address'
  occupancyRevisionId: string | null
  addressRevisionId: string | null
  membershipRevisionIds: string[]
  relationshipSnapshot: { locationIds: string[]; signature: string }
  relationshipHeads: {
    table: 'locationOccupancy' | 'locationMembership' | 'locationAddress'
    id: string
    relationshipId: string
  }[]
  organisationRevision: string | null
  geometry: { type: 'Point'; coordinates: [number, number] } | null
  policy: 'fixed' | 'review' | 'follow'
  blockers: string[]
  beforeAddressRevisionId: string | null
  beforeAccessHints: Record<string, string | null>
  beforeOverrides: Record<string, Record<string, string | boolean | null>>
  beforeUnitDetails?: unknown
  beforeAddressDisplay: string
  occupancyEvidence: RelationshipEvidence[]
  occupancyVerifiedAt: string | null
  beforeGeometry: unknown
  content: z.infer<typeof LocalLocationAddressSchema> | null
}
/** Reassert sparse fields on a reviewed canonical version, retiring equal values only.
 * @param fields Explicit local differences. @param content Reviewed canonical content.
 * @returns Remaining differences; prior immutable rows are never changed.
 */
export function reconcileAddressFields(
  fields: AddressCorrection['fields'],
  content: z.infer<typeof LocalLocationAddressSchema>,
): AddressCorrection['fields'] {
  const result: AddressCorrection['fields'] = {}
  for (const [locale, values] of Object.entries(fields)) {
    const baseline = content.i18n[locale] as Record<string, unknown> | undefined
    const remaining = Object.fromEntries(
      Object.entries(values).filter(
        ([key, value]) => !equalLocationValue(value, baseline?.[key] ?? null),
      ),
    )
    if (Object.keys(remaining).length) result[locale] = remaining
  }
  return result
}
