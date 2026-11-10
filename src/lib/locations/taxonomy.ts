// VALIDATION
import { z } from 'zod'

/** Identity families used when choosing a Location match; unknown preserves missing evidence. */
export const LOCATION_ENTITY_KINDS = [
  'unknown',
  'built',
  'geographic',
  'operational',
  'address',
] as const
export const BUILT_LOCATION_CLASSES = [
  'premises',
  'building',
  'building_part',
  'structure',
  'thoroughfare',
] as const
export const GEOGRAPHIC_LOCATION_CLASSES = [
  'landform',
  'coastal_feature',
  'water_feature',
] as const
export const OPERATIONAL_LOCATION_CLASSES = ['establishment', 'service_point'] as const
export const LocationTaxonomySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unknown'), class: z.null() }),
  z.strictObject({
    kind: z.literal('built'),
    class: z.enum(BUILT_LOCATION_CLASSES).nullable(),
  }),
  z.strictObject({
    kind: z.literal('geographic'),
    class: z.enum(GEOGRAPHIC_LOCATION_CLASSES).nullable(),
  }),
  z.strictObject({
    kind: z.literal('operational'),
    class: z.enum(OPERATIONAL_LOCATION_CLASSES),
  }),
  z.strictObject({
    kind: z.literal('address'),
    class: z.null(),
  }),
])
export type LocationTaxonomy = z.infer<typeof LocationTaxonomySchema>

/** Decode a retained matching discriminator without inventing a geographic subclass.
 * @param type Historical or current matching discriminator.
 * @returns The validated identity kind and optional class.
 * @remarks Infrastructure is not proof of a structure; retain it as built with unknown class.
 */
export function locationTaxonomy(type: string): LocationTaxonomy {
  if (type === 'street') return { kind: 'built', class: 'thoroughfare' }
  if ((OPERATIONAL_LOCATION_CLASSES as readonly string[]).includes(type))
    return LocationTaxonomySchema.parse({ kind: 'operational', class: type })
  // Retained revision discriminators decode to the current address identity.
  if (['premises_address', 'cadastral_address', 'linear_reference'].includes(type))
    return { kind: 'address', class: null }
  if (type === 'natural' || type === 'geographic')
    return { kind: 'geographic', class: null }
  if (type === 'infrastructure' || type === 'built')
    return { kind: 'built', class: null }
  if ((BUILT_LOCATION_CLASSES as readonly string[]).includes(type))
    return LocationTaxonomySchema.parse({ kind: 'built', class: type })
  if ((GEOGRAPHIC_LOCATION_CLASSES as readonly string[]).includes(type))
    return LocationTaxonomySchema.parse({ kind: 'geographic', class: type })
  return LocationTaxonomySchema.parse({ kind: type, class: null })
}

/** Encode taxonomy for existing matching and historical-facts consumers.
 * @param taxonomy Validated kind/class pair.
 * @returns Stable matching discriminator; thoroughfare retains the historical street token.
 */
export function locationMatchingType(taxonomy: LocationTaxonomy): string {
  const value = LocationTaxonomySchema.parse(taxonomy)
  if (value.class === 'thoroughfare') return 'street'
  return value.class ?? (value.kind === 'geographic' ? 'natural' : value.kind)
}

/** Expand broad matching permissions while retaining legacy policy tokens.
 * @param types Configured matching types, including retained pre-taxonomy policies.
 * @returns Deduplicated permissions; no permission crosses entity families.
 * @remarks A broad geographic or built permission includes its classes. Historical
 * infrastructure permits unclassified built places and structures, not arbitrary buildings.
 */
export function expandLocationMatchingTypes(types: readonly string[]): string[] {
  return [
    ...new Set(
      types.flatMap(type =>
        type === 'natural'
          ? [type, ...GEOGRAPHIC_LOCATION_CLASSES]
          : type === 'built'
            ? [
                type,
                ...BUILT_LOCATION_CLASSES.map(className =>
                  locationMatchingType({ kind: 'built', class: className }),
                ),
              ]
            : type === 'infrastructure'
              ? [type, 'built', 'structure']
              : [type === 'thoroughfare' ? 'street' : type],
      ),
    ),
  ]
}
