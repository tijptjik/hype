// DOMAIN
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
import { featureNameTextValue, nameBooleanValue } from '#lib/features/locationPolicy.js'
import {
  featureRevisionBaseName,
  featureRevisionNameOverride,
} from '#lib/revisions/featureNaming.js'
import {
  renderLocalizedDisplayTemplate,
  type DisplayTemplateDefinition,
} from './registry'
// TYPES
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { EffectiveLocationFacts } from '#lib/locations/resolve.js'
import type { TemplateScalar } from './displayTemplate'

/** Read a value in the requested language without borrowing another translation.
 * @param values Accepted localized values. @param locale Requested locale.
 * @returns Matching value, including explicit clears.
 */
function localized(
  values: Record<string, string | null> | null | undefined,
  locale: string,
): string | null | undefined {
  return Object.entries(values ?? {}).find(
    ([tag]) => canonicalContentTag(tag) === canonicalContentTag(locale),
  )?.[1]
}

/** Generate display titles exclusively from accepted Feature content and accepted Location fields.
 * @param content Accepted or transactionally proposed Feature snapshot.
 * @param definition Immutable central definition. @param location Resolved accepted Location, never the current community head.
 * @returns Per-locale display values; manual names and explicit clears take precedence.
 */
export function featureTemplateTitles(
  content: FeatureRevisionContent,
  definition: DisplayTemplateDefinition,
  location?: EffectiveLocationFacts,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(content.translations).map(([locale, translation]) => {
      const base = featureRevisionBaseName(content, locale)
      const values: Record<string, TemplateScalar> = {
        'source.name': localized(location?.names, locale) ?? base,
        'location.name': localized(location?.names, locale),
        'feature.name': base,
        'brand.name': localized(location?.brands?.[0]?.names, locale),
        'format.name': localized(location?.format, locale),
        branch: localized(location?.branch, locale),
        address: translation.address.value,
        phoneNumber: location?.phoneNumber?.[0],
        website: location?.websites?.[0],
      }
      // Property interpretation belongs to the captured definition, not today's mutable catalogue.
      for (const [id, property] of Object.entries(content.properties)) {
        const field = property.selection.definition
        const translated = Object.entries(property.translations).find(
          ([tag]) => canonicalContentTag(tag) === canonicalContentTag(locale),
        )?.[1]?.value
        const raw = translated ?? property.selection.value
        values[`properties.${id}`] =
          field.dataType === 'boolean' || field.component === 'ToggleField'
            ? nameBooleanValue(raw)
            : featureNameTextValue(raw, field.component)
      }
      return [
        locale,
        renderLocalizedDisplayTemplate(
          definition,
          locale,
          values,
          base,
          featureRevisionNameOverride(content, locale),
        ),
      ]
    }),
  )
}
