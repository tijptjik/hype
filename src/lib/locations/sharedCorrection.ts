import { normalizePhoneNumber } from '#lib/utils/phone-property.js'
// VALIDATION
import { z } from 'zod'
import { LocationFactsSchema } from './validation'
import { AccessibilitySchema } from './accessibility'
import { equalLocationValue } from './baseline'
// TYPES
import type { LocationFacts } from './model'

/** Public contact links are HTTP(S), never executable or credential-bearing URLs. */
export const ContactUrlSchema = z
  .string()
  .url()
  .max(2000)
  .refine(value => {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  }, 'Use a public HTTP or HTTPS URL')
export const WebsitesSchema = z.array(ContactUrlSchema).max(30)
export const SocialsSchema = z.record(z.string().min(1).max(50), ContactUrlSchema)
export const SHARED_CONTACT_FIELDS = [
  'phoneNumber',
  'websites',
  'socials',
  'accessibility',
] as const
export const SharedCorrectionValuesSchema = LocationFactsSchema.partial().extend({
  phoneNumber: z
    .array(
      z
        .string()
        .refine(value => Boolean(normalizePhoneNumber(value)), 'Invalid phone number'),
    )
    .optional(),
  websites: WebsitesSchema.optional(),
  socials: SocialsSchema.optional(),
  accessibility: AccessibilitySchema.optional(),
})
export const SharedCorrectionFieldSchema = SharedCorrectionValuesSchema.keyof()
export const SharedFieldPinsSchema = z
  .array(
    z.strictObject({
      field: SharedCorrectionFieldSchema,
      revision: z.string().min(1).nullable(),
    }),
  )
  .max(SharedCorrectionFieldSchema.options.length)
export type SharedCorrectionField = z.infer<typeof SharedCorrectionFieldSchema>
const choice = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('inherit') }),
  z.strictObject({ mode: z.literal('clear') }),
  z.strictObject({ mode: z.literal('override'), value: z.unknown() }),
])
export const SharedCorrectionPatchSchema = z
  .partialRecord(SharedCorrectionFieldSchema, choice)
  .superRefine((patch, ctx) => {
    if (!Object.keys(patch).length)
      ctx.addIssue({ code: 'custom', message: 'Choose a field to change' })
    for (const [field, change] of Object.entries(patch)) {
      if (change?.mode === 'clear' && (field === 'location' || field === 'entity')) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: 'This field requires a replacement value or inheritance',
        })
      }
      if (change?.mode !== 'override') continue
      const parsed = SharedCorrectionValuesSchema.shape[
        field as SharedCorrectionField
      ].safeParse(change.value)
      if (!parsed.success || change.value === undefined)
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: 'Invalid correction value',
        })
    }
    if (JSON.stringify(patch).length > 64000)
      ctx.addIssue({ code: 'custom', message: 'Correction is too large' })
  })
export type SharedCorrectionPatch = z.infer<typeof SharedCorrectionPatchSchema>
export type SharedCorrectionEntry = {
  original: { present: boolean; value?: unknown }
  choice: z.infer<typeof choice>
  sourceRevisionId: string
  actorId: string
  editedAt: string
  supersededBy?: string
}
export type SharedCorrections = Partial<
  Record<SharedCorrectionField, SharedCorrectionEntry>
>

/** Enforce shared-field authority independently of Organisation override authority.
 * @param patch Validated changes. @param rights Server-resolved persisted permissions.
 * @returns Nothing; rejects edits without community-curation authority.
 */
export function authorizeSharedCorrection(
  patch: SharedCorrectionPatch,
  rights: { canEdit: boolean; superAdmin: boolean },
): void {
  if (!rights.canEdit && !rights.superAdmin)
    throw new Error('SHARED_LOCATION_EDIT_FORBIDDEN')
  // Group-issued branch identifiers are authored only in Organisation customizations.
  const entity =
    patch.entity?.mode === 'override'
      ? (patch.entity.value as LocationFacts['entity'])
      : undefined
  if (patch.branchId || (entity?.details && Object.hasOwn(entity.details, 'branchId')))
    throw new Error('BRANCH_ID_INTERNAL_ONLY')
}

