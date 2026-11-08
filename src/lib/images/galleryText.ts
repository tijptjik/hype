// I18N
import { contentStorageTag } from '#lib/i18n/contentRecords.js'

/**
 * Resolves authored gallery text using the requested content language and retained fallbacks.
 * @param values Caption or alternative-text map from the exact accepted gallery entry.
 * @param locale Current UI/content language, including legacy Chinese aliases.
 * @returns Authored text or an empty string when no text is available.
 */
export function galleryText(
  values: Readonly<Record<string, string>> | undefined,
  locale: string,
): string {
  if (!values) return ''
  return (
    values[contentStorageTag(locale)] ??
    values.en ??
    Object.values(values).find(value => value.trim()) ??
    ''
  )
}
