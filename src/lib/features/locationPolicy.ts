// CONTENT LOCALES
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
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
  // Retained broad and legacy contexts remain valid in existing policies.
  'infrastructure',
  'built',
  'address',
  'natural',
] as const
// Decode retained policy/history tokens without exposing them as current choices.
export const TargetContextSchema = z.preprocess(
  value =>
    ['premises_address', 'cadastral_address', 'linear_reference'].includes(
      String(value),
    )
      ? 'address'
      : value,
  z.enum(TARGET_CONTEXTS),
)
export type TargetContext = z.infer<typeof TargetContextSchema>
export const AssociationRelationSchema = z.enum(['locatedAt', 'represents'])

/** Starting records supply editable address/position data, never identity permission. */
export const TARGET_STARTING_KINDS: Record<TargetContext, readonly TargetContext[]> = {
  premises: ['building', 'establishment', 'address'],
  building: ['premises', 'building_part', 'establishment', 'address'],
  building_part: ['building', 'premises', 'establishment', 'address'],
  structure: [
    'premises',
    'building',
    'address',
    'landform',
    'coastal_feature',
    'water_feature',
  ],
  street: ['address'],
  landform: ['natural', 'coastal_feature', 'water_feature'],
  coastal_feature: ['natural', 'landform', 'water_feature'],
  water_feature: ['natural', 'landform', 'coastal_feature'],
  establishment: ['building_part', 'building', 'premises', 'address'],
  service_point: ['establishment', 'building_part', 'building', 'premises', 'address'],
  address: [
    'premises',
    'building',
    'building_part',
    'structure',
    'street',
    'establishment',
    'service_point',
  ],
  infrastructure: ['built', 'premises', 'address'],
  built: ['premises', 'address'],
  natural: ['landform', 'coastal_feature', 'water_feature'],
}

/** Return identity-compatible kinds, independently of starting-record suggestions.
 * @param context Intended identity. @returns Same kind/class, including explicitly broad legacy intents.
 */
export function targetLocationKinds(context: TargetContext): TargetContext[] {
  return expandLocationMatchingTypes([context]) as TargetContext[]
}

/** Return discoverable identities and starting records without widening link permission.
 * @param context Intended location. @returns Preferred identity first, then useful starting kinds.
 */
export function targetSuggestionKinds(context: TargetContext): TargetContext[] {
  return [
    ...new Set([...targetLocationKinds(context), ...TARGET_STARTING_KINDS[context]]),
  ]
}

/** Identify an optional operating relationship independently of copied address data.
 * @param kind New location kind. @param host Existing host kind.
 * @returns Whether an explicit Operates in relationship is supported.
 */
export function canOperateIn(kind: string, host: string): boolean {
  return (
    (kind === 'establishment' || kind === 'service_point') &&
    (['premises', 'building', 'building_part', 'structure'].includes(host) ||
      (kind === 'service_point' && host === 'establishment'))
  )
}

const localizedCase = z.strictObject({
  true: z.string().max(200),
  false: z.string().max(200),
  null: z.string().max(200),
  placement: z.enum(['prefix', 'suffix']),
  separator: z.string().max(10),
})
export const FeatureNameRuleSchema = z.strictObject({
  // Central immutable version; legacy rule fields remain a compatible fallback.
  registry: z
    .strictObject({ id: z.string().min(1), version: z.number().int().positive() })
    .optional(),
  base: z.enum(['feature', 'location']),
  conditions: z
    .array(
      z.strictObject({
        propertyId: z.string().min(1),
        test: z.enum(['boolean', 'hasValue']).optional(),
        locales: z.record(z.string().min(2).max(30), localizedCase),
      }),
    )
    .max(10),
})
export type FeatureNameRule = z.infer<typeof FeatureNameRuleSchema>

/** Compose a localized title without evaluating arbitrary expressions.
 * @param input Names, boolean or short-text field values and optional explicit per-locale override.
 * @returns Generated name, or the explicit override when present.
 * @remarks False and missing values remain distinct; empty cases never introduce separators.
 */
export function generateFeatureName(input: {
  rule: FeatureNameRule
  locale: string
  locationName?: string
  featureName?: string
  properties: Record<string, boolean | string | null | undefined>
  override?: string | null
}): string {
  if (input.override != null) return input.override
  let name =
    (input.rule.base === 'location' ? input.locationName : input.featureName) ?? ''
  // A missing source is unresolved; conditional fragments cannot invent a base name.
  if (!name) return ''
  for (const condition of input.rule.conditions) {
    const text = Object.entries(condition.locales).find(
      ([locale]) => canonicalContentTag(locale) === canonicalContentTag(input.locale),
    )?.[1]
    if (!text) continue
    const value = input.properties[condition.propertyId]
    const state =
      condition.test === 'hasValue'
        ? typeof value === 'string' && value.trim()
          ? 'true'
          : 'false'
        : value === true
          ? 'true'
          : value === false
            ? 'false'
            : 'null'
    const part =
      condition.test === 'hasValue' && typeof value === 'string' && value.trim()
        ? value
        : text[state].trim()
    if (part)
      name = !name
        ? part
        : text.placement === 'prefix'
          ? `${part}${text.separator}${name}`
          : `${name}${text.separator}${part}`
  }
  return name
}

/** Features pin the reviewed naming rule; default changes rewrite existing content only after explicit adoption review. */
export const FeatureNameTemplateSchema = z.strictObject({
  rule: FeatureNameRuleSchema,
})
export type FeatureNameTemplate = z.infer<typeof FeatureNameTemplateSchema>

/** Decode a text condition's display value before testing its presence.
 * @param value Stored scalar or serialized phone collection.
 * @param component Property editor identifying phone storage semantics.
 * @returns Text suitable for naming, with empty phone collections treated as absent.
 * @remarks Matches the materialized naming view: use the first phone and omit +852.
 * Ordinary text fields retain literal JSON-looking text.
 */
export function featureNameTextValue(
  value: string | null | undefined,
  component?: string | null,
): string {
  let text = value ?? ''
  if (component !== 'PhoneField') return text
  // Phone fields store collections; their JSON representation is never a title fragment.
  try {
    const decoded: unknown = JSON.parse(text)
    if (Array.isArray(decoded)) {
      const first: unknown = decoded[0]
      text = typeof first === 'string' || typeof first === 'number' ? String(first) : ''
    }
  } catch {
    // Legacy scalar phone values already contain the display text.
  }
  return text.replace(/^\s*\+852\s*/, '')
}

/** Decode persisted boolean property values without conflating false and missing.
 * @param value Stored property value. @returns A boolean or null for unset/unrecognized values.
 */
export function nameBooleanValue(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return null
}

/** Identify fields that provide true, false, or unset values to a naming condition.
 * @param field Field definition, including legacy toggle controls with text storage.
 * @returns Whether the field can drive a naming condition, independent of audience.
 * @remarks Configuring a rule deliberately exposes its chosen text, not the field itself.
 */
export function isFeatureNameBooleanField(field: {
  dataType?: string | null
  component?: string | null
}): boolean {
  return field.dataType === 'boolean' || field.component === 'ToggleField'
}

/** Identify single-line text and phone fields usable for presence conditions.
 * @param field Stored or resolved field definition. @returns Whether this is short text or a phone field, excluding toggles and rich text.
 */
export function isFeatureNameTextField(field: {
  dataType?: string | null
  component?: string | null
}): boolean {
  return (
    field.dataType === 'text' &&
    ['InputField', 'TextField', 'PhoneField'].includes(field.component ?? '')
  )
}