/** Record the actual source evidence, not the previously corrected display value.
 * @param previous Prior immutable corrections. @param patch Explicit edit intent.
 * @param source Original source facts. @param metadata Authenticated attribution and source pin.
 * @returns New complete snapshot without mutating earlier history.
 */
export function amendSharedCorrections(
  previous: SharedCorrections,
  patch: SharedCorrectionPatch,
  source: LocationFacts,
  metadata: {
    actorId: string
    editedAt: string
    sourceRevisionId: string
    omittedFields?: readonly string[]
  },
): SharedCorrections {
  const result = structuredClone(previous)
  for (const [field, change] of Object.entries(patch)) {
    if (!change) continue
    const key = field as SharedCorrectionField
    result[key] = {
      actorId: metadata.actorId,
      editedAt: metadata.editedAt,
      sourceRevisionId: metadata.sourceRevisionId,
      choice: change,
      original:
        !metadata.omittedFields?.includes(key) && Object.hasOwn(source, key)
          ? { present: true, value: source[key] }
          : { present: false },
    }
  }
  return result
}

/** Resolve current source evidence beneath a shared correction.
 * @param source Immutable source facts. @param corrections Explicit retained correction snapshot.
 * @returns Effective facts and per-field history status. Omission never means upstream deletion.
 * @remarks A changed contact field supersedes its correction; community identity corrections remain until explicitly reset.
 */
export function resolveSharedCorrections(
  source: LocationFacts,
  corrections: SharedCorrections,
  evaluateFreshness = true,
  omittedFields: readonly string[] = [],
): {
  facts: LocationFacts
  status: Partial<
    Record<SharedCorrectionField, 'active' | 'inherited' | 'superseded' | 'agreed'>
  >
} {
  const facts = structuredClone(source)
  const status: Partial<
    Record<SharedCorrectionField, 'active' | 'inherited' | 'superseded' | 'agreed'>
  > = {}
  for (const [field, entry] of Object.entries(corrections)) {
    const key = field as SharedCorrectionField
    if (!entry) continue
    if (entry.supersededBy) {
      status[key] = 'superseded'
      continue
    }
    if (entry.choice.mode === 'inherit') {
      status[key] = 'inherited'
      continue
    }
    const present = !omittedFields.includes(key) && Object.hasOwn(source, key)
    const changed =
      present &&
      (!entry.original.present ||
        !equalLocationValue(source[key], entry.original.value))
    if (
      evaluateFreshness &&
      changed &&
      (SHARED_CONTACT_FIELDS as readonly string[]).includes(key)
    ) {
      status[key] =
        entry.choice.mode === 'override' &&
        equalLocationValue(source[key], entry.choice.value)
          ? 'agreed'
          : 'superseded'
      continue
    }
    status[key] = 'active'
    const empty =
      key === 'branchId'
        ? ''
        : key === 'branch' || key === 'format'
          ? {}
          : key === 'phoneNumber' || key === 'brands' || key === 'websites'
            ? []
            : key === 'names' || key === 'socials'
              ? {}
              : null
    Object.assign(facts, {
      [key]: entry.choice.mode === 'clear' ? empty : entry.choice.value,
    })
  }
  return { facts: LocationFactsSchema.parse(facts), status }
}

/** Preserve publisher omission separately from the normalized empty display array.
 * @param raw Immutable source envelope. @returns Contact fields absent or unknown in a SaanSeoi payload.
 */
export function omittedSourceContacts(raw: unknown): string[] {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw
  const attrs = value?.resource?.attributes
  if (!attrs) return []
  return [
    ['phoneNumber', 'phones'],
    ['websites', 'websites'],
    ['socials', 'socials'],
    ['accessibility', 'accessibility'],
  ]
    .filter(([, key]) => attrs[key] == null)
    .map(([field]) => field)
}
