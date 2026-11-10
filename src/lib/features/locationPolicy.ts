import { expandLocationMatchingTypes } from '#lib/locations/taxonomy.js'
// VALIDATION
import { z } from 'zod'

export const FEATURE_KINDS = ['object', 'place', 'area', 'route'] as const
export const FeatureKindSchema = z.enum(FEATURE_KINDS)
export const TARGET_CONTEXTS = [
  'building_part',
  'structure',
  'building',
  'premises',
  'street',
  'landform',
  'coastal_feature',
  'water_feature',
  'establishment',
  'service_point',
  'premises_address',
  'cadastral_address',
  'linear_reference',
  // Retained broad and legacy contexts remain valid in existing policies.
  'infrastructure',
  'built',
  'address',
  'natural',
] as const
export const TargetContextSchema = z.enum(TARGET_CONTEXTS)
export type TargetContext = z.infer<typeof TargetContextSchema>
export const AssociationRelationSchema = z.enum(['locatedAt', 'represents'])

/** Shared physical matching order; source availability never changes target identity. */
export const TARGET_FALLBACKS: Record<TargetContext, readonly TargetContext[]> = {
  building_part: ['building', 'premises', 'address'],
  building: ['premises', 'address'],
  premises: ['address'],
  infrastructure: ['built', 'address'],
  built: ['address'],
  structure: ['built', 'address'],
  landform: ['natural'],
  coastal_feature: ['natural'],
  water_feature: ['natural'],
  street: ['address'],
  address: [],
  establishment: [],
  service_point: [],
  premises_address: [],
  cadastral_address: [],
  linear_reference: [],
  natural: [],
}

/** Return eligible targets in preferred-first order. @param context Intended location. @returns Direct kind followed by explicit fallbacks. */
export function targetLocationKinds(context: TargetContext): TargetContext[] {
  return expandLocationMatchingTypes([
    context,
    ...TARGET_FALLBACKS[context],
  ]) as TargetContext[]
}

/** Establishments can supply evidence for a building part, never substitute for it.
 * @param context Intended location. @returns Permitted discovery result kinds.
 */
export function targetSuggestionKinds(context: TargetContext): TargetContext[] {
  return context === 'building_part'
    ? [...targetLocationKinds(context), 'establishment']
    : targetLocationKinds(context)
}

const localizedCase = z.strictObject({
  true: z.string().max(200),
  false: z.string().max(200),
  null: z.string().max(200),
  placement: z.enum(['prefix', 'suffix']),
  separator: z.string().max(10),
})
export const FeatureNameRuleSchema = z.strictObject({
  base: z.enum(['feature', 'location']),
  conditions: z
    .array(
      z.strictObject({
        propertyId: z.string().min(1),
        locales: z.record(z.string().min(2).max(30), localizedCase),
      }),
    )
    .max(10),
})
export type FeatureNameRule = z.infer<typeof FeatureNameRuleSchema>

/** Compose a localized title without evaluating arbitrary expressions.
 * @param input Names, boolean field values and optional explicit per-locale override.
 * @returns Generated name, or the explicit override when present.
 * @remarks False and missing values remain distinct; empty cases never introduce separators.
 */
export function generateFeatureName(input: {
  rule: FeatureNameRule
  locale: string
  locationName?: string
  featureName?: string
  properties: Record<string, boolean | null | undefined>
  override?: string | null
}): string {
  if (input.override != null) return input.override
  let name =
    (input.rule.base === 'location' ? input.locationName : input.featureName) ||
    input.featureName ||
    ''
  for (const condition of input.rule.conditions) {
    const text = Object.entries(condition.locales).find(
      ([locale]) => locale.toLowerCase() === input.locale.toLowerCase(),
    )?.[1]
    if (!text) continue
    const value = input.properties[condition.propertyId]
    const part =
      text[value === true ? 'true' : value === false ? 'false' : 'null'].trim()
    if (part)
      name = !name
        ? part
        : text.placement === 'prefix'
          ? `${part}${text.separator}${name}`
          : `${name}${text.separator}${part}`
  }
  return name
}

/** New features pin the reviewed naming rule; changing project defaults does not rewrite existing content. */
export const FeatureNameTemplateSchema = z.strictObject({
  rule: FeatureNameRuleSchema,
  baseNames: z.record(z.string(), z.string()),
  overrides: z.record(z.string(), z.string().max(1000)),
})
export type FeatureNameTemplate = z.infer<typeof FeatureNameTemplateSchema>

/** Decode persisted boolean property values without conflating false and missing.
 * @param value Stored property value. @returns A boolean or null for unset/unrecognized values.
 */
export function nameBooleanValue(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return null
}
