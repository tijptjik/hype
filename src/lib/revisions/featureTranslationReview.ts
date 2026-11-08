// DOMAIN
import { equalRevisionValue } from './merge'
// TYPES
import type { FeatureRevisionContent } from './featureContent'

/**
 * Limits a translation command to the inspected existing locales and permitted text groups.
 * @param previous Current comparison snapshot, loaded by the server.
 * @param result Complete merged candidate, including hidden retained content.
 * @param fields Currently editable translation fields.
 * @returns Non-sensitive validation errors; other authored groups cannot be changed through this API.
 */
export function validateFeatureTranslationResult(
  previous: FeatureRevisionContent,
  result: FeatureRevisionContent,
  fields: readonly ('title' | 'description')[],
): string[] {
  const retained = structuredClone(result)
  const locales = Object.keys(previous.translations)
  if (!equalRevisionValue(locales.sort(), Object.keys(result.translations).sort()))
    return ['Translation locales changed; refresh the editor']
  for (const locale of locales) {
    for (const field of fields) {
      if (
        field === 'title' &&
        previous.placement.location &&
        previous.placement.location.acceptancePolicy?.nameMode !== 'independent' &&
        !equalRevisionValue(
          previous.translations[locale].title,
          result.translations[locale].title,
        )
      )
        return ['Inherited names require separate Location correction review']
      if (field === 'title')
        retained.translations[locale].title = previous.translations[locale].title
      else
        retained.translations[locale].description =
          previous.translations[locale].description
    }
  }
  return equalRevisionValue(previous, retained)
    ? []
    : ['This proposal includes changes outside the permitted translation fields']
}

/**
 * Restricts conflict values to editable text groups without exposing addresses or properties.
 * @param path Server-generated conflict path or client-submitted resolution path.
 * @param fields Current permitted translation groups.
 * @returns Whether the whole atomic text/verification value may be reviewed.
 */
export function canReviewFeatureTranslationPath(
  path: readonly string[],
  fields: readonly ('title' | 'description')[],
): boolean {
  return (
    path.length === 3 &&
    path[0] === 'translations' &&
    fields.some(field => field === path[2])
  )
}
