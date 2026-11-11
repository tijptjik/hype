// VALIDATION
import { z } from 'zod'
// DOMAIN
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
import {
  parseDisplayTemplate,
  renderDisplayTemplate,
  type TemplateValues,
} from './displayTemplate'

export const DisplayTemplateDefinitionSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    code: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
    target: z.enum(['feature', 'location']),
    locales: z.record(z.string().min(2).max(30), z.string().min(1).max(4096)),
  })
  .superRefine((definition, ctx) => {
    const seen = new Set<string>()
    if (!Object.keys(definition.locales).length)
      ctx.addIssue({
        code: 'custom',
        path: ['locales'],
        message: 'Provide at least one locale',
      })
    if (Object.keys(definition.locales).length > 30)
      ctx.addIssue({
        code: 'custom',
        path: ['locales'],
        message: 'At most 30 locales are supported',
      })
    for (const [locale, source] of Object.entries(definition.locales)) {
      const canonical = canonicalContentTag(locale)
      if (seen.has(canonical))
        ctx.addIssue({
          code: 'custom',
          path: ['locales', locale],
          message: 'Duplicate locale',
        })
      seen.add(canonical)
      try {
        const parsed = parseDisplayTemplate(source)
        for (const path of parsed.dependencies) {
          const locationPath = [
            'source.name',
            'location.name',
            'brand.name',
            'group.name',
            'format.name',
            'branch',
            'address',
            'phoneNumber',
            'website',
          ].includes(path)
          const featurePath =
            path === 'feature.name' || /^properties\.[A-Za-z0-9_-]+$/.test(path)
          if (!locationPath && !(definition.target === 'feature' && featurePath))
            throw new Error(`Unsupported ${definition.target} property: ${path}`)
        }
      } catch (cause) {
        ctx.addIssue({
          code: 'custom',
          path: ['locales', locale],
          message: cause instanceof Error ? cause.message : 'Invalid template',
        })
      }
    }
  })
export type DisplayTemplateDefinition = z.infer<typeof DisplayTemplateDefinitionSchema>
export type DisplayTemplateReference = { id: string; version: number }
export type DisplayTemplateRecord = DisplayTemplateDefinition &
  DisplayTemplateReference & {
    organisationId: string | null
  }

/** Render the requested locale without inventing a translation from another language.
 * @param definition Central immutable version. @param locale Requested content locale.
 * @param values Accepted field values for that locale. @param fallback Provided title.
 * @param override Explicit authored title, including intentional clears.
 * @returns Explicit title, localized generated text, or the provided title when no locale exists.
 */
export function renderLocalizedDisplayTemplate(
  definition: DisplayTemplateDefinition,
  locale: string,
  values: TemplateValues,
  fallback: string,
  override?: string | null,
): string {
  if (override != null) return override
  const source = Object.entries(definition.locales).find(
    ([tag]) => canonicalContentTag(tag) === canonicalContentTag(locale),
  )?.[1]
  return source === undefined ? fallback : renderDisplayTemplate(source, values)
}
