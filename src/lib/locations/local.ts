import {
  LocationTaxonomySchema,
  locationTaxonomy,
  locationMatchingType,
} from './taxonomy'
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
    kind: LocationKindSchema.or(z.literal('geographic'))
      .or(z.literal('operational'))
      .default('establishment')
      .transform(kind =>
        kind === 'geographic'
          ? ('natural' as const)
          : kind === 'operational'
            ? ('establishment' as const)
            : kind,
      ),
    class: z
      .enum([
        'premises',
        'building',
        'building_part',
        'structure',
        'thoroughfare',
        'service_point',
        'landform',
        'coastal_feature',
        'water_feature',
        'establishment',
      ])
      .nullable()
      .optional(),
    buildingId: z.string().trim().min(1).max(200).optional(),
    parentPartId: z.string().trim().min(1).max(200).optional(),
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
    if (input.class !== undefined) {
      const previous = locationTaxonomy(input.kind)
      const pair = LocationTaxonomySchema.safeParse({
        kind: previous.kind,
        class: input.class,
      })
      if (
        !pair.success ||
        (previous.class !== null && previous.class !== input.class)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['class'],
          message: 'Location class must belong to its kind',
        })
        return
      }
      input.kind = LocationKindSchema.parse(locationMatchingType(pair.data))
    }
    if (
      input.kind === 'building_part'
        ? !input.buildingId
        : Boolean(input.buildingId || input.parentPartId)
    )
      context.addIssue({
        code: 'custom',
        path: ['buildingId'],
        message:
          'Building parts require an owning building; other kinds cannot claim part membership',
      })
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
