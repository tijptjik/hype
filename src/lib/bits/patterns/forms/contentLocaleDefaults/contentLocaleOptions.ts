// CONTENT LOCALES
import {
  CONTENT_LOCALE_CATALOGUE,
  queryContentLocales,
} from '#lib/content-locales/catalogue.js'
// TYPES
import type { LocaleOption } from '#lib/bits/custom/localeControls/localeControls.types.js'

/**
 * Adapt the shared catalogue to the context-free controls.
 * @param displayLocale Current UI locale, including legacy UI keys.
 * @returns Localized names, reviewed autonyms and all catalogue search aliases.
 */
export function contentLocaleOptions(displayLocale: string): LocaleOption[] {
  // Some Intl versions canonicalize multiple registry entries to one identity.
  const options = new Map<string, LocaleOption>()
  for (const record of queryContentLocales({ displayLocale })) {
    const previous = options.get(record.locale)
    options.set(record.locale, {
      tag: record.locale,
      autonym: previous?.autonym ?? record.autonym,
      name: previous?.name ?? record.name,
      aliases: [
        ...new Set([
          ...(previous?.aliases ?? []),
          ...record.aliases,
          record.autonym,
          record.name,
          ...CONTENT_LOCALE_CATALOGUE.filter(
            entry => entry.locale === record.locale,
          ).map(entry => entry.englishName),
        ]),
      ],
    })
  }
  return [...options.values()]
}
