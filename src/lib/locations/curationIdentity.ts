// VALIDATION
import { z } from 'zod'
// CONTENT LOCALES
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'

export const CURATION_IDENTITY_FIELDS = [
  'groupId',
  'brandId',
  'format',
  'branch',
  'branchId',
] as const
export const LocalizedCurationTextSchema = z.preprocess(
  value => (typeof value === 'string' ? { en: value } : value),
  z
    .record(z.string().min(2).max(32), z.string().max(1000))
    .transform(value =>
      Object.fromEntries(
        Object.entries(value).map(([locale, text]) => [
          canonicalContentTag(locale),
          text,
        ]),
      ),
    ),
)
export type LocalizedCurationText = z.output<typeof LocalizedCurationTextSchema>

/** Seed all supported catalogue languages without claiming translations were supplied upstream.
 * @param names Original localized brand/group names.
 * @returns Three editable locale values and retained additional languages.
 */
export function seedCurationNames(
  names: Record<string, string>,
): Record<string, string> {
  const normalized = LocalizedCurationTextSchema.parse(names)
  const fallback =
    normalized.en || Object.values(normalized).find(value => value.trim()) || ''
  return {
    ...normalized,
    en: normalized.en || fallback,
    'zh-Hant': normalized['zh-Hant'] || fallback,
    'zh-Hans': normalized['zh-Hans'] || fallback,
  }
}

/** Resolve one display locale while leaving the stored authored language map intact.
 * @param names Localized curation values.
 * @param locale Requested locale.
 * @returns Requested value, then English, then the first supplied value.
 */
export function curationText(
  names: Record<string, string> | null | undefined,
  locale: string,
): string {
  return (
    names?.[canonicalContentTag(locale)] ??
    names?.en ??
    Object.values(names ?? {})[0] ??
    ''
  )
}
