// VALIDATION
import { z } from 'zod'
// CANONICAL CONTENT CONTRACT (LLM 1)
import {
  ContentLocaleSchema,
  CONTENT_LOCALE_FORM_KEY_PREFIX,
  MAX_CONTENT_LOCALE_LENGTH,
  toLegacyContentLocaleKey,
  type ContentLocale,
} from '#lib/content-locales/model.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. CONTENT BOUNDARY TAGS
// 2. LOSSLESS MAP ADAPTERS
// 3. VALIDATION
// ---

/** Normalize authored content tags without changing the compiled UI locale contract.
 * @param input Canonical tag or an existing camelCase/lowercase storage alias.
 * @returns Canonical BCP 47 tag.
 * @remarks Catalogue eligibility is owned by the locale-settings layer; stored tags
 * must remain readable even when they are absent from that catalogue.
 */
export function canonicalContentTag(input: string): ContentLocale {
  return ContentLocaleSchema.parse(input)
}

/** Adapt content identity to a JavaScript identifier for remote-form field paths.
 * @param input Content tag, encoded form key, or legacy key.
 * @returns A reversible form key, retaining the existing Chinese aliases.
 * @remarks Hyphens are encoded only at the form boundary; storage keeps BCP 47 tags.
 */
export function contentFormKey(input: string): string {
  const locale = toLegacyContentLocaleKey(input)
  return locale.includes('-')
    ? `${CONTENT_LOCALE_FORM_KEY_PREFIX}${locale.replaceAll('-', '_')}`
    : locale
}

/** Retain existing Chinese database keys without a data migration.
 * @param input Content tag or legacy key. @returns Existing storage tag or canonical tag.
 */
export function contentStorageTag(input: string): string {
  const tag = canonicalContentTag(input)
  return tag === 'zh-Hant' || tag === 'zh-Hans' ? tag.toLowerCase() : tag
}

/** Convert locale maps without silently resolving normalization collisions.
 * @param values Locale-keyed values, including empty values and verification metadata.
 * @param key Target boundary key adapter.
 * @returns A fresh map; duplicate identities fail before any write.
 */
export function adaptContentMap<T>(
  values: Record<string, T>,
  key: (locale: string) => string = contentFormKey,
): Record<string, T> {
  const result: Record<string, T> = {}
  for (const [raw, value] of Object.entries(values)) {
    const locale = key(raw)
    if (Object.hasOwn(result, locale))
      throw new Error(`Content locale collision: ${raw} -> ${locale}`)
    result[locale] = value
  }
  return result
}

/** Read relational rows without collapsing extra languages into English.
 * @param rows Stored translations. @returns Form-keyed rows with storage locale tags.
 */
export function contentRowsToForm<T extends { locale?: string }>(
  rows: T[],
): Record<string, T> {
  const result: Record<string, T> = {}
  for (const row of rows) {
    if (!row.locale) throw new Error('Missing content locale')
    const key = contentFormKey(row.locale)
    if (Object.hasOwn(result, key))
      throw new Error(`Content locale collision: ${row.locale} -> ${key}`)
    result[key] = { ...row, locale: contentStorageTag(row.locale) }
  }
  return result
}

/** Prepare write rows while rejecting inconsistent embedded locale identities.
 * @param values Submitted form map. @returns Storage-keyed rows preserving every field.
 */
export function contentMapToStorage<T extends Record<string, unknown>>(
  values: Partial<Record<string, T>>,
): Record<string, T & { locale: string }> {
  const mapped = adaptContentMap(values, contentStorageTag)
  return Object.fromEntries(
    Object.entries(mapped).flatMap(([locale, row]) => {
      if (!row) return []
      if (typeof row.locale === 'string' && contentStorageTag(row.locale) !== locale)
        throw new Error(`Content locale does not match its map key: ${locale}`)
      return [[locale, { ...row, locale }]]
    }),
  )
}

/** Omit empty draft translations at an entity's persistence boundary.
 * @param values Submitted locale rows, including empty editor controls.
 * @param fields Authored text fields that make a translation meaningful.
 * @returns Storage-keyed populated rows with all original text and provenance intact.
 * @remarks Validate identities before filtering, so empty alias collisions still fail.
 * Use only for replacement collections; an explicit clear must delete the old row.
 */
export function populatedContentMapToStorage<T extends Record<string, unknown>>(
  values: Partial<Record<string, T>>,
  fields: readonly string[],
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(contentMapToStorage(values)).filter(([, row]) =>
      fields.some(
        field => typeof row[field] === 'string' && row[field].trim().length > 0,
      ),
    ),
  )
}

export const ContentTagInput = z
  .string()
  .min(1)
  .max(MAX_CONTENT_LOCALE_LENGTH + CONTENT_LOCALE_FORM_KEY_PREFIX.length)
  .refine(value => {
    try {
      canonicalContentTag(value)
      return true
    } catch {
      return false
    }
  }, 'Invalid content locale')

/** Validate a dynamic map, then adapt keys for existing form consumers.
 * @param model Per-locale value validator. @returns A lossless locale-map validator.
 * @remarks Empty maps are allowed here; entity schemas enforce required content.
 */
export function contentLocaleMap<T extends z.ZodType>(model: T) {
  return z
    .record(ContentTagInput, model)
    .transform((value, ctx): Record<string, z.output<T>> => {
      try {
        return adaptContentMap(value)
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          message:
            error instanceof Error ? error.message : 'Invalid content locale map',
        })
        return z.NEVER
      }
    })
}
