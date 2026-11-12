// VALIDATION
import { z } from 'zod'
// I18N
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
import { placeTaxonomyPath } from './placeTaxonomy'
import { seedCurationNames } from './curationIdentity'

export const IdentityCatalogueContentSchema = z.strictObject({
  // Optional containing group for both brands and groups; revisions retain membership history.
  groupId: z.string().min(1).max(200).nullable().optional(),
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100)
    .optional(),
  categories: z
    .array(
      z
        .string()
        .refine(
          value => placeTaxonomyPath(value).length > 0,
          'Choose an existing category',
        ),
    )
    .max(50)
    .refine(
      values => new Set(values).size === values.length,
      'Categories must be distinct',
    )
    .optional(),
  // Discovery preferences are independent of the brand classification.
  discovery: z
    .strictObject({
      terms: z
        .array(z.string().trim().max(200))
        .max(20)
        .default([])
        .transform(values => values.filter(Boolean)),
      category: z
        .string()
        .refine(value => placeTaxonomyPath(value).length > 0)
        .optional(),
    })
    .optional(),
  i18n: z
    .record(
      z.string().min(2).max(32),
      z.strictObject({ name: z.string().trim().max(300) }),
    )
    .refine(
      value => Object.values(value).some(row => Boolean(row.name.trim())),
      'Provide at least one catalogue name',
    )
    .refine(
      value =>
        ['en', 'zh-Hant', 'zh-Hans'].every(locale => value[locale] !== undefined),
      'Include the primary locale rows; untranslated names may be empty',
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
