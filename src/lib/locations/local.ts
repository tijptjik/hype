// VALIDATION
import { z } from 'zod'
import { classifyLocationFactsKind } from './factsKind'
import { validateLocationStatusKind } from './lifecycle'
import { LocationFactsSchema } from './validation'
import { LocationKindSchema } from './kinds'
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'
import { streetNumberIssue } from '#lib/addresses/streetNumber.js'

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
      // Newly authored number fields must have valid syntax and ordered endpoints.
      for (const [locale, fields] of Object.entries(address.authored?.i18n ?? {})) {
        const issue = streetNumberIssue(fields)
        if (issue)
          context.addIssue({
            code: 'custom',
            path: [
              'location',
              'address',
              'authored',
              'i18n',
              locale,
              'buildingNumberExpression',
            ],
            message:
              issue === 'descending'
                ? 'The last street number must not be lower than the first.'
                : 'Invalid street number expression.',
          })
      }
      if (
        address.status !== 'unresolved' ||
        address.address2dId ||
        address.address3dId ||
        address.address3dUnitId ||
        address.snapshotId ||
        Object.keys(address.rawSource).length
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
      input.kind = classifyLocationFactsKind(input.kind, input.facts)
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
