// VALIDATION
import { z } from 'zod'
// I18N
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
import { seedCurationNames } from './curationIdentity'

export const IdentityCatalogueContentSchema = z.strictObject({
  i18n: z
    .record(
      z.string().min(2).max(32),
      z.strictObject({ name: z.string().trim().min(1).max(300) }),
    )
    .refine(
      value =>
        ['en', 'zh-Hant', 'zh-Hans'].every(locale => Boolean(value[locale]?.name)),
      'Provide all three catalogue names',
    )
    .refine(
      value =>
        Object.keys(value).every(locale => canonicalContentTag(locale) === locale),
      'Use canonical locale tags',
    ),
  logo: z
    .string()
    .regex(/^\/api\/identity-catalogue\/logos\/[a-f0-9-]+$/)
    .nullable()
    .default(null),
})
export type IdentityCatalogueContent = z.infer<typeof IdentityCatalogueContentSchema>
export type IdentityCatalogueRecord = IdentityCatalogueContent & {
  id: string
  kind: 'brand' | 'group'
  version: number
}

/** Seed canonical, locale-first names while preserving upstream evidence outside the catalogue.
 * @param names Available upstream locale map. @returns Editable names for all three supported locales.
 */
export function seedIdentityCatalogue(
  names: Record<string, string>,
): IdentityCatalogueContent {
  return IdentityCatalogueContentSchema.parse({
    i18n: Object.fromEntries(
      Object.entries(seedCurationNames(names)).map(([locale, name]) => [
        locale,
        { name },
      ]),
    ),
    logo: null,
  })
}

/** Adapt a curated catalogue revision to the legacy normalized Location display projection.
 * @param record Immutable catalogue version. @returns Localized display-name map.
 */
export function catalogueNames(
  record: IdentityCatalogueContent,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record.i18n).map(([locale, value]) => [locale, value.name]),
  )
}
