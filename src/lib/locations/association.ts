// VALIDATION
import { z } from 'zod'
// ADDRESS
import { LocalLocationAddressSchema } from '#lib/addresses/localLocationAddress.js'
import { LocationFactsSchema } from './validation'

export const ASSOCIATION_KINDS = [
  'address',
  'premises',
  'building',
  'building_part',
  'infrastructure',
  'built',
  'structure',
  'landform',
  'coastal_feature',
  'water_feature',
  'service_point',
  'street',
  'natural',
  'establishment',
] as const
export const AssociationKindSchema = z.enum(ASSOCIATION_KINDS)
export type AssociationKind = z.infer<typeof AssociationKindSchema>
export const AssociationLookupSchema = z.enum([
  'not-checked',
  'checking',
  'matched',
  'no-match',
  'ambiguous',
  'failed',
  'deferred',
])
export type AssociationLookup = z.infer<typeof AssociationLookupSchema>

/** Feature-owned association intent and address evidence; independent of Location visibility. */
export const AddressAssociationSchema = z.strictObject({
  originKind: AssociationKindSchema,
  kind: AssociationKindSchema,
  mode: z.enum(['manual', 'unlinked', 'linked']),
  lookup: AssociationLookupSchema,
  checkedAt: z.string().optional(),
  names: z.record(z.string(), z.string().max(1000)).default({}),
  targetId: z.string().optional(),
  buildingId: z.string().min(1).max(200).optional(),
  parentPartId: z.string().min(1).max(200).optional(),
  // Both immutable publications survive component choices; no mixed source identity is invented.
  originalSource: LocationFactsSchema.shape.location.shape.address.optional(),
  matchedSource: LocationFactsSchema.shape.location.shape.address.optional(),
  content: LocalLocationAddressSchema.optional(),
  choices: z.record(z.string(), z.enum(['original', 'location', 'custom'])).optional(),
})
export type AddressAssociation = z.infer<typeof AddressAssociationSchema>
