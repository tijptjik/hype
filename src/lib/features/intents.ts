// VALIDATION
import { z } from 'zod'

export const FEATURE_LOCATION_KINDS = [
  'establishment',
  'building',
  'premises',
  'address',
  'natural',
  'unknown',
] as const
export const FeatureTypeIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_-]*$/)
export const FeatureTypeSchema = z
  .strictObject({
    id: FeatureTypeIdSchema,
    label: z.string().trim().min(1).max(80),
    locationKinds: z
      .array(z.enum(FEATURE_LOCATION_KINDS))
      .max(6)
      .refine(
        kinds => new Set(kinds).size === kinds.length,
        'Location kinds must be unique',
      ),
    start: z.enum(['search', 'pin']),
    associationRequired: z.boolean(),
  })
  .refine(
    value => !value.associationRequired || value.locationKinds.length > 0,
    'A required association needs at least one Location kind',
  )
export const FeatureTypesSchema = z
  .array(FeatureTypeSchema)
  .min(1)
  .max(50)
  .refine(
    types => new Set(types.map(type => type.id)).size === types.length,
    'Feature type identifiers must be unique',
  )
export type FeatureType = z.infer<typeof FeatureTypeSchema>
export const DEFAULT_FEATURE_TYPES: FeatureType[] = [
  {
    id: 'object',
    label: 'Object',
    locationKinds: [...FEATURE_LOCATION_KINDS],
    start: 'search',
    associationRequired: false,
  },
  {
    id: 'natural',
    label: 'Natural feature',
    locationKinds: [...FEATURE_LOCATION_KINDS],
    start: 'pin',
    associationRequired: false,
  },
  {
    id: 'business',
    label: 'Business or venue',
    locationKinds: [...FEATURE_LOCATION_KINDS],
    start: 'search',
    associationRequired: false,
  },
]

/** Resolve allowed editorial subjects without turning a Location kind into a subject.
 * @param hub Hub defaults, or application defaults when absent.
 * @param project Project replacement catalogue; null inherits.
 * @param layer Layer subset; unknown/retired IDs are never silently enabled.
 * @returns Effective types in project-defined order.
 */
export function resolveFeatureTypes(
  hub?: FeatureType[] | null,
  project?: FeatureType[] | null,
  layer?: string[] | null,
): FeatureType[] {
  const types = project ?? hub ?? DEFAULT_FEATURE_TYPES
  return layer == null ? types : types.filter(type => layer.includes(type.id))
}

/** Validate a new subject choice; single-type layers infer the only valid answer.
 * @param types Effective allowed types.
 * @param id Explicit subject identity.
 * @returns Authoritative definition, never a client-provided mapping.
 */
export function requireFeatureType(
  types: FeatureType[],
  id?: string | null,
): FeatureType {
  const selected = types.find(
    type => type.id === (id || (types.length === 1 ? types[0].id : '')),
  )
  if (!selected) throw new Error('Choose an available feature type for this layer.')
  return selected
}
