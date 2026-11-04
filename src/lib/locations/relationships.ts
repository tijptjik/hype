// VALIDATION
import { z } from 'zod'

const id = z.string().trim().min(1).max(200)
export const DatePrecisionSchema = z.enum(['day', 'month', 'year', 'decade'])
/** Validate a historical boundary without padding unknown months or days.
 * @param value Original boundary string. @param precision Supported accuracy.
 * @returns Whether the string denotes a real date at that precision.
 */
export function validKnownDate(
  value: string,
  precision: z.infer<typeof DatePrecisionSchema>,
): boolean {
  if (precision === 'year' || precision === 'decade')
    return (
      /^\d{4}$/.test(value) &&
      Number(value) > 0 &&
      (precision !== 'decade' || Number(value) % 10 === 0)
    )
  if (precision === 'month')
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) > 0
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) > 0 &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}
export const KnownDateSchema = z
  .strictObject({ value: z.string(), precision: DatePrecisionSchema })
  .refine(v => validKnownDate(v.value, v.precision), 'Invalid historical date')
  .nullable()
export const RelationshipEvidenceSchema = z
  .strictObject({
    source: z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('url'),
        url: z.url().refine(v => /^https?:/.test(v)),
        accessedAt: z.iso.datetime(),
      }),
      z.strictObject({
        kind: z.literal('record'),
        resourceType: z.enum([
          'locationRevision',
          'addressRevision',
          'locationAddress',
          'locationMembership',
          'locationOccupancy',
          'locationTransition',
        ]),
        revisionId: id,
      }),
      z.strictObject({ kind: z.literal('image'), imageId: id, contentHash: id }),
    ]),
    supports: z.array(id).min(1),
    quotedText: z.string().trim().max(4000).nullable(),
    description: z.string().trim().max(4000).nullable(),
    sourceDate: KnownDateSchema,
  })
  .refine(
    v => Boolean(v.quotedText || v.description),
    'Evidence needs a quotation or description',
  )
export type RelationshipEvidence = z.infer<typeof RelationshipEvidenceSchema>
const common = {
  id,
  relationshipId: id,
  previousRevisionId: id.nullable(),
  scopeOrganisationId: id.nullable(),
  assertionState: z.enum(['asserted', 'suppressed']),
  evidence: z.array(RelationshipEvidenceSchema).max(20),
  observedAt: z.iso.datetime().nullable(),
  verifiedAt: z.iso.datetime().nullable(),
  effectiveFrom: KnownDateSchema,
  effectiveTo: KnownDateSchema,
}
export const RelationshipInputSchema = z.discriminatedUnion('table', [
  z.strictObject({
    ...common,
    table: z.literal('locationAddress'),
    locationId: id,
    addressRevisionId: id,
    priority: z.number().int().nonnegative().nullable(),
    addressState: z.enum(['current', 'former', 'unconfirmed']),
  }),
  z.strictObject({
    ...common,
    table: z.literal('locationMembership'),
    childLocationId: id,
    parentLocationId: id,
    membershipState: z.enum(['current', 'former', 'unconfirmed']),
  }),
  z.strictObject({
    ...common,
    table: z.literal('locationOccupancy'),
    establishmentLocationId: id,
    containerLocationId: id.nullable(),
    addressRevisionId: id.nullable(),
    occupancyState: z.enum(['current', 'former', 'unconfirmed']),
  }),
])
export type RelationshipInput = z.infer<typeof RelationshipInputSchema>
export const TransitionInputSchema = z
  .strictObject({
    ...common,
    type: z.enum(['replacement', 'merge', 'split', 'reconfiguration']),
    basis: z.enum(['real_world', 'identity_correction']),
    before: z.array(id).min(1).max(30),
    after: z.array(id).min(1).max(30),
  })
  .superRefine((v, ctx) => {
    if (
      new Set(v.before).size !== v.before.length ||
      new Set(v.after).size !== v.after.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate transition participant' })
    if (
      (v.type === 'merge' && v.after.length !== 1) ||
      (v.type === 'split' && v.before.length !== 1)
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid transition cardinality' })
    if (v.type === 'replacement' && v.before.some(id => v.after.includes(id)))
      ctx.addIssue({
        code: 'custom',
        message: 'Replacement must retain distinct identities',
      })
    if (!v.evidence.length)
      ctx.addIssue({
        code: 'custom',
        message: 'A transition requires supporting evidence',
      })
  })
export type TransitionInput = z.infer<typeof TransitionInputSchema>
