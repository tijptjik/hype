// VALIDATION
import { z } from 'zod'

/** Stable roles remain compatible with existing gallery history and cover indexes. */
export const IMAGE_INTENT_ROLES = {
  undefined: 'Unclassified',
  canonical: 'Featured',
  general: 'Catch-All',
} as const

export const ImageIntentIdSchema = z.string().min(1).max(80).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
export const ImageIntentDefinitionSchema = z.strictObject({
  id: ImageIntentIdSchema,
  label: z.string().trim().min(1).max(80),
  isPublished: z.boolean(),
})
export type ImageIntentDefinition = z.infer<typeof ImageIntentDefinitionSchema>

/** Array position is the configured display order; role identities cannot be removed. */
export const ImageIntentCatalogueSchema = z.array(ImageIntentDefinitionSchema).min(3).max(100).superRefine((intents, ctx) => {
  if (new Set(intents.map(intent => intent.id)).size !== intents.length)
    ctx.addIssue({ code: 'custom', message: 'Intent identities must be unique' })
  for (const id of Object.keys(IMAGE_INTENT_ROLES))
    if (!intents.some(intent => intent.id === id))
      ctx.addIssue({ code: 'custom', message: `${IMAGE_INTENT_ROLES[id as keyof typeof IMAGE_INTENT_ROLES]} cannot be deleted` })
  if (intents.find(intent => intent.id === 'undefined')?.isPublished)
    ctx.addIssue({ code: 'custom', message: 'Unclassified images must remain unpublished' })
  if (!intents.find(intent => intent.id === 'general')?.isPublished)
    ctx.addIssue({ code: 'custom', message: 'Catch-All must be public for automatic classification' })
})

export const DEFAULT_IMAGE_INTENTS: readonly ImageIntentDefinition[] = [
  { id: 'canonical', label: 'Featured', isPublished: true },
  { id: 'closeUp', label: 'Close-up', isPublished: true },
  { id: 'context', label: 'Context', isPublished: true },
  { id: 'general', label: 'General', isPublished: true },
  { id: 'alternative', label: 'Alternative', isPublished: false },
  { id: 'research', label: 'Research', isPublished: false },
  { id: 'undefined', label: 'Unclassified', isPublished: false },
]

/**
 * Resolves an assignment from trusted policy, never from a client visibility flag.
 * @param intents Effective Hub or Project catalogue.
 * @param id Requested intent identity.
 * @param classifyUnclassified Whether this upload/publication explicitly includes unclassified images.
 * @returns Stable assignment and its derived publication intent.
 */
export function resolveImageIntent(intents: readonly ImageIntentDefinition[], id: string, classifyUnclassified = false): { intent: string; isPublished: boolean } {
  const intent = id === 'undefined' && classifyUnclassified ? 'general' : id
  const definition = intents.find(item => item.id === intent)
  if (!definition) throw new Error('This image intent is no longer available; refresh and choose another intent')
  return { intent, isPublished: intent !== 'undefined' && definition.isPublished }
}

/**
 * Looks up a configurable label while retaining readable historical identities.
 * @param intents Effective catalogue.
 * @param id Image intent identity.
 * @returns Current label, or the identity for a removed historical intent.
 */
export function imageIntentLabel(intents: readonly ImageIntentDefinition[], id: string): string {
  return intents.find(intent => intent.id === id)?.label ?? id
}

/** Validated optional transport shared by the Hub and Project forms. */
export const ImageIntentSettingsPatchSchema = z.object({
  version: z.number().int(),
  hubVersion: z.number().int(),
  intents: ImageIntentCatalogueSchema.nullable(),
  autoPublishUnclassified: z.boolean(),
  reassignments: z.record(ImageIntentIdSchema, ImageIntentIdSchema),
})
export type ImageIntentSettingsPatch = z.infer<typeof ImageIntentSettingsPatchSchema>
export const ImageIntentSettingsFormData = z.preprocess(value => {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}, ImageIntentSettingsPatchSchema.optional())
