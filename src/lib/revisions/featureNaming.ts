// DOMAIN
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// TYPES
import type { FeatureRevisionContent } from './featureContent'

/** Read a retained localized value without rewriting historical locale keys.
 * @param values Historical locale map. @param locale Requested locale.
 * @returns Matching value, including an explicit empty string, or undefined.
 */
function localized(
  values: Record<string, string> | undefined,
  locale: string,
): string | undefined {
  return Object.entries(values ?? {}).find(
    ([key]) => canonicalContentTag(key) === canonicalContentTag(locale),
  )?.[1]
}

/** Resolve authored base text from current translations or an immutable legacy snapshot.
 * @param content Accepted or proposed content. @param locale Translation key.
 * @returns Authored input, never a materialized display title.
 */
export function featureRevisionBaseName(
  content: FeatureRevisionContent,
  locale: string,
): string {
  return (
    localized(content.profile.nameTemplate?.baseNames, locale) ??
    content.translations[locale]?.title.value ??
    ''
  )
}

/** Resolve explicit overrides while preserving old immutable revision payloads.
 * @param content Accepted or proposed content. @param locale Translation key.
 * @returns Explicit replacement or null; untemplated features never use overrides.
 */
export function featureRevisionNameOverride(
  content: FeatureRevisionContent,
  locale: string,
): string | null {
  if (!content.profile.nameTemplate) return null
  return (
    content.translations[locale]?.nameOverride ??
    localized(content.profile.nameTemplate.overrides, locale) ??
    null
  )
}
