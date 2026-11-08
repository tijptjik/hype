// CONTENT LOCALES
import { normalizeContentLocale, normalizeContentLocales } from './model'
// TYPES
import type { ContentLocale } from './model'
import type { ContentLocaleSettings } from './settings'

export type ContentLocaleOrigin = 'project' | 'organisation' | 'user-default'
export interface ResolvedContentLocales {
  locales: ContentLocale[]
  origin: ContentLocaleOrigin
}

/**
 * Resolves shared authoring defaults without changing persisted settings or form chips.
 * @param options - Optional Project/Organisation settings and the current UI locale.
 * @returns Fresh ordered locales and their origin; overrides replace the whole order.
 * @remarks Chinese regions never imply a script. Future UI languages use English order.
 */
export function resolveContentLocales(
  options: {
    projectSettings?: ContentLocaleSettings | null
    organisationSettings?: ContentLocaleSettings | null
    userLocale?: string | null
  } = {},
): ResolvedContentLocales {
  if (options.projectSettings?.contentLocales?.length) {
    return { locales: [...options.projectSettings.contentLocales], origin: 'project' }
  }
  if (options.organisationSettings?.contentLocales?.length) {
    return {
      locales: [...options.organisationSettings.contentLocales],
      origin: 'organisation',
    }
  }
  const locale = normalizeContentLocale(options.userLocale)
  const language = locale ? new Intl.Locale(locale) : null
  const order =
    language?.language === 'zh' && language.script === 'Hant'
      ? ['zh-Hant', 'zh-Hans', 'en']
      : language?.language === 'zh' && language.script === 'Hans'
        ? ['zh-Hans', 'zh-Hant', 'en']
        : ['en', 'zh-Hant', 'zh-Hans']
  return { locales: normalizeContentLocales(order), origin: 'user-default' }
}

/** Resolve independent multilingual presentation defaults without materializing inheritance.
 * @param options Project and Organisation settings, in decreasing precedence.
 * @returns Content/address defaults; explicit false overrides true and missing means false.
 */
export function resolveMultilingualDefaults(
  options: {
    projectSettings?: ContentLocaleSettings | null
    organisationSettings?: ContentLocaleSettings | null
  } = {},
): { content: boolean; addresses: boolean } {
  return {
    content:
      options.projectSettings?.multilingualContent ??
      options.organisationSettings?.multilingualContent ??
      false,
    addresses:
      options.projectSettings?.multilingualAddresses ??
      options.organisationSettings?.multilingualAddresses ??
      false,
  }
}
