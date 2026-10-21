// VALIDATION
import { z } from 'zod'
import { validateLocationStatusKind } from './lifecycle'
import { LocationFactsSchema } from './validation'
import { LocationKindSchema } from './kinds'
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'

/** Local baselines cannot claim unverified canonical Address identities. */
export const LocalLocationInputSchema = z
  .strictObject({
    state: z.enum(['manual', 'unresolved']),
    // Authored type is independent of manual/unmatched state and source adapter availability.
    kind: LocationKindSchema.default('establishment'),
    // Consent is independent of source matching state and Organisation visibility.
    sharingPreference: z.enum(['private', 'allow-sharing']).default('private'),
    parseSource: z.record(z.string().max(35), z.string().max(10000)).optional(),
    facts: LocationFactsSchema.superRefine((facts, context) => {
      // Local authoring accepts geometry, not fabricated upstream geometry-publication claims.
      if (facts.footprint?.mode === 'reference')
        context.addIssue({
          code: 'custom',
          path: ['footprint'],
          message: 'Author local footprints as inline geometry',
        })
      if (!Object.values(facts.names).some(name => name.trim().length > 0)) {
        context.addIssue({
          code: 'custom',
          path: ['names'],
          message: 'A Location name is required',
        })
      }
      const address = facts.location.address
      if (
        address.status !== 'unresolved' ||
        address.address2dId ||
        address.address3dId ||
        address.address3dUnitId ||
        address.addressSnapshotId ||
        Object.keys(address.records).length
      ) {
        context.addIssue({
          code: 'custom',
          path: ['location', 'address'],
          message:
            'Local content cannot claim unverified canonical Address identities or publication evidence',
        })
      }
      for (const [index, number] of facts.phoneNumber.entries()) {
        if (!normalizeHongKongPhoneNumber(number))
          context.addIssue({
            code: 'custom',
            path: ['phoneNumber', index],
            message: 'Invalid Hong Kong phone number',
          })
      }
    }).transform(facts => ({
      ...facts,
      phoneNumber: facts.phoneNumber.map(number => {
        const normalized = normalizeHongKongPhoneNumber(number)
        if (!normalized) throw new Error('Invalid Hong Kong phone number')
        return normalized
      }),
    })),
  })
  .superRefine((input, context) => {
    try {
      validateLocationStatusKind(input.kind, input.facts)
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['facts'],
        message: 'Status must match Location kind',
      })
    }
  })
export type LocalLocationInput = z.infer<typeof LocalLocationInputSchema>
