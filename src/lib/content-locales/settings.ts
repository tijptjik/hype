// ZOD
import { z } from 'zod'
// CONTENT LOCALES
import { SupportedContentLocaleSchema } from './catalogue'
import { ContentLocaleSchema } from './model'

export const MULTILINGUAL_SETTING_KEYS = ['multilingualContent', 'multilingualAddresses'] as const
export type MultilingualSettingKey = typeof MULTILINGUAL_SETTING_KEYS[number]

export const MAX_CONTENT_LOCALES = 32
const orderedLocales = z
  .array(ContentLocaleSchema)
  .min(1)
  .max(MAX_CONTENT_LOCALES)
  .refine(
    locales => new Set(locales).size === locales.length,
    'Content locales must be unique after normalization.',
  )
const supportedLocales = z
  .array(SupportedContentLocaleSchema)
  .min(1)
  .max(MAX_CONTENT_LOCALES)
  .refine(
    locales => new Set(locales).size === locales.length,
    'Content locales must be unique after normalization.',
  )

/** Reads retain future JSON settings; writes are restricted to explicitly validated keys. */
export const ContentLocaleSettingsSchema = z
  .object({
    contentLocales: orderedLocales.optional(),
    multilingualContent: z.boolean().optional(),
    multilingualAddresses: z.boolean().optional(),
  })
  .catchall(z.json())
export type ContentLocaleSettings = z.output<typeof ContentLocaleSettingsSchema>

/** Null is a transport-only reset marker; it is never stored. */
export const ContentLocaleSettingsPatchSchema = z
  .object({
    contentLocales: supportedLocales.nullable().optional(),
    multilingualContent: z.boolean().nullable().optional(),
    multilingualAddresses: z.boolean().nullable().optional(),
  })
  .strict()
export type ContentLocaleSettingsPatch = z.output<
  typeof ContentLocaleSettingsPatchSchema
>

/** Form transport may supply a JSON string; malformed JSON fails ordinary validation. */
export const ContentLocaleSettingsFormSchema = z.preprocess(value => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}, ContentLocaleSettingsPatchSchema.optional())

/**
 * Applies a validated patch without replacing unrelated settings.
 * @param current - Current persisted settings (missing for a new resource).
 * @param patch - Optional settings patch; null removes an overridden key.
 * @returns Fresh settings object with canonical ordered locales.
 * @remarks Missing keys preserve values; use null to reset, never a resolved user default.
 */
export function applyContentLocaleSettingsPatch(
  current: ContentLocaleSettings | null | undefined,
  patch?: ContentLocaleSettingsPatch,
): ContentLocaleSettings {
  const next = ContentLocaleSettingsSchema.parse(current ?? {})
  const parsed = ContentLocaleSettingsPatchSchema.parse(patch ?? {})
  if (parsed.contentLocales === null) delete next.contentLocales
  else if (parsed.contentLocales !== undefined)
    next.contentLocales = [...parsed.contentLocales]
  for (const key of MULTILINGUAL_SETTING_KEYS) {
    if (parsed[key] === null) delete next[key]
    else if (parsed[key] !== undefined) next[key] = parsed[key]
  }
  return next
}

/**
 * Builds only editable settings for existing form transports.
 * @param settings - Persisted resource settings.
 * @returns Content-locale patch; unknown settings are not resubmitted by older forms.
 */
export function toContentLocaleSettingsForm(
  settings?: ContentLocaleSettings,
): ContentLocaleSettingsPatch {
  const patch: ContentLocaleSettingsPatch = settings?.contentLocales ? { contentLocales: [...settings.contentLocales] } : {}
  for (const key of MULTILINGUAL_SETTING_KEYS) {
    if (settings?.[key] !== undefined) patch[key] = settings[key]
  }
  return patch
}
