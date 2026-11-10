// VALIDATION
import { z } from 'zod'
// CONTENT LOCALES
import {
  adaptContentMap,
  canonicalContentTag,
  contentLocaleMap,
} from '#lib/i18n/contentRecords.js'
import {
  FeatureKindSchema,
  TargetContextSchema,
  AssociationRelationSchema,
  FeatureNameRuleSchema,
  TARGET_CONTEXTS,
} from './locationPolicy'

export const FEATURE_LOCATION_KINDS = [
  'establishment',
  'building',
  'building_part',
  'premises',
  'address',
  'natural',
  'unknown',
  'infrastructure',
  'built',
  'structure',
  'landform',
  'coastal_feature',
  'water_feature',
  'service_point',
  'premises_address',
  'cadastral_address',
  'linear_reference',
  'street',
] as const
export const FeatureTypeIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_-]*$/)
export const FeatureTypeSchema = z
  .strictObject({
    id: FeatureTypeIdSchema,
    enabled: z.boolean().optional(),
    kind: FeatureKindSchema.optional(),
    targetContexts: z
      .array(TargetContextSchema)
      .min(1)
      .max(TARGET_CONTEXTS.length)
      .refine(
        values => new Set(values).size === values.length,
        'Target contexts must be unique',
      )
      .optional(),
    relation: AssociationRelationSchema.optional(),
    unresolvedMode: z.enum(['prompt', 'silent']).optional(),
    nameRule: FeatureNameRuleSchema.optional(),
    label: z.string().trim().min(1).max(80),
    labels: contentLocaleMap(z.string().trim().max(80))
      .transform(values => adaptContentMap(values, canonicalContentTag))
      .optional(),
    locationKinds: z
      .array(z.enum(FEATURE_LOCATION_KINDS))
      .max(FEATURE_LOCATION_KINDS.length)
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

/** Resolve the authored display name without changing the stable type identifier.
 * @param type Configured type, including legacy single-name definitions.
 * @param locale Requested content or interface language.
 * @returns Translated label, falling back to the existing base label for missing or empty translations.
 */
export function featureTypeLabel(type: FeatureType, locale: string): string {
  return type.labels?.[canonicalContentTag(locale)]?.trim() || type.label
}
export const DEFAULT_FEATURE_TYPES: FeatureType[] = [
  {
    id: 'object',
    enabled: true,
    label: 'Object',
    kind: 'object',
    targetContexts: ['building_part', 'building', 'premises', 'address'],
    relation: 'locatedAt',
    unresolvedMode: 'prompt',
    locationKinds: FEATURE_LOCATION_KINDS.filter(kind => kind !== 'infrastructure'),
    start: 'search',
    associationRequired: false,
  },
  {
    id: 'place',
    enabled: true,
    label: 'Place',
    kind: 'place',
    targetContexts: [
      'building_part',
      'building',
      'structure',
      'establishment',
      'service_point',
      'address',
    ],
    relation: 'represents',
    unresolvedMode: 'prompt',
    locationKinds: FEATURE_LOCATION_KINDS.filter(kind => kind !== 'infrastructure'),
    start: 'search',
    associationRequired: false,
  },
  {
    id: 'area',
    enabled: false,
    label: 'Area',
    kind: 'area',
    targetContexts: ['premises', 'address'],
    relation: 'locatedAt',
    unresolvedMode: 'silent',
    locationKinds: FEATURE_LOCATION_KINDS.filter(kind => kind !== 'infrastructure'),
    start: 'pin',
    associationRequired: false,
  },
  {
    id: 'route',
    enabled: false,
    label: 'Route',
    kind: 'route',
    targetContexts: ['street', 'premises', 'address'],
    relation: 'locatedAt',
    unresolvedMode: 'silent',
    locationKinds: FEATURE_LOCATION_KINDS.filter(kind => kind !== 'infrastructure'),
    start: 'pin',
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
 * @param includeDisabled Retain access when editing an existing feature.
 * @returns Authoritative definition, never a client-provided mapping.
 */
export function requireFeatureType(
  types: FeatureType[],
  id?: string | null,
  includeDisabled = false,
): FeatureType {
  const available = types.filter(type => includeDisabled || type.enabled !== false)
  const selected = available.find(
    type => type.id === (id || (available.length === 1 ? available[0].id : '')),
  )
  if (!selected) throw new Error('Choose an available feature type for this layer.')
  return selected
}

/** Staged policy payload carried by the centralized resource form. */
export const FeatureIntentSettingsPatchSchema = z.object({
  definition: FeatureTypesSchema.nullable(),
  version: z.number().int().nonnegative(),
  fingerprint: z.string().min(1),
})
export type FeatureIntentSettingsPatch = z.infer<
  typeof FeatureIntentSettingsPatchSchema
>
export const FeatureIntentSettingsFormData = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid feature type settings JSON' })
      return z.NEVER
    }
  })
  .pipe(FeatureIntentSettingsPatchSchema)
  .optional()
