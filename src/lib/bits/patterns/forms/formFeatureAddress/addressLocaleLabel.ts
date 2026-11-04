import type { LocaleKey } from '#lib/types.js'

/** Compact native-language labels for address controls.
 * @param locale Address locale. @returns A short label with no editable language code.
 */
export function addressLocaleLabel(locale: LocaleKey): string {
  return { en: 'EN', zhHant: '繁中', zhHans: '简中' }[locale]
}
